export type DailySpend = { day: string; spentMicro: bigint };

export function forecastMicro(daily: DailySpend[], asOf: string, daysInMonth: number): bigint {
  const elapsed = daily.filter((row) => row.day <= asOf).sort((a, b) => a.day.localeCompare(b.day));
  if (elapsed.length === 0) return 0n;
  const spent = elapsed.reduce((total, row) => total + row.spentMicro, 0n);
  const recent = elapsed.slice(-7);
  const recentSum = recent.reduce((total, row) => total + row.spentMicro, 0n);
  const recentAvg = recentSum / BigInt(recent.length);
  const remaining = BigInt(Math.max(0, daysInMonth - elapsed.length));
  return spent + recentAvg * remaining;
}

export function monthBounds(asOf: string): { start: string; daysInMonth: number } {
  const [year, month] = asOf.split("-").map(Number);
  if (!year || !month) throw new Error("asOf must be YYYY-MM-DD");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`;
  return { start, daysInMonth };
}

export function ratio(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number(part) / Number(whole);
}
