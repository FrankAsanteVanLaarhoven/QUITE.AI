"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { when, type RequestView } from "@/components/domain";
import { DecisionView } from "@/components/screens/decision";
import { useListKeys } from "@/components/screens/keys";
import { ScreenState } from "@/components/shell";
import { useCommands, usePanel } from "@/components/state";

export function ApprovalsScreen() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["approvals"], queryFn: () => api<{ approvals: RequestView[] }>("/api/approvals"), refetchInterval: 15000 });
  const approvals = list.data?.approvals ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = approvals.find((item) => item.approval?.id === chosen) ?? approvals[0] ?? null;

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["approvals"] });
    await client.invalidateQueries({ queryKey: ["requests"] });
    await client.invalidateQueries({ queryKey: ["audit"] });
  }

  const decide = useMutation({
    mutationFn: (input: { id: string; action: "approve" | "reject" }) => api(`/api/approvals/${input.id}/${input.action}`, { method: "POST" }),
    onSuccess: async () => {
      setChosen(null);
      await refresh();
    },
  });

  const approvalId = selected?.approval?.id;
  useCommands({
    approve: approvalId ? () => decide.mutate({ id: approvalId, action: "approve" }) : undefined,
    reject: approvalId ? () => decide.mutate({ id: approvalId, action: "reject" }) : undefined,
  });
  useListKeys(approvals.map((item) => item.approval?.id ?? item.id), selected?.approval?.id ?? null, setChosen);

  const panel = useMemo(() => {
    if (!selected?.approval) return { title: "Inbox", sections: [{ label: "Queue", text: "Nothing is waiting. New held routes appear here." }] };
    return {
      title: selected.taskLabel,
      sections: [
        { label: "Recommendation", text: `${selected.approval.recommendedTier} · ${selected.approval.reason}` },
        { label: "Cost", text: `${selected.estimated} on ${selected.modelName}. Premium baseline ${selected.premium}.` },
        { label: "Policy", text: selected.policyName ?? "Held by the route, without a named policy." },
      ],
    };
  }, [selected]);
  usePanel(panel);

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <div>
          <p className="label">Human review</p>
          <h1 className="section-title">Approval inbox</h1>
          <p className="lede">Approving records the decision. It does not invent a provider bill. Rejecting leaves the request unbilled.</p>
        </div>
        {decide.error ? <p className="notice" data-tone="critical" role="alert">{decide.error.message}</p> : null}
        {approvals.length === 0 ? <p className="card">Nothing is waiting for a person.</p> : null}
        {selected ? <DecisionView request={selected} /> : null}
        {selected?.approval ? (
          <div className="actions">
            <button className="btn primary" type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: selected.approval!.id, action: "approve" })}>{busyLabel(decide.isPending, "Approve")}</button>
            <button className="btn" type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: selected.approval!.id, action: "reject" })}>{busyLabel(decide.isPending, "Reject")}</button>
          </div>
        ) : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Request</th><th>Tier</th><th>Estimate</th><th>Why</th></tr>
            </thead>
            <tbody>
              {approvals.map((item) => (
                <tr key={item.id} aria-selected={item.id === selected?.id}>
                  <td>{when(item.createdAt)}</td>
                  <td><button className="row-button" type="button" onClick={() => setChosen(item.approval?.id ?? item.id)}>{item.taskLabel}</button></td>
                  <td className="tier" data-tier={item.approval?.recommendedTier ?? item.modelTier}>{item.approval?.recommendedTier ?? item.modelTier}</td>
                  <td className="num">{item.estimated}</td>
                  <td>{item.approval?.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ScreenState>
  );
}
