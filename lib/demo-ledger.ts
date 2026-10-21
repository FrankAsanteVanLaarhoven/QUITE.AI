import { poundsToMicro, sumMicro } from "@/lib/money";
import { forecastMicro, type DailySpend } from "@/lib/router/forecast";
import { tradeoffs } from "@/lib/router/copy";
import type { Complexity, Sensitivity, TaskType } from "@/lib/types";

export type DemoTeamPlan = {
  slug: string;
  name: string;
  seats: number;
  allowancePounds: bigint;
  earlyBase: bigint;
  earlyRemainder: number;
  recent: bigint;
  workflow: string;
  taskType: TaskType;
  modelSlug: string;
};

export const DEMO_TEAMS: DemoTeamPlan[] = [
  { slug: "support", name: "Support", seats: 120, allowancePounds: 14000n, earlyBase: 221n, earlyRemainder: 0, recent: 378n, workflow: "customer-support", taskType: "support", modelSlug: "gpt-4.1-mini" },
  { slug: "engineering", name: "Engineering", seats: 85, allowancePounds: 22000n, earlyBase: 682n, earlyRemainder: 0, recent: 616n, workflow: "pr-review", taskType: "coding", modelSlug: "gpt-4.1" },
  { slug: "marketing", name: "Marketing", seats: 40, allowancePounds: 5000n, earlyBase: 49n, earlyRemainder: 4, recent: 30n, workflow: "product-descriptions", taskType: "marketing", modelSlug: "gpt-4.1-mini" },
  { slug: "sales", name: "Sales", seats: 65, allowancePounds: 7000n, earlyBase: 172n, earlyRemainder: 0, recent: 196n, workflow: "sales-notes", taskType: "summarisation", modelSlug: "gpt-4.1-mini" },
  { slug: "shared", name: "Shared platform", seats: 0, allowancePounds: 0n, earlyBase: 424n, earlyRemainder: 2, recent: 146n, workflow: "embeddings", taskType: "extraction", modelSlug: "gpt-4.1-mini" },
];

export const DEMO_AS_OF = "2026-10-21";
export const DEMO_DAYS = 21;
export const DEMO_BILLED_COUNT = 18_400;
export const DEMO_ESCALATIONS = 736;
export const DEMO_SPEND_POUNDS = 31240n;
export const DEMO_SAVING_POUNDS = 18700n;
export const DEMO_FORECAST_POUNDS = 44900n;
export const DEMO_COMMITTED_POUNDS = 48000n;

export type DemoRequest = {
  id: string;
  teamSlug: string;
  workflow: string;
  taskLabel: string;
  taskType: TaskType;
  complexity: Complexity;
  sensitivity: Sensitivity;
  confidence: number;
  tokensIn: number;
  tokensOut: number;
  modelSlug: string;
  premiumSlug: string;
  estimatedMicro: bigint;
  premiumMicro: bigint;
  actualMicro: bigint | null;
  savingMicro: bigint;
  status: "routed" | "accepted" | "overridden" | "pending_review" | "escalated" | "rejected" | "failed";
  withinPolicy: boolean;
  escalated: boolean;
  reasons: string[];
  pros: string;
  cons: string;
  policyName: string | null;
  createdAt: string;
  featured: boolean;
  mode: "imported" | "decide";
  excerpt: string;
  approval: { recommendedTier: "economy" | "standard" | "premium"; reason: string } | null;
};

export type DemoLedger = {
  requests: DemoRequest[];
  spentMicro: bigint;
  savingMicro: bigint;
  forecastMicro: bigint;
  quality: number;
  billed: number;
  escalations: number;
  daily: DailySpend[];
};

function dayStamp(index: number): string {
  return `2026-10-${String(index).padStart(2, "0")}`;
}

