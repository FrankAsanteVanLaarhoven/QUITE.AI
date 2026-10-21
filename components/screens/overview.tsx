"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/components/api";
import { stamp, type Overview, type TeamRow } from "@/components/domain";
import { ScreenState } from "@/components/shell";
import { usePanel } from "@/components/state";

export function OverviewScreen() {
  const query = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/api/overview"), refetchInterval: 15000 });
  const [slug, setSlug] = useState<string | null>(null);
  const data = query.data;
  const team = data?.teams.find((item) => item.slug === slug) ?? null;
  const panel = useMemo(() => {
    if (!data) return null;
    if (team) {
      return {
        title: team.name,
        sections: [
          { label: "Allowance", text: `${team.spent} used of ${team.allowance}. Forecast ${team.forecastAmount}.` },
          { label: "Seats", text: team.seats === 0 ? "Shared cost. No seats and no team allowance." : `${team.seats} seats. Used ${team.used ?? "—"} of its own allowance. Forecast ${team.forecast ?? "—"}.` },
          { label: "Status", text: team.status },
          { label: "Quality", text: data.definition },
        ],
      };
    }
    return {
      title: data.environment.name,
      sections: [
        { label: "Quality", text: data.definition },
        { label: "Recommendation", text: data.recommendations.join("\n\n") },
      ],
    };
  }, [data, team]);
  usePanel(panel);

  return (
    <ScreenState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
      {data ? <OverviewBody data={data} team={team} onSelect={setSlug} /> : null}
    </ScreenState>
  );
}

function OverviewBody({ data, team, onSelect }: { data: Overview; team: TeamRow | null; onSelect: (slug: string) => void }) {
  return (
    <div className="stack">
      <div>
        <p className="label">{data.environment.name} · {stamp(data.asOf)} UTC</p>
        <h1 className="promise">{data.headline}</h1>
        <p className="lede">{data.definition} Percentages below are each team’s own allowance, not a share of the company total.</p>
      </div>
      <section className="metrics five" aria-label="Month figures">
        <Metric label="Committed" value={data.committed} />
        <Metric label="Billed" value={data.spent} />
        <Metric label="Forecast" value={data.forecast} />
        <Metric label="Saving" value={data.saving} accent />
        <Metric label="Quality" value={data.quality} />
      </section>
      <section className="card">
        <h2 className="section-title">Billed spend</h2>
        <SpendChart series={data.series} committed={data.committedNumber} asOf={data.asOf} />
        <div className="legend">
          <span><i className="swatch actual" /> Billed cumulative</span>
          <span><i className="swatch pace" /> Committed pace</span>
        </div>
        <p className="faint">Forecast adds the average of the last seven billed days for the days still left in the month. {data.billed.toLocaleString("en-GB")} billed requests are in these figures. Open decisions are not.</p>
        <details>
          <summary>Daily billed pounds</summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Day</th><th>Cumulative pounds</th></tr>
              </thead>
              <tbody>
                {data.series.length === 0 ? (
                  <tr><td colSpan={2}>No billed days in this month.</td></tr>
                ) : data.series.map((point) => (
                  <tr key={point.day}><td>{point.day}</td><td className="num">{point.cumulative.toLocaleString("en-GB")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      {data.recommendations.map((line) => <p className="notice" key={line}>{line}</p>)}
      <section>
        <h2 className="section-title">Teams</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Seats</th>
                <th>Used</th>
                <th>Forecast</th>
                <th>Billed</th>
                <th>Allowance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.length === 0 ? (
                <tr><td colSpan={7}>No teams yet. Add one before routing production traffic.</td></tr>
              ) : data.teams.map((item) => (
                <tr key={item.slug} aria-selected={team?.slug === item.slug}>
                  <td>
                    <button className="row-button" type="button" onClick={() => onSelect(item.slug)}>{item.name}</button>
                  </td>
                  <td className="num">{item.seats}</td>
                  <td className="num">{item.used ?? "—"}</td>
                  <td className="num">{item.forecast ?? "—"}</td>
                  <td className="num">{item.spent}</td>
                  <td className="num">{item.allowance}</td>
                  <td><span className="status" data-status={item.status}><i />{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <b className={accent ? "accent" : undefined}>{value}</b>
    </div>
  );
}

function SpendChart({ series, committed, asOf }: { series: Overview["series"]; committed: number; asOf: string }) {
  const [year, month] = asOf.split("-").map(Number);
  const days = year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
  if (series.length === 0) return <p className="muted">No billed usage to plot this month.</p>;
  const width = 640;
  const height = 160;
  const pad = 8;
  const max = Math.max(committed, ...series.map((point) => point.cumulative), 1);
  const x = (day: number) => pad + ((day - 1) / Math.max(days - 1, 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const pace = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    return `${x(day)},${y((committed * day) / days)}`;
  }).join(" ");
  const actual = series.map((point) => `${x(Number(point.day.slice(8, 10)))},${y(point.cumulative)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative billed spend against a committed pace of ${committed.toLocaleString("en-GB")} pounds`}>
      <polyline points={pace} fill="none" stroke="#8d8d98" strokeWidth="1" />
      <polyline points={actual} fill="none" stroke="#9bb6ff" strokeWidth="1.5" />
    </svg>
  );
}
