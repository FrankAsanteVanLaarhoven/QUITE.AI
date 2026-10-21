export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS environments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  slug text NOT NULL,
  name text NOT NULL,
  UNIQUE (workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'finance', 'operator', 'reviewer')),
  password_hash text NOT NULL,
  UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  environment_id uuid NOT NULL REFERENCES environments(id),
  name text NOT NULL,
  token_prefix text NOT NULL DEFAULT '',
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  slug text NOT NULL,
  name text NOT NULL,
  seats integer NOT NULL CHECK (seats >= 0),
  allowance_micro bigint NOT NULL CHECK (allowance_micro >= 0),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS models (
  slug text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('economy', 'standard', 'premium')),
  region text NOT NULL,
  input_micro_per_million bigint NOT NULL,
  output_micro_per_million bigint NOT NULL,
  latency_p50_ms integer NOT NULL,
  quality_index integer NOT NULL,
  adapter text NOT NULL,
  upstream_model text NOT NULL
);

CREATE TABLE IF NOT EXISTS model_access (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  model_slug text NOT NULL REFERENCES models(slug),
  allowed boolean NOT NULL,
  PRIMARY KEY (workspace_id, model_slug)
);

CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  priority integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  environment_id uuid NOT NULL REFERENCES environments(id),
  period text NOT NULL,
  committed_micro bigint NOT NULL,
  PRIMARY KEY (workspace_id, environment_id, period)
);

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  environment_id uuid NOT NULL REFERENCES environments(id),
  team_id uuid REFERENCES teams(id),
  policy_id uuid REFERENCES policies(id),
  workflow text NOT NULL,
  task_label text NOT NULL,
  task_type text NOT NULL,
  complexity text NOT NULL,
  sensitivity text NOT NULL,
  confidence numeric(4,3) NOT NULL,
  tokens_in integer NOT NULL,
  tokens_out integer NOT NULL,
  selected_model_slug text REFERENCES models(slug),
  premium_model_slug text REFERENCES models(slug),
  estimated_cost_micro bigint NOT NULL,
  premium_cost_micro bigint NOT NULL,
  actual_cost_micro bigint,
  saving_micro bigint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('routed', 'accepted', 'overridden', 'pending_review', 'escalated', 'rejected', 'failed')),
  within_policy boolean NOT NULL,
  escalated boolean NOT NULL DEFAULT false,
  reasons jsonb NOT NULL,
  pros text NOT NULL,
  cons text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  prompt_sha256 text,
  mode text NOT NULL CHECK (mode IN ('imported', 'decide', 'live')),
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS requests_lookup ON requests (workspace_id, environment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES requests(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  recommended_tier text NOT NULL,
  reason text NOT NULL,
  reviewer_id uuid REFERENCES users(id),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_lookup ON audit_events (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status_code integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (api_key_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS rate_buckets (
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (api_key_id, window_start)
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
  balance_micro bigint NOT NULL DEFAULT 0 CHECK (balance_micro >= 0)
);

CREATE TABLE IF NOT EXISTS credit_entries (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('grant', 'purchase')),
  status text NOT NULL CHECK (status IN ('posted', 'awaiting_payment')),
  amount_micro bigint NOT NULL CHECK (amount_micro > 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_entries_lookup ON credit_entries (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS team_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS team_members_team ON team_members (team_id);
`;
