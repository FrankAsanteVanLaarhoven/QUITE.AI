"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { can, type ModelView } from "@/components/domain";
import { ScreenState, useWorkspaceUser } from "@/components/shell";
import { usePanel } from "@/components/state";

export function ModelsScreen() {
  const user = useWorkspaceUser();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["models"], queryFn: () => api<{ models: ModelView[] }>("/api/models") });
  const [slug, setSlug] = useState<string | null>(null);
  const writeAllowed = can(user.role, "write");
  const models = list.data?.models ?? [];
  const current = models.find((model) => model.slug === slug) ?? null;
  const toggle = useMutation({
    mutationFn: (model: ModelView) => api(`/api/models/${model.slug}/allowed`, {
      method: "POST",
      body: JSON.stringify({ allowed: !model.allowed }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["models"] });
      await client.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const panel = useMemo(() => current ? {
    title: current.name,
    sections: [
      { label: "Catalogue", text: `${current.provider} does not colour this row. Tier ${current.tier}, region ${current.region}, quality index ${current.quality}, p50 ${current.latencyMs} ms.` },
      { label: "Price", text: `Input ${current.input}. Output ${current.output}.` },
      { label: "Access", text: current.allowed ? "Allowed for routing." : "Blocked. The router will not select it." },
    ],
  } : {
    title: "Catalogue",
    sections: [{ label: "Floor", text: "Economy needs a quality index of at least 75. A cheaper model under that floor is rejected and named in the decision." }],
  }, [current]);
  usePanel(panel);

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <div>
          <p className="label">Catalogue</p>
          <h1 className="section-title">Models</h1>
          <p className="lede">Rates are illustrative catalogue prices in pounds per million tokens. Live calls use these prices on the provider’s returned token counts. Colour marks the cost tier, not the vendor.</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Model</th><th>Tier</th><th>Region</th><th>Quality</th><th>Latency</th><th>Input</th><th>Output</th><th>Access</th></tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.slug} aria-selected={model.slug === current?.slug}>
                  <td><button className="row-button" type="button" onClick={() => setSlug(model.slug)}>{model.name}</button></td>
                  <td className="tier" data-tier={model.tier}>{model.tier}</td>
                  <td>{model.region}</td>
                  <td className="num">{model.quality}</td>
                  <td className="num">{model.latencyMs} ms</td>
                  <td className="num">{model.input}</td>
                  <td className="num">{model.output}</td>
                  <td>
                    <button className="btn" type="button" disabled={!writeAllowed || toggle.isPending} aria-pressed={model.allowed} onClick={() => toggle.mutate(model)}>
                      {busyLabel(toggle.isPending && toggle.variables?.slug === model.slug, model.allowed ? "Allowed" : "Blocked")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {toggle.error ? <p className="notice" data-tone="critical" role="alert">{toggle.error.message}</p> : null}
        {!writeAllowed ? <p className="faint">An admin or operator can change the allow list.</p> : null}
      </div>
    </ScreenState>
  );
}
