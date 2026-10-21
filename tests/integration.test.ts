import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.QUIET_TEST_DATABASE_URL ?? "";
let databaseName = "";
try {
  databaseName = url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) : "";
} catch {
  databaseName = "";
}
if (url && !databaseName.endsWith("_test")) {
  throw new Error("QUIET_TEST_DATABASE_URL must use a database whose name ends with _test.");
}

const SUPPORT_PROMPT = "Reply to this customer support ticket. The customer asks for the order status of a blue kettle.";

describe.skipIf(!url)("postgres ledger", () => {
  let workspaceId = "";
  let actor: { id: string; workspaceId: string; role: "admin"; name: string };
  let productionId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.QUIET_SEED = "demo";
    process.env.QUIET_ALLOW_DEMO_CREDENTIALS = "true";
    process.env.QUIET_GATEWAY_MODE = "decide";
    process.env.QUIET_DEV_API_KEY = "quiet_demo_harbourline_local_only";
    process.env.QUIET_ADMIN_EMAIL = "amara@harbourline.example";
    process.env.QUIET_ADMIN_PASSWORD = "Harbourline-local-2026";
    if (!process.env.QUIET_SESSION_SECRET || process.env.QUIET_SESSION_SECRET.length < 32) {
      process.env.QUIET_SESSION_SECRET = "integration-session-secret-32chars!";
    }

    const { Client } = await import("pg");
    const client = new Client({ connectionString: url });
    await client.connect();
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.end();

    const db = await import("@/lib/db");
    await db.closePool();
    const boot = await import("@/lib/bootstrap");
    boot.resetBootForTests();
    await boot.ensureBoot();
    if (!boot.boot.ready) throw new Error(boot.boot.error ?? "Bootstrap did not become ready.");

    const { query } = await import("@/lib/db");
    const workspaces = await query<{ id: string }>(`SELECT id FROM workspaces WHERE slug = 'harbourline'`);
    const users = await query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE email = 'amara@harbourline.example'`);
    workspaceId = workspaces[0]?.id ?? "";
    actor = { id: users[0]?.id ?? "", workspaceId, role: "admin", name: users[0]?.name ?? "Amara Okonkwo" };
    const { environmentBySlug } = await import("@/lib/service");
    productionId = (await environmentBySlug(workspaceId, "production")).id;
  }, 120_000);

  afterAll(async () => {
    const { closePool } = await import("@/lib/db");
    await closePool();
  });

  it("reconciles the October production and staging ledgers", async () => {
    const { environmentBySlug, getOverview, listApprovals, listRequests } = await import("@/lib/service");
    const production = await environmentBySlug(workspaceId, "production");
    const overview = await getOverview(workspaceId, production, "2026-10-21");
    expect(overview.headline).toBe("You saved £18,700 this month while maintaining 96% quality.");
    expect(overview.spent).toBe("£31,240");
    expect(overview.committed).toBe("£48,000");
    expect(overview.forecast).toBe("£44,900");
    expect(overview.saving).toBe("£18,700");
    expect(overview.quality).toBe("96%");
    expect(overview.billed).toBe(18400);
    expect(overview.recommendations.some((line) => line.includes("£1,980"))).toBe(true);
    expect(overview.teams.map((team) => team.name)).toEqual(expect.arrayContaining(["Support", "Engineering", "Marketing", "Sales", "Shared platform"]));

    const staging = await getOverview(workspaceId, await environmentBySlug(workspaceId, "staging"), "2026-10-21");
    expect(staging.committed).toBe("£4,800");
    expect(staging.spent).toBe("£105");
    expect(staging.saving).toBe("£21.00");
    expect(staging.forecast).toBe("£155");
    expect(staging.quality).toBe("100%");

    const requests = await listRequests(workspaceId, productionId);
    const support = requests.find((request) => request.taskLabel === "Customer support reply");
    expect(support?.estimated).toBe("£0.0018");
    expect(support?.premium).toBe("£0.0124");
    expect(support?.savingRatio).toBe("85%");
    expect(support?.confidenceLabel).toBe("94%");
    expect(support?.actual).toBeNull();

    const approvals = await listApprovals(workspaceId);
    expect(approvals.map((request) => request.estimated).sort()).toEqual(["£0.08", "£0.42", "£1.20"]);
  });

  it("routes, overrides, pins, and approves without inventing a bill", async () => {
    const { decideApproval, listApprovals, listModels, listPolicies, pinWorkflow, routeAndRecord, setModelAllowed, usageCsv, usePremium } = await import("@/lib/service");
    const routed = await routeAndRecord({
      actor,
      workspaceId,
      environmentId: productionId,
      prompt: SUPPORT_PROMPT,
      workflow: "customer-support",
      teamSlug: "support",
      source: "console",
    });
    expect(routed.status).toBe(200);
    expect(routed.request.modelSlug).toBe("gpt-4.1-mini");
    expect(routed.request.confidenceLabel).toBe("94%");
    expect(routed.request.actual).toBeNull();
    expect(routed.request.mode).toBe("decide");

    const premium = await usePremium(actor, routed.request.id);
    expect(premium.modelSlug).toBe("claude-sonnet");
    expect(premium.status).toBe("overridden");
    expect(premium.actual).toBeNull();

    await pinWorkflow(actor, routed.request.id);
    const policies = await listPolicies(workspaceId);
    expect(policies.some((policy) => policy.name === "Always premium · customer-support" && policy.enabled)).toBe(true);

    const legal = await routeAndRecord({
      actor,
      workspaceId,
      environmentId: productionId,
      prompt: "Summarise the liability clause in the supplier contract.",
      workflow: "legal-review",
      teamSlug: "support",
      source: "console",
    });
    expect(legal.request.status).toBe("pending_review");
    expect(legal.request.actual).toBeNull();
    expect(legal.request.approval?.id).toBeTruthy();
    const approved = await decideApproval(actor, legal.request.approval!.id, "approve");
    expect(approved.status).toBe("accepted");
    expect(approved.actual).toBeNull();

    const refund = await routeAndRecord({
      actor,
      workspaceId,
      environmentId: productionId,
      prompt: "Decide whether this customer refund matches the published policy.",
      workflow: "refunds",
      teamSlug: "sales",
      source: "gateway",
    });
    expect(refund.status).toBe(409);
    const rejected = await decideApproval(actor, refund.request.approval!.id, "reject");
    expect(rejected.status).toBe("rejected");
    expect(rejected.actual).toBeNull();

    await setModelAllowed(actor, "gemini-flash", false);
    const models = await listModels(workspaceId);
    expect(models.find((model) => model.slug === "gemini-flash")?.allowed).toBe(false);

    const csv = await usageCsv(workspaceId, productionId, "2026-10-21");
    expect(csv.startsWith("day,team,requests,spend_gbp,saving_gbp\n")).toBe(true);
    expect(csv).toContain("Support");

    const pending = await listApprovals(workspaceId);
    expect(pending).toHaveLength(3);
  });

  it("opens a workspace and records credit without charging a card", async () => {
    const { registerWorkspace } = await import("@/lib/register");
    const { getCredits, postCredit, recordCredit } = await import("@/lib/credits");
    const created = await registerWorkspace({
      name: "Nia Mensah",
      email: "nia@example.com",
      password: "a-long-local-password",
      workspaceName: "Northline",
    });
    const admin = { id: created.userId, workspaceId: created.workspaceId, role: "admin" as const, name: "Nia Mensah" };
    const posted = await recordCredit(admin, "250", "purchase");
    expect(posted.status).toBe("posted");
    expect(posted.balance).toBe("£250");
    const requested = await recordCredit({ ...admin, role: "reviewer" }, "50", "purchase");
    expect(requested.status).toBe("awaiting_payment");
    expect(requested.balance).toBe("£250");
    const waiting = (await getCredits(created.workspaceId, "admin")).entries.find((entry) => entry.status === "awaiting_payment");
    const settled = await postCredit(admin, waiting?.id ?? "");
    expect(settled.balance).toBe("£300");
  });
});
