import type { Classification, PolicyRecord } from "@/lib/types";

export function policyMatches(policy: PolicyRecord, input: { workflow: string; teamSlug: string; classification: Classification }): boolean {
  if (!policy.enabled || policy.definition.then.budgetGuard) return false;
  const when = policy.definition.when;
  const { classification } = input;
  if (when.taskTypes?.length && !when.taskTypes.includes(classification.taskType)) return false;
  if (when.workflows?.length && !when.workflows.includes(input.workflow)) return false;
  if (when.teams?.length && !when.teams.includes(input.teamSlug)) return false;
  if (when.sensitivities?.length && !when.sensitivities.includes(classification.sensitivity)) return false;
  if (when.excludeSensitivities?.length && when.excludeSensitivities.includes(classification.sensitivity)) return false;
  if (when.maxInputTokens != null && classification.tokensIn > when.maxInputTokens) return false;
  return true;
}

export function matchPolicy(policies: PolicyRecord[], input: { workflow: string; teamSlug: string; classification: Classification }): PolicyRecord | null {
  const ordered = [...policies].filter((policy) => policy.enabled).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  return ordered.find((policy) => policyMatches(policy, input)) ?? null;
}

export function budgetGuardEnabled(policies: PolicyRecord[]): boolean {
  return policies.some((policy) => policy.enabled && policy.definition.then.budgetGuard === true);
}
