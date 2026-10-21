"use client";

import type { RequestView } from "@/components/domain";
import { statusText } from "@/components/domain";

export function DecisionView({ request }: { request: RequestView }) {
  return (
    <article className="card stack">
      <div className="row">
        <p className="label">{request.teamName} · {request.workflow}</p>
        <span className="status" data-status={request.status}><i />{statusText(request.status)}</span>
      </div>
      <h2 className="section-title">{request.taskLabel}</h2>
      <p className="lede">
        <span className={`tier`} data-tier={request.modelTier}>{request.modelName}</span>
        {" "}at {request.estimated}
        {request.billed ? `, billed ${request.actual}` : ", not billed yet"}.
        {" "}{request.premiumName} would cost {request.premium}. Saving {request.saving} ({request.savingRatio}) at {request.confidenceLabel} confidence.
      </p>
      <ul className="reasons">
        {request.reasons.length === 0 ? <li>Quiet did not record a reason for this route.</li> : request.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <div className="split">
        <div>
          <div className="label">Trade-off</div>
          <p>{request.pros}</p>
          <p className="muted">{request.cons}</p>
        </div>
        <div>
          <div className="label">Alternatives</div>
          {request.alternatives.length === 0 ? <p className="muted">No other allowed model meets this policy.</p> : (
            <ul className="reasons">
              {request.alternatives.map((item) => (
                <li key={`${item.name}-${item.note}`}>{item.name} · {item.tier} · {item.cost}. {item.note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {request.excerpt ? (
        <p className="muted">Excerpt: {request.excerpt}</p>
      ) : null}
      <p className="faint">{request.tokensIn.toLocaleString("en-GB")} in · {request.tokensOut.toLocaleString("en-GB")} out · {request.mode} · {request.modelRegion || "region unset"}</p>
    </article>
  );
}
