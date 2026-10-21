"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/catalogue", label: "Models" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/chat", label: "Chat" },
  { href: "/rankings", label: "Rankings" },
  { href: "/apps", label: "Apps" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

const PRODUCT = [
  { href: "/overview", title: "Control room", text: "Capacity, decisions, and the teams using them." },
  { href: "/catalogue", title: "Models", text: "Economy, standard, and premium prices in one catalogue." },
  { href: "/chat", title: "Chat", text: "One composer for text. Media waits until a model is allowed." },
  { href: "/rankings", title: "Rankings", text: "Sorted by catalogue cost for a fixed token budget." },
  { href: "/benchmarks", title: "Benchmarks", text: "The quality and latency floors the policy actually uses." },
  { href: "/apps", title: "Apps", text: "Support, legal, refunds, and catalogue work." },
  { href: "/pricing", title: "Pricing", text: "Prepaid credit in pounds. No card is charged here." },
  { href: "/credits", title: "Credits", text: "Add treasury credit or record a purchase." },
  { href: "/docs", title: "Docs", text: "The OpenAI-compatible endpoint and the API key." },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [product, setProduct] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [mobile, setMobile] = useState(false);
  const shown = product || pinned;

  return (
    <header className="site-header">
      <div className="site-bar">
        <Link className="site-logo" href="/" aria-label="Quiet home">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#111113" stroke="rgba(255,255,255,0.16)" />
            <path d="M8 16h10" stroke="#9BB6FF" strokeWidth="1.5" />
            <circle cx="22" cy="16" r="2.2" fill="#9BB6FF" />
          </svg>
          Quiet
        </Link>
        <nav className="site-links" aria-label="Product">
          <div className="product" onMouseEnter={() => setProduct(true)} onMouseLeave={() => setProduct(false)}>
            <button className="site-link" type="button" aria-expanded={shown} aria-controls="product-menu" onClick={() => setPinned((value) => !value)}>
              Product
            </button>
            {shown ? (
              <div className="menu-panel" id="product-menu" role="region" aria-label="What Quiet offers">
                {PRODUCT.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => { setPinned(false); setProduct(false); }}>
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          {LINKS.map((item) => (
            <Link key={item.href} className="site-link" href={item.href}>{item.label}</Link>
          ))}
        </nav>
        <div className="site-actions">
          <button className="btn site-menu-btn" type="button" aria-expanded={mobile} onClick={() => setMobile((value) => !value)}>Menu</button>
          {signedIn ? <Link className="btn" href="/overview">Control room</Link> : <Link className="btn" href="/login">Sign in</Link>}
          <Link className="btn primary" href={signedIn ? "/credits" : "/signup"}>{signedIn ? "Add credit" : "Create workspace"}</Link>
        </div>
      </div>
      {mobile ? (
        <nav className="site-mobile" aria-label="Mobile">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>{item.label}</Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Quiet routes to the lowest-cost model that meets policy. It does not claim to know the best model in the abstract.</p>
      <p><Link href="/docs">Read the API</Link> · <Link href="/login">Sign in</Link> · <Link href="/signup">Create a workspace</Link></p>
    </footer>
  );
}
