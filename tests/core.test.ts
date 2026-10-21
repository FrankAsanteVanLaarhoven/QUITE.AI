import { describe, expect, it } from "vitest";
import { CATALOGUE, defaultPolicyRecords, modelBySlug } from "@/lib/catalogue";
import { buildDemoLedger, buildStagingRequests, DEMO_COMMITTED_POUNDS, DEMO_FORECAST_POUNDS, DEMO_SAVING_POUNDS, DEMO_SPEND_POUNDS } from "@/lib/demo-ledger";
import { recommendations, teamStatus } from "@/lib/finops";
import { formatMicro, formatPercentRatio } from "@/lib/format";
import { parseCreditPounds } from "@/lib/credits";
import { validateMember } from "@/lib/members";
import { poundsToMicro, requestCostMicro } from "@/lib/money";
import { slugifyWorkspace, validateSignup } from "@/lib/register";
import { classify } from "@/lib/router/classify";
import { decide } from "@/lib/router/decide";
import { redactText } from "@/lib/router/redact";
import type { TeamBudget } from "@/lib/types";

const policies = defaultPolicyRecords();
const supportTeam: TeamBudget = {
  slug: "support",
  name: "Support",
  allowanceMicro: poundsToMicro(14000n),
  spentMicro: poundsToMicro(5740n),
  forecastMicro: poundsToMicro(9520n),
};
const engineeringTeam: TeamBudget = {
  slug: "engineering",
  name: "Engineering",
  allowanceMicro: poundsToMicro(22000n),
  spentMicro: poundsToMicro(13860n),
  forecastMicro: poundsToMicro(20020n),
};

