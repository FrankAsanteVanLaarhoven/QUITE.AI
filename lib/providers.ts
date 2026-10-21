import { appConfig } from "@/lib/config";
import type { CatalogueModel } from "@/lib/types";

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: "not_configured" | "upstream",
  ) {
    super(message);
  }
}

export type ProviderResult = { text: string; tokensIn: number; tokensOut: number };

export async function callProvider(model: CatalogueModel, prompt: string): Promise<ProviderResult> {
  const config = appConfig();
  if (model.adapter === "anthropic") {
    if (!config.anthropicKey) {
      throw new ProviderError(`No Anthropic key is configured. Add ANTHROPIC_API_KEY, or run the gateway in decide mode.`, "not_configured");
    }
    return anthropic(config.anthropicKey, model.upstreamModel, prompt);
  }
  if (!config.openaiKey) {
    throw new ProviderError(`No provider key is configured for ${model.provider}. Add OPENAI_API_KEY, or run the gateway in decide mode.`, "not_configured");
  }
  return openai(config.openaiBaseUrl, config.openaiKey, model.upstreamModel, prompt);
}

async function openai(baseUrl: string, key: string, model: string, prompt: string): Promise<ProviderResult> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ProviderError(`The provider returned ${response.status}. Quiet did not invent a completion.`, "upstream");
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    tokensIn: body.usage?.prompt_tokens ?? 0,
    tokensOut: body.usage?.completion_tokens ?? 0,
  };
}

async function anthropic(key: string, model: string, prompt: string): Promise<ProviderResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ProviderError(`The provider returned ${response.status}. Quiet did not invent a completion.`, "upstream");
  const body = (await response.json()) as {
    content?: { text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: body.content?.map((part) => part.text ?? "").join("") ?? "",
    tokensIn: body.usage?.input_tokens ?? 0,
    tokensOut: body.usage?.output_tokens ?? 0,
  };
}
