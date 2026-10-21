import { cookies } from "next/headers";
import { findSession } from "@/lib/auth";
import { boot, ensureBoot } from "@/lib/bootstrap";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await ensureBoot();
  if (!boot.ready) {
    return (
      <main className="auth-card">
        <h1>Quiet cannot open the workspace yet.</h1>
        <p className="lede">{boot.error ?? "Start Postgres, then reload this page."}</p>
      </main>
    );
  }
  const jar = await cookies();
  const user = await findSession(jar.get("quiet_session")?.value).catch(() => null);
  return (
    <div className="site">
      <a className="skip" href="#content">Skip to content</a>
      <SiteHeader signedIn={Boolean(user)} />
      <div id="content">{children}</div>
      <SiteFooter />
    </div>
  );
}
