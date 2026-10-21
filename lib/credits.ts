import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { formatMicro } from "@/lib/format";
import { HttpError } from "@/lib/http";
import { MICRO } from "@/lib/money";
import type { Role } from "@/lib/types";

const MAX_POUNDS = 100_000n;

export function parseCreditPounds(raw: string): { micro: bigint } | { error: string } {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { error: "Enter the amount in pounds, with at most two decimal places." };
  }
  const [whole, fraction = ""] = text.split(".");
  const pounds = BigInt(whole);
  const frac = BigInt((fraction + "00").slice(0, 2));
  const micro = pounds * MICRO + frac * 10_000n;
  if (micro <= 0n) return { error: "Enter an amount greater than £0." };
  if (pounds > MAX_POUNDS) return { error: "Quiet records a single credit entry up to £100,000." };
  return { micro };
}

type Actor = { id: string; workspaceId: string; role: Role; name: string };

export function canSettleCredit(role: Role): boolean {
  return role === "admin" || role === "finance";
}

export async function getCredits(workspaceId: string, role: Role) {
  const { query } = await import("@/lib/db");
  await ensureAccount(workspaceId);
  const accounts = await query<{ balance_micro: string }>(
    `SELECT balance_micro::text FROM credit_accounts WHERE workspace_id = $1`,
    [workspaceId],
  );
  const entries = await query<{
    id: string;
    kind: string;
    status: string;
    amount_micro: string;
    note: string;
    created_at: Date | string;
  }>(
    `SELECT id, kind, status, amount_micro::text, note, created_at
     FROM credit_entries WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [workspaceId],
  );
  return {
    balance: formatMicro(BigInt(accounts[0]?.balance_micro ?? "0")),
    canSettle: canSettleCredit(role),
    settlement: "Quiet records credit in the workspace ledger. No card is charged.",
    entries: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      amount: formatMicro(BigInt(entry.amount_micro)),
      note: entry.note,
      createdAt: new Date(entry.created_at).toISOString(),
    })),
  };
}

export async function recordCredit(actor: Actor, rawPounds: string, kind: "grant" | "purchase"): Promise<{ status: string; balance: string }> {
  const parsed = parseCreditPounds(rawPounds);
  if ("error" in parsed) throw new HttpError(400, parsed.error, "invalid");
  if (kind === "grant" && !canSettleCredit(actor.role)) {
    throw new HttpError(403, "Only an admin or finance role can add credit.", "forbidden");
  }
  const settle = kind === "grant" || canSettleCredit(actor.role);
  const status = settle ? "posted" : "awaiting_payment";
  const note = settle
    ? "Recorded in the workspace ledger. No card was charged."
    : "Waiting for an admin or finance role to record the purchase. No card was charged.";
  await withTx(async (client) => {
    await ensureAccount(actor.workspaceId, client);
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO credit_entries (id, workspace_id, actor_id, kind, status, amount_micro, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, actor.workspaceId, actor.id, kind, status, parsed.micro.toString(), note],
    );
    if (settle) {
      await client.query(`UPDATE credit_accounts SET balance_micro = balance_micro + $2 WHERE workspace_id = $1`, [
        actor.workspaceId,
        parsed.micro.toString(),
      ]);
    }
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, $4, 'credit', $5, $6::jsonb)`,
      [crypto.randomUUID(), actor.workspaceId, actor.id, settle ? "credit.posted" : "credit.requested", id, JSON.stringify({ kind, status })],
    );
  });
  const view = await getCredits(actor.workspaceId, actor.role);
  return { status, balance: view.balance };
}

export async function postCredit(actor: Actor, entryId: string): Promise<{ balance: string }> {
  if (!canSettleCredit(actor.role)) throw new HttpError(403, "Only an admin or finance role can record a purchase.", "forbidden");
  await withTx(async (client) => {
    const rows = await client.query<{ amount_micro: string }>(
      `UPDATE credit_entries SET status = 'posted'
       WHERE id = $1 AND workspace_id = $2 AND status = 'awaiting_payment'
       RETURNING amount_micro::text`,
      [entryId, actor.workspaceId],
    );
    const amount = rows.rows[0]?.amount_micro;
    if (!amount) throw new HttpError(404, "That credit request is not waiting for settlement.", "not_found");
    await ensureAccount(actor.workspaceId, client);
    await client.query(`UPDATE credit_accounts SET balance_micro = balance_micro + $2 WHERE workspace_id = $1`, [actor.workspaceId, amount]);
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'credit.posted', 'credit', $4, '{"kind":"purchase","status":"posted"}'::jsonb)`,
      [crypto.randomUUID(), actor.workspaceId, actor.id, entryId],
    );
  });
  const view = await getCredits(actor.workspaceId, actor.role);
  return { balance: view.balance };
}

async function ensureAccount(workspaceId: string, client?: PoolClient): Promise<void> {
  const sql = `INSERT INTO credit_accounts (workspace_id, balance_micro) VALUES ($1, 0) ON CONFLICT (workspace_id) DO NOTHING`;
  if (client) {
    await client.query(sql, [workspaceId]);
    return;
  }
  const { query } = await import("@/lib/db");
  await query(sql, [workspaceId]);
}
