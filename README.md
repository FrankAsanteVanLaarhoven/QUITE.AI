# Quiet

Quiet is an AI capacity control plane. It routes an OpenAI-compatible request to the lowest-cost catalogue model that meets the workspace quality, latency, safety, and budget policy, and it escalates to a person when confidence is low or a rule requires review.

It does not claim to know the best model in the abstract. Cost stays visible. A decide-mode route records an estimate and does not book a bill. A bill exists only when a live provider returns usage.

This tree is a private local deployment. It does not publish a public domain, a sitemap, or a social preview.

## Run locally

Postgres 16 and Node 22 or newer are required.

```bash
cd workspace/quiet
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3970` for the front door. Sign in or create a workspace there. The control room is `/overview`. An admin adds people on `/people` and can place them on a team. Placement does not change purchased seats. Quiet does not email the password.

The local demo workspace is Harbourline. Sign in as `amara@harbourline.example` with `Harbourline-local-2026`. The same password signs in the reviewer `samir@harbourline.example`. The local gateway key is `quiet_demo_harbourline_local_only`. These credentials exist only when demo seeding is allowed. Replace them before any shared host, and set `QUIET_COOKIE_SECURE=true` behind HTTPS.

`QUIET_SEED=none` creates an empty workspace: one admin, a General team, the catalogue, and the default policies. No October ledger is imported.

## Gateway

`POST /v1/chat/completions` with `Authorization: Bearer <key>`.

- `model` `quiet-auto` lets the policy choose.
- A catalogue slug pins that model when it is allowed.
- `x-quiet-team` selects a team slug. Otherwise Quiet uses `support`, then the first team.
- `x-quiet-workflow` names the workflow. The default is `gateway`.
- `Idempotency-Key` replays the stored response.
- A request that needs approval returns HTTP 409 and does not invent a completion.
- `QUIET_GATEWAY_MODE=decide` records the route and returns `finish_reason` `quiet_decision`.
- `QUIET_GATEWAY_MODE=live` calls OpenAI or Anthropic only when that provider's key is set. A missing key fails the request. One premium retry follows an upstream error.

Prompt bodies are redacted before a provider call and before the stored excerpt. Quiet stores a SHA-256 of the prompt, not the prompt.

## Deployment

```bash
export QUIET_SESSION_SECRET="replace-with-32-or-more-characters"
docker compose up --build
```

Compose falls back to a local-only session secret if that variable is unset. Replace it before any shared host. The app container listens on port 3970. `GET /api/health` returns 200 when Postgres answers and 503 with a recovery message when it does not.

Set `QUIET_SEED=none` and `QUIET_ALLOW_DEMO_CREDENTIALS=false` for a real workspace. Set `QUIET_COOKIE_SECURE=true` when the console is served over HTTPS. Quiet does not configure a public hostname in this repository.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` runs the pure ledger tests. The Postgres test runs only when `QUIET_TEST_DATABASE_URL` points at a database whose name ends in `_test`. It drops that database's `public` schema.

```bash
docker compose up -d postgres
docker compose exec postgres psql -U quiet -d quiet -c "CREATE DATABASE quiet_test"
QUIET_TEST_DATABASE_URL=postgres://quiet:quiet@127.0.0.1:5432/quiet_test pnpm exec vitest run tests/integration.test.ts
```

The October headline is exact when the reporting date is 21 October 2026. On another date the forecast uses the same ledger and the days that remain.
