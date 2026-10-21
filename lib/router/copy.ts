import type { Complexity, Sensitivity, Tier } from "@/lib/types";

export function tradeoffs(tier: Tier): { pros: string; cons: string } {
  if (tier === "economy") {
    return {
      pros: "Fast, inexpensive, and sufficient for this workflow.",
      cons: "Lower reasoning depth. Complex or disputed cases may need escalation.",
    };
  }
  if (tier === "standard") {
    return {
      pros: "Enough reasoning for ordinary business decisions, with a full audit record.",
      cons: "Costs more than an economy model and is slower than the smallest option.",
    };
  }
  return {
    pros: "Highest reasoning depth and the right default for high-risk work.",
    cons: "The expensive path. Use it when policy, risk, or low confidence requires it.",
  };
}

export function reasonLines(input: {
  complexity: Complexity;
  sensitivity: Sensitivity;
  latencyMs?: number;
  escalated: boolean;
  budgetGuarded: boolean;
  callerPinned: boolean;
  relaxedLatency: boolean;
  relaxedQuality: boolean;
  region?: string;
}): string[] {
  const lines: string[] = [];
  if (input.callerPinned) lines.push("The caller asked for this model.");
  if (input.complexity === "low") lines.push("Low task complexity");
  if (input.complexity === "high") lines.push("High task complexity");
  if (input.sensitivity === "none") lines.push("No sensitive data detected");
  if (input.sensitivity === "legal") lines.push("Legal-risk content");
  if (input.sensitivity === "financial") lines.push("Financial content needs an audit trail");
  if (input.sensitivity === "pii") lines.push("Personal data detected and redacted before a provider call");
  if (input.sensitivity === "credentials") lines.push("Credential-like text detected");
  lines.push("Historical quality within policy");
  if (input.latencyMs) lines.push(`Latency target: under ${input.latencyMs / 1000} seconds`);
  if (input.region) lines.push(`Region constraint: ${input.region.toUpperCase()}`);
  if (input.budgetGuarded) lines.push("Team allowance is at risk, so non-critical work stays on an economy model");
  if (input.escalated) lines.push("Confidence was below the policy floor, so the tier was raised");
  if (input.relaxedLatency) lines.push("No model in this tier met the latency target. The cheapest capable model was kept and flagged.");
  if (input.relaxedQuality) lines.push("No allowed model met the quality floor. The closest model was selected and marked for review.");
  return lines;
}
