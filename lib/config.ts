export type AppConfig = {
  nodeEnv: string;
  databaseUrl: string;
  sessionSecret: string;
  seed: "demo" | "none";
  allowDemo: boolean;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  devApiKey: string;
  gatewayMode: "decide" | "live";
  cookieSecure: boolean;
  workspaceName: string;
  openaiKey: string;
  anthropicKey: string;
  openaiBaseUrl: string;
  otelEndpoint: string;
  rateLimitPerMinute: number;
};

export function appConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const allowDemo = process.env.QUIET_ALLOW_DEMO_CREDENTIALS === "true" || nodeEnv !== "production";
  const sessionSecret = process.env.QUIET_SESSION_SECRET ?? (nodeEnv === "production" ? "" : "dev-only-session-secret-change-me!!");
  if (sessionSecret.length < 32) {
    throw new Error("QUIET_SESSION_SECRET must be at least 32 characters.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const seed = process.env.QUIET_SEED === "none" ? "none" : "demo";
  if (nodeEnv === "production" && seed === "demo" && !allowDemo) {
    throw new Error("Refusing to load demo data in production. Set QUIET_SEED=none.");
  }
  const adminPassword = process.env.QUIET_ADMIN_PASSWORD ?? (allowDemo ? "Harbourline-local-2026" : "");
  if (adminPassword.length < 12) {
    throw new Error("QUIET_ADMIN_PASSWORD must be at least 12 characters.");
  }
  const devApiKey = process.env.QUIET_DEV_API_KEY ?? (seed === "demo" && allowDemo ? "quiet_demo_harbourline_local_only" : "");
  return {
    nodeEnv,
    databaseUrl,
    sessionSecret,
    seed,
    allowDemo,
    adminEmail: (process.env.QUIET_ADMIN_EMAIL ?? "amara@harbourline.example").toLowerCase(),
    adminPassword,
    adminName: "Amara Okonkwo",
    devApiKey,
    gatewayMode: process.env.QUIET_GATEWAY_MODE === "live" ? "live" : "decide",
    cookieSecure: process.env.QUIET_COOKIE_SECURE === "true",
    workspaceName: process.env.QUIET_WORKSPACE_NAME ?? "Harbourline",
    openaiKey: process.env.OPENAI_API_KEY ?? "",
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "",
    rateLimitPerMinute: 60,
  };
}
