import type { PoolClient } from "pg";
import { CATALOGUE } from "@/lib/catalogue";
import { appConfig } from "@/lib/config";
import { micro, nullableMicro, query, withTx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { formatConfidence, formatMicro, formatPercentRatio, microToNumber } from "@/lib/format";
import { recommendations, teamStatus, type TeamSnapshot } from "@/lib/finops";
import { sha256 as hashToken, newToken } from "@/lib/auth";
import { requestCostMicro } from "@/lib/money";
import { callProvider, ProviderError } from "@/lib/providers";
import { decide, savingMicro } from "@/lib/router/decide";
import { monthBounds, forecastMicro, ratio, type DailySpend } from "@/lib/router/forecast";
import { costOf, listAlternatives, referencePremium } from "@/lib/router/select";
import { span } from "@/lib/telemetry";
import type { CatalogueModel, PolicyDefinition, PolicyRecord, Role, TeamBudget, Tier } from "@/lib/types";
import { SENSITIVITIES, TASK_TYPES, TIERS } from "@/lib/types";

const QUALITY_COPY =
  "Quality is the share of billed requests that completed on the chosen model without an escalation. Saving is the gap versus the premium baseline on those billed requests.";

type EnvRef = { id: string; slug: string; name: string };
type RequestRow = Record<string, unknown>;

export type SessionRef = { id: string; workspaceId: string; role: Role; name: string };

export async function environmentBySlug(workspaceId: string, slug: string): Promise<EnvRef> {
  const rows = await query<{ id: string; slug: string; name: string }>(
    `SELECT id, slug, name FROM environments WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug === "staging" ? "staging" : "production"],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "That environment is not in this workspace.", "environment");
  return row;
}

export function reportingDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function getOverview(workspaceId: string, env: EnvRef, asOf = reportingDate()) {
  const window = monthWindow(asOf);
  const [dailyRows, teamDaily, teams, budgetRows, qualityRows] = await Promise.all([
    query<{ day: string; spent: string }>(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              COALESCE(SUM(actual_cost_micro), 0)::text AS spent
       FROM requests
       WHERE workspace_id = $1 AND environment_id = $2 AND actual_cost_micro IS NOT NULL
         AND created_at >= $3 AND created_at < $4
       GROUP BY 1 ORDER BY 1`,
      [workspaceId, env.id, window.start, window.end],
    ),
    query<{ slug: string; day: string; spent: string }>(
      `SELECT t.slug, to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              COALESCE(SUM(r.actual_cost_micro), 0)::text AS spent
       FROM requests r JOIN teams t ON t.id = r.team_id
       WHERE r.workspace_id = $1 AND r.environment_id = $2 AND r.actual_cost_micro IS NOT NULL
         AND r.created_at >= $3 AND r.created_at < $4
       GROUP BY t.slug, 2`,
      [workspaceId, env.id, window.start, window.end],
    ),
    query<{ slug: string; name: string; seats: number; allowance_micro: string }>(
      `SELECT slug, name, seats, allowance_micro::text FROM teams WHERE workspace_id = $1 ORDER BY seats DESC, name`,
      [workspaceId],
    ),
    query<{ committed_micro: string }>(
      `SELECT committed_micro::text FROM budgets WHERE workspace_id = $1 AND environment_id = $2 AND period = $3`,
      [workspaceId, env.id, window.period],
    ),
    query<{ billed: string; ok: string; saving: string }>(
      `SELECT COUNT(*) FILTER (WHERE actual_cost_micro IS NOT NULL)::text AS billed,
              COUNT(*) FILTER (WHERE actual_cost_micro IS NOT NULL AND within_policy AND NOT escalated)::text AS ok,
              COALESCE(SUM(saving_micro) FILTER (WHERE actual_cost_micro IS NOT NULL), 0)::text AS saving
       FROM requests
       WHERE workspace_id = $1 AND environment_id = $2 AND created_at >= $3 AND created_at < $4`,
      [workspaceId, env.id, window.start, window.end],
    ),
  ]);

  const daily: DailySpend[] = dailyRows.map((row) => ({ day: row.day, spentMicro: micro(row.spent) }));
  const spent = daily.reduce((total, row) => total + row.spentMicro, 0n);
  const forecast = forecastMicro(daily, asOf, window.days);
  const saving = micro(qualityRows[0]?.saving);
  const billed = Number(qualityRows[0]?.billed ?? 0);
  const ok = Number(qualityRows[0]?.ok ?? 0);
  const quality = billed > 0 ? ok / billed : null;
  const committed = micro(budgetRows[0]?.committed_micro);

  const byTeam = new Map<string, DailySpend[]>();
  for (const row of teamDaily) {
    const list = byTeam.get(row.slug) ?? [];
    list.push({ day: row.day, spentMicro: micro(row.spent) });
    byTeam.set(row.slug, list);
  }
  const snapshots: TeamSnapshot[] = teams.map((team) => ({
    slug: team.slug,
    name: team.name,
    seats: team.seats,
    allowanceMicro: micro(team.allowance_micro),
    spentMicro: (byTeam.get(team.slug) ?? []).reduce((total, row) => total + row.spentMicro, 0n),
    forecastMicro: forecastMicro(byTeam.get(team.slug) ?? [], asOf, window.days),
  }));

  let cumulative = 0;
  const series = daily.map((row) => {
    cumulative += microToNumber(row.spentMicro);
    return { day: row.day, cumulative: Math.round(cumulative) };
  });

  return {
    asOf,
    period: window.period,
    environment: env,
    definition: QUALITY_COPY,
    headline: quality == null
      ? "No billed usage yet this month."
      : `You saved ${formatMicro(saving)} this month while maintaining ${formatPercentRatio(quality)} quality.`,
    saving: formatMicro(saving),
    quality: quality == null ? "—" : formatPercentRatio(quality),
    spent: formatMicro(spent),
    committed: formatMicro(committed),
    forecast: formatMicro(forecast),
    billed,
    committedNumber: Math.round(microToNumber(committed)),
    series,
    teams: snapshots.map((team) => ({
      slug: team.slug,
      name: team.name,
      seats: team.seats,
      status: teamStatus(team),
      used: ratioLabel(team.spentMicro, team.allowanceMicro),
      forecast: ratioLabel(team.forecastMicro, team.allowanceMicro),
      spent: formatMicro(team.spentMicro),
      allowance: formatMicro(team.allowanceMicro),
      forecastAmount: formatMicro(team.forecastMicro),
    })),
    recommendations: recommendations(snapshots),
  };
}

