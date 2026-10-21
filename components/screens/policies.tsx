"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, busyLabel } from "@/components/api";
import { can, type PolicyView } from "@/components/domain";
import { ScreenState, useWorkspaceUser } from "@/components/shell";
import { usePanel } from "@/components/state";

const TASKS = ["support", "summarisation", "extraction", "coding", "reasoning", "legal", "finance", "marketing"];
const SENSITIVITIES = ["none", "financial", "legal", "pii", "credentials"];

export function PoliciesScreen() {
  const user = useWorkspaceUser();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["policies"], queryFn: () => api<{ policies: PolicyView[] }>("/api/policies") });
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState<string[]>(["support"]);
  const [sensitivities, setSensitivities] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState("");
  const [tier, setTier] = useState("economy");
  const [escalate, setEscalate] = useState("85");
  const [approval, setApproval] = useState(false);
  const [redact, setRedact] = useState(true);
  const [region, setRegion] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const writeAllowed = can(user.role, "write");
  const policies = list.data?.policies ?? [];
  const current = policies.find((policy) => policy.id === selected) ?? policies[0] ?? null;

  const save = useMutation({
    mutationFn: () => api("/api/policies", {
      method: "POST",
      body: JSON.stringify({
        name,
        taskTypes: tasks,
        sensitivities,
        workflow,
        tier,
        escalateBelow: Number(escalate) / 100,
        requireApproval: approval,
        redact,
        region: region || undefined,
      }),
    }),
    onSuccess: async () => {
      setName("");
      await client.invalidateQueries({ queryKey: ["policies"] });
      await client.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (policy: PolicyView) => api(`/api/policies/${policy.id}/enabled`, {
      method: "POST",
      body: JSON.stringify({ enabled: !policy.enabled }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["policies"] });
      await client.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const panel = useMemo(() => current ? {
    title: current.name,
    sections: [
      { label: "When", text: current.summary.when.join("\n") },
      { label: "Then", text: current.summary.then.join("\n") },
      { label: "Priority", text: `Priority ${current.priority}. Lower numbers win. A pinned workflow sits at 40.` },
    ],
  } : null, [current]);
  usePanel(panel);

  function flip(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  return (
    <ScreenState pending={list.isPending} error={list.error} onRetry={() => list.refetch()}>
      <div className="stack">
        <div>
          <p className="label">Control</p>
          <h1 className="section-title">Routing policies</h1>
          <p className="lede">A rule matches only when every condition is true. The first matching rule, by priority, chooses the tier, the region, and whether a person must approve.</p>
        </div>
        {policies.map((policy) => (
          <article className="card" key={policy.id}>
            <div className="row">
              <button className="row-button" type="button" onClick={() => setSelected(policy.id)} aria-pressed={current?.id === policy.id}>
                <strong>{policy.name}</strong>
              </button>
              <button className="btn" type="button" disabled={!writeAllowed || toggle.isPending} aria-pressed={policy.enabled} onClick={() => toggle.mutate(policy)}>
                {policy.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <p className="muted">When {policy.summary.when.join("; ")}.</p>
            <p>Then {policy.summary.then.join("; ")}.</p>
            <p className="faint">Priority {policy.priority}</p>
          </article>
        ))}
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          if (!writeAllowed) {
            setFormError("Your role cannot change policies.");
            return;
          }
          if (name.trim().length < 3) {
            setFormError("Name the policy in at least 3 characters.");
            return;
          }
          if (tasks.length === 0 && sensitivities.length === 0 && workflow.trim().length === 0) {
            setFormError("Add a task, a sensitivity, or a workflow so the rule has a boundary.");
            return;
          }
          const floor = Number(escalate);
          if (!Number.isFinite(floor) || floor < 50 || floor > 99) {
            setFormError("The confidence floor must sit between 50% and 99%.");
            return;
          }
          save.mutate();
        }}>
          <h2 className="section-title">New rule</h2>
          <label className="field">
            <span className="label">Name</span>
            <input aria-label="Policy name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <fieldset>
            <legend className="label">When the task is</legend>
            <div className="checks">
              {TASKS.map((task) => (
                <label key={task}><input type="checkbox" checked={tasks.includes(task)} onChange={() => flip(tasks, task, setTasks)} />{task}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">And the sensitivity is</legend>
            <div className="checks">
              {SENSITIVITIES.map((item) => (
                <label key={item}><input type="checkbox" checked={sensitivities.includes(item)} onChange={() => flip(sensitivities, item, setSensitivities)} />{item}</label>
              ))}
            </div>
          </fieldset>
          <div className="split">
            <label className="field">
              <span className="label">Workflow, if it must match</span>
              <input aria-label="Workflow condition" value={workflow} onChange={(event) => setWorkflow(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Then use</span>
              <select aria-label="Tier" value={tier} onChange={(event) => setTier(event.target.value)}>
                <option value="economy">economy</option>
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
            </label>
          </div>
          <div className="split">
            <label className="field">
              <span className="label">Escalate below confidence %</span>
              <input aria-label="Confidence floor percent" inputMode="numeric" value={escalate} onChange={(event) => setEscalate(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Region</span>
              <select aria-label="Region" value={region} onChange={(event) => setRegion(event.target.value)}>
                <option value="">Any region</option>
                <option value="eu">EU</option>
                <option value="us">US</option>
              </select>
            </label>
          </div>
          <div className="checks">
            <label><input type="checkbox" checked={approval} onChange={(event) => setApproval(event.target.checked)} />Ask a person to approve</label>
            <label><input type="checkbox" checked={redact} onChange={(event) => setRedact(event.target.checked)} />Redact personal data and secrets</label>
          </div>
          <button className="btn primary" type="submit" disabled={!writeAllowed || save.isPending}>{busyLabel(save.isPending, "Save policy")}</button>
          {!writeAllowed ? <p className="faint">An admin or operator can change policies.</p> : null}
        </form>
        {formError ? <p className="notice" data-tone="critical" role="alert">{formError}</p> : null}
        {save.error || toggle.error ? <p className="notice" data-tone="critical" role="alert">{(save.error ?? toggle.error)?.message}</p> : null}
      </div>
    </ScreenState>
  );
}
