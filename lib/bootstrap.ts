import type { PoolClient } from "pg";
import { CATALOGUE, DEFAULT_POLICIES } from "@/lib/catalogue";
import { appConfig } from "@/lib/config";
import { withTx } from "@/lib/db";
import { hashPassword, sha256 } from "@/lib/auth";
import { buildDemoLedger, buildStagingRequests, DEMO_COMMITTED_MICRO, DEMO_TEAMS, type DemoRequest } from "@/lib/demo-ledger";
import { poundsToMicro } from "@/lib/money";
import { SCHEMA_SQL } from "@/lib/schema";
import { log } from "@/lib/logger";

export const boot = { ready: false, error: null as string | null };
let pending: Promise<void> | null = null;

export function resetBootForTests(): void {
  boot.ready = false;
  boot.error = null;
  pending = null;
}

export function ensureBoot(): Promise<void> {
  if (boot.ready) return Promise.resolve();
  if (!pending) {
    pending = bootstrap().finally(() => {
      if (!boot.ready) pending = null;
    });
  }
  return pending;
}

export async function bootstrap(): Promise<void> {
  try {
    const config = appConfig();
    if (!config.databaseUrl) {
      boot.error = "DATABASE_URL is not set. Start Postgres and restart Quiet.";
      boot.ready = false;
      return;
    }
    await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(40121)");
      await client.query(SCHEMA_SQL);
      await client.query(`INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING`);
      await client.query(`INSERT INTO schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING`);
      await seedModels(client);
      await seedWorkspace(client);
      await client.query(
        `INSERT INTO credit_accounts (workspace_id, balance_micro)
         SELECT id, 0 FROM workspaces
         ON CONFLICT (workspace_id) DO NOTHING`,
      );
    });
    boot.ready = true;
    boot.error = null;
    log("info", "bootstrap_ready", { seed: appConfig().seed });
  } catch (error) {
    boot.ready = false;
    const message = error instanceof Error ? error.message : "Quiet could not prepare the database.";
    boot.error = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|authentication failed|does not exist/i.test(message)
      ? "Quiet cannot reach Postgres. Check DATABASE_URL and that the database is accepting connections."
      : message;
    log("error", "bootstrap_failed", { message });
  }
}

async function seedModels(client: PoolClient): Promise<void> {
  for (const model of CATALOGUE) {
    await client.query(
      `INSERT INTO models (slug, name, provider, tier, region, input_micro_per_million, output_micro_per_million, latency_p50_ms, quality_index, adapter, upstream_model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO NOTHING`,
      [
        model.slug,
        model.name,
        model.provider,
        model.tier,
        model.region,
        model.inputMicroPerMillion.toString(),
        model.outputMicroPerMillion.toString(),
        model.latencyP50Ms,
        model.qualityIndex,
        model.adapter,
        model.upstreamModel,
      ],
    );
  }
}

