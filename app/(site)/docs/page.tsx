import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <main className="site-wrap page-top">
      <p className="label">Docs</p>
      <h1 className="section-title">One OpenAI-compatible endpoint.</h1>
      <p className="lede">Send a bearer key created in the control room. Model <span className="mono">quiet-auto</span> lets policy choose. A catalogue slug pins that model when it is allowed.</p>
      <pre className="card code">{`curl http://127.0.0.1:3970/v1/chat/completions \\
  -H "Authorization: Bearer $QUIET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"quiet-auto","messages":[{"role":"user","content":"Reply to this support ticket."}]}'`}</pre>
      <div className="site-grid three">
        <article className="card"><h2 className="section-title">Decide</h2><p className="muted">The default mode records the route and returns finish reason quiet_decision. Actual cost stays empty.</p></article>
        <article className="card"><h2 className="section-title">Approval</h2><p className="muted">A request that needs a person returns HTTP 409 and no completion. Approve it in the inbox.</p></article>
        <article className="card"><h2 className="section-title">Live</h2><p className="muted">Live mode calls OpenAI or Anthropic only when that key is set. A missing key fails the request.</p></article>
      </div>
      <p className="lede">Headers: <span className="mono">x-quiet-team</span>, <span className="mono">x-quiet-workflow</span>, and <span className="mono">Idempotency-Key</span>. Prompt bodies are redacted before they leave Quiet.</p>
      <Link className="btn primary" href="/budgets">Create an API key</Link>
    </main>
  );
}
