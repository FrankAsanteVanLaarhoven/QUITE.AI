"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { can, type TeamAccount } from "@/components/domain";
import { ScreenState, useWorkspaceUser } from "@/components/shell";
import { usePanel } from "@/components/state";

export function TeamsScreen() {
  const user = useWorkspaceUser();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: TeamAccount[] }>("/api/teams") });
  const [slug, setSlug] = useState<string | null>(null);
  const [allowance, setAllowance] = useState("");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("0");
  const [newAllowance, setNewAllowance] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const money = can(user.role, "money");
  const teams = list.data?.teams ?? [];
  const current = teams.find((team) => team.slug === slug) ?? null;

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["teams"] });
    await client.invalidateQueries({ queryKey: ["overview"] });
    await client.invalidateQueries({ queryKey: ["audit"] });
  }
  const update = useMutation({
    mutationFn: () => api(`/api/teams/${current?.slug}/allowance`, { method: "POST", body: JSON.stringify({ allowancePounds: Number(allowance) }) }),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: () => api("/api/teams", { method: "POST", body: JSON.stringify({ name, seats: Number(seats), allowancePounds: Number(newAllowance) }) }),
    onSuccess: async () => {
      setName("");
      await refresh();
    },
  });

  const panel = useMemo(() => current ? {
    title: current.name,
    sections: [
      { label: "Seats", text: String(current.seats) },
      { label: "Allowance", text: current.allowance },
      { label: "Slug", text: current.slug },
    ],
  } : null, [current]);
  usePanel(panel);

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <div>
          <p className="label">Capacity</p>
          <h1 className="section-title">Teams and seats</h1>
          <p className="lede">An allowance is the monthly cap Quiet uses for budget guard and chargeback. Seats of zero mark shared platform cost.</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Team</th><th>Seats</th><th>Allowance</th></tr></thead>
            <tbody>
              {teams.length === 0 ? <tr><td colSpan={3}>No teams yet.</td></tr> : teams.map((team) => (
                <tr key={team.slug} aria-selected={team.slug === current?.slug}>
                  <td><button className="row-button" type="button" onClick={() => { setSlug(team.slug); setAllowance(""); }}>{team.name}</button></td>
                  <td className="num">{team.seats}</td>
                  <td className="num">{team.allowance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          if (!current) {
            setFormError("Choose a team first.");
            return;
          }
          if (!money) {
            setFormError("Your role cannot change an allowance.");
            return;
          }
          if (!Number.isFinite(Number(allowance)) || Number(allowance) < 0) {
            setFormError("Enter the allowance in pounds, zero or more.");
            return;
          }
          update.mutate();
        }}>
          <h2 className="section-title">Change allowance</h2>
          <p className="muted">{current ? current.name : "Select a team in the table."}</p>
          <label className="field">
            <span className="label">Monthly allowance, pounds</span>
            <input aria-label="Monthly allowance in pounds" inputMode="decimal" value={allowance} onChange={(event) => setAllowance(event.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={!money || update.isPending}>{busyLabel(update.isPending, "Update allowance")}</button>
        </form>
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          if (!money) {
            setFormError("Your role cannot add a team.");
            return;
          }
          if (name.trim().length < 2) {
            setFormError("Give the team a name.");
            return;
          }
          create.mutate();
        }}>
          <h2 className="section-title">Add a team</h2>
          <label className="field">
            <span className="label">Name</span>
            <input aria-label="Team name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="split">
            <label className="field">
              <span className="label">Seats</span>
              <input aria-label="Seats" inputMode="numeric" value={seats} onChange={(event) => setSeats(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Allowance, pounds</span>
              <input aria-label="New team allowance in pounds" inputMode="decimal" value={newAllowance} onChange={(event) => setNewAllowance(event.target.value)} />
            </label>
          </div>
          <button className="btn" type="submit" disabled={!money || create.isPending}>{busyLabel(create.isPending, "Add team")}</button>
          {!money ? <p className="faint">An admin or finance role can change seats and money.</p> : null}
        </form>
        {formError ? <p className="notice" data-tone="critical" role="alert">{formError}</p> : null}
        {update.error || create.error ? <p className="notice" data-tone="critical" role="alert">{(update.error ?? create.error)?.message}</p> : null}
      </div>
    </ScreenState>
  );
}
