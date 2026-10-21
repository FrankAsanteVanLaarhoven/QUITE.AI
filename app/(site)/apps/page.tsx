import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Apps" };

const APPS = [
  { name: "Customer support reply", tier: "Economy when confidence is high", text: "A clear status reply with no sensitive data can route to GPT-4.1 mini. The sample decision is £0.0018 against a £0.0124 premium baseline." },
  { name: "Legal contract summary", tier: "Premium, EU, approval", text: "Legal text stays on an EU premium model and waits for a person before anything is treated as accepted." },
  { name: "Customer refund", tier: "Standard, approval", text: "A financial decision does not auto-complete. The reviewer sees the cost before approving or rejecting it." },
  { name: "Bulk descriptions", tier: "Economy", text: "High-volume catalogue copy stays on the cheap tier unless the prompt trips a sensitivity rule." },
];

export default function AppsPage() {
  return (
    <main className="site-wrap page-top">
      <p className="label">Apps</p>
      <h1 className="section-title">Workflows the policy already understands.</h1>
      <p className="lede">These are the Harbourline sample workflows. A pin from a decision creates a future rule for that workflow. Quiet does not train on the prompt.</p>
      <div className="site-grid">
        {APPS.map((app) => (
          <article key={app.name} className="card">
            <p className="label">{app.tier}</p>
            <h2 className="section-title">{app.name}</h2>
            <p className="muted">{app.text}</p>
          </article>
        ))}
      </div>
      <p><Link className="btn primary" href="/requests">Open the routing queue</Link></p>
    </main>
  );
}
