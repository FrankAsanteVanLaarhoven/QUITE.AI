# Quiet local quality review

Delivery: private local build, 21 October 2026. No git commit. Production server `pnpm start` on http://127.0.0.1:3970. Final standalone check used `node server.js` on 127.0.0.1:3972 and was then stopped.

Classification: private authenticated local application. Not a public release. No domain was purchased or invented.

Environment: macOS, Node as installed for this workspace, pnpm 10.20.0, Next 16.3.6, local Postgres 16 database `quiet`. Gateway mode `decide`. Reporting as-of 2026-10-21 UTC. Chrome headless, viewports 1440×900, 768×1024, and 390×844.

Commands:

- `pnpm exec vitest run tests/core.test.ts` — 10 passed, including signup validation and credit parsing.
- `QUIET_TEST_DATABASE_URL=postgres://quiet:quiet@127.0.0.1:5432/quiet_test QUIET_SESSION_SECRET=… pnpm exec vitest run tests/integration.test.ts` — 3 passed. That URL uses `quiet_test` and drops only that database's `public` schema. The credit case posts £250, leaves a reviewer request at awaiting payment, then records it to £300.
- `pnpm lint` — clean.
- `pnpm build` (`DATABASE_URL= next build`) — compiled without bootstrapping Postgres. `/` is dynamic. Static output is only `/_not-found` and `/robots.txt`.
- Browser scripts against the running server. Screenshots are gitignored under `docs/quality/screenshots/`.

Live Harbourline production ledger after the landing restart: “You saved £18,700 this month while maintaining 96% quality.” Billed £31,240, forecast £44,900, 18,400 billed requests. Customer support reply remains routed at £0.0018 versus £0.0124, actual cost empty. Approval inbox still has the three pending rows (£0.42 premium, £0.08 standard, £1.20 economy). A separate treasury balance of £40.00 was recorded from a reviewer request; it does not change those billed figures. One decide-mode chat row was added with actual cost empty.

| Check | Result | Evidence |
|---|---|---|
| Q01 Production domain | N/A | Private local app. No public hostname is configured. A preview domain was not invented. |
| Q02 Page titles | PASS | Front door `Control plane · Quiet`. Public views: Models, Benchmarks, Chat, Rankings, Apps, Pricing, Docs, Create a workspace, each suffixed `· Quiet`. Signed-in documents include Capacity this month, Credits, Routing decisions, Approval inbox, Routing policies, Teams and seats, Budgets and export, Model catalogue, and Audit log. Sign-in is `Sign in · Quiet`. Unknown route is `Page not found · Quiet`. Template is `%s · Quiet`. |
| Q03 Meta descriptions | PASS | One description, “Quiet is the AI capacity control plane for routing, budgets, and approval.” It names no tenant, user, or ledger figure. `robots` is `noindex, nofollow` on the front door and the public views. The local front door is not an indexable marketing site. |
| Q04 Favicon and icons | PASS | `GET /icon.svg` returns 200 `image/svg+xml`. `GET /favicon.ico` returns 200 `image/x-icon` without a session. The mark is the dark tile with the blue route line. Headless Chrome no longer records a favicon 404. Screenshot `21-icon-64.png`. |
| Q05 Open Graph image | N/A | No public shareable page. An Open Graph image was not invented. |
| Q06 Canonical URLs | N/A | No indexable public origin. A canonical URL was not invented. |
| Q07 Social previews | N/A | No public share card. Private pages are `noindex`. |
| Q08 Custom 404 | PASS | Unsigned `GET /does-not-exist` and `GET /sitemap.xml` return 404, title `Page not found · Quiet`, heading “That page is not in Quiet.”, with links to Quiet (`/`) and the control room (`/overview`). Console routes without a session redirect to `/login` (307): `/overview` and `/credits` observed. Screenshot `31-not-found.png`. |
| Q09 Loading states | PASS | With `/api/overview` stalled, the console showed “Loading the ledger” and “Quiet is reading this workspace. The figures will replace this note.” `aria-busy` is set. The headline replaced that note when the request continued. The route fallback copy is “Quiet is preparing this view.” Screenshot `18-loading-stalled.png`. |
| Q10 Error messages | PASS | Unreachable Postgres: sign-in heading “Quiet cannot open the workspace yet.” and “Quiet cannot reach Postgres. Check DATABASE_URL and that the database is accepting connections.” Health returns 503 with that sentence and code `starting`. The HTML does not include the driver error. Bad password returns 303 to `/login?error=1` (“That email or password is not valid. Try again.”). Unsigned `/api/overview` returns 401 “Sign in to continue.” A cross-site `Origin: null` returns 403 “Quiet rejected this request because it did not come from the console.” Screenshot `20-database-down.png`. |
| Q11 Heading structure | PASS | After each view loaded, the document had one `h1`: the October savings sentence, Routing decisions, Approval inbox, Routing policies, Teams and seats, Budgets and export, Models, and Audit. The loading state is a status label, not a second `h1`. |
| Q12 Alternative text | PASS | The spend chart is `role="img"` with an accessible name that includes the committed pace. The sidebar mark is `aria-hidden`. Search, palette, environment, team, policy, and budget controls have accessible names. Icon-only controls are not used for the primary actions. |
| Q13 Sitemap and indexing | PASS | `robots.txt` is `User-Agent: *` / `Disallow: /`. Pages send `noindex, nofollow`. `/sitemap.xml` is 404. Robots is not treated as access control; the console still requires a session. |
| Q14 Console errors | PASS | Headless Chrome recorded no console errors or exceptions across sign-in, eight workspace views, the command palette, a stalled load, the 404, and the database-down page. After the favicon fix, the only failed response in the heading pass was the intentional 404 for `/does-not-exist`. |
| Q15 Debug output | PASS | No `console.log` in shipped `ts` or `tsx`. Server operations use the structured logger (`console.info` / `console.error`). Prompt bodies are not logged. |
| Q16 Source maps | PASS | `productionBrowserSourceMaps` is false. The final `.next/static` tree contains 0 `.map` files. |
| Q17 JavaScript and performance | PASS | Budget recorded for this app: total client JS under 250 KB gzip, and no chunk over 120 KB gzip. Landing build: 25 JS files, 227,646 bytes gzip total, largest chunk 71,452 bytes gzip. |
| Q18 Mobile layout | PASS | 1440: rails rest at 64px and 48px, Menu and Details hidden, overflow 0. Hover and pin grow the rails in the grid; the October h1 stays clear of the sidebar (left 288px, rail right 264px). 768: sidebar stays, Menu hidden, Details opens the context, overflow 0, headline intact. 390: Menu and Details, sidebar hidden until Menu, landing and console overflow 0. Screenshots `34-rails-collapsed.png`, `47-rails-hover-clear.png`, `48-details-clear.png`, `38-landing-mobile-menu.png`, `49-mobile-menu-clear.png`, `50-tablet-clear.png`. |
| Q19 Consistent spacing | PASS | Dark canvas, hairline cards, 4px spacing scale, Geist, and the cost accent on saving. Sign out no longer wraps; computed `white-space` is `nowrap`. The same metric, type, and button styles appear at 1440, 768, and 390. |
| Q20 Working controls and links | PASS | Browser: front door, Product menu on hover and on click, signup duplicate-email error, new empty workspace, sign-in to `/overview`, rail hover, pin, and Escape, reviewer credit request with Add credit disabled, admin record of that request, image mode with no route request, reviewer chat blocked with no route request, admin text route, mobile Menu, tablet Details and Close. API keys remain on Budgets. Integration test on `quiet_test`: route, premium override, pin, approve, and reject, with actual cost left null, plus the credit ledger. Accept was not clicked on the live Harbourline support decision. |

