import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { createSession, destroySession, findSession, verifyPassword } from "@/lib/auth";
import { getCredits, postCredit, recordCredit } from "@/lib/credits";
import { registerWorkspace } from "@/lib/register";
import { query } from "@/lib/db";
import { boot, ensureBoot } from "@/lib/bootstrap";
import { assertSameOrigin, HttpError, json, readJson } from "@/lib/http";
import { log } from "@/lib/logger";
import {
  acceptRequest,
  authenticateApiKey,
  createApiKey,
  createPolicy,
  createTeam,
  decideApproval,
  environmentBySlug,
  getOverview,
  getRequest,
  listApiKeys,
  listApprovals,
  listAudit,
  listModels,
  listPolicies,
  listRequests,
  listTeams,
  pinWorkflow,
  readIdempotent,
  reportingDate,
  routeAndRecord,
  saveIdempotent,
  setModelAllowed,
  setPolicyEnabled,
  takeRateLimit,
  updateAllowance,
  usageCsv,
  usePremium,
  type SessionRef,
} from "@/lib/service";
import { appConfig as configFn } from "@/lib/config";
import type { Role } from "@/lib/types";

const WRITE_ROLES: Role[] = ["admin", "operator"];
const MONEY_ROLES: Role[] = ["admin", "finance"];
const REVIEW_ROLES: Role[] = ["admin", "finance", "operator", "reviewer"];

