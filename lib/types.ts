export const TASK_TYPES = [
  "support",
  "summarisation",
  "extraction",
  "coding",
  "reasoning",
  "legal",
  "finance",
  "marketing",
] as const;

export const SENSITIVITIES = ["none", "financial", "legal", "pii", "credentials"] as const;
export const TIERS = ["economy", "standard", "premium"] as const;
export const COMPLEXITIES = ["low", "moderate", "high"] as const;
export const ROLES = ["admin", "finance", "operator", "reviewer"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type Sensitivity = (typeof SENSITIVITIES)[number];
export type Tier = (typeof TIERS)[number];
export type Complexity = (typeof COMPLEXITIES)[number];
export type Role = (typeof ROLES)[number];

export type PolicyDefinition = {
  when: {
    taskTypes?: TaskType[];
    workflows?: string[];
    teams?: string[];
    sensitivities?: Sensitivity[];
    excludeSensitivities?: Sensitivity[];
    maxInputTokens?: number;
  };
  then: {
    tier?: Tier;
    minQuality?: number;
    escalateBelowConfidence?: number;
    latencyMs?: number;
    requireApproval?: boolean;
    redact?: boolean;
    pinModelSlug?: string;
    region?: string;
    budgetGuard?: boolean;
  };
};

export type PolicyRecord = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  definition: PolicyDefinition;
};

export type CatalogueModel = {
  slug: string;
  name: string;
  provider: string;
  tier: Tier;
  region: string;
  inputMicroPerMillion: bigint;
  outputMicroPerMillion: bigint;
  latencyP50Ms: number;
  qualityIndex: number;
  allowed: boolean;
  adapter: "openai" | "anthropic";
  upstreamModel: string;
};

export type TeamBudget = {
  slug: string;
  name: string;
  allowanceMicro: bigint;
  spentMicro: bigint;
  forecastMicro: bigint;
};

export type Classification = {
  taskType: TaskType;
  complexity: Complexity;
  sensitivity: Sensitivity;
  confidence: number;
  tokensIn: number;
  tokensOut: number;
  signals: string[];
};

export type Alternative = {
  slug: string;
  name: string;
  tier: Tier;
  micro: bigint;
  note: string;
};

export type Decision = {
  taskLabel: string;
  taskType: TaskType;
  complexity: Complexity;
  sensitivity: Sensitivity;
  confidence: number;
  tokensIn: number;
  tokensOut: number;
  tier: Tier;
  modelSlug: string;
  modelName: string;
  premiumSlug: string;
  premiumName: string;
  estimatedMicro: bigint;
  premiumMicro: bigint;
  reasons: string[];
  pros: string;
  cons: string;
  policyId: string | null;
  policyName: string | null;
  requireApproval: boolean;
  escalated: boolean;
  withinPolicy: boolean;
  alternatives: Alternative[];
  redactedExcerpt: string;
  outboundPrompt: string;
  promptSha256: string;
  callerPinned: boolean;
};
