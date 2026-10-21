export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <p className="label">Loading</p>
      <div className="card">Quiet is preparing this view.</div>
    </div>
  );
}