describe("money and ledger", () => {
  it("prices the support example at the catalogue rates", () => {
    const mini = modelBySlug(CATALOGUE, "gpt-4.1-mini");
    const sonnet = modelBySlug(CATALOGUE, "claude-sonnet");
    const selected = requestCostMicro(1000, 200, mini.inputMicroPerMillion, mini.outputMicroPerMillion);
    const premium = requestCostMicro(1000, 200, sonnet.inputMicroPerMillion, sonnet.outputMicroPerMillion);
    expect(selected).toBe(1800n);
    expect(premium).toBe(12400n);
    expect(formatMicro(selected)).toBe("£0.0018");
    expect(formatMicro(premium)).toBe("£0.0124");
    expect(formatPercentRatio(Number(premium - selected) / Number(premium))).toBe("85%");
  });

  it("formats budget figures for the capacity headline", () => {
    expect(formatMicro(poundsToMicro(31240n))).toBe("£31,240");
    expect(formatMicro(poundsToMicro(18700n))).toBe("£18,700");
    expect(formatMicro(420_000n)).toBe("£0.42");
    expect(formatMicro(1_200_000n)).toBe("£1.20");
    expect(formatMicro(80_000n)).toBe("£0.08");
    expect(formatMicro(0n)).toBe("£0");
  });

  it("reconciles the October demo ledger", () => {
    const ledger = buildDemoLedger();
    expect(ledger.spentMicro).toBe(poundsToMicro(DEMO_SPEND_POUNDS));
    expect(ledger.savingMicro).toBe(poundsToMicro(DEMO_SAVING_POUNDS));
    expect(ledger.forecastMicro).toBe(poundsToMicro(DEMO_FORECAST_POUNDS));
    expect(ledger.quality).toBe(0.96);
    expect(ledger.billed).toBe(18400);
    expect(ledger.requests.filter((request) => request.actualMicro == null)).toHaveLength(4);
    const teams = ["support", "engineering", "marketing", "sales", "shared"].map((slug) => {
      const spent = ledger.requests.filter((request) => request.teamSlug === slug && request.actualMicro != null).reduce((total, request) => total + (request.actualMicro ?? 0n), 0n);
      return spent;
    });
    expect(teams.reduce((total, spent) => total + spent, 0n)).toBe(poundsToMicro(DEMO_SPEND_POUNDS));
    expect(DEMO_COMMITTED_POUNDS > DEMO_FORECAST_POUNDS).toBe(true);
    const ids = [...ledger.requests, ...buildStagingRequests()].map((request) => request.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("router", () => {
  it("routes a clear support reply to the economy model", () => {
    const result = decide({
      prompt: "Reply to this customer support ticket. The customer asks for the order status of a blue kettle.",
      workflow: "customer-support",
      teamSlug: "support",
      policies,
      models: CATALOGUE,
      team: supportTeam,
      requestedModel: "quiet-auto",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.taskType).toBe("support");
    expect(result.decision.complexity).toBe("low");
    expect(result.decision.sensitivity).toBe("none");
    expect(result.decision.confidence).toBe(0.94);
    expect(result.decision.modelSlug).toBe("gpt-4.1-mini");
    expect(result.decision.tier).toBe("economy");
    expect(result.decision.requireApproval).toBe(false);
    expect(result.decision.reasons).toContain("No sensitive data detected");
    expect(result.decision.alternatives.some((item) => item.slug === "gemini-flash")).toBe(true);
  });

  it("holds legal work for premium review on an EU model", () => {
    const result = decide({
      prompt: "Summarise the liability clause in the supplier contract.",
      workflow: "legal-review",
      teamSlug: "support",
      policies,
      models: CATALOGUE,
      team: supportTeam,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.modelSlug).toBe("claude-sonnet");
    expect(result.decision.requireApproval).toBe(true);
    expect(result.decision.policyName).toBe("Legal review");
  });

  it("downgrades non-critical engineering work when the allowance is at risk", () => {
    const result = decide({
      prompt: "Refactor this typescript function and add a unit test.",
      workflow: "pr-review",
      teamSlug: "engineering",
      policies,
      models: CATALOGUE,
      team: engineeringTeam,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.tier).toBe("economy");
    expect(result.decision.modelSlug).toBe("gpt-4.1-mini");
    expect(result.decision.reasons.some((reason) => reason.includes("allowance"))).toBe(true);
  });

  it("rejects a disallowed caller pin", () => {
    const models = CATALOGUE.map((model) => (model.slug === "claude-opus" ? { ...model, allowed: false } : model));
    const result = decide({
      prompt: "Reply to this customer support ticket about a kettle.",
      workflow: "customer-support",
      teamSlug: "support",
      policies,
      models,
      team: supportTeam,
      requestedModel: "claude-opus",
    });
    expect(result.ok).toBe(false);
  });

  it("redacts emails, card numbers and secrets", () => {
    const clean = redactText("Email ada@example.com card 4242424242424242 and api_key sk_live_secretvalue");
    expect(clean).not.toContain("ada@example.com");
    expect(clean).not.toContain("4242424242424242");
    expect(clean).not.toContain("sk_live_secretvalue");
    expect(classify("My password is hunter2").sensitivity).toBe("credentials");
  });
});

describe("signup and credit", () => {
  it("rejects a short password and prices a whole-pound credit", () => {
    expect(validateSignup({ name: "Nia Mensah", email: "nia@example.com", password: "short", workspaceName: "Northline" })?.code).toBe("password");
    expect(slugifyWorkspace("North Line")).toBe("north-line");
    const parsed = parseCreditPounds("250");
    expect("micro" in parsed ? parsed.micro : 0n).toBe(250_000_000n);
    expect("error" in parseCreditPounds("10.999")).toBe(true);
    expect("error" in parseCreditPounds("0")).toBe(true);
    expect(validateMember({ name: "Idris Cole", email: "idris@example.com", password: "short", role: "operator" })?.code).toBe("password");
    expect(validateMember({ name: "Idris Cole", email: "idris@example.com", password: "a-long-local-password", role: "guest" })?.code).toBe("role");
  });
});

describe("finops recommendations", () => {
  it("names the under-used and watch teams from the October allowances", () => {
    const teams = [
      { slug: "support", name: "Support", seats: 120, allowanceMicro: poundsToMicro(14000n), spentMicro: poundsToMicro(5740n), forecastMicro: poundsToMicro(9520n) },
      { slug: "engineering", name: "Engineering", seats: 85, allowanceMicro: poundsToMicro(22000n), spentMicro: poundsToMicro(13860n), forecastMicro: poundsToMicro(20020n) },
      { slug: "marketing", name: "Marketing", seats: 40, allowanceMicro: poundsToMicro(5000n), spentMicro: poundsToMicro(900n), forecastMicro: poundsToMicro(1200n) },
      { slug: "sales", name: "Sales", seats: 65, allowanceMicro: poundsToMicro(7000n), spentMicro: poundsToMicro(3780n), forecastMicro: poundsToMicro(5740n) },
      { slug: "shared", name: "Shared platform", seats: 0, allowanceMicro: 0n, spentMicro: poundsToMicro(6960n), forecastMicro: poundsToMicro(8420n) },
    ];
    expect(teamStatus(teams[1])).toBe("Watch");
    expect(teamStatus(teams[2])).toBe("Under-used");
    expect(teamStatus(teams[3])).toBe("Healthy");
    expect(teamStatus(teams[4])).toBe("Shared");
    const lines = recommendations(teams);
    expect(lines.some((line) => line.includes("Engineering") && line.includes("91%"))).toBe(true);
    expect(lines.some((line) => line.includes("Reserve") && line.includes("Marketing"))).toBe(true);
  });
});