function ratioLabel(part: bigint, whole: bigint): string | null {
  const value = ratio(part, whole);
  return value == null ? null : formatPercentRatio(value);
}

function monthWindow(asOf: string): { start: string; end: string; period: string; days: number } {
  const { start, daysInMonth } = monthBounds(asOf);
  const [year, month] = start.split("-").map(Number);
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end, period: start.slice(0, 7), days: daysInMonth };
}

export async function listRequests(workspaceId: string, environmentId: string) {
  const rows = await query<RequestRow>(`${REQUEST_SELECT} WHERE r.workspace_id = $1 AND r.environment_id = $2 ORDER BY r.created_at DESC LIMIT 40`, [
    workspaceId,
    environmentId,
  ]);
  const models = await loadModels(workspaceId);
  return rows.map((row) => presentRequest(row, models));
}

export async function getRequest(workspaceId: string, id: string) {
  const rows = await query<RequestRow>(`${REQUEST_SELECT} WHERE r.workspace_id = $1 AND r.id = $2`, [workspaceId, id]);
  const row = rows[0];
  if (!row) throw new HttpError(404, "That request is not in this workspace.", "not_found");
  const [models, audit] = await Promise.all([
    loadModels(workspaceId),
    query<{ action: string; created_at: string; actor: string | null; detail: unknown }>(
      `SELECT a.action, a.created_at, u.name AS actor, a.detail
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.workspace_id = $1 AND a.target_id = $2
       ORDER BY a.created_at DESC LIMIT 12`,
      [workspaceId, id],
    ),
  ]);
  return { ...presentRequest(row, models), audit: audit.map((event) => ({ action: event.action, at: event.created_at, actor: event.actor, detail: event.detail })) };
}

export async function acceptRequest(actor: SessionRef, id: string) {
  return withTx(async (client) => {
    const row = await lockRequest(client, actor.workspaceId, id);
    if (row.status === "rejected") throw new HttpError(409, "This request was rejected. Route it again if it still needs a model.", "rejected");
    await client.query(`UPDATE requests SET status = 'accepted' WHERE id = $1`, [id]);
    await client.query(`UPDATE approvals SET status = 'approved', reviewer_id = $2, decided_at = now() WHERE request_id = $1 AND status = 'pending'`, [id, actor.id]);
    await audit(client, actor, "request.accepted", id, {});
    return loadRequestView(client, actor.workspaceId, id);
  });
}

export async function usePremium(actor: SessionRef, id: string) {
  return withTx(async (client) => {
    const row = await lockRequest(client, actor.workspaceId, id);
    if (row.actual_cost_micro != null) {
      throw new HttpError(409, "This request was already billed. Pin the workflow if future calls should use the premium model.", "already_billed");
    }
    await client.query(
      `UPDATE requests
       SET selected_model_slug = premium_model_slug,
           estimated_cost_micro = premium_cost_micro,
           saving_micro = 0,
           status = 'overridden'
       WHERE id = $1`,
      [id],
    );
    await audit(client, actor, "request.premium", id, { model: String(row.premium_model_slug) });
    return loadRequestView(client, actor.workspaceId, id);
  });
}

