import type { Metadata } from "next";
import { showcaseModels } from "@/lib/showcase";

export const metadata: Metadata = { title: "Benchmarks" };

export default function BenchmarksPage() {
  const models = [...showcaseModels()].sort((a, b) => b.quality - a.quality);
  return (
    <main className="site-wrap page-top">
      <p className="label">Benchmarks</p>
      <h1 className="section-title">The floors the policy uses.</h1>
      <p className="lede">The quality index and latency are catalogue values Quiet compares with a rule. They are not an independent public leaderboard, and a higher index is not a claim that the model is best.</p>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Model</th><th>Quality index</th><th>Latency p50</th><th>Tier</th></tr></thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.slug}>
                <td>{model.name}</td>
                <td className="mono">{model.quality}</td>
                <td className="mono">{model.latencyMs} ms</td>
                <td className="tier" data-tier={model.tier}>{model.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="site-grid three">
        <article className="card"><h2 className="section-title">Economy</h2><p className="muted">Quality floor 75 after the budget guard. A cheaper model below that floor is blocked.</p></article>
        <article className="card"><h2 className="section-title">Standard</h2><p className="muted">Financial and coding rules ask for quality 85 and can require a person.</p></article>
        <article className="card"><h2 className="section-title">Premium</h2><p className="muted">Legal and credential rules ask for quality 92, an EU region for legal text, and approval.</p></article>
      </div>
    </main>
  );
}
