import { fail, gatewayCompletion } from "@/lib/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await gatewayCompletion(request);
  } catch (error) {
    return fail(error);
  }
}