function dayPounds(team: DemoTeamPlan, dayIndex: number): bigint {
  if (dayIndex < 14) return team.earlyBase + (dayIndex < team.earlyRemainder ? 1n : 0n);
  return team.recent;
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function distributeCount(total: number, weights: bigint[]): number[] {
  const sum = weights.reduce((totalWeight, weight) => totalWeight + weight, 0n);
  const counts = weights.map((weight) => Number((weight * BigInt(total)) / sum));
  for (let index = 0; index < counts.length; index += 1) {
    if (weights[index] > 0n && counts[index] === 0) counts[index] = 1;
  }
  let assigned = counts.reduce((totalCount, count) => totalCount + count, 0);
  let cursor = 0;
  while (assigned < total) {
    const index = weights.findIndex((weight, item) => weight > 0n && item >= cursor % weights.length);
    const target = index === -1 ? counts.findIndex((count) => count >= 0) : index;
    counts[target] += 1;
    assigned += 1;
    cursor += 1;
    if (cursor > total * 2) break;
  }
  while (assigned > total) {
    const index = counts.findIndex((count) => count > 1);
    if (index === -1) throw new Error("Demo ledger cannot fit the request count.");
    counts[index] -= 1;
    assigned -= 1;
  }
  if (assigned !== total) throw new Error(`Demo request count is ${assigned}, expected ${total}.`);
  return counts;
}

function splitMicro(total: bigint, parts: number): bigint[] {
  const base = total / BigInt(parts);
  const remainder = total % BigInt(parts);
  return Array.from({ length: parts }, (_, index) => base + (BigInt(index) < remainder ? 1n : 0n));
}

function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((totalWeight, weight) => totalWeight + weight, 0n);
  const shares = weights.map((weight) => (weight * total) / sum);
  let assigned = shares.reduce((totalShare, share) => totalShare + share, 0n);
  let index = 0;
  while (assigned < total) {
    shares[index % shares.length] += 1n;
    assigned += 1n;
    index += 1;
  }
  return shares;
}

function featuredRequests(): DemoRequest[] {
  const economy = tradeoffs("economy");
  const standard = tradeoffs("standard");
  const premium = tradeoffs("premium");
  return [
    {
      id: uuid(9001),
      teamSlug: "support",
      workflow: "customer-support",
      taskLabel: "Customer support reply",
      taskType: "support",
      complexity: "low",
      sensitivity: "none",
      confidence: 0.94,
      tokensIn: 1000,
      tokensOut: 200,
      modelSlug: "gpt-4.1-mini",
      premiumSlug: "claude-sonnet",
      estimatedMicro: 1800n,
      premiumMicro: 12400n,
      actualMicro: null,
      savingMicro: 10600n,
      status: "routed",
      withinPolicy: true,
      escalated: false,
      reasons: ["Low task complexity", "No sensitive data detected", "Historical quality within policy", "Latency target: under 1.5 seconds"],
      pros: economy.pros,
      cons: economy.cons,
      policyName: "Customer support replies",
      createdAt: "2026-10-21T18:05:00.000Z",
      featured: true,
      mode: "decide",
      excerpt: "Reply to the customer asking for the order status of a blue kettle.",
      approval: null,
    },
    {
      id: uuid(9002),
      teamSlug: "support",
      workflow: "legal-review",
      taskLabel: "Legal contract summary",
      taskType: "legal",
      complexity: "high",
      sensitivity: "legal",
      confidence: 0.93,
      tokensIn: 2400,
      tokensOut: 600,
      modelSlug: "claude-sonnet",
      premiumSlug: "claude-sonnet",
      estimatedMicro: 420_000n,
      premiumMicro: 420_000n,
      actualMicro: null,
      savingMicro: 0n,
      status: "pending_review",
      withinPolicy: true,
      escalated: false,
      reasons: ["Legal-risk task", "Policy requires a premium model and a human review"],
      pros: premium.pros,
      cons: premium.cons,
      policyName: "Legal review",
      createdAt: "2026-10-21T18:06:00.000Z",
      featured: true,
      mode: "decide",
      excerpt: "Summarise the liability clause in the supplier contract.",
      approval: { recommendedTier: "premium", reason: "Legal-risk task. Policy requires premium review." },
    },
    {
      id: uuid(9003),
      teamSlug: "sales",
      workflow: "refunds",
      taskLabel: "Customer refund decision",
      taskType: "finance",
      complexity: "moderate",
      sensitivity: "financial",
      confidence: 0.91,
      tokensIn: 700,
      tokensOut: 200,
      modelSlug: "gpt-4.1",
      premiumSlug: "claude-sonnet",
      estimatedMicro: 80_000n,
      premiumMicro: 320_000n,
      actualMicro: null,
      savingMicro: 240_000n,
      status: "pending_review",
      withinPolicy: true,
      escalated: false,
      reasons: ["Financial content needs an audit trail", "Policy keeps a standard model and asks for review"],
      pros: standard.pros,
      cons: standard.cons,
      policyName: "Financial decisions",
      createdAt: "2026-10-21T18:07:00.000Z",
      featured: true,
      mode: "decide",
      excerpt: "Decide whether this customer refund matches the published policy.",
      approval: { recommendedTier: "standard", reason: "Financial decision requires an audit trail." },
    },
    {
      id: uuid(9004),
      teamSlug: "marketing",
      workflow: "product-descriptions",
      taskLabel: "Bulk product descriptions",
      taskType: "marketing",
      complexity: "low",
      sensitivity: "none",
      confidence: 0.92,
      tokensIn: 1800,
      tokensOut: 900,
      modelSlug: "gpt-4.1-mini",
      premiumSlug: "claude-sonnet",
      estimatedMicro: 1_200_000n,
      premiumMicro: 4_800_000n,
      actualMicro: null,
      savingMicro: 3_600_000n,
      status: "pending_review",
      withinPolicy: true,
      escalated: false,
      reasons: ["Low task complexity", "No sensitive data detected", "High volume, low risk"],
      pros: economy.pros,
      cons: economy.cons,
      policyName: "Marketing and summaries",
      createdAt: "2026-10-21T18:08:00.000Z",
      featured: true,
      mode: "decide",
      excerpt: "Draft short product descriptions for the autumn catalogue.",
      approval: { recommendedTier: "economy", reason: "Low-risk content generation." },
    },
  ];
}

