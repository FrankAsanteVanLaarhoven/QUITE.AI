import type { Metadata } from "next";
import { showcaseModels } from "@/lib/showcase";

export const metadata: Metadata = { title: "Rankings" };

export default function RankingsPage() {
  const models = showcaseModels();
  return (
    <main className="site-wrap page-top">
      <p className="label">Rankings</p>
      <h1 className="section-title">Lowest catalogue cost first.</h1>
      <p className="lede">Ranked only by the cost of 1,000 input tokens and 200 output tokens. This is not a popularity ranking and it does not override a policy that requires a higher tier.</p>
      <ol className="rank-list">
        {models.map((model, index) => (
          <li key={model.slug} className="card row">
            <div>
              <span className="faint mono">{String(index + 1).padStart(2, "0")}</span>
              <h2 className="section-title">{model.name}</h2>
              <p className="muted">{model.provider} · {model.tier} · quality {model.quality} · {model.latencyMs} ms</p>
            </div>
            <b className="mono">{model.sample}</b>
          </li>
        ))}
      </ol>
    </main>
  );
}
