import { CATALOGUE } from "@/lib/catalogue";
import { formatMicro } from "@/lib/format";
import { requestCostMicro } from "@/lib/money";

export type ShowcaseModel = {
  slug: string;
  name: string;
  provider: string;
  tier: string;
  region: string;
  quality: number;
  latencyMs: number;
  input: string;
  output: string;
  sample: string;
  sampleMicro: bigint;
};

export function showcaseModels(): ShowcaseModel[] {
  return CATALOGUE.map((model) => {
    const sampleMicro = requestCostMicro(1000, 200, model.inputMicroPerMillion, model.outputMicroPerMillion);
    return {
      slug: model.slug,
      name: model.name,
      provider: model.provider,
      tier: model.tier,
      region: model.region,
      quality: model.qualityIndex,
      latencyMs: model.latencyP50Ms,
      input: formatMicro(model.inputMicroPerMillion),
      output: formatMicro(model.outputMicroPerMillion),
      sample: formatMicro(sampleMicro),
      sampleMicro,
    };
  }).sort((a, b) => (a.sampleMicro < b.sampleMicro ? -1 : a.sampleMicro > b.sampleMicro ? 1 : 0));
}

export const OFFER = [
  { title: "Route", text: "Quiet picks the lowest-cost catalogue model that meets the quality, latency, safety, and budget rule for that request." },
  { title: "Approve", text: "Legal, financial, and low-confidence routes wait for a person. The gateway returns 409 and does not invent a completion." },
  { title: "Charge back", text: "Spend, forecast, and saving stay on the team that sent the work. Credit is a separate treasury balance." },
  { title: "Export", text: "Finance can download the billed usage as CSV. Decide-mode routes stay estimates until a provider returns usage." },
] as const;

export const MODALITIES = [
  { name: "Text", state: "Routes today", text: "Support, drafting, code, and review go through the policy router and the OpenAI-compatible endpoint." },
  { name: "Images", state: "Waiting on a model", text: "The composer is here. Quiet will price an image only after an image model is allowed in the workspace." },
  { name: "Video", state: "Waiting on a model", text: "Same approval and credit ledger. No video model is in the catalogue, so Quiet will not invent a clip." },
  { name: "Audio", state: "Waiting on a model", text: "Audio uses the same control room once a model is connected. None is connected in this build." },
] as const;
