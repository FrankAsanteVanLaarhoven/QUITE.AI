import { hashPassword } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { ROLES, type Role } from "@/lib/types";

type Actor = { id: string; workspaceId: string; role: Role; name: string };

export type MemberInput = {
  name: string;
  email: string;
  password: string;
  role: string;
};

export function parseRole(value: string): Role | null {
  return ROLES.includes(value as Role) ? (value as Role) : null;
}

export function validateMember(input: MemberInput): { error: string; code: string } | null {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) return { error: "Enter the name people should see in the control room.", code: "name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { error: "Enter a valid email address.", code: "invalid" };
  if (input.password.length < 12 || input.password.length > 200) return { error: "Use a password of at least 12 characters.", code: "password" };
  if (!parseRole(input.role)) return { error: "Choose admin, finance, operator, or reviewer.", code: "role" };
  return null;
}

export async function listMembers(workspaceId: string) {
  const { query } = await import("@/lib/db");
  const rows = await query<{ id: string; name: string; email: string; role: Role; team_slug: string | null; team_name: string | null }>(
    `SELECT u.id, u.name, u.email, u.role, t.slug AS team_slug, t.name AS team_name
     FROM users u
     LEFT JOIN team_members m ON m.user_id = u.id
     LEFT JOIN teams t ON t.id = m.team_id
     WHERE u.workspace_id = $1
     ORDER BY u.name`,
    [workspaceId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    teamSlug: row.team_slug,
    teamName: row.team_name,
  }));
}

export async function addMember(actor: Actor, input: MemberInput) {
  if (actor.role !== "admin") throw new HttpError(403, "Only an admin can add a person.", "forbidden");
  const problem = validateMember(input);
  if (problem) throw new HttpError(400, problem.error, problem.code);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const role = parseRole(input.role) as Role;
  const passwordHash = await hashPassword(input.password);
  const id = crypto.randomUUID();
  await withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(40121)");
    const taken = await client.query(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
    if (taken.rows[0]) throw new HttpError(409, "That email already signs in to Quiet.", "email");
    await client.query(
      `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, actor.workspaceId, email, name, role, passwordHash],
    );
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'member.added', 'user', $4, $5::jsonb)`,
      [crypto.randomUUID(), actor.workspaceId, actor.id, id, JSON.stringify({ role })],
    );
  });
  return { id, name, email, role };
}

export async function setMemberRole(actor: Actor, userId: string, roleValue: string) {
  if (actor.role !== "admin") throw new HttpError(403, "Only an admin can change a role.", "forbidden");
  const role = parseRole(roleValue);
  if (!role) throw new HttpError(400, "Choose admin, finance, operator, or reviewer.", "role");
  await withTx(async (client) => {
    const current = await client.query<{ id: string; role: Role }>(
      `SELECT id, role FROM users WHERE id = $1 AND workspace_id = $2`,
      [userId, actor.workspaceId],
    );
    const person = current.rows[0];
    if (!person) throw new HttpError(404, "That person is not in this workspace.", "not_found");
    if (person.role === "admin" && role !== "admin") {
      const admins = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE workspace_id = $1 AND role = 'admin' AND id <> $2`,
        [actor.workspaceId, userId],
      );
      if (admins.rows.length === 0) throw new HttpError(409, "Quiet needs at least one admin in this workspace.", "last_admin");
    }
    await client.query(`UPDATE users SET role = $1 WHERE id = $2 AND workspace_id = $3`, [role, userId, actor.workspaceId]);
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'member.role', 'user', $4, $5::jsonb)`,
      [crypto.randomUUID(), actor.workspaceId, actor.id, userId, JSON.stringify({ from: person.role, to: role })],
    );
  });
  return { id: userId, role };
}

export async function setMemberTeam(actor: Actor, userId: string, teamSlug: string | null) {
  if (actor.role !== "admin") throw new HttpError(403, "Only an admin can place a person on a team.", "forbidden");
  const slug = teamSlug?.trim() || null;
  return withTx(async (client) => {
    const person = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND workspace_id = $2`,
      [userId, actor.workspaceId],
    );
    if (!person.rows[0]) throw new HttpError(404, "That person is not in this workspace.", "not_found");
    if (!slug) {
      await client.query(`DELETE FROM team_members WHERE user_id = $1 AND workspace_id = $2`, [userId, actor.workspaceId]);
      await client.query(
        `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
         VALUES ($1, $2, $3, 'member.team', 'user', $4, '{"team":null}'::jsonb)`,
        [crypto.randomUUID(), actor.workspaceId, actor.id, userId],
      );
      return { teamName: null, teamSlug: null, seats: null, filled: 0, notice: "Removed from the team. Purchased seats were not changed." };
    }
    const team = await client.query<{ id: string; name: string; seats: number }>(
      `SELECT id, name, seats FROM teams WHERE workspace_id = $1 AND slug = $2`,
      [actor.workspaceId, slug],
    );
    const row = team.rows[0];
    if (!row) throw new HttpError(404, "That team is not in this workspace.", "not_found");
    await client.query(
      `INSERT INTO team_members (workspace_id, user_id, team_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET team_id = EXCLUDED.team_id, workspace_id = EXCLUDED.workspace_id`,
      [actor.workspaceId, userId, row.id],
    );
    const count = await client.query<{ filled: number }>(
      `SELECT count(*)::int AS filled FROM team_members WHERE team_id = $1`,
      [row.id],
    );
    const filled = count.rows[0]?.filled ?? 0;
    const seats = row.seats;
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'member.team', 'user', $4, $5::jsonb)`,
      [crypto.randomUUID(), actor.workspaceId, actor.id, userId, JSON.stringify({ team: slug })],
    );
    const notice = seats === 0
      ? `Placed on ${row.name}. That team has no purchased seats. The assignment does not add one.`
      : filled > seats
        ? `Placed on ${row.name}. Assigned people now exceed the ${seats} purchased seats. The seat count was not changed.`
        : `Placed on ${row.name}. Purchased seats stay ${seats}.`;
    return { teamName: row.name, teamSlug: slug, seats, filled, notice };
  });
}
