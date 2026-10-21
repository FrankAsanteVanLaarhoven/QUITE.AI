import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "@/lib/db";
import type { Role } from "@/lib/types";

const scrypt = promisify(scryptCallback);

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  workspaceId: string;
  workspaceName: string;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const actual = (await scrypt(password, Buffer.from(salt, "base64"), 32)) as Buffer;
  const expected = Buffer.from(key, "base64");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function findSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await query<{
    id: string;
    email: string;
    name: string;
    role: Role;
    workspace_id: string;
    workspace_name: string;
  }>(
    `SELECT u.id, u.email, u.name, u.role, u.workspace_id, w.name AS workspace_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN workspaces w ON w.id = u.workspace_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '12 hours')`,
    [crypto.randomUUID(), userId, sha256(token)],
  );
  return token;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}
