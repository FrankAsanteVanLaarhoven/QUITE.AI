import { formatMicro } from "@/lib/format";
import { ratio } from "@/lib/router/forecast";

export type TeamSnapshot = {
  slug: string;
  name: string;
  seats: number;
  allowanceMicro: bigint;
  spentMicro: bigint;
  forecastMicro: bigint;
};

export type TeamStatus = "Healthy" | "Watch" | "Under-used" | "Over" | "Shared";

export function teamStatus(team: TeamSnapshot): TeamStatus {
  if (team.seats === 0) return "Shared";
  const forecast = ratio(team.forecastMicro, team.allowanceMicro);
  const used = ratio(team.spentMicro, team.allowanceMicro);
  if (forecast != null && forecast > 1) return "Over";
  if (used != null && used < 0.25) return "Under-used";
  if (forecast != null && forecast >= 0.85) return "Watch";
  return "Healthy";
}

export function recommendations(teams: TeamSnapshot[]): string[] {
  if (teams.length === 0) {
    return ["Add a team allowance before production traffic is routed. Quiet cannot protect a budget it has not been given."];
  }
  const lines: string[] = [];
  for (const team of teams) {
    const status = teamStatus(team);
    const forecast = ratio(team.forecastMicro, team.allowanceMicro);
    if (status === "Watch" || status === "Over") {
      lines.push(`${team.name} is forecast to reach ${forecast == null ? "its cap" : `${Math.round(forecast * 100)}%`} of its ${formatMicro(team.allowanceMicro)} allowance.`);
    }
    if (status === "Under-used") {
      lines.push(`${team.name} has used ${Math.round((ratio(team.spentMicro, team.allowanceMicro) ?? 0) * 100)}% of its ${formatMicro(team.allowanceMicro)} allowance across ${team.seats} seats.`);
    }
  }
  const donor = teams.find((team) => teamStatus(team) === "Under-used");
  const receiver = teams.find((team) => teamStatus(team) === "Watch" || teamStatus(team) === "Over");
  if (donor && receiver) {
    const headroom = donor.allowanceMicro - donor.forecastMicro;
    const gap = receiver.allowanceMicro - receiver.forecastMicro;
    const move = headroom > 0n && gap > 0n ? (headroom < gap ? headroom : gap) : 0n;
    if (move > 0n) {
      lines.push(`Reserve ${formatMicro(move)} of ${donor.name}'s unused allowance for ${receiver.name} escalations. This does not cancel seats.`);
    }
  }
  if (lines.length === 0) lines.push("No team is forecast to exceed its allowance.");
  return lines;
}
