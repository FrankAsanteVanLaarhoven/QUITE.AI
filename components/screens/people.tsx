"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { can } from "@/components/domain";
import { ScreenState, useWorkspaceUser } from "@/components/shell";
import { usePanel } from "@/components/state";

const ROLES = ["reviewer", "operator", "finance", "admin"] as const;

type Member = { id: string; name: string; email: string; role: string; teamSlug: string | null; teamName: string | null };
type TeamOption = { slug: string; name: string; seats: number; filled?: number };

export function PeopleScreen() {
  const user = useWorkspaceUser();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["people"], queryFn: () => api<{ members: Member[] }>("/api/people") });
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: TeamOption[] }>("/api/teams") });
  const admin = can(user.role, "people");
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("reviewer");
  const [nextRole, setNextRole] = useState<(typeof ROLES)[number]>("reviewer");
  const [teamSlug, setTeamSlug] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const members = list.data?.members ?? [];
  const current = members.find((member) => member.id === selected) ?? null;

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["people"] });
    await client.invalidateQueries({ queryKey: ["teams"] });
    await client.invalidateQueries({ queryKey: ["audit"] });
  }

  const add = useMutation({
    mutationFn: () => api<Member>("/api/people", { method: "POST", body: JSON.stringify({ name, email, password, role }) }),
    onSuccess: async (member) => {
      setName("");
      setEmail("");
      setPassword("");
      setRole("reviewer");
      setError(null);
      setMessage(`${member.name} can sign in as ${member.role}. Quiet did not send an email.`);
      setSelected(member.id);
      await refresh();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const change = useMutation({
    mutationFn: () => api(`/api/people/${current?.id}/role`, { method: "POST", body: JSON.stringify({ role: nextRole }) }),
    onSuccess: async () => {
      setError(null);
      setMessage("Role updated.");
      await refresh();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const place = useMutation({
    mutationFn: () => api<{ notice: string }>(`/api/people/${current?.id}/team`, { method: "POST", body: JSON.stringify({ teamSlug: teamSlug || null }) }),
    onSuccess: async (result) => {
      setError(null);
      setMessage(result.notice);
      await refresh();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const panel = useMemo(() => current ? {
    title: current.name,
    sections: [
      { label: "Role", text: current.role },
      { label: "Team", text: current.teamName ?? "No team. Placement does not change purchased seats." },
      { label: "Sign-in", text: current.email },
      { label: "Access", text: "A reviewer reads the room. An operator routes. Finance moves money. An admin adds people and keys." },
    ],
  } : {
    title: "People",
    sections: [{ label: "Password", text: "The admin sets the password here. Quiet does not email it and does not store it in the audit log." }],
  }, [current]);
  usePanel(panel);

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <header>
          <p className="label">Workspace</p>
          <h1 className="section-title">People</h1>
          <p className="lede">An admin adds a person, chooses a role, and can place them on a team. Placement does not change the purchased seat count or the billed ledger. Quiet does not send email.</p>
        </header>
        <div className="table-wrap fit">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th></tr></thead>
            <tbody>
              {members.length === 0 ? <tr><td colSpan={4}>No people yet.</td></tr> : members.map((member) => (
                <tr key={member.id} aria-selected={member.id === current?.id}>
                  <td><button className="row-button" type="button" onClick={() => { setSelected(member.id); setNextRole(member.role as (typeof ROLES)[number]); setTeamSlug(member.teamSlug ?? ""); }}>{member.name}</button></td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{member.teamName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="card stack" onSubmit={(event) => { event.preventDefault(); setMessage(null); add.mutate(); }}>
          <h2 className="section-title">Add a person</h2>
          <label className="field"><span className="label">Name</span><input aria-label="Person name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field"><span className="label">Email</span><input aria-label="Person email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="field"><span className="label">Password</span><input aria-label="Person password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="field">
            <span className="label">Role</span>
            <select aria-label="Person role" value={role} onChange={(event) => setRole(event.target.value as (typeof ROLES)[number])}>
              {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="btn primary" type="submit" disabled={!admin || add.isPending}>{busyLabel(add.isPending, "Add person")}</button>
          {!admin ? <p className="faint">Only an admin can add a person, change a role, or place them on a team.</p> : null}
        </form>
        <form className="card stack" onSubmit={(event) => { event.preventDefault(); setMessage(null); change.mutate(); }}>
          <h2 className="section-title">Change role</h2>
          <p className="muted">{current ? current.name : "Select a person in the table."}</p>
          <label className="field">
            <span className="label">Role</span>
            <select aria-label="New role" value={nextRole} onChange={(event) => setNextRole(event.target.value as (typeof ROLES)[number])}>
              {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="btn" type="submit" disabled={!admin || !current || change.isPending}>{busyLabel(change.isPending, "Update role")}</button>
        </form>
        <form className="card stack" onSubmit={(event) => { event.preventDefault(); setMessage(null); place.mutate(); }}>
          <h2 className="section-title">Place on a team</h2>
          <p className="muted">{current ? current.name : "Select a person in the table."}</p>
          <label className="field">
            <span className="label">Team</span>
            <select aria-label="Team placement" value={teamSlug} onChange={(event) => setTeamSlug(event.target.value)}>
              <option value="">No team</option>
              {(teams.data?.teams ?? []).map((team) => <option key={team.slug} value={team.slug}>{team.name}</option>)}
            </select>
          </label>
          <button className="btn" type="submit" disabled={!admin || !current || place.isPending}>{busyLabel(place.isPending, "Place on team")}</button>
        </form>
        {message ? <p className="notice" role="status">{message}</p> : null}
        {error ? <p className="notice" data-tone="critical" role="alert">{error}</p> : null}
      </div>
    </ScreenState>
  );
}
