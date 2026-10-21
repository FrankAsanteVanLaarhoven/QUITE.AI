import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const consolePath = ["/overview", "/requests", "/approvals", "/policies", "/teams", "/budgets", "/models", "/audit", "/credits"].some(
    (item) => pathname === item || pathname.startsWith(`${item}/`),
  );
  const hasSession = Boolean(request.cookies.get("quiet_session")?.value);
  if (consolePath && !hasSession) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  response.headers.set("Cache-Control", pathname.startsWith("/api/") || pathname.startsWith("/v1/") ? "private, no-store" : "private, no-cache");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
