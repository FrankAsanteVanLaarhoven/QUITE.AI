import { dispatch, fail } from "@/lib/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };

async function handle(method: string, request: Request, context: Context) {
  try {
    const { path = [] } = await context.params;
    return await dispatch(method, request, path);
  } catch (error) {
    return fail(error);
  }
}

export function GET(request: Request, context: Context) {
  return handle("GET", request, context);
}
export function POST(request: Request, context: Context) {
  return handle("POST", request, context);
}
