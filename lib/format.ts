import { MICRO } from "@/lib/money";

const whole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const pence = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const subPenny = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function formatMicro(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  if (abs === 0n) return negative ? "-£0" : "£0";
  const asPounds = Number(abs) / Number(MICRO);
  let text: string;
  const wholePence = 10_000n;
  if (abs >= 100n * MICRO) text = whole.format(asPounds);
  else if (abs >= wholePence && abs % wholePence === 0n) text = pence.format(asPounds);
  else text = subPenny.format(asPounds);
  return negative ? `-${text}` : text;
}

export function formatPercentRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function microToNumber(micro: bigint): number {
  return Number(micro) / Number(MICRO);
}
