"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { can, stamp, when, type ApiKeyView, type Overview } from "@/components/domain";
import { ScreenState, useWorkspaceUser } from "@/components/shell";
import { usePanel } from "@/components/state";

async function downloadCsv(setExportError: (message: string | null) => void) {
  setExportError(null);
  const response = await fetch("/api/reports/usage");
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setExportError(body?.error?.message ?? "Quiet could not export the ledger.");
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quiet-usage.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function BudgetsScreen() {
  const user = useWorkspaceUser();
  const client = useQueryClient();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/api/overview"), refetchInterval: 15000 });
  const keys = useQuery({ queryKey: ["keys"], queryFn: () => api<{ keys: ApiKeyView[] }>("/api/keys") });
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAllowed = can(user.role, "export");
  const keysAllowed = can(user.role, "keys");
  const create = useMutation({
    mutationFn: () => api<{ token: string; name: string }>("/api/keys", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: async (body) => {
      setToken(body.token);
      setName("");
      await client.invalidateQueries({ queryKey: ["keys"] });
      await client.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const data = overview.data;
  const panel = useMemo(() => data ? {
    title: "Ledger",
    sections: [
      { label: "Billed", text: `${data.spent} billed of ${data.committed} committed. Forecast ${data.forecast}.` },
      { label: "Saving", text: `${data.saving}. ${data.definition}` },
      { label: "Keys", text: "A key is bound to the environment selected in the sidebar. Quiet stores only a hash and shows the secret once." },
    ],
  } : null, [data]);
  usePanel(panel);

  return (
    <ScreenState pending={overview.isPending} error={overview.error} onRetry={() => overview.refetch()}>
      {data ? (
        <div className="stack">
          <div>
            <p className="label">{data.environment.name} · {stamp(data.asOf)} UTC</p>
            <h1 className="section-title">Budgets and export</h1>
            <p className="lede">The headline uses billed rows only. A decide-mode route stores an estimate and leaves the actual empty until a live provider returns usage.</p>
          </div>
          <section className="metrics" aria-label="Budget figures">
            <div className="metric"><div className="label">Committed</div><b>{data.committed}</b></div>
            <div className="metric"><div className="label">Billed</div><b>{data.spent}</b></div>
            <div className="metric"><div className="label">Forecast</div><b>{data.forecast}</b></div>
            <div className="metric"><div className="label">Saving</div><b className="accent">{data.saving}</b></div>
          </section>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Team</th><th>Billed</th><th>Forecast</th><th>Allowance</th><th>Status</th></tr></thead>
              <tbody>
                {data.teams.map((team) => (
                  <tr key={team.slug}>
                    <td>{team.name}</td>
                    <td className="num">{team.spent}</td>
                    <td className="num">{team.forecastAmount}</td>
                    <td className="num">{team.allowance}</td>
                    <td><span className="status" data-status={team.status}><i />{team.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {exportAllowed ? (
            <p><button className="btn primary" type="button" onClick={() => downloadCsv(setExportError)}>Export usage CSV</button></p>
          ) : <p className="faint">A reviewer cannot export the ledger.</p>}
          {exportError ? <p className="notice" data-tone="critical" role="alert">{exportError}</p> : null}
          <section className="card stack">
            <h2 className="section-title">API keys</h2>
            <p className="muted">Send the key as a bearer token to <span className="mono">/v1/chat/completions</span>. Use model <span className="mono">quiet-auto</span>, or a catalogue slug to pin.</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Prefix</th><th>Environment</th><th>Created</th></tr></thead>
                <tbody>
                  {(keys.data?.keys ?? []).length === 0 ? <tr><td colSpan={4}>No keys yet.</td></tr> : keys.data?.keys.map((key) => (
                    <tr key={`${key.name}-${key.created_at}`}>
                      <td>{key.name}</td>
                      <td className="mono">{key.token_prefix}</td>
                      <td>{key.environment}</td>
                      <td>{when(key.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form className="stack" onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              if (!keysAllowed) {
                setFormError("Only an admin can create a key.");
                return;
              }
              if (name.trim().length < 2) {
                setFormError("Name the key so an operator can recognise it later.");
                return;
              }
              create.mutate();
            }}>
              <label className="field">
                <span className="label">Key name</span>
                <input aria-label="Key name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <button className="btn" type="submit" disabled={!keysAllowed || create.isPending}>{busyLabel(create.isPending, "Create key")}</button>
            </form>
            {token ? <p className="notice" role="status">Copy this key now. Quiet will not show it again. {token}</p> : null}
            {keys.error ? <p className="notice" data-tone="critical" role="alert">{keys.error.message}</p> : null}
          </section>
          {formError ? <p className="notice" data-tone="critical" role="alert">{formError}</p> : null}
          {create.error ? <p className="notice" data-tone="critical" role="alert">{create.error.message}</p> : null}
        </div>
      ) : null}
    </ScreenState>
  );
}
