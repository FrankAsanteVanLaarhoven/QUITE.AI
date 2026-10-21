"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { can, statusText, when, type ModelView, type RequestView, type TeamAccount } from "@/components/domain";
import { DecisionView } from "@/components/screens/decision";
import { useListKeys } from "@/components/screens/keys";
import { ScreenState, useWorkspaceUser } from "@/components/shell";
import { useCommands, usePanel } from "@/components/state";

export function RequestsScreen() {
  const user = useWorkspaceUser();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["requests"], queryFn: () => api<{ requests: RequestView[] }>("/api/requests"), refetchInterval: 15000 });
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: TeamAccount[] }>("/api/teams") });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api<{ models: ModelView[] }>("/api/models") });
  const requests = list.data?.requests ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [workflow, setWorkflow] = useState("customer-support");
  const [teamSlug, setTeamSlug] = useState("support");
  const teamOptions = teams.data?.teams ?? [];
  const activeTeam = teamOptions.some((item) => item.slug === teamSlug)
    ? teamSlug
    : teamOptions.find((item) => item.slug === "support")?.slug ?? teamOptions[0]?.slug ?? teamSlug;
  const [model, setModel] = useState("quiet-auto");
  const [formError, setFormError] = useState<string | null>(null);
  const selectedId = chosen ?? requests.find((item) => item.taskType === "support" && item.status === "routed")?.id ?? requests[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ["request", selectedId],
    queryFn: () => api<RequestView>(`/api/requests/${selectedId}`),
    enabled: Boolean(selectedId),
  });
  const request = detail.data ?? requests.find((item) => item.id === selectedId) ?? null;

  async function refresh(id: string) {
    await client.invalidateQueries({ queryKey: ["requests"] });
    await client.invalidateQueries({ queryKey: ["request", id] });
    await client.invalidateQueries({ queryKey: ["approvals"] });
    await client.invalidateQueries({ queryKey: ["overview"] });
    await client.invalidateQueries({ queryKey: ["policies"] });
    await client.invalidateQueries({ queryKey: ["audit"] });
  }

  const accept = useMutation({
    mutationFn: (id: string) => api<RequestView>(`/api/requests/${id}/accept`, { method: "POST" }),
    onSuccess: async (row) => { setChosen(row.id); await refresh(row.id); },
  });
  const premium = useMutation({
    mutationFn: (id: string) => api<RequestView>(`/api/requests/${id}/premium`, { method: "POST" }),
    onSuccess: async (row) => { setChosen(row.id); await refresh(row.id); },
  });
  const pin = useMutation({
    mutationFn: (id: string) => api<RequestView>(`/api/requests/${id}/pin`, { method: "POST" }),
    onSuccess: async (row) => { setChosen(row.id); await refresh(row.id); },
  });
  const route = useMutation({
    mutationFn: () => api<{ request: RequestView; failure: string | null }>("/api/requests", {
      method: "POST",
      body: JSON.stringify({ prompt, workflow, teamSlug: activeTeam, model: model === "quiet-auto" ? "quiet-auto" : model }),
    }),
    onSuccess: async (body) => {
      setChosen(body.request.id);
      setPrompt("");
      await refresh(body.request.id);
    },
  });

  const routeAllowed = can(user.role, "route");
  const writeAllowed = can(user.role, "write");
  const acceptAllowed = routeAllowed;
  useCommands({
    accept: request && acceptAllowed ? () => accept.mutate(request.id) : undefined,
    premium: request && writeAllowed && !request.billed ? () => premium.mutate(request.id) : undefined,
    pin: request && writeAllowed ? () => pin.mutate(request.id) : undefined,
  });
  useListKeys(requests.map((item) => item.id), selectedId, setChosen);

  const panel = useMemo(() => {
    if (!request) return null;
    const audit = (detail.data?.audit ?? []).slice(0, 6).map((event) => `${when(event.at)} · ${event.actor ?? "Gateway"} · ${event.action}`).join("\n");
    return {
      title: request.modelName,
      sections: [
        { label: "Model", text: `${request.modelName} (${request.modelTier}) · ${request.estimated}. Premium baseline ${request.premium}.` },
        { label: "Policy", text: request.policyName ?? "No named policy matched. The default tier rule applied." },
        { label: "Escalation", text: request.approval ? `${request.approval.status}: ${request.approval.reason}` : request.escalated ? "Escalated after the first provider call failed." : "No escalation." },
        { label: "Audit", text: audit || "No audit events on this request yet." },
      ],
    };
  }, [detail.data, request]);
  usePanel(panel);

  const actionError = accept.error ?? premium.error ?? pin.error ?? route.error;
  const busy = accept.isPending || premium.isPending || pin.isPending;

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <div>
          <p className="label">Router</p>
          <h1 className="section-title">Routing decisions</h1>
          <p className="lede">Quiet picks the lowest-cost model that meets the quality, latency, safety and budget policy, then escalates when confidence is low. It does not claim to know the best model in the abstract.</p>
        </div>
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          if (!routeAllowed) {
            setFormError("Your role cannot route a request.");
            return;
          }
          if (prompt.trim().length < 1) {
            setFormError("Write a prompt before routing it.");
            return;
          }
          route.mutate();
        }}>
          <label className="field">
            <span className="label">Prompt</span>
            <textarea aria-label="Prompt" rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Paste the request Quiet should classify and price." />
          </label>
          <div className="split">
            <label className="field">
              <span className="label">Workflow</span>
              <input aria-label="Workflow" value={workflow} onChange={(event) => setWorkflow(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Team</span>
              <select aria-label="Team" value={activeTeam} onChange={(event) => setTeamSlug(event.target.value)}>
                {(teamOptions.length ? teamOptions : [{ slug: activeTeam, name: activeTeam || "Team", seats: 0, allowance: "" }]).map((item) => (
                  <option key={item.slug} value={item.slug}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="label">Model</span>
            <select aria-label="Model" value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="quiet-auto">quiet-auto</option>
              {(models.data?.models ?? []).filter((item) => item.allowed).map((item) => (
                <option key={item.slug} value={item.slug}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button className="btn primary" type="submit" disabled={route.isPending || !routeAllowed}>{busyLabel(route.isPending, "Route")}</button>
          </div>
          {!routeAllowed ? <p className="faint">A reviewer can inspect decisions. An operator, finance admin, or admin can route.</p> : null}
        </form>
        {formError ? <p className="notice" data-tone="critical" role="alert">{formError}</p> : null}
        {actionError ? <p className="notice" data-tone="critical" role="alert">{actionError.message}</p> : null}
        {request ? (
          <>
            <DecisionView request={request} />
            <div className="actions">
              <button className="btn primary" type="button" disabled={!acceptAllowed || busy} onClick={() => accept.mutate(request.id)}>{busyLabel(accept.isPending, "Accept")}</button>
              <button className="btn" type="button" disabled={!writeAllowed || request.billed || busy} onClick={() => premium.mutate(request.id)}>{busyLabel(premium.isPending, "Use premium")}</button>
              <button className="btn" type="button" disabled={!writeAllowed || busy} onClick={() => pin.mutate(request.id)}>{busyLabel(pin.isPending, "Always premium for this workflow")}</button>
              <a className="btn" href="/policies">View policy</a>
            </div>
            {request.billed ? <p className="faint">This request is already billed. Pin the workflow if later calls should use the premium model. Quiet will not rewrite the bill.</p> : null}
            {request.status === "pending_review" ? <p className="notice">Held for a person. No provider was called.</p> : null}
          </>
        ) : <p className="card">No routing decisions in this environment yet. Send a prompt to record one.</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Task</th><th>Model</th><th>Estimate</th><th>Saving</th><th>Status</th></tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id} aria-selected={item.id === selectedId}>
                  <td>{when(item.createdAt)}</td>
                  <td><button className="row-button" type="button" onClick={() => setChosen(item.id)}>{item.taskLabel}</button></td>
                  <td className="tier" data-tier={item.modelTier}>{item.modelName}</td>
                  <td className="num">{item.estimated}</td>
                  <td className="num">{item.saving}</td>
                  <td><span className="status" data-status={item.status}><i />{statusText(item.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ScreenState>
  );
}