export async function dispatch(method: string, request: Request, path: string[]): Promise<Response> {
  try {
    await ensureBoot();
    if (!boot.ready) {
      return json(503, { error: { message: boot.error ?? "Quiet is still starting. Retry the health check in a moment.", code: "starting" } });
    }
    const key = path.join("/");
    if (method === "GET" && key === "health") return await health();
    if (method === "POST" && key === "auth/login") return await login(request);
    if (method === "POST" && key === "auth/signup") return await signup(request);
    if (method === "POST" && key === "auth/logout") return await logout(request);
    if (method !== "GET" && method !== "HEAD") assertSameOrigin(request);
    const user = await currentUser();
    if (!user) return json(401, { error: { message: "Sign in to continue.", code: "unauthenticated" } });
    const env = await environmentBySlug(user.workspaceId, await envSlug());
    const actor: SessionRef = { id: user.id, workspaceId: user.workspaceId, role: user.role, name: user.name };

    if (method === "GET" && key === "session") {
      return json(200, { user: { name: user.name, email: user.email, role: user.role, workspace: user.workspaceName }, environment: env });
    }
    if (method === "POST" && key === "environment") return await setEnvironment(request);
    if (method === "GET" && key === "overview") return json(200, await getOverview(user.workspaceId, env, reportingDate()));
    if (method === "GET" && key === "requests") return json(200, { requests: await listRequests(user.workspaceId, env.id) });
    if (method === "POST" && key === "requests") return await routeConsole(request, actor, env.id);
    if (method === "GET" && path[0] === "requests" && path[1] && path.length === 2) return json(200, await getRequest(user.workspaceId, path[1]));
    if (method === "POST" && path[0] === "requests" && path[2] === "accept") return await act(actor, WRITE_ROLES.concat("finance"), () => acceptRequest(actor, path[1]));
    if (method === "POST" && path[0] === "requests" && path[2] === "premium") return await act(actor, WRITE_ROLES, () => usePremium(actor, path[1]));
    if (method === "POST" && path[0] === "requests" && path[2] === "pin") return await act(actor, WRITE_ROLES, () => pinWorkflow(actor, path[1]));
    if (method === "GET" && key === "approvals") return json(200, { approvals: await listApprovals(user.workspaceId) });
    if (method === "POST" && path[0] === "approvals" && path[2] === "approve") return await act(actor, REVIEW_ROLES, () => decideApproval(actor, path[1], "approve"));
    if (method === "POST" && path[0] === "approvals" && path[2] === "reject") return await act(actor, REVIEW_ROLES, () => decideApproval(actor, path[1], "reject"));
    if (method === "GET" && key === "policies") return json(200, { policies: await listPolicies(user.workspaceId) });
    if (method === "POST" && key === "policies") return await act(actor, WRITE_ROLES, async () => createPolicy(actor, await readJson(request)));
    if (method === "POST" && path[0] === "policies" && path[2] === "enabled") {
      const body = await readJson<{ enabled: boolean }>(request);
      return await act(actor, WRITE_ROLES, async () => {
        await setPolicyEnabled(actor, path[1], Boolean(body.enabled));
        return { ok: true };
      });
    }
    if (method === "GET" && key === "models") return json(200, { models: await listModels(user.workspaceId) });
    if (method === "POST" && path[0] === "models" && path[2] === "allowed") {
      const body = await readJson<{ allowed: boolean }>(request);
      return await act(actor, WRITE_ROLES, async () => {
        await setModelAllowed(actor, path[1], Boolean(body.allowed));
        return { ok: true };
      });
    }
    if (method === "GET" && key === "teams") return json(200, { teams: await listTeams(user.workspaceId) });
    if (method === "POST" && key === "teams") return await act(actor, MONEY_ROLES, async () => {
      await createTeam(actor, await readJson(request));
      return { ok: true };
    });
    if (method === "POST" && path[0] === "teams" && path[2] === "allowance") {
      const body = await readJson<{ allowancePounds: number }>(request);
      return await act(actor, MONEY_ROLES, async () => {
        await updateAllowance(actor, path[1], Number(body.allowancePounds));
        return { ok: true };
      });
    }
    if (method === "GET" && key === "audit") return json(200, { events: await listAudit(user.workspaceId) });
    if (method === "GET" && key === "credits") return json(200, await getCredits(user.workspaceId, user.role));
    if (method === "POST" && key === "credits") {
      const body = await readJson<{ pounds?: string; kind?: string }>(request);
      const kind = body.kind === "grant" ? "grant" : "purchase";
      return await act(actor, REVIEW_ROLES, () => recordCredit(actor, body.pounds ?? "", kind));
    }
    if (method === "POST" && path[0] === "credits" && path[2] === "post") {
      return await act(actor, MONEY_ROLES, () => postCredit(actor, path[1] ?? ""));
    }
    if (method === "GET" && key === "keys") return json(200, { keys: await listApiKeys(user.workspaceId) });
    if (method === "POST" && key === "keys") {
      const body = await readJson<{ name: string }>(request);
      return await act(actor, ["admin"], () => createApiKey(actor, env.id, body.name));
    }
    if (method === "GET" && key === "reports/usage") {
      if (!MONEY_ROLES.includes(user.role) && user.role !== "operator") {
        return json(403, { error: { message: "Your role cannot export the ledger.", code: "forbidden" } });
      }
      const csv = await usageCsv(user.workspaceId, env.id, reportingDate());
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="quiet-usage-${reportingDate()}.csv"`,
          "cache-control": "private, no-store",
        },
      });
    }
    return json(404, { error: { message: "Quiet does not have that API route.", code: "not_found" } });
  } catch (error) {
    return fail(error);
  }
}

async function health(): Promise<Response> {
  try {
    await query(`SELECT 1 AS ok`);
    return json(200, { ok: true, service: "quiet", mode: configFn().gatewayMode });
  } catch {
    return json(503, { error: { message: "Quiet cannot reach Postgres. Check DATABASE_URL and that the database is accepting connections.", code: "database" } });
  }
}

async function login(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const body = await credentials(request);
  const email = body.email.toLowerCase().trim();
  const rows = await query<{ id: string; password_hash: string }>(`SELECT id, password_hash FROM users WHERE email = $1`, [email]);
  const user = rows[0];
  const valid = user ? await verifyPassword(body.password, user.password_hash) : false;
  if (!user || !valid) {
    if (body.form) return redirectTo(request, "/login?error=1");
    return json(401, { error: { message: "That email or password is not valid. Try again.", code: "credentials" } });
  }
  const token = await createSession(user.id);
  const response = body.form
    ? redirectTo(request, "/overview")
    : NextResponse.json({ ok: true }, { status: 200, headers: { "cache-control": "private, no-store" } });
  response.cookies.set("quiet_session", token, cookieOptions());
  return response;
}

async function signup(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const type = request.headers.get("content-type") ?? "";
  const form = !type.includes("application/json");
  let name = "";
  let email = "";
  let password = "";
  let workspaceName = "";
  if (form) {
    const body = await request.formData();
    name = String(body.get("name") ?? "");
    email = String(body.get("email") ?? "");
    password = String(body.get("password") ?? "");
    workspaceName = String(body.get("workspace") ?? "");
  } else {
    const body = await readJson<{ name?: string; email?: string; password?: string; workspace?: string }>(request);
    name = body.name ?? "";
    email = body.email ?? "";
    password = body.password ?? "";
    workspaceName = body.workspace ?? "";
  }
  try {
    const created = await registerWorkspace({ name, email, password, workspaceName });
    const token = await createSession(created.userId);
    const response = form
      ? redirectTo(request, "/overview")
      : NextResponse.json({ ok: true }, { status: 200, headers: { "cache-control": "private, no-store" } });
    response.cookies.set("quiet_session", token, cookieOptions());
    return response;
  } catch (error) {
    if (form && error instanceof HttpError) return redirectTo(request, `/signup?error=${encodeURIComponent(error.code)}`);
    throw error;
  }
}

async function logout(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const jar = await cookies();
  await destroySession(jar.get("quiet_session")?.value);
  const response = redirectTo(request, "/login");
  response.cookies.set("quiet_session", "", { ...cookieOptions(), maxAge: 0 });
  return response;
}

async function setEnvironment(request: Request): Promise<Response> {
  const body = await readJson<{ environment?: string }>(request);
  const slug = body.environment === "staging" ? "staging" : "production";
  const response = NextResponse.json({ environment: slug }, { status: 200, headers: { "cache-control": "private, no-store" } });
  response.cookies.set("quiet_env", slug, { ...cookieOptions(), httpOnly: true });
  return response;
}

async function routeConsole(request: Request, actor: SessionRef, environmentId: string): Promise<Response> {
  if (!WRITE_ROLES.includes(actor.role) && actor.role !== "finance") {
    return json(403, { error: { message: "Your role cannot route a request.", code: "forbidden" } });
  }
  const body = await readJson<{ prompt?: string; workflow?: string; teamSlug?: string; model?: string }>(request);
  const result = await routeAndRecord({
    actor,
    workspaceId: actor.workspaceId,
    environmentId,
    prompt: body.prompt ?? "",
    workflow: body.workflow ?? "ad-hoc",
    teamSlug: body.teamSlug ?? "",
    requestedModel: body.model,
    source: "console",
  });
  return json(result.status === 503 ? 503 : 200, { request: result.request, failure: result.failure });
}

export async function gatewayCompletion(request: Request): Promise<Response> {
  try {
    await ensureBoot();
    if (!boot.ready) return json(503, { error: { message: boot.error ?? "Quiet is starting.", type: "starting" } });
    const header = request.headers.get("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (!token) return json(401, { error: { message: "Send the Quiet API key as a bearer token.", type: "unauthorized" } });
    const apiKey = await authenticateApiKey(token);
    if (!apiKey) return json(401, { error: { message: "That API key is not valid.", type: "unauthorized" } });
    const idempotency = request.headers.get("idempotency-key");
    if (idempotency) {
      const prior = await readIdempotent(apiKey.id, idempotency);
      if (prior) return json(prior.status_code, prior.response);
    }
    const allowed = await takeRateLimit(apiKey.id, appConfig().rateLimitPerMinute);
    if (!allowed) return json(429, { error: { message: "This key has hit its per-minute limit. Retry in a moment.", type: "rate_limit" } });
    const body = await readJson<{ model?: string; messages?: { content?: string }[] }>(request);
    const prompt = (body.messages ?? []).map((message) => message.content ?? "").join("\n").trim();
    const teams = await listTeams(apiKey.workspace_id);
    const requestedTeam = request.headers.get("x-quiet-team");
    const teamSlug = teams.find((team) => team.slug === requestedTeam)?.slug ?? teams.find((team) => team.slug === "support")?.slug ?? teams[0]?.slug;
    if (!teamSlug) return json(422, { error: { message: "Add a team in Quiet before routing production traffic.", type: "team_required" } });
    const result = await routeAndRecord({
      actor: null,
      workspaceId: apiKey.workspace_id,
      environmentId: apiKey.environment_id,
      prompt,
      workflow: request.headers.get("x-quiet-workflow") ?? "gateway",
      teamSlug,
      requestedModel: body.model,
      source: "gateway",
    });
    const quiet = publicQuiet(result.request);
    if (result.status === 409) {
      const payload = { error: { message: "This request needs a human approval before a model is called.", type: "quiet_approval_required", request_id: result.request.id, quiet } };
      if (idempotency) await saveIdempotent(apiKey.id, idempotency, 409, payload);
      return json(409, payload);
    }
    if (result.status === 503) {
      const payload = { error: { message: result.failure ?? "The provider call did not complete.", type: "provider_unavailable", request_id: result.request.id, quiet } };
      if (idempotency) await saveIdempotent(apiKey.id, idempotency, 503, payload);
      return json(503, payload);
    }
    const content = result.providerText ?? "Quiet recorded this routing decision and did not call a provider. Read the quiet object for the model, cost and policy.";
    const payload = {
      id: `chatcmpl_${result.request.id.replace(/-/g, "")}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: result.request.modelSlug,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: result.providerText ? "stop" : "quiet_decision" }],
      usage: {
        prompt_tokens: result.request.tokensIn,
        completion_tokens: result.request.tokensOut,
        total_tokens: result.request.tokensIn + result.request.tokensOut,
      },
      quiet,
    };
    if (idempotency) await saveIdempotent(apiKey.id, idempotency, 200, payload);
    return json(200, payload);
  } catch (error) {
    return fail(error);
  }
}

