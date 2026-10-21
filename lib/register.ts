import { CATALOGUE, DEFAULT_POLICIES } from "@/lib/catalogue";
import { hashPassword } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
};

export function validateSignup(input: SignupInput): { error: string; code: string } | null {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const workspaceName = input.workspaceName.trim();
  if (name.length < 2 || name.length > 80) return { error: "Enter the name people should see in the control room.", code: "name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { error: "Enter a valid email address.", code: "invalid" };
  if (input.password.length < 12 || input.password.length > 200) return { error: "Use a password of at least 12 characters.", code: "password" };
  if (workspaceName.length < 2 || workspaceName.length > 80) return { error: "Name the workspace with at least 2 characters.", code: "workspace" };
  return null;
}

export function slugifyWorkspace(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "workspace";
}

export async function registerWorkspace(input: SignupInput): Promise<{ userId: string; email: string; workspaceId: string }> {
  const problem = validateSignup(input);
  if (problem) throw new HttpError(400, problem.error, problem.code);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const workspaceName = input.workspaceName.trim();
  const passwordHash = await hashPassword(input.password);
  const userId = crypto.randomUUID();
  let workspaceId = "";

  await withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(40121)");
    const taken = await client.query(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
    if (taken.rows[0]) throw new HttpError(409, "That email already has a Quiet workspace. Sign in instead.", "email");

    let slug = slugifyWorkspace(workspaceName);
    const clash = await client.query(`SELECT id FROM workspaces WHERE slug = $1`, [slug]);
    if (clash.rows[0]) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;

    workspaceId = crypto.randomUUID();
    const productionId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();
    const period = new Date().toISOString().slice(0, 7);
    await client.query(`INSERT INTO workspaces (id, slug, name) VALUES ($1, $2, $3)`, [workspaceId, slug, workspaceName]);
    await client.query(
      `INSERT INTO environments (id, workspace_id, slug, name) VALUES ($1, $2, 'production', 'Production'), ($3, $2, 'staging', 'Staging')`,
      [productionId, workspaceId, stagingId],
    );
    await client.query(
      `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, 'admin', $5)`,
      [userId, workspaceId, email, name, passwordHash],
    );
    for (const model of CATALOGUE) {
      await client.query(`INSERT INTO model_access (workspace_id, model_slug, allowed) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`, [workspaceId, model.slug]);
    }
    for (const policy of DEFAULT_POLICIES) {
      await client.query(
        `INSERT INTO policies (id, workspace_id, name, priority, enabled, definition) VALUES ($1, $2, $3, $4, true, $5::jsonb)`,
        [crypto.randomUUID(), workspaceId, policy.name, policy.priority, JSON.stringify(policy.definition)],
      );
    }
    await client.query(
      `INSERT INTO teams (id, workspace_id, slug, name, seats, allowance_micro) VALUES ($1, $2, 'general', 'General', 0, 0)`,
      [crypto.randomUUID(), workspaceId],
    );
    await client.query(
      `INSERT INTO budgets (workspace_id, environment_id, period, committed_micro) VALUES ($1, $2, $3, 0), ($1, $4, $3, 0)`,
      [workspaceId, productionId, period, stagingId],
    );
    await client.query(`INSERT INTO credit_accounts (workspace_id, balance_micro) VALUES ($1, 0)`, [workspaceId]);
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'workspace.created', 'workspace', $2, '{}'::jsonb)`,
      [crypto.randomUUID(), workspaceId, userId],
    );
  });

  return { userId, email, workspaceId };
}
