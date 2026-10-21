import { classify } from "@/lib/router/classify";
import { reasonLines, tradeoffs } from "@/lib/router/copy";
import { budgetGuardEnabled, matchPolicy } from "@/lib/router/policy";
import { excerpt, redactText, sha256 } from "@/lib/router/redact";
import { chooseModel, costOf, demoteTier, listAlternatives, promoteTier, referencePremium } from "@/lib/router/select";
import type { CatalogueModel, Decision, PolicyRecord, TeamBudget, Tier } from "@/lib/types";

const QUALITY: Record<Tier, number> = { economy: 75, standard: 85, premium: 92 };

const LABELS: Record<Decision["taskType"], string> = {
  support: "Customer support reply",
  summarisation: "Summary",
  extraction: "Extraction",
  coding: "Code change",
  reasoning: "Analysis",
  legal: "Legal review",
  finance: "Financial decision",
  marketing: "Marketing draft",
};

export type DecideInput = {
  prompt: string;
  workflow: string;
  teamSlug: string;
  policies: PolicyRecord[];
  models: CatalogueModel[];
  team: TeamBudget;
  requestedModel?: string | null;
};

export type DecideResult = { ok: true; decision: Decision } | { ok: false; code: string; error: string };

function findRequested(models: CatalogueModel[], requested: string | null | undefined): CatalogueModel | null {
  if (!requested || requested === "quiet-auto") return null;
  return models.find((model) => model.slug === requested || model.upstreamModel === requested) ?? null;
}

export function decide(input: DecideInput): DecideResult {
  const classification = classify(input.prompt);
  const requested = findRequested(input.models, input.requestedModel);
  if (input.requestedModel && input.requestedModel !== "quiet-auto" && !requested) {
    return { ok: false, code: "unknown_model", error: `Quiet does not have a model named ${input.requestedModel}. Use quiet-auto or a catalogue slug.` };
  }
  if (requested && !requested.allowed) {
    return { ok: false, code: "model_not_allowed", error: `${requested.name} is not on this workspace allow-list.` };
  }

  const matched = matchPolicy(input.policies, {
    workflow: input.workflow,
    teamSlug: input.teamSlug,
    classification,
  });
  const then = matched?.definition.then;
  let tier: Tier = then?.tier ?? defaultTier(classification);
  let requireApproval = Boolean(then?.requireApproval);
  const region = then?.region;
  const latencyMs = then?.latencyMs;
  const escalateBelow = then?.escalateBelowConfidence ?? 0.85;
  const protectedRoute = requireApproval || classification.taskType === "legal" || classification.sensitivity === "credentials";

  if (!matched) {
    if (classification.taskType === "legal" || classification.sensitivity === "legal" || classification.sensitivity === "credentials") {
      tier = "premium";
      requireApproval = true;
    } else if (classification.taskType === "finance" || classification.sensitivity === "financial") {
      tier = "standard";
      requireApproval = true;
    }
  }

  let escalated = false;
  if (classification.confidence < escalateBelow) {
    const raised = promoteTier(tier);
    escalated = raised !== tier;
    tier = raised;
  }

  const forecastRatio = input.team.allowanceMicro > 0n ? Number(input.team.forecastMicro) / Number(input.team.allowanceMicro) : 0;
  let budgetGuarded = false;
  if (budgetGuardEnabled(input.policies) && forecastRatio >= 0.8 && !protectedRoute && tier !== "economy") {
    tier = demoteTier(tier) === tier ? tier : "economy";
    budgetGuarded = true;
    escalated = false;
  }

  const minQuality = budgetGuarded ? QUALITY.economy : (then?.minQuality ?? QUALITY[tier]);
  const callerPinned = Boolean(requested);
  const choice = requested
    ? { model: requested, relaxedLatency: false, relaxedQuality: false, blockedCheaper: [] }
    : chooseModel(input.models, tier, classification.tokensIn, classification.tokensOut, {
        minQuality,
        latencyMs,
        region,
        pinModelSlug: then?.pinModelSlug,
      });

  if (!choice.model) {
    return { ok: false, code: "no_model", error: "No allowed model can take this request. Review the model allow-list." };
  }
  if (choice.relaxedQuality) requireApproval = true;

  const premium = referencePremium(input.models);
  const estimatedMicro = costOf(choice.model, classification.tokensIn, classification.tokensOut);
  const premiumMicro = premium ? costOf(premium, classification.tokensIn, classification.tokensOut) : estimatedMicro;
  const copy = tradeoffs(choice.model.tier);
  const redact = Boolean(then?.redact) || classification.sensitivity !== "none";
  const outbound = redact ? redactText(input.prompt) : input.prompt;

  const decision: Decision = {
    taskLabel: LABELS[classification.taskType],
    taskType: classification.taskType,
    complexity: classification.complexity,
    sensitivity: classification.sensitivity,
    confidence: classification.confidence,
    tokensIn: classification.tokensIn,
    tokensOut: classification.tokensOut,
    tier: choice.model.tier,
    modelSlug: choice.model.slug,
    modelName: choice.model.name,
    premiumSlug: premium?.slug ?? choice.model.slug,
    premiumName: premium?.name ?? choice.model.name,
    estimatedMicro,
    premiumMicro,
    reasons: reasonLines({
      complexity: classification.complexity,
      sensitivity: classification.sensitivity,
      latencyMs,
      escalated,
      budgetGuarded,
      callerPinned,
      relaxedLatency: choice.relaxedLatency,
      relaxedQuality: choice.relaxedQuality,
      region,
    }),
    pros: copy.pros,
    cons: copy.cons,
    policyId: matched?.id ?? null,
    policyName: matched?.name ?? null,
    requireApproval,
    escalated,
    withinPolicy: !choice.relaxedQuality,
    alternatives: listAlternatives(input.models, choice.model, premium, choice.blockedCheaper, classification.tokensIn, classification.tokensOut),
    redactedExcerpt: excerpt(outbound),
    outboundPrompt: outbound,
    promptSha256: sha256(input.prompt),
    callerPinned,
  };

  return { ok: true, decision };
}

function defaultTier(classification: { taskType: Decision["taskType"]; confidence: number }): Tier {
  if (classification.taskType === "coding" || classification.taskType === "reasoning") return "standard";
  if (classification.confidence >= 0.85) return "economy";
  return "standard";
}

export function savingMicro(estimated: bigint, premium: bigint): bigint {
  return premium > estimated ? premium - estimated : 0n;
}
