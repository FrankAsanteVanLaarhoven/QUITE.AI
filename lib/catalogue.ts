import type { CatalogueModel, PolicyDefinition, PolicyRecord } from "@/lib/types";

function perMillion(pounds: number): bigint {
  return BigInt(Math.round(pounds * 1_000_000));
}

export const CATALOGUE: CatalogueModel[] = [
  {
    slug: "gemini-flash",
    name: "Gemini Flash",
    provider: "Google",
    tier: "economy",
    region: "eu",
    inputMicroPerMillion: perMillion(0.2),
    outputMicroPerMillion: perMillion(0.8),
    latencyP50Ms: 450,
    qualityIndex: 72,
    allowed: true,
    adapter: "openai",
    upstreamModel: "gemini-flash",
  },
  {
    slug: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    provider: "OpenAI",
    tier: "economy",
    region: "us",
    inputMicroPerMillion: perMillion(0.8),
    outputMicroPerMillion: perMillion(5),
    latencyP50Ms: 700,
    qualityIndex: 78,
    allowed: true,
    adapter: "openai",
    upstreamModel: "gpt-4.1-mini",
  },
  {
    slug: "claude-haiku",
    name: "Claude Haiku",
    provider: "Anthropic",
    tier: "economy",
    region: "us",
    inputMicroPerMillion: perMillion(1),
    outputMicroPerMillion: perMillion(5),
    latencyP50Ms: 650,
    qualityIndex: 80,
    allowed: true,
    adapter: "anthropic",
    upstreamModel: "claude-haiku",
  },
  {
    slug: "gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    tier: "standard",
    region: "us",
    inputMicroPerMillion: perMillion(2.5),
    outputMicroPerMillion: perMillion(10),
    latencyP50Ms: 1100,
    qualityIndex: 88,
    allowed: true,
    adapter: "openai",
    upstreamModel: "gpt-4.1",
  },
  {
    slug: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "Anthropic",
    tier: "premium",
    region: "eu",
    inputMicroPerMillion: perMillion(6),
    outputMicroPerMillion: perMillion(32),
    latencyP50Ms: 1400,
    qualityIndex: 94,
    allowed: true,
    adapter: "anthropic",
    upstreamModel: "claude-sonnet",
  },
  {
    slug: "claude-opus",
    name: "Claude Opus",
    provider: "Anthropic",
    tier: "premium",
    region: "us",
    inputMicroPerMillion: perMillion(15),
    outputMicroPerMillion: perMillion(75),
    latencyP50Ms: 2200,
    qualityIndex: 97,
    allowed: true,
    adapter: "anthropic",
    upstreamModel: "claude-opus",
  },
];

export const DEFAULT_POLICIES: { name: string; priority: number; definition: PolicyDefinition }[] = [
  {
    name: "Credential block",
    priority: 5,
    definition: {
      when: { sensitivities: ["credentials"] },
      then: { tier: "premium", minQuality: 92, escalateBelowConfidence: 0.99, requireApproval: true, redact: true },
    },
  },
  {
    name: "Legal review",
    priority: 10,
    definition: {
      when: { taskTypes: ["legal"] },
      then: { tier: "premium", minQuality: 92, escalateBelowConfidence: 0.9, latencyMs: 5000, requireApproval: true, redact: true, region: "eu" },
    },
  },
  {
    name: "Financial decisions",
    priority: 20,
    definition: {
      when: { taskTypes: ["finance"] },
      then: { tier: "standard", minQuality: 85, escalateBelowConfidence: 0.85, requireApproval: true, redact: true },
    },
  },
  {
    name: "Budget guard",
    priority: 30,
    definition: {
      when: {},
      then: { budgetGuard: true },
    },
  },
  {
    name: "Customer support replies",
    priority: 50,
    definition: {
      when: { taskTypes: ["support"], excludeSensitivities: ["legal", "financial", "credentials"], maxInputTokens: 2000 },
      then: { tier: "economy", minQuality: 75, escalateBelowConfidence: 0.85, latencyMs: 1500 },
    },
  },
  {
    name: "Marketing and summaries",
    priority: 55,
    definition: {
      when: { taskTypes: ["marketing", "summarisation"], excludeSensitivities: ["financial", "legal", "credentials"] },
      then: { tier: "economy", minQuality: 75, escalateBelowConfidence: 0.85, latencyMs: 1500 },
    },
  },
  {
    name: "Extraction",
    priority: 56,
    definition: {
      when: { taskTypes: ["extraction"], excludeSensitivities: ["credentials"] },
      then: { tier: "economy", minQuality: 75, escalateBelowConfidence: 0.8, latencyMs: 1500, redact: true },
    },
  },
  {
    name: "Coding",
    priority: 60,
    definition: {
      when: { taskTypes: ["coding"] },
      then: { tier: "standard", minQuality: 85, escalateBelowConfidence: 0.8, latencyMs: 3000 },
    },
  },
];

export function defaultPolicyRecords(): PolicyRecord[] {
  return DEFAULT_POLICIES.map((policy, index) => ({
    id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    name: policy.name,
    priority: policy.priority,
    enabled: true,
    definition: policy.definition,
  }));
}

export function modelBySlug(models: CatalogueModel[], slug: string): CatalogueModel {
  const model = models.find((item) => item.slug === slug);
  if (!model) throw new Error(`Unknown model ${slug}`);
  return model;
}
