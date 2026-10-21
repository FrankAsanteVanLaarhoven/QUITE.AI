import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pricing" };

const PACKS = [
  { amount: "£50", name: "Starter credit", text: "A small treasury top-up for a pilot team." },
  { amount: "£250", name: "Team credit", text: "Enough to compare a month of routed text against the premium baseline." },
  { amount: "£1,000", name: "Workspace credit", text: "A recorded purchase for a larger allowance. Still not a card charge." },
];

export default function PricingPage() {
  return (
    <main className="site-wrap page-top">
      <p className="label">Pricing</p>
      <h1 className="section-title">Credit is pounds in the workspace ledger.</h1>
      <p className="lede">Add credit as a grant, or record a purchase. Quiet does not charge a card in this build. The October usage ledger is separate: buying credit does not rewrite billed spend.</p>
      <div className="site-grid three">
        {PACKS.map((pack) => (
          <article key={pack.amount} className="card">
            <p className="label">{pack.name}</p>
            <h2 className="promise">{pack.amount}</h2>
            <p className="muted">{pack.text}</p>
          </article>
        ))}
      </div>
      <div className="cta-row">
        <Link className="btn primary" href="/credits">Add or buy credit</Link>
        <Link className="btn" href="/signup">Create a workspace</Link>
      </div>
    </main>
  );
}