## Deployment

- `Dockerfile` builds the standalone server. `docker-compose.yml` runs Postgres 16 and the app, with a healthcheck on `/api/health`.
- Final `node server.js` from `.next/standalone`, with static files and `public/`, returned `{"ok":true,"service":"quiet","mode":"decide"}`, icon 200, and favicon 200, then the process was stopped.
- `docker info` failed. The Docker socket at `unix:///Users/favl/.docker/run/docker.sock` was down, so the image was not built. That check is BLOCKED, not a pass.
- `pnpm start` serves this build and prints Next’s warning that `output: standalone` prefers `node server.js`. Compose already uses that command.
- Demo credentials stay local. Replace `QUIET_SESSION_SECRET` and set `QUIET_ALLOW_DEMO_CREDENTIALS=false` before any shared host. This review does not deploy or publish.

## Landing, credits, and rails

Checked on 21 October 2026 against `pnpm start` at http://127.0.0.1:3970 after the production build.

- `/` is the front door, signed in or not. The control room is `/overview`. Login and signup land there.
- Public views: `/catalogue`, `/benchmarks`, `/chat`, `/rankings`, `/apps`, `/pricing`, `/docs`, `/signup`. Each had one `h1` and overflow 0 at 1440. “Ori” was not added.
- Copy stays inside what Quiet does: text routes today; images, video, and audio do not generate until a model is allowed; credit copy says no card is charged. The October band is labelled as the Harbourline sample.
- Signup of a short password returns 303 to `/signup?error=password`. A duplicate Harbourline email shows “That email already has a Quiet workspace.” A new workspace opened on “No billed usage yet this month.”
- Samir (reviewer) can request a purchase. Add credit stayed disabled and the balance stayed £0 until Amara recorded the £40.00 row. The balance then read “Credit £40.00” and “No card was charged.”
- Headless Chrome recorded no console errors on the landing pass. The only failed document response in that pass was the intentional 404.

Known gaps: the container image has not been built on this machine. A public production release is not claimed. `docker info` exited 1, so the image check stays BLOCKED.

Release-ready claim: the applicable local checks pass. The Docker image build remains blocked until a Docker daemon is available.