export async function pinWorkflow(actor: SessionRef, id: string) {
  return withTx(async (client) => {
    const row = await lockRequest(client, actor.workspaceId, id);
    const workflow = String(row.workflow);
    const name = `Always premium · ${workflow}`;
    const existing = await client.query<{ id: string }>(`SELECT id FROM policies WHERE workspace_id = $1 AND name = $2`, [actor.workspaceId, name]);
    const policyId = existing.rows[0]?.id ?? crypto.randomUUID();
    const definition = {
      when: { workflows: [workflow] },
      then: { tier: "premium", minQuality: 92, escalateBelowConfidence: 0.5, pinModelSlug: "claude-sonnet" },
    };
    if (existing.rows[0]) {
      await client.query(`UPDATE policies SET enabled = true, priority = 40, definition = $2::jsonb, updated_at = now() WHERE id = $1`, [policyId, JSON.stringify(definition)]);
    } else {
      await client.query(
        `INSERT INTO policies (id, workspace_id, name, priority, enabled, definition) VALUES ($1, $2, $3, 40, true, $4::jsonb)`,
        [policyId, actor.workspaceId, name, JSON.stringify(definition)],
      );
    }
    if (row.actual_cost_micro == null) {
      await client.query(
        `UPDATE requests SET selected_model_slug = premium_model_slug, estimated_cost_micro = premium_cost_micro, saving_micro = 0, status = 'overridden', policy_id = $2 WHERE id = $1`,
        [id, policyId],
      );
    }
    await audit(client, actor, "policy.pinned", policyId, { workflow, requestId: id });
    return loadRequestView(client, actor.workspaceId, id);
  });
}

export async function decideApproval(actor: SessionRef, approvalId: string, action: "approve" | "reject") {
  return withTx(async (client) => {
    const rows = await client.query<{ id: string; request_id: string; status: string }>(
      `SELECT id, request_id, status FROM approvals WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
      [approvalId, actor.workspaceId],
    );
    const approval = rows.rows[0];
    if (!approval) throw new HttpError(404, "That approval is not in this workspace.", "not_found");
    if (approval.status !== "pending") throw new HttpError(409, "This approval has already been decided.", "already_decided");
    if (action === "approve") {
      await client.query(`UPDATE requests SET status = 'accepted' WHERE id = $1`, [approval.request_id]);
      await client.query(`UPDATE approvals SET status = 'approved', reviewer_id = $2, decided_at = now() WHERE id = $1`, [approvalId, actor.id]);
    } else {
      await client.query(`UPDATE requests SET status = 'rejected', actual_cost_micro = NULL WHERE id = $1`, [approval.request_id]);
      await client.query(`UPDATE approvals SET status = 'rejected', reviewer_id = $2, decided_at = now() WHERE id = $1`, [approvalId, actor.id]);
    }
    await audit(client, actor, action === "approve" ? "approval.approved" : "approval.rejected", approval.request_id, { approvalId });
    return loadRequestView(client, actor.workspaceId, approval.request_id);
  });
}

export async function listApprovals(workspaceId: string) {
  const rows = await query<RequestRow>(
    `${REQUEST_SELECT} WHERE r.workspace_id = $1 AND a.status = 'pending' ORDER BY r.created_at DESC`,
    [workspaceId],
  );
  const models = await loadModels(workspaceId);
  return rows.map((row) => presentRequest(row, models));
}

export async function listPolicies(workspaceId: string) {
  const rows = await query<{ id: string; name: string; priority: number; enabled: boolean; definition: PolicyDefinition }>(
    `SELECT id, name, priority, enabled, definition FROM policies WHERE workspace_id = $1 ORDER BY priority, name`,
    [workspaceId],
  );
  return rows.map((policy) => ({
    id: policy.id,
    name: policy.name,
    priority: policy.priority,
    enabled: policy.enabled,
    definition: policy.definition,
    summary: summarisePolicy(policy.definition),
  }));
}

export async function createPolicy(actor: SessionRef, input: PolicyInput) {
  const definition = policyDefinition(input);
  const priority = input.workflow ? 45 : 70;
  const id = crypto.randomUUID();
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO policies (id, workspace_id, name, priority, enabled, definition) VALUES ($1, $2, $3, $4, true, $5::jsonb)`,
      [id, actor.workspaceId, input.name.trim(), priority, JSON.stringify(definition)],
    );
    await audit(client, actor, "policy.created", id, { name: input.name.trim() });
  });
  return { id };
}

export async function setPolicyEnabled(actor: SessionRef, id: string, enabled: boolean) {
  const rows = await query<{ id: string }>(`SELECT id FROM policies WHERE id = $1 AND workspace_id = $2`, [id, actor.workspaceId]);
  if (!rows[0]) throw new HttpError(404, "That policy is not in this workspace.", "not_found");
  await withTx(async (client) => {
    await client.query(`UPDATE policies SET enabled = $2, updated_at = now() WHERE id = $1`, [id, enabled]);
    await audit(client, actor, enabled ? "policy.enabled" : "policy.disabled", id, {});
  });
}

