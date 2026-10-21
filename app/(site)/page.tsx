import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { findSession } from "@/lib/auth";
import { MODALITIES, OFFER, showcaseModels } from "@/lib/showcase";

export const metadata: Metadata = { title: "Control plane" };

export default async function HomePage() {
  const jar = await cookies();
  const user = await findSession(jar.get("quiet_session")?.value).catch(() => null);
  const models = showcaseModels();
  return (
    <main>
      <section className="hero">
        <p className="label">Quiet control plane</p>
        <h1>Govern model capacity before the request is sent.</h1>
        <p className="lede">Quiet sends each text request to the lowest-cost model that meets your quality, latency, safety, and budget policy, then escalates when confidence is low. Cost stays on the decision.</p>
        <div className="cta-row">
          {user ? <Link className="btn primary" href="/overview">Open the control room</Link> : <Link className="btn primary" href="/signup">Create a workspace</Link>}
          <Link className="btn" href={user ? "/chat" : "/login"}>{user ? "Route a prompt" : "Sign in"}</Link>
        </div>
      </section>

      <section className="site-wrap">
        <p className="label">Harbourline sample · October</p>
        <div className="offer-band">
          <h2>You saved £18,700 this month while maintaining 96% quality.</h2>
          <p className="lede">That figure is the sample ledger: £48,000 committed, £31,240 billed, £44,900 forecast. A support reply routes to GPT-4.1 mini at £0.0018 instead of Claude Sonnet at £0.0124.</p>
          <Link href="/login">Sign in to Harbourline</Link>
        </div>
      </section>

      <section className="site-wrap">
        <h2 className="section-title">What the control room does</h2>
        <div className="site-grid four">
          {OFFER.map((item) => (
            <article key={item.title} className="card">
              <h3>{item.title}</h3>
              <p className="muted">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-wrap">
        <div className="row">
          <h2 className="section-title">Text, images, video, and audio</h2>
          <Link href="/chat">Open the composer</Link>
        </div>
        <p className="lede">One interface. Text routes today. Images, video, and audio stay in the same approval and credit ledger, and Quiet will not generate them until a model for that modality is allowed.</p>
        <div className="site-grid four">
          {MODALITIES.map((item) => (
            <article key={item.name} className="card">
              <p className="label">{item.state}</p>
              <h3>{item.name}</h3>
              <p className="muted">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-wrap">
        <div className="row">
          <h2 className="section-title">Browse the catalogue</h2>
          <Link href="/catalogue">Browse all</Link>
        </div>
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr><th>Model</th><th>Tier</th><th>Sample</th><th>Quality</th><th>Latency</th></tr>
            </thead>
            <tbody>
              {models.slice(0, 4).map((model) => (
                <tr key={model.slug}>
                  <td>{model.name}<div className="faint">{model.provider}</div></td>
                  <td className="tier" data-tier={model.tier}>{model.tier}</td>
                  <td className="mono">{model.sample}</td>
                  <td className="mono">{model.quality}</td>
                  <td className="mono">{model.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint">Sample cost is 1,000 input tokens and 200 output tokens at catalogue prices.</p>
      </section>

      <section className="site-wrap site-grid three">
        <article className="card">
          <h2 className="section-title">Availability</h2>
          <p className="muted">In live mode, one provider error retries once on the premium model. If that also fails, Quiet records the failure. It does not invent a completion or a bill.</p>
          <Link href="/docs">Learn more</Link>
        </article>
        <article className="card">
          <h2 className="section-title">Price and performance</h2>
          <p className="muted">Every decision shows the estimate, the premium baseline, and the saving. Decide mode records the route and leaves the actual cost empty.</p>
          <Link href="/rankings">See the cost order</Link>
        </article>
        <article className="card">
          <h2 className="section-title">Data policies</h2>
          <p className="muted">Rules can require redaction, an EU region, a quality floor, or a person. Quiet stores a SHA-256 of the prompt, not the prompt.</p>
          <Link href="/docs">View docs</Link>
        </article>
      </section>

      <section className="site-wrap offer-band">
        <h2>Open the control room, or start a workspace.</h2>
        <p className="lede">Signup creates an admin, the catalogue, the default policies, and a credit balance of £0. The Harbourline demo is already on this machine.</p>
        <div className="cta-row">
          <Link className="btn primary" href="/signup">Create a workspace</Link>
          <Link className="btn" href="/pricing">See credit packs</Link>
        </div>
      </section>
    </main>
  );
}
