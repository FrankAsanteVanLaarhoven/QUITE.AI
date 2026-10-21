export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export function json(status: number, body: unknown, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || origin === "null") {
    if (site === "cross-site") {
      throw new HttpError(403, "Quiet rejected this request because it did not come from the console.", "origin");
    }
    return;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Quiet rejected this request because its origin was not valid.", "origin");
  }
  if (!host || originHost !== host) {
    throw new HttpError(403, "Quiet rejected this request because it did not come from the console.", "origin");
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "The request body must be JSON.", "invalid_json");
  }
}