function publicQuiet(request: Awaited<ReturnType<typeof getRequest>>) {
  return {
    request_id: request.id,
    task: request.taskLabel,
    tier: request.modelTier,
    model: request.modelName,
    policy: request.policyName,
    confidence: request.confidence,
    estimated_cost: request.estimated,
    premium_cost: request.premium,
    saving: request.saving,
    reasons: request.reasons,
    status: request.status,
    mode: request.mode,
  };
}

async function act(actor: SessionRef, roles: Role[], fn: () => Promise<unknown>): Promise<Response> {
  if (!roles.includes(actor.role)) return json(403, { error: { message: "Your role cannot do that. Ask a workspace admin if you need access.", code: "forbidden" } });
  return json(200, await fn());
}

async function currentUser() {
  const jar = await cookies();
  return findSession(jar.get("quiet_session")?.value);
}

async function envSlug(): Promise<string> {
  const jar = await cookies();
  return jar.get("quiet_env")?.value === "staging" ? "staging" : "production";
}

function redirectTo(request: Request, pathname: string): NextResponse {
  const forwarded = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const base = forwarded ? `${proto}://${forwarded}` : new URL(request.url).origin;
  return NextResponse.redirect(new URL(pathname, base), { status: 303 });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appConfig().cookieSecure,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

async function credentials(request: Request): Promise<{ email: string; password: string; form: boolean }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await readJson<{ email?: string; password?: string }>(request);
    return { email: body.email ?? "", password: body.password ?? "", form: false };
  }
  const form = await request.formData();
  return { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), form: true };
}

export function fail(error: unknown): Response {
  if (error instanceof HttpError) return json(error.status, { error: { message: error.message, code: error.code } });
  const message = error instanceof Error ? error.message : "unknown";
  log("error", "request_failed", { message });
  return json(500, { error: { message: "Quiet could not complete that action. Retry it. If it keeps failing, check the health endpoint.", code: "internal" } });
}
