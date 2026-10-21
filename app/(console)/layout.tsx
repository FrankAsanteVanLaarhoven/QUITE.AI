import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "@/lib/auth";
import { boot, ensureBoot } from "@/lib/bootstrap";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await ensureBoot();
  if (!boot.ready) {
    return (
      <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
        <h1 className="section-title">Quiet cannot open the workspace yet.</h1>
        <p className="lede">{boot.error ?? "Start Postgres, then reload."}</p>
      </main>
    );
  }
  const jar = await cookies();
  const user = await findSession(jar.get("quiet_session")?.value);
  if (!user) redirect("/login");
  const environment = jar.get("quiet_env")?.value === "staging" ? "staging" : "production";
  return (
    <Shell user={{ name: user.name, email: user.email, role: user.role, workspace: user.workspaceName }} environment={environment}>
      {children}
    </Shell>
  );
}
