import type { Classification, Complexity, Sensitivity, TaskType } from "@/lib/types";

const OUTPUT_TOKENS: Record<TaskType, number> = {
  support: 180,
  summarisation: 220,
  extraction: 160,
  marketing: 240,
  coding: 400,
  reasoning: 500,
  legal: 600,
  finance: 200,
};

const TASK_RULES: { type: TaskType; weight: number; pattern: RegExp; signal: string }[] = [
  { type: "legal", weight: 3, pattern: /\b(contract|clause|liability|indemnity|governing law|nda|addendum)\b/i, signal: "Legal language" },
  { type: "finance", weight: 3, pattern: /\b(refund|invoice|payment|chargeback|vat|sort code|iban)\b/i, signal: "Financial language" },
  { type: "coding", weight: 2, pattern: /```|\b(function|stack trace|typescript|refactor|unit test)\b/i, signal: "Code" },
  { type: "extraction", weight: 2, pattern: /\b(extract|json schema|fields from|parse the)\b/i, signal: "Extraction" },
  { type: "summarisation", weight: 2, pattern: /\b(summarise|summarize|tl;dr|summary of)\b/i, signal: "Summary" },
  { type: "marketing", weight: 2, pattern: /\b(product description|campaign|seo|headline)\b/i, signal: "Marketing" },
  { type: "support", weight: 2, pattern: /\b(customer|ticket|reply to|support)\b/i, signal: "Support" },
];

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function sensitivityOf(text: string, taskType: TaskType): { sensitivity: Sensitivity; signal: string | null } {
  if (/\b(api[_ -]?key|password|secret|bearer\s+[a-z0-9\-._~+/]+=*)\b/i.test(text)) {
    return { sensitivity: "credentials", signal: "Credential-like text" };
  }
  if (/\b(?:\d[ -]*?){13,19}\b/.test(text) || /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/.test(text)) {
    return { sensitivity: "financial", signal: "Account or card number" };
  }
  if (taskType === "legal" || /\blegal(ly)? privileged\b/i.test(text)) {
    return { sensitivity: "legal", signal: "Legal-risk content" };
  }
  if (taskType === "finance") {
    return { sensitivity: "financial", signal: "Financial decision" };
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    return { sensitivity: "pii", signal: "Email address" };
  }
  return { sensitivity: "none", signal: null };
}

function complexityOf(taskType: TaskType, tokensIn: number, sensitivity: Sensitivity): Complexity {
  if (tokensIn > 2000 || taskType === "legal" || sensitivity === "credentials") return "high";
  if (tokensIn < 500 && sensitivity === "none" && (taskType === "support" || taskType === "marketing" || taskType === "extraction" || taskType === "summarisation")) {
    return "low";
  }
  return "moderate";
}

export function classify(prompt: string): Classification {
  const tokensIn = estimateTokens(prompt);
  const hits = TASK_RULES.filter((rule) => rule.pattern.test(prompt)).sort((a, b) => b.weight - a.weight);
  const taskType: TaskType = hits[0]?.type ?? (tokensIn > 800 ? "reasoning" : "support");
  const sensitivity = sensitivityOf(prompt, taskType);
  const complexity = complexityOf(taskType, tokensIn, sensitivity.sensitivity);

  let confidence = 0.7;
  const top = hits[0]?.weight ?? 0;
  const second = hits[1]?.weight ?? 0;
  if (hits.length === 0) confidence -= 0.12;
  else if (top >= second + 2 || (hits.length === 1 && top >= 2)) confidence += 0.18;
  else if (top > second) confidence += 0.1;
  else confidence -= 0.1;
  if (sensitivity.sensitivity !== "none" && (taskType === "legal" || taskType === "finance")) confidence += 0.06;
  if (complexity === "low" && hits.length === 1) confidence += 0.06;
  if (tokensIn < 24 && hits.length === 0) confidence -= 0.16;
  confidence = Math.min(0.97, Math.max(0.35, Math.round(confidence * 1000) / 1000));

  const signals = hits.map((hit) => hit.signal);
  if (sensitivity.signal) signals.push(sensitivity.signal);
  if (hits.length === 0) signals.push(tokensIn > 800 ? "Long unclassified request" : "Defaulted to support");

  return {
    taskType,
    complexity,
    sensitivity: sensitivity.sensitivity,
    confidence: Math.round(confidence * 1000) / 1000,
    tokensIn,
    tokensOut: OUTPUT_TOKENS[taskType],
    signals,
  };
}
