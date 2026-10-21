import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
      <p className="label">404</p>
      <h1 className="section-title">That page is not in Quiet.</h1>
      <p className="lede">The address does not match a workspace view. Go back to capacity, or open the routing queue.</p>
      <div className="actions">
        <Link className="btn primary" href="/">Quiet</Link>
        <Link className="btn" href="/overview">Control room</Link>
      </div>
    </main>
  );
}