export function buildDemoLedger(): DemoLedger {
  const cells: { team: DemoTeamPlan; day: string; pounds: bigint }[] = [];
  for (let dayIndex = 1; dayIndex <= DEMO_DAYS; dayIndex += 1) {
    for (const team of DEMO_TEAMS) {
      cells.push({ team, day: dayStamp(dayIndex), pounds: dayPounds(team, dayIndex - 1) });
    }
  }
  const counts = distributeCount(DEMO_BILLED_COUNT, cells.map((cell) => cell.pounds));
  const requests: DemoRequest[] = [];
  let sequence = 20_000;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const parts = splitMicro(poundsToMicro(cell.pounds), counts[index]);
    parts.forEach((actual, part) => {
      const copy = tradeoffs(cell.team.modelSlug === "gpt-4.1" ? "standard" : "economy");
      const created = new Date(Date.parse(`${cell.day}T08:00:00.000Z`) + (part + DEMO_TEAMS.indexOf(cell.team)) * 1000);
      requests.push({
        id: uuid(sequence),
        teamSlug: cell.team.slug,
        workflow: cell.team.workflow,
        taskLabel: cell.team.taskType === "coding" ? "Code change" : cell.team.taskType === "extraction" ? "Embedding batch" : cell.team.name === "Sales" ? "Sales notes" : cell.team.name === "Marketing" ? "Marketing draft" : "Support reply",
        taskType: cell.team.taskType,
        complexity: cell.team.taskType === "coding" ? "moderate" : "low",
        sensitivity: "none",
        confidence: 0.91,
        tokensIn: 400,
        tokensOut: 160,
        modelSlug: cell.team.modelSlug,
        premiumSlug: "claude-sonnet",
        estimatedMicro: actual,
        premiumMicro: actual,
        actualMicro: actual,
        savingMicro: 0n,
        status: "accepted",
        withinPolicy: true,
        escalated: false,
        reasons: ["Imported from the October usage ledger"],
        pros: copy.pros,
        cons: copy.cons,
        policyName: null,
        createdAt: created.toISOString(),
        featured: false,
        mode: "imported",
        excerpt: "",
        approval: null,
      });
      sequence += 1;
    });
  }

  if (requests.length !== DEMO_BILLED_COUNT) {
    throw new Error(`Expected ${DEMO_BILLED_COUNT} billed requests, built ${requests.length}.`);
  }
  const shares = allocate(poundsToMicro(DEMO_SAVING_POUNDS), requests.map((request) => request.actualMicro ?? 0n));
  requests.forEach((request, index) => {
    request.savingMicro = shares[index];
    request.premiumMicro = (request.actualMicro ?? 0n) + shares[index];
  });
  const step = Math.floor(requests.length / DEMO_ESCALATIONS);
  for (let index = 0; index < DEMO_ESCALATIONS; index += 1) {
    const request = requests[index * step];
    request.escalated = true;
    request.withinPolicy = false;
    request.confidence = 0.62;
    request.reasons = ["Imported escalation. The first model missed the quality floor."];
  }

  const open = featuredRequests();
  const all = [...requests, ...open];
  const spentMicro = sumMicro(requests.map((request) => request.actualMicro ?? 0n));
  const saving = sumMicro(requests.map((request) => request.savingMicro));
  const dailyMap = new Map<string, bigint>();
  for (const request of requests) {
    const day = request.createdAt.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0n) + (request.actualMicro ?? 0n));
  }
  const daily = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, spent]) => ({ day, spentMicro: spent }));
  const forecast = forecastMicro(daily, DEMO_AS_OF, 31);
  const escalations = requests.filter((request) => request.escalated).length;
  const quality = requests.filter((request) => request.withinPolicy && !request.escalated).length / requests.length;
  if (spentMicro !== poundsToMicro(DEMO_SPEND_POUNDS)) throw new Error("Demo spend did not reconcile.");
  if (saving !== poundsToMicro(DEMO_SAVING_POUNDS)) throw new Error("Demo saving did not reconcile.");
  if (forecast !== poundsToMicro(DEMO_FORECAST_POUNDS)) throw new Error(`Demo forecast was ${forecast}.`);
  if (quality !== 0.96) throw new Error(`Demo quality was ${quality}.`);
  if (escalations !== DEMO_ESCALATIONS) throw new Error("Demo escalation count drifted.");
  return { requests: all, spentMicro, savingMicro: saving, forecastMicro: forecast, quality, billed: requests.length, escalations, daily };
}

