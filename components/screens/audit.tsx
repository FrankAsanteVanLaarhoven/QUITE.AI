"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/components/api";
import { when, type AuditEvent } from "@/components/domain";
import { ScreenState } from "@/components/shell";
import { usePanel } from "@/components/state";

export function AuditScreen() {
  const list = useQuery({ queryKey: ["audit"], queryFn: () => api<{ events: AuditEvent[] }>("/api/audit"), refetchInterval: 15000 });
  const [id, setId] = useState<string | null>(null);
  const events = list.data?.events ?? [];
  const current = events.find((event) => event.id === id) ?? null;
  const panel = useMemo(() => current ? {
    title: current.action,
    sections: [
      { label: "Actor", text: current.actor ?? "Gateway or system" },
      { label: "When", text: when(current.created_at) },
      { label: "Detail", text: JSON.stringify(current.detail ?? {}, null, 2) },
    ],
  } : null, [current]);
  usePanel(panel);

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <div>
          <p className="label">Record</p>
          <h1 className="section-title">Audit</h1>
          <p className="lede">Quiet records who changed a route, policy, allowance, model, key, person, or team placement. Prompt bodies are not stored. A hash is.</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Action</th><th>Actor</th></tr></thead>
            <tbody>
              {events.length === 0 ? <tr><td colSpan={3}>No audit events yet.</td></tr> : events.map((event) => (
                <tr key={event.id} aria-selected={event.id === current?.id}>
                  <td>{when(event.created_at)}</td>
                  <td><button className="row-button" type="button" onClick={() => setId(event.id)}>{event.action}</button></td>
                  <td>{event.actor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ScreenState>
  );
}