async function seedWorkspace(client: PoolClient): Promise<void> {
  const config = appConfig();
  const slug = config.seed === "demo" ? "harbourline" : slugify(config.workspaceName);
  const existing = await client.query<{ id: string }>(`SELECT id FROM workspaces WHERE slug = $1`, [slug]);
  if (existing.rows[0]) return;

  const workspaceId = crypto.randomUUID();
  const productionId = crypto.randomUUID();
  const stagingId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  await client.query(`INSERT INTO workspaces (id, slug, name) VALUES ($1, $2, $3)`, [
    workspaceId,
    slug,
    config.seed === "demo" ? "Harbourline" : config.workspaceName,
  ]);
  await client.query(`INSERT INTO environments (id, workspace_id, slug, name) VALUES ($1, $2, 'production', 'Production'), ($3, $2, 'staging', 'Staging')`, [
    productionId,
    workspaceId,
    stagingId,
  ]);
  const passwordHash = await hashPassword(config.adminPassword);
  await client.query(
    `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, 'admin', $5)`,
    [adminId, workspaceId, config.adminEmail, config.adminName, passwordHash],
  );
  for (const model of CATALOGUE) {
    await client.query(`INSERT INTO model_access (workspace_id, model_slug, allowed) VALUES ($1, $2, true)`, [workspaceId, model.slug]);
  }
  const policyIds = new Map<string, string>();
  for (const policy of DEFAULT_POLICIES) {
    const id = crypto.randomUUID();
    policyIds.set(policy.name, id);
    await client.query(
      `INSERT INTO policies (id, workspace_id, name, priority, enabled, definition) VALUES ($1, $2, $3, $4, true, $5::jsonb)`,
      [id, workspaceId, policy.name, policy.priority, JSON.stringify(policy.definition)],
    );
  }

  if (config.seed === "demo") {
    const reviewerHash = await hashPassword(config.adminPassword);
    await client.query(
      `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, 'reviewer', $5)`,
      [crypto.randomUUID(), workspaceId, "samir@harbourline.example", "Samir Shah", reviewerHash],
    );
    const teamIds = new Map<string, string>();
    for (const team of DEMO_TEAMS) {
      const id = crypto.randomUUID();
      teamIds.set(team.slug, id);
      await client.query(
        `INSERT INTO teams (id, workspace_id, slug, name, seats, allowance_micro) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, workspaceId, team.slug, team.name, team.seats, poundsToMicro(team.allowancePounds).toString()],
      );
    }
    await client.query(
      `INSERT INTO budgets (workspace_id, environment_id, period, committed_micro) VALUES ($1, $2, '2026-10', $3), ($1, $4, '2026-10', $5)`,
      [workspaceId, productionId, DEMO_COMMITTED_MICRO.toString(), stagingId, poundsToMicro(4800n).toString()],
    );
    const ledger = buildDemoLedger();
    await insertRequests(client, ledger.requests, { workspaceId, environmentId: productionId, teamIds, policyIds });
    await insertRequests(client, buildStagingRequests(), { workspaceId, environmentId: stagingId, teamIds, policyIds });
    if (config.devApiKey) {
      await client.query(`INSERT INTO api_keys (id, workspace_id, environment_id, name, token_prefix, token_hash) VALUES ($1, $2, $3, $4, $5, $6)`, [
        crypto.randomUUID(),
        workspaceId,
        productionId,
        "Local demo",
        config.devApiKey.slice(0, 12),
        sha256(config.devApiKey),
      ]);
    }
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'ledger.imported', 'workspace', $2, $4::jsonb)`,
      [crypto.randomUUID(), workspaceId, adminId, JSON.stringify({ period: "2026-10", note: "October usage ledger imported for Harbourline." })],
    );
  } else {
    await client.query(
      `INSERT INTO teams (id, workspace_id, slug, name, seats, allowance_micro) VALUES ($1, $2, 'general', 'General', 0, 0)`,
      [crypto.randomUUID(), workspaceId],
    );
    await client.query(
      `INSERT INTO budgets (workspace_id, environment_id, period, committed_micro) VALUES ($1, $2, $3, 0), ($1, $4, $3, 0)`,
      [workspaceId, productionId, new Date().toISOString().slice(0, 7), stagingId],
    );
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail)
       VALUES ($1, $2, $3, 'workspace.created', 'workspace', $2, '{}'::jsonb)`,
      [crypto.randomUUID(), workspaceId, adminId],
    );
  }
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "workspace";
}

async function insertRequests(
  client: PoolClient,
  requests: DemoRequest[],
  scope: { workspaceId: string; environmentId: string; teamIds: Map<string, string>; policyIds: Map<string, string> },
): Promise<void> {
  const width = 30;
  for (let offset = 0; offset < requests.length; offset += 200) {
    const slice = requests.slice(offset, offset + 200);
    const values: unknown[] = [];
    const groups = slice.map((request, index) => {
      const base = index * width;
      const row = [
        request.id,
        scope.workspaceId,
        scope.environmentId,
        scope.teamIds.get(request.teamSlug) ?? null,
        request.policyName ? scope.policyIds.get(request.policyName) ?? null : null,
        request.workflow,
        request.taskLabel,
        request.taskType,
        request.complexity,
        request.sensitivity,
        request.confidence,
        request.tokensIn,
        request.tokensOut,
        request.modelSlug,
        request.premiumSlug,
        request.estimatedMicro.toString(),
        request.premiumMicro.toString(),
        request.actualMicro?.toString() ?? null,
        request.savingMicro.toString(),
        request.status,
        request.withinPolicy,
        request.escalated,
        JSON.stringify(request.reasons),
        request.pros,
        request.cons,
        request.excerpt,
        null,
        request.mode,
        request.featured,
        request.createdAt,
      ];
      if (row.length !== width) throw new Error("Request insert width drifted.");
      values.push(...row);
      return `(${row.map((_, column) => `$${base + column + 1}`).join(",")})`;
    });
    await client.query(
      `INSERT INTO requests (
        id, workspace_id, environment_id, team_id, policy_id, workflow, task_label, task_type, complexity, sensitivity,
        confidence, tokens_in, tokens_out, selected_model_slug, premium_model_slug, estimated_cost_micro, premium_cost_micro,
        actual_cost_micro, saving_micro, status, within_policy, escalated, reasons, pros, cons, excerpt, prompt_sha256, mode, featured, created_at
      ) VALUES ${groups.join(",")}`,
      values,
    );
  }
  for (const request of requests) {
    if (!request.approval) continue;
    await client.query(
      `INSERT INTO approvals (id, request_id, workspace_id, status, recommended_tier, reason)
       VALUES ($1, $2, $3, 'pending', $4, $5)`,
      [crypto.randomUUID(), request.id, scope.workspaceId, request.approval.recommendedTier, request.approval.reason],
    );
  }
}