export async function listModels(workspaceId: string) {
  const models = await loadModels(workspaceId);
  return models.map((model) => ({
    slug: model.slug,
    name: model.name,
    provider: model.provider,
    tier: model.tier,
    region: model.region.toUpperCase(),
    latencyMs: model.latencyP50Ms,
    quality: model.qualityIndex,
    allowed: model.allowed,
    input: `${formatMicro(model.inputMicroPerMillion)} / 1M`,
    output: `${formatMicro(model.outputMicroPerMillion)} / 1M`,
  }));
}

export async function setModelAllowed(actor: SessionRef, slug: string, allowed: boolean) {
  const known = CATALOGUE.some((model) => model.slug === slug);
  if (!known) throw new HttpError(404, "That model is not in the catalogue.", "not_found");
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO model_access (workspace_id, model_slug, allowed) VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, model_slug) DO UPDATE SET allowed = EXCLUDED.allowed`,
      [actor.workspaceId, slug, allowed],
    );
    await audit(client, actor, allowed ? "model.allowed" : "model.blocked", null, { slug });
  });
}

export async function listTeams(workspaceId: string) {
  return query<{ slug: string; name: string; seats: number; allowance: string }>(
    `SELECT slug, name, seats, allowance_micro::text AS allowance FROM teams WHERE workspace_id = $1 ORDER BY seats DESC, name`,
    [workspaceId],
  ).then((rows) => rows.map((team) => ({ ...team, allowance: formatMicro(micro(team.allowance)) })));
}

export async function createTeam(actor: SessionRef, input: { name: string; seats: number; allowancePounds: number }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "Give the team a name between 2 and 80 characters.", "invalid");
  if (!Number.isInteger(input.seats) || input.seats < 0 || input.seats > 100000) throw new HttpError(400, "Seats must be a whole number from 0 up.", "invalid");
  if (!Number.isFinite(input.allowancePounds) || input.allowancePounds < 0) throw new HttpError(400, "Allowance must be zero or a positive amount in pounds.", "invalid");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO teams (id, workspace_id, slug, name, seats, allowance_micro) VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), actor.workspaceId, `${slug}-${crypto.randomUUID().slice(0, 4)}`, name, input.seats, BigInt(Math.round(input.allowancePounds * 1_000_000)).toString()],
    );
    await audit(client, actor, "team.created", null, { name });
  });
}

export async function updateAllowance(actor: SessionRef, slug: string, allowancePounds: number) {
  if (!Number.isFinite(allowancePounds) || allowancePounds < 0) throw new HttpError(400, "Allowance must be zero or a positive amount in pounds.", "invalid");
  const rows = await query<{ id: string }>(`SELECT id FROM teams WHERE workspace_id = $1 AND slug = $2`, [actor.workspaceId, slug]);
  if (!rows[0]) throw new HttpError(404, "That team is not in this workspace.", "not_found");
  await withTx(async (client) => {
    await client.query(`UPDATE teams SET allowance_micro = $2 WHERE id = $1`, [rows[0].id, BigInt(Math.round(allowancePounds * 1_000_000)).toString()]);
    await audit(client, actor, "team.allowance", rows[0].id, { allowancePounds });
  });
}

export async function listAudit(workspaceId: string) {
  const rows = await query<{ id: string; action: string; created_at: string; actor: string | null; target_type: string; detail: unknown }>(
    `SELECT a.id, a.action, a.created_at, u.name AS actor, a.target_type, a.detail
     FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.workspace_id = $1 ORDER BY a.created_at DESC LIMIT 80`,
    [workspaceId],
  );
  return rows;
}

export async function usageCsv(workspaceId: string, environmentId: string, asOf = reportingDate()): Promise<string> {
  const window = monthWindow(asOf);
  const rows = await query<{ day: string; team: string; requests: string; spend: string; saving: string }>(
    `SELECT to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            COALESCE(t.name, 'Unassigned') AS team,
            COUNT(*)::text AS requests,
            COALESCE(SUM(r.actual_cost_micro), 0)::text AS spend,
            COALESCE(SUM(r.saving_micro) FILTER (WHERE r.actual_cost_micro IS NOT NULL), 0)::text AS saving
     FROM requests r LEFT JOIN teams t ON t.id = r.team_id
     WHERE r.workspace_id = $1 AND r.environment_id = $2 AND r.created_at >= $3 AND r.created_at < $4
     GROUP BY 1, 2 ORDER BY 1, 2`,
    [workspaceId, environmentId, window.start, window.end],
  );
  const lines = ["day,team,requests,spend_gbp,saving_gbp"];
  for (const row of rows) {
    lines.push([row.day, csv(row.team), row.requests, (Number(row.spend) / 1_000_000).toFixed(6), (Number(row.saving) / 1_000_000).toFixed(6)].join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function createApiKey(actor: SessionRef, environmentId: string, name: string) {
  const label = name.trim();
  if (label.length < 2) throw new HttpError(400, "Name the key so an operator can recognise it later.", "invalid");
  const token = `quiet_${newToken()}`;
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO api_keys (id, workspace_id, environment_id, name, token_prefix, token_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), actor.workspaceId, environmentId, label, token.slice(0, 12), hashToken(token)],
    );
    await audit(client, actor, "api_key.created", null, { name: label });
  });
  return { token, name: label };
}

export async function listApiKeys(workspaceId: string) {
  return query<{ name: string; token_prefix: string; environment: string; created_at: string }>(
    `SELECT k.name, k.token_prefix, e.name AS environment, k.created_at
     FROM api_keys k JOIN environments e ON e.id = k.environment_id
     WHERE k.workspace_id = $1 ORDER BY k.created_at DESC`,
    [workspaceId],
  );
}

export async function authenticateApiKey(token: string) {
  const rows = await query<{ id: string; workspace_id: string; environment_id: string }>(
    `SELECT id, workspace_id, environment_id FROM api_keys WHERE token_hash = $1`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function takeRateLimit(apiKeyId: string, limit: number): Promise<boolean> {
  const rows = await query<{ count: number }>(
    `INSERT INTO rate_buckets (api_key_id, window_start, count)
     VALUES ($1, date_trunc('minute', now()), 1)
     ON CONFLICT (api_key_id, window_start)
     DO UPDATE SET count = rate_buckets.count + 1
     RETURNING count`,
    [apiKeyId],
  );
  return Number(rows[0]?.count ?? 1) <= limit;
}

export async function readIdempotent(apiKeyId: string, key: string) {
  const rows = await query<{ status_code: number; response: unknown }>(
    `SELECT status_code, response FROM idempotency_keys WHERE api_key_id = $1 AND idempotency_key = $2`,
    [apiKeyId, key],
  );
  return rows[0] ?? null;
}

export async function saveIdempotent(apiKeyId: string, key: string, status: number, response: unknown) {
  await query(
    `INSERT INTO idempotency_keys (api_key_id, idempotency_key, status_code, response) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT DO NOTHING`,
    [apiKeyId, key, status, JSON.stringify(response)],
  );
}

export async function routeAndRecord(input: {
  actor: SessionRef | null;
  workspaceId: string;
  environmentId: string;
  prompt: string;
  workflow: string;
  teamSlug: string;
  requestedModel?: string | null;
  source: "console" | "gateway";
}) {
  return span("quiet.route", { source: input.source, team: input.teamSlug }, async () => {
    const prompt = input.prompt.trim();
    if (prompt.length < 1 || prompt.length > 32_000) {
      throw new HttpError(400, "The prompt must be between 1 and 32,000 characters.", "invalid");
    }
    const workflow = input.workflow.trim() || "ad-hoc";
    const [policies, models, team] = await Promise.all([
      loadPolicies(input.workspaceId),
      loadModels(input.workspaceId),
      loadTeamBudget(input.workspaceId, input.environmentId, input.teamSlug),
    ]);
    const result = decide({
      prompt,
      workflow,
      teamSlug: input.teamSlug,
      policies,
      models,
      team,
      requestedModel: input.requestedModel,
    });
    if (!result.ok) throw new HttpError(422, result.error, result.code);

    let decision = result.decision;
    let providerText: string | null = null;
    let actual: bigint | null = null;
    let status: string = decision.requireApproval ? "pending_review" : "routed";
    let failure: string | null = null;
    const mode = appConfig().gatewayMode;

    if (!decision.requireApproval && mode === "live") {
      const model = models.find((item) => item.slug === decision.modelSlug);
      if (!model) throw new HttpError(422, "The selected model disappeared from the catalogue.", "no_model");
      try {
        const completion = await callProvider(model, decision.outboundPrompt);
        providerText = completion.text;
        const tokensIn = completion.tokensIn || decision.tokensIn;
        const tokensOut = completion.tokensOut || decision.tokensOut;
        actual = requestCostMicro(tokensIn, tokensOut, model.inputMicroPerMillion, model.outputMicroPerMillion);
        const premium = referencePremium(models);
        const premiumCost = premium ? costOf(premium, tokensIn, tokensOut) : actual;
        decision = { ...decision, tokensIn, tokensOut, estimatedMicro: actual, premiumMicro: premiumCost };
        status = "accepted";
      } catch (error) {
        const message = error instanceof ProviderError ? error.message : "The provider call failed.";
        if (error instanceof ProviderError && error.code === "upstream" && decision.modelSlug !== decision.premiumSlug) {
          const premium = models.find((item) => item.slug === decision.premiumSlug);
          if (premium?.allowed) {
            try {
              const completion = await callProvider(premium, decision.outboundPrompt);
              providerText = completion.text;
              actual = requestCostMicro(completion.tokensIn || decision.tokensIn, completion.tokensOut || decision.tokensOut, premium.inputMicroPerMillion, premium.outputMicroPerMillion);
              decision = {
                ...decision,
                modelSlug: premium.slug,
                modelName: premium.name,
                tier: premium.tier,
                estimatedMicro: actual,
                escalated: true,
                reasons: [...decision.reasons, "The first provider call failed, so Quiet escalated once."],
              };
              status = "escalated";
            } catch (second) {
              failure = second instanceof Error ? second.message : message;
              status = "failed";
            }
          }
        } else {
          failure = message;
          status = "failed";
        }
      }
    }

    const id = crypto.randomUUID();
    const saving = actual == null ? savingMicro(decision.estimatedMicro, decision.premiumMicro) : savingMicro(actual, decision.premiumMicro);
    await withTx(async (client) => {
      const teamId = await client.query<{ id: string }>(`SELECT id FROM teams WHERE workspace_id = $1 AND slug = $2`, [input.workspaceId, input.teamSlug]);
      await client.query(
        `INSERT INTO requests (
          id, workspace_id, environment_id, team_id, policy_id, workflow, task_label, task_type, complexity, sensitivity,
          confidence, tokens_in, tokens_out, selected_model_slug, premium_model_slug, estimated_cost_micro, premium_cost_micro,
          actual_cost_micro, saving_micro, status, within_policy, escalated, reasons, pros, cons, excerpt, prompt_sha256, mode, featured, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25,$26,$27,$28,false,now()
        )`,
        [
          id,
          input.workspaceId,
          input.environmentId,
          teamId.rows[0]?.id ?? null,
          decision.policyId,
          workflow,
          decision.taskLabel,
          decision.taskType,
          decision.complexity,
          decision.sensitivity,
          decision.confidence,
          decision.tokensIn,
          decision.tokensOut,
          decision.modelSlug,
          decision.premiumSlug,
          decision.estimatedMicro.toString(),
          decision.premiumMicro.toString(),
          actual?.toString() ?? null,
          saving.toString(),
          status,
          decision.withinPolicy && status !== "failed",
          decision.escalated,
          JSON.stringify(failure ? [...decision.reasons, failure] : decision.reasons),
          decision.pros,
          decision.cons,
          decision.redactedExcerpt,
          decision.promptSha256,
          mode === "live" && actual != null ? "live" : "decide",
        ],
      );
      if (status === "pending_review") {
        await client.query(
          `INSERT INTO approvals (id, request_id, workspace_id, status, recommended_tier, reason) VALUES ($1, $2, $3, 'pending', $4, $5)`,
          [crypto.randomUUID(), id, input.workspaceId, decision.tier, decision.reasons[0] ?? "Policy requires a human review."],
        );
      }
      await audit(client, input.actor, "request.routed", id, { status, model: decision.modelSlug, source: input.source });
    });

    const view = await getRequest(input.workspaceId, id);
    const httpStatus = status === "pending_review" && input.source === "gateway" ? 409 : status === "failed" ? 503 : 200;
    return { status: httpStatus, request: view, providerText, failure };
  });
}

async function loadTeamBudget(workspaceId: string, environmentId: string, slug: string): Promise<TeamBudget> {
  const teams = await query<{ id: string; slug: string; name: string; allowance_micro: string }>(
    `SELECT id, slug, name, allowance_micro::text FROM teams WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug],
  );
  const team = teams[0];
  if (!team) throw new HttpError(400, "Choose a team that exists in this workspace.", "team");
  const asOf = reportingDate();
  const window = monthWindow(asOf);
  const daily = await query<{ day: string; spent: string }>(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COALESCE(SUM(actual_cost_micro), 0)::text AS spent
     FROM requests
     WHERE team_id = $1 AND environment_id = $2 AND actual_cost_micro IS NOT NULL AND created_at >= $3 AND created_at < $4
     GROUP BY 1`,
    [team.id, environmentId, window.start, window.end],
  );
  const series = daily.map((row) => ({ day: row.day, spentMicro: micro(row.spent) }));
  return {
    slug: team.slug,
    name: team.name,
    allowanceMicro: micro(team.allowance_micro),
    spentMicro: series.reduce((total, row) => total + row.spentMicro, 0n),
    forecastMicro: forecastMicro(series, asOf, window.days),
  };
}

async function loadPolicies(workspaceId: string): Promise<PolicyRecord[]> {
  const rows = await query<{ id: string; name: string; priority: number; enabled: boolean; definition: PolicyDefinition }>(
    `SELECT id, name, priority, enabled, definition FROM policies WHERE workspace_id = $1`,
    [workspaceId],
  );
  return rows;
}

async function loadModels(workspaceId: string): Promise<CatalogueModel[]> {
  const rows = await query<{
    slug: string;
    name: string;
    provider: string;
    tier: Tier;
    region: string;
    input_micro_per_million: string;
    output_micro_per_million: string;
    latency_p50_ms: number;
    quality_index: number;
    adapter: "openai" | "anthropic";
    upstream_model: string;
    allowed: boolean | null;
  }>(
    `SELECT m.*, a.allowed
     FROM models m
     LEFT JOIN model_access a ON a.model_slug = m.slug AND a.workspace_id = $1
     ORDER BY m.tier, m.input_micro_per_million`,
    [workspaceId],
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    tier: row.tier,
    region: row.region,
    inputMicroPerMillion: micro(row.input_micro_per_million),
    outputMicroPerMillion: micro(row.output_micro_per_million),
    latencyP50Ms: row.latency_p50_ms,
    qualityIndex: row.quality_index,
    allowed: row.allowed !== false,
    adapter: row.adapter,
    upstreamModel: row.upstream_model,
  }));
}

const REQUEST_SELECT = `
SELECT r.*, t.slug AS team_slug, t.name AS team_name,
       sm.name AS model_name, sm.tier AS model_tier, sm.provider AS model_provider, sm.region AS model_region,
       pm.name AS premium_name, p.name AS policy_name,
       a.id AS approval_id, a.status AS approval_status, a.recommended_tier, a.reason AS approval_reason
FROM requests r
LEFT JOIN teams t ON t.id = r.team_id
LEFT JOIN models sm ON sm.slug = r.selected_model_slug
LEFT JOIN models pm ON pm.slug = r.premium_model_slug
LEFT JOIN policies p ON p.id = r.policy_id
LEFT JOIN approvals a ON a.request_id = r.id
`;

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isoTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toISOString();
}

function presentRequest(row: RequestRow, models: CatalogueModel[]) {
  const estimated = micro(row.estimated_cost_micro as string);
  const premium = micro(row.premium_cost_micro as string);
  const actual = nullableMicro(row.actual_cost_micro as string | null);
  const saving = actual == null ? savingMicro(estimated, premium) : micro(row.saving_micro as string);
  const baseline = actual == null ? premium : actual + saving;
  const selected = models.find((model) => model.slug === row.selected_model_slug);
  const premiumModel = referencePremium(models);
  const floor = row.model_tier === "premium" ? 92 : row.model_tier === "standard" ? 85 : 75;
  const blocked = models.filter((model) => model.tier === row.model_tier && model.qualityIndex < floor);
  const alternatives = selected
    ? listAlternatives(models, selected, premiumModel, blocked, Number(row.tokens_in), Number(row.tokens_out)).map((item) => ({
        name: item.name,
        tier: item.tier,
        cost: formatMicro(item.micro),
        note: item.note,
      }))
    : [];
  return {
    id: String(row.id),
    taskLabel: String(row.task_label),
    workflow: String(row.workflow),
    teamSlug: String(row.team_slug ?? ""),
    teamName: String(row.team_name ?? "Unassigned"),
    status: String(row.status),
    taskType: String(row.task_type),
    complexity: String(row.complexity),
    sensitivity: String(row.sensitivity),
    confidence: Number(row.confidence),
    confidenceLabel: formatConfidence(Number(row.confidence)),
    tokensIn: Number(row.tokens_in),
    tokensOut: Number(row.tokens_out),
    modelSlug: String(row.selected_model_slug ?? ""),
    modelName: String(row.model_name ?? "Unselected"),
    modelTier: String(row.model_tier ?? ""),
    modelProvider: String(row.model_provider ?? ""),
    modelRegion: String(row.model_region ?? "").toUpperCase(),
    premiumName: String(row.premium_name ?? "Premium baseline"),
    estimated: formatMicro(estimated),
    premium: formatMicro(premium),
    actual: actual == null ? null : formatMicro(actual),
    saving: formatMicro(saving),
    savingRatio: baseline > 0n ? formatPercentRatio(Number(saving) / Number(baseline)) : "0%",
    reasons: stringList(row.reasons),
    pros: String(row.pros),
    cons: String(row.cons),
    policyId: row.policy_id ? String(row.policy_id) : null,
    policyName: row.policy_name ? String(row.policy_name) : null,
    escalated: Boolean(row.escalated),
    withinPolicy: Boolean(row.within_policy),
    mode: String(row.mode),
    featured: Boolean(row.featured),
    excerpt: String(row.excerpt ?? ""),
    createdAt: isoTime(row.created_at),
    billed: actual != null,
    alternatives,
    approval: row.approval_id
      ? {
          id: String(row.approval_id),
          status: String(row.approval_status),
          recommendedTier: String(row.recommended_tier),
          reason: String(row.approval_reason),
        }
      : null,
  };
}

async function lockRequest(client: PoolClient, workspaceId: string, id: string) {
  const rows = await client.query<RequestRow>(`SELECT * FROM requests WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [id, workspaceId]);
  const row = rows.rows[0];
  if (!row) throw new HttpError(404, "That request is not in this workspace.", "not_found");
  return row;
}

