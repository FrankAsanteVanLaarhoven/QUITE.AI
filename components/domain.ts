export type RequestView = {
  id: string;
  taskLabel: string;
  workflow: string;
  teamSlug: string;
  teamName: string;
  status: string;
  taskType: string;
  complexity: string;
  sensitivity: string;
  confidence: number;
  confidenceLabel: string;
  tokensIn: number;
  tokensOut: number;
  modelSlug: string;
  modelName: string;
  modelTier: string;
  modelProvider: string;
  modelRegion: string;
  premiumName: string;
  estimated: string;
  premium: string;
  actual: string | null;
  saving: string;
  savingRatio: string;
  reasons: string[];
  pros: string;
  cons: string;
  policyId: string | null;
  policyName: string | null;
  escalated: boolean;
  withinPolicy: boolean;
  mode: string;
  featured: boolean;
  excerpt: string;
  createdAt: string;
  billed: boolean;
  alternatives: { name: string; tier: string; cost: string; note: string }[];
  approval: { id: string; status: string; recommendedTier: string; reason: string } | null;
  audit?: { action: string; at: string; actor: string | null; detail: unknown }[];
};

export type TeamRow = {
  slug: string;
  name: string;
  seats: number;
  status: string;
  used: string | null;
  forecast: string | null;
  spent: string;
  allowance: string;
  forecastAmount: string;
};

export type Overview = {
  asOf: string;
  period: string;
  environment: { id: string; slug: string; name: string };
  definition: string;
  headline: string;
  saving: string;
  quality: string;
  spent: string;
  committed: string;
  forecast: string;
  billed: number;
  committedNumber: number;
  series: { day: string; cumulative: number }[];
  teams: TeamRow[];
  recommendations: string[];
};

export type PolicyView = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  summary: { when: string[]; then: string[] };
};

export type ModelView = {
  slug: string;
  name: string;
  provider: string;
  tier: string;
  region: string;
  latencyMs: number;
  quality: number;
  allowed: boolean;
  input: string;
  output: string;
};

export type TeamAccount = { slug: string; name: string; seats: number; allowance: string; filled?: number };

export type AuditEvent = {
  id: string;
  action: string;
  created_at: string;
  actor: string | null;
  target_type: string;
  detail: unknown;
};

export type ApiKeyView = { name: string; token_prefix: string; environment: string; created_at: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function stamp(asOf: string): string {
  const [year, month, day] = asOf.split("-").map(Number);
  if (!year || !month || !day) return asOf;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function statusText(status: string): string {
  return status.replaceAll("_", " ");
}

export function can(role: string, action: "route" | "write" | "money" | "export" | "keys" | "people"): boolean {
  if (action === "route") return role === "admin" || role === "operator" || role === "finance";
  if (action === "write") return role === "admin" || role === "operator";
  if (action === "money") return role === "admin" || role === "finance";
  if (action === "export") return role === "admin" || role === "finance" || role === "operator";
  return role === "admin";
}
