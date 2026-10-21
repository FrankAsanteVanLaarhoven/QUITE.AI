import { requestCostMicro } from "@/lib/money";
import type { Alternative, CatalogueModel, Tier } from "@/lib/types";

const TIER_ORDER: Tier[] = ["economy", "standard", "premium"];

export function promoteTier(tier: Tier): Tier {
  const index = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, index + 1)] ?? tier;
}

export function demoteTier(tier: Tier): Tier {
  const index = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, index - 1)] ?? tier;
}

export type TierChoice = {
  model: CatalogueModel | null;
  relaxedLatency: boolean;
  relaxedQuality: boolean;
  blockedCheaper: CatalogueModel[];
};

export function chooseModel(
  models: CatalogueModel[],
  tier: Tier,
  tokensIn: number,
  tokensOut: number,
  constraints: { minQuality: number; latencyMs?: number; region?: string; pinModelSlug?: string },
): TierChoice {
  const allowed = models.filter((model) => model.allowed);
  if (constraints.pinModelSlug) {
    const pinned = allowed.find((model) => model.slug === constraints.pinModelSlug) ?? null;
    return { model: pinned, relaxedLatency: false, relaxedQuality: false, blockedCheaper: [] };
  }

  const inTier = allowed.filter((model) => model.tier === tier);
  const regional = constraints.region ? inTier.filter((model) => model.region === constraints.region) : inTier;
  const pool = constraints.region && regional.length === 0 ? inTier : regional;
  const capable = pool.filter((model) => model.qualityIndex >= constraints.minQuality);
  const blockedCheaper = pool
    .filter((model) => model.qualityIndex < constraints.minQuality)
    .sort((a, b) => Number(costOf(a, tokensIn, tokensOut) - costOf(b, tokensIn, tokensOut)));

  let relaxedLatency = false;
  let candidates = capable;
  if (constraints.latencyMs != null) {
    const fast = capable.filter((model) => model.latencyP50Ms <= constraints.latencyMs!);
    if (fast.length > 0) candidates = fast;
    else if (capable.length > 0) relaxedLatency = true;
  }

  const ranked = [...candidates].sort((a, b) => {
    const cost = Number(costOf(a, tokensIn, tokensOut) - costOf(b, tokensIn, tokensOut));
    if (cost !== 0) return cost;
    return b.qualityIndex - a.qualityIndex;
  });

  if (ranked[0]) {
    return { model: ranked[0], relaxedLatency, relaxedQuality: false, blockedCheaper };
  }

  const fallback = [...pool].sort((a, b) => b.qualityIndex - a.qualityIndex)[0] ?? null;
  return { model: fallback, relaxedLatency, relaxedQuality: Boolean(fallback), blockedCheaper };
}

export function costOf(model: CatalogueModel, tokensIn: number, tokensOut: number): bigint {
  return requestCostMicro(tokensIn, tokensOut, model.inputMicroPerMillion, model.outputMicroPerMillion);
}

export function referencePremium(models: CatalogueModel[]): CatalogueModel | null {
  return models.find((model) => model.slug === "claude-sonnet" && model.allowed) ?? models.find((model) => model.tier === "premium" && model.allowed) ?? null;
}

export function listAlternatives(
  models: CatalogueModel[],
  selected: CatalogueModel,
  premium: CatalogueModel | null,
  blockedCheaper: CatalogueModel[],
  tokensIn: number,
  tokensOut: number,
): Alternative[] {
  const alternatives: Alternative[] = [];
  const cheaper = blockedCheaper[0];
  if (cheaper && cheaper.slug !== selected.slug) {
    alternatives.push({
      slug: cheaper.slug,
      name: cheaper.name,
      tier: cheaper.tier,
      micro: costOf(cheaper, tokensIn, tokensOut),
      note: `Below the quality floor (${cheaper.qualityIndex})`,
    });
  }
  if (premium && premium.slug !== selected.slug) {
    alternatives.push({
      slug: premium.slug,
      name: premium.name,
      tier: premium.tier,
      micro: costOf(premium, tokensIn, tokensOut),
      note: "Premium baseline",
    });
  }
  const next = models
    .filter((model) => model.allowed && model.slug !== selected.slug && model.tier !== selected.tier && model.slug !== premium?.slug && model.slug !== cheaper?.slug)
    .sort((a, b) => Number(costOf(a, tokensIn, tokensOut) - costOf(b, tokensIn, tokensOut)))[0];
  if (next) {
    alternatives.push({
      slug: next.slug,
      name: next.name,
      tier: next.tier,
      micro: costOf(next, tokensIn, tokensOut),
      note: `${next.tier} option`,
    });
  }
  return alternatives.slice(0, 3);
}
