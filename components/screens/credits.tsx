"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, busyLabel } from "@/components/api";
import { ScreenState } from "@/components/shell";

type Credits = {
  balance: string;
  canSettle: boolean;
  settlement: string;
  entries: { id: string; kind: string; status: string; amount: string; note: string; createdAt: string }[];
};

export function CreditsScreen() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["credits"], queryFn: () => api<Credits>("/api/credits") });
  const [pounds, setPounds] = useState("250");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (kind: "grant" | "purchase") => api<{ status: string; balance: string }>("/api/credits", { method: "POST", body: JSON.stringify({ pounds, kind }) }),
    onSuccess: async (result) => {
      setError(null);
      setMessage(result.status === "posted" ? `Credit is now ${result.balance}. No card was charged.` : "Requested. An admin or finance role still has to record it. No card was charged.");
      await client.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const post = useMutation({
    mutationFn: (id: string) => api<{ balance: string }>(`/api/credits/${id}/post`, { method: "POST", body: "{}" }),
    onSuccess: async (result) => {
      setError(null);
      setMessage(`Credit is now ${result.balance}. No card was charged.`);
      await client.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const data = query.data;
  return (
    <ScreenState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
      {data ? (
        <div className="stack">
          <header>
            <p className="label">Treasury</p>
            <h1 className="section-title">Credit {data.balance}</h1>
            <p className="lede">{data.settlement} This balance does not change the billed usage ledger.</p>
          </header>
          <form className="card stack" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span className="label">Amount in pounds</span>
              <input aria-label="Credit amount in pounds" inputMode="decimal" value={pounds} onChange={(event) => setPounds(event.target.value)} />
            </label>
            <div className="actions">
              <button className="btn primary" type="button" disabled={!data.canSettle || save.isPending} onClick={() => save.mutate("grant")}>{busyLabel(save.isPending, "Add credit")}</button>
              <button className="btn" type="button" disabled={save.isPending} onClick={() => save.mutate("purchase")}>{data.canSettle ? "Record purchase" : "Request purchase"}</button>
            </div>
            {!data.canSettle ? <p className="faint">A reviewer can request a purchase. An admin or finance role records it.</p> : null}
          </form>
          {message ? <p className="notice" role="status">{message}</p> : null}
          {error ? <p className="notice" data-tone="critical" role="alert">{error}</p> : null}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Kind</th><th>Status</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {data.entries.length === 0 ? <tr><td colSpan={5}>No credit entries yet.</td></tr> : data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString("en-GB", { hour12: false })}</td>
                    <td>{entry.kind}</td>
                    <td>{entry.status === "awaiting_payment" ? "Awaiting record" : "Posted"}</td>
                    <td className="mono">{entry.amount}</td>
                    <td>{entry.status === "awaiting_payment" && data.canSettle ? <button className="btn" type="button" onClick={() => post.mutate(entry.id)}>Record</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ScreenState>
  );
}