export const DEMO_COMMITTED_MICRO = poundsToMicro(DEMO_COMMITTED_POUNDS);

export function buildStagingRequests(): DemoRequest[] {
  const rows: DemoRequest[] = [];
  let sequence = 50_000;
  for (let day = 1; day <= DEMO_DAYS; day += 1) {
    DEMO_TEAMS.forEach((team, teamIndex) => {
      const actual = 1_000_000n;
      const copy = tradeoffs("economy");
      rows.push({
        id: uuid(sequence),
        teamSlug: team.slug,
        workflow: team.workflow,
        taskLabel: "Staging sample",
        taskType: team.taskType,
        complexity: "low",
        sensitivity: "none",
        confidence: 0.9,
        tokensIn: 200,
        tokensOut: 80,
        modelSlug: "gpt-4.1-mini",
        premiumSlug: "claude-sonnet",
        estimatedMicro: actual,
        premiumMicro: actual + 200_000n,
        actualMicro: actual,
        savingMicro: 200_000n,
        status: "accepted",
        withinPolicy: true,
        escalated: false,
        reasons: ["Staging sample"],
        pros: copy.pros,
        cons: copy.cons,
        policyName: null,
        createdAt: new Date(Date.parse(`${dayStamp(day)}T09:00:00.000Z`) + teamIndex * 1000).toISOString(),
        featured: false,
        mode: "imported",
        excerpt: "",
        approval: null,
      });
      sequence += 1;
    });
  }
  return rows;
}