async function loadRequestView(client: PoolClient, workspaceId: string, id: string) {
  const rows = await client.query<RequestRow>(`${REQUEST_SELECT} WHERE r.workspace_id = $1 AND r.id = $2`, [workspaceId, id]);
  const models = await loadModels(workspaceId);
  return presentRequest(rows.rows[0], models);
}

async function audit(client: PoolClient, actor: SessionRef | null, action: string, targetId: string | null, detail: Record<string, unknown>) {
  if (!actor && !targetId) return;
  const workspaceId = actor?.workspaceId ?? (await workspaceForTarget(client, targetId));
  if (!workspaceId) return;
  await client.query(
    `INSERT INTO audit_events (id, workspace_id, actor_id, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, 'request', $5, $6::jsonb)`,
    [crypto.randomUUID(), workspaceId, actor?.id ?? null, action, targetId, JSON.stringify(detail)],
  );
}

async function workspaceForTarget(client: PoolClient, targetId: string | null): Promise<string | null> {
  if (!targetId) return null;
  const rows = await client.query<{ workspace_id: string }>(`SELECT workspace_id FROM requests WHERE id = $1`, [targetId]);
  return rows.rows[0]?.workspace_id ?? null;
}

export type PolicyInput = {
  name: string;
  taskTypes?: string[];
  sensitivities?: string[];
  maxInputTokens?: number | null;
  workflow?: string;
  tier?: string;
  escalateBelow?: number;
  requireApproval?: boolean;
  redact?: boolean;
  region?: string;
};

