import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "@/lib/auth";
import { boot, ensureBoot } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await ensureBoot();
  if (!boot.ready) {
    return (
      <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
        <h1 className="section-title">Quiet cannot open the workspace yet.</h1>
        <p className="lede">{boot.error ?? "Start Postgres, then reload this page."}</p>
      </main>
    );
  }
  const jar = await cookies();
  const user = await findSession(jar.get("quiet_session")?.value).catch(() => null);
  if (user) redirect("/");
  const params = await searchParams;
  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24 }}>
      <p className="label">Quiet</p>
      <h1 className="section-title">Sign in to the control plane</h1>
      <p className="lede">Capacity, routing and approval for this workspace. The demo ledger signs in as the finance admin.</p>
      {params.error ? (
        <p className="notice" data-tone="critical" role="alert" style={{ marginTop: 16 }}>
          That email or password is not valid. Try again.
        </p>
      ) : null}
      <form className="stack" action="/api/auth/login" method="post" style={{ marginTop: 24 }}>
        <label className="field">
          <span className="label">Email</span>
          <input name="email" type="email" autoComplete="username" required aria-label="Email" />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input name="password" type="password" autoComplete="current-password" required aria-label="Password" />
        </label>
        <button className="btn primary" type="submit">Sign in</button>
      </form>
      <p className="muted">New workspace? <Link href="/signup">Create one</Link>. Or return to the <Link href="/">Quiet</Link> front door.</p>
    </main>
  );
}
