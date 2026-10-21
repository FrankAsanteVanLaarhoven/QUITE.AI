import { randomBytes } from "node:crypto";
import { appConfig } from "@/lib/config";
import { log } from "@/lib/logger";

export async function span<T>(name: string, attributes: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T> {
  const started = process.hrtime.bigint();
  try {
    const value = await fn();
    void exportSpan(name, attributes, started, true);
    return value;
  } catch (error) {
    void exportSpan(name, attributes, started, false);
    throw error;
  }
}

async function exportSpan(name: string, attributes: Record<string, string | number | boolean>, started: bigint, ok: boolean): Promise<void> {
  const ms = Number(process.hrtime.bigint() - started) / 1_000_000;
  log("info", "span", { name, ok, ms: Math.round(ms), ...flatten(attributes) });
  const endpoint = appConfig().otelEndpoint;
  if (!endpoint) return;
  const now = BigInt(Date.now()) * 1_000_000n;
  const startNano = now - BigInt(Math.round(ms * 1_000_000));
  const body = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "quiet" } }] },
        scopeSpans: [
          {
            scope: { name: "quiet" },
            spans: [
              {
                traceId: randomBytes(16).toString("hex"),
                spanId: randomBytes(8).toString("hex"),
                name,
                kind: 1,
                startTimeUnixNano: startNano.toString(),
                endTimeUnixNano: now.toString(),
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: typeof value === "number" ? { intValue: Math.round(value) } : typeof value === "boolean" ? { boolValue: value } : { stringValue: value },
                })),
                status: { code: ok ? 1 : 2 },
              },
            ],
          },
        ],
      },
    ],
  };
  try {
    await fetch(endpoint.replace(/\/$/, "") + "/v1/traces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    log("error", "otel_export_failed", { name });
  }
}

function flatten(attributes: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  return attributes;
}
