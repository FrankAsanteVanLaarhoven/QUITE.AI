import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Create a workspace" };

const ERRORS: Record<string, string> = {
  email: "That email already has a Quiet workspace. Sign in instead.",
  password: "Use a password of at least 12 characters.",
  name: "Enter the name people should see in the control room.",
  workspace: "Name the workspace with at least 2 characters.",
  invalid: "Enter a valid email address.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const message = ERRORS[params.error ?? ""] ?? "";
  return (
    <main className="auth-card">
      <p className="label">Quiet</p>
      <h1>Create a workspace</h1>
      <p className="lede">You become the admin. Quiet adds the catalogue, the default policies, a General team, and a credit balance of £0.</p>
      {message ? <p className="notice" data-tone="critical" role="alert">{message}</p> : null}
      <form className="stack" action="/api/auth/signup" method="post">
        <label className="field"><span className="label">Your name</span><input name="name" autoComplete="name" required aria-label="Your name" /></label>
        <label className="field"><span className="label">Email</span><input name="email" type="email" autoComplete="username" required aria-label="Email" /></label>
        <label className="field"><span className="label">Password</span><input name="password" type="password" autoComplete="new-password" required minLength={12} aria-label="Password" /></label>
        <label className="field"><span className="label">Workspace</span><input name="workspace" required aria-label="Workspace name" /></label>
        <button className="btn primary" type="submit">Create workspace</button>
      </form>
      <p className="muted">Already have a workspace? <Link href="/login">Sign in</Link>.</p>
    </main>
  );
}
