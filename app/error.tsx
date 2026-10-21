"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
      <h1 className="section-title">Quiet hit a problem loading this view.</h1>
      <p className="lede">{error.message || "Retry the view. If it keeps failing, check that Postgres is running."}</p>
      <button className="btn primary" type="button" onClick={reset}>Retry</button>
    </main>
  );
}
