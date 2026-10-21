import { createHash } from "node:crypto";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const SECRET = /\b(api[_ -]?key|password|secret|bearer)\b\s*[:=]?\s*\S+/gi;

export function redactText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(CARD, "[number]").replace(SECRET, "$1 [redacted]");
}

export function excerpt(text: string, limit = 280): string {
  const clean = redactText(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1)}…`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
