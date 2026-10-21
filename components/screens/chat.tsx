"use client";

import { useState } from "react";
import Link from "next/link";
import { api, busyLabel } from "@/components/api";

const MODES = ["Text", "Images", "Video", "Audio"] as const;

type Decision = {
  taskLabel: string;
  modelName: string;
  modelTier: string;
  estimated: string;
  premium: string;
  saving: string;
  confidenceLabel: string;
  policyName: string;
  status: string;
  reasons: string[];
};

export function ChatStudio({ signedIn, role }: { signedIn: boolean; role: string }) {
  const [mode, setMode] = useState<(typeof MODES)[number]>("Text");
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const media = mode !== "Text";
  const canRoute = signedIn && (role === "admin" || role === "operator" || role === "finance");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDecision(null);
    if (media) {
      setError(`No ${mode.toLowerCase()} model is allowed. Quiet will not invent a ${mode.toLowerCase()} result.`);
      return;
    }
    if (!signedIn) {
      setError("Sign in before Quiet can route this prompt.");
      return;
    }
    if (!canRoute) {
      setError("Your role can read the control room. An admin, operator, or finance role routes a prompt.");
      return;
    }
    if (prompt.trim().length < 8) {
      setError("Write the request Quiet should classify and price.");
      return;
    }
    setPending(true);
    try {
      const teams = await api<{ teams: { slug: string }[] }>("/api/teams");
      const teamSlug = teams.teams.find((team) => team.slug === "support")?.slug ?? teams.teams[0]?.slug ?? "";
      const result = await api<{ request: Decision }>("/api/requests", {
        method: "POST",
        body: JSON.stringify({ prompt, workflow: "chat", teamSlug }),
      });
      setDecision(result.request);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quiet could not route that prompt.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="mode-row" role="tablist" aria-label="Modality">
        {MODES.map((item) => (
          <button key={item} type="button" className="btn" aria-pressed={mode === item} onClick={() => { setMode(item); setError(null); setDecision(null); }}>{item}</button>
        ))}
      </div>
      <label className="field">
        <span className="label">{mode} prompt</span>
        <textarea aria-label={`${mode} prompt`} rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={media ? `Describe the ${mode.toLowerCase()} work. Quiet will not generate it yet.` : "Paste the request Quiet should classify and price."} />
      </label>
      <div className="cta-row">
        <button className="btn primary" type="submit" disabled={pending}>{busyLabel(pending, media ? "Check modality" : "Route this prompt")}</button>
        {!signedIn ? <Link className="btn" href="/login">Sign in</Link> : null}
      </div>
      {error ? <p className="notice" data-tone="critical" role="alert">{error}</p> : null}
      {decision ? (
        <article className="card">
          <p className="label">{decision.status} · {decision.confidenceLabel}</p>
          <h2 className="section-title">{decision.taskLabel}</h2>
          <p>{decision.modelName} · <span className="tier" data-tier={decision.modelTier}>{decision.modelTier}</span> · {decision.estimated} estimated, {decision.premium} premium, saving {decision.saving}.</p>
          <p className="muted">{decision.policyName}</p>
          <ul className="reasons">{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <Link href="/requests">Open it in the queue</Link>
        </article>
      ) : null}
    </form>
  );
}