function policyDefinition(input: PolicyInput): PolicyDefinition {
  const name = input.name?.trim() ?? "";
  if (name.length < 3 || name.length > 80) throw new HttpError(400, "Name the policy in 3 to 80 characters.", "invalid");
  const taskTypes = (input.taskTypes ?? []).filter((item) => (TASK_TYPES as readonly string[]).includes(item));
  const sensitivities = (input.sensitivities ?? []).filter((item) => (SENSITIVITIES as readonly string[]).includes(item));
  const tier = (TIERS as readonly string[]).includes(input.tier ?? "") ? (input.tier as Tier) : undefined;
  if (!tier) throw new HttpError(400, "Choose an economy, standard, or premium tier.", "invalid");
  const escalate = Number(input.escalateBelow ?? 0.85);
  if (escalate < 0.5 || escalate > 0.99) throw new HttpError(400, "The confidence floor must sit between 50% and 99%.", "invalid");
  return {
    when: {
      ...(taskTypes.length ? { taskTypes: taskTypes as PolicyDefinition["when"]["taskTypes"] } : {}),
      ...(sensitivities.length ? { sensitivities: sensitivities as PolicyDefinition["when"]["sensitivities"] } : {}),
      ...(input.workflow?.trim() ? { workflows: [input.workflow.trim()] } : {}),
      ...(input.maxInputTokens ? { maxInputTokens: input.maxInputTokens } : {}),
    },
    then: {
      tier,
      minQuality: tier === "premium" ? 92 : tier === "standard" ? 85 : 75,
      escalateBelowConfidence: escalate,
      requireApproval: Boolean(input.requireApproval),
      redact: Boolean(input.redact),
      ...(input.region === "eu" || input.region === "us" ? { region: input.region } : {}),
    },
  };
}

function summarisePolicy(definition: PolicyDefinition): { when: string[]; then: string[] } {
  const when: string[] = [];
  const then: string[] = [];
  if (definition.when.taskTypes?.length) when.push(definition.when.taskTypes.join(", "));
  if (definition.when.workflows?.length) when.push(`Workflow ${definition.when.workflows.join(", ")}`);
  if (definition.when.sensitivities?.length) when.push(`Sensitivity ${definition.when.sensitivities.join(", ")}`);
  if (definition.when.excludeSensitivities?.length) when.push(`Excluding ${definition.when.excludeSensitivities.join(", ")}`);
  if (definition.when.maxInputTokens) when.push(`Under ${definition.when.maxInputTokens.toLocaleString("en-GB")} input tokens`);
  if (definition.then.budgetGuard) then.push("If a team is forecast to pass 80% of its allowance, keep non-critical work on an economy model");
  if (definition.then.tier) then.push(`Use the ${definition.then.tier} tier`);
  if (definition.then.pinModelSlug) then.push(`Pin ${definition.then.pinModelSlug}`);
  if (definition.then.region) then.push(`Keep the call in ${definition.then.region.toUpperCase()}`);
  if (definition.then.escalateBelowConfidence) then.push(`Escalate below ${Math.round(definition.then.escalateBelowConfidence * 100)}% confidence`);
  if (definition.then.requireApproval) then.push("Ask a person to approve before the provider is called");
  if (definition.then.redact) then.push("Redact personal data, secrets and account numbers");
  if (when.length === 0) when.push("Any request this rule still matches");
  if (then.length === 0) then.push("No action is configured");
  return { when, then };
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
