# Docker-based developer workflow

Goal: one-command reproducible local run, separate tests, no real cloud deployment. This document defines target commands; agent must implement and verify them, not claim they exist yet.

## Compose and images
- Compose v2 `compose.yaml` (or docker-compose.yml, choose one), multi-stage Dockerfiles with pinned compatible Node/Python/Postgres/Nginx versions, lockfile `npm ci`, build TypeScript, lean runtime, non-root users where possible, `.dockerignore`, no baked secrets. Use PostgreSQL 16, Node 22, Python 3 standard library. Exact tested versions recorded in README. npm workspaces monorepo, scripts from root.
- Services: `postgres` with named persistent volume, healthcheck pg_isready; `migrate` one-shot after DB healthy; `seed` one-shot after migrations, default core idempotent; `provider` standalone original simulator via launcher; `api`, `worker` same backend image with different entrypoint commands, start after DB migration/seed complete; `web` Vite build served by Nginx, same-origin `/api/v1`, `/docs`, `/health` proxy; `test` only explicit profile/isolated project. API/worker should tolerate provider unavailable, readiness depends on DB/schema, not provider.
- Provider original file copied into runtime from `references/company/provider_simulator.py` unchanged. `infrastructure/provider/launcher.py` imports `Handler`, uses `ThreadingHTTPServer(('0.0.0.0',8091), Handler)` and handles shutdown; do not change protocol/state. Internal service URL `http://provider:8091`; healthcheck Python urllib `/health`; bind only within network or explicitly loopback publish for demo inspection. Original script remains runnable on host 127.0.0.1. Do not use `localhost` from API container to reach provider. No API process spawning Python subprocess; Compose manages independent lifecycles.
- Web loopback `http://localhost:8080` (chosen default; allow env port). API/DB/provider not externally exposed by default. Nginx same-origin proxy preserves Origin/cookies, SPA fallback only UI; docs assets routes work; configure proxy body limits. App health `/health` and `/health/ready`; worker health/status via DB polling/heartbeat or process liveness, document scope. `restart` policy reasonable for long-running processes, not for one-shots. API readiness after DB migrations; startup retries bounded.
- `compose.test.yaml` or dedicated test config uses separate project name, DB volume, provider instance, optional test stub, ephemeral runner; Playwright installed via compatible image/version. Test runner must not connect to existing local core/demo. `make demo` starts separate project (`renewaldesk-demo`), web port 8081, separate volume/provider; seed:demo and explicit demo bootstrap as architecture doc. Core default `renewaldesk-core`. Use environment validation, prevent dataset mix. No real credentials.

## Env example (target)
```
APP_ENV=development
DATASET=core
WEB_PORT=8080
APP_ORIGIN=http://localhost:8080
DATABASE_URL=postgresql://renewaldesk:LOCAL_DEV_PASSWORD@postgres:5432/renewaldesk
JWT_SECRET=<generate-local-random-secret>
CSRF_SECRET=<generate-separate-local-random-secret>
JWT_TTL_SECONDS=1800
COOKIE_SECURE=false
PROVIDER_BASE_URL=http://provider:8091
PROVIDER_TIMEOUT_MS=5000
RETRY_DELAY_MS=6000
JOB_LEASE_MS=30000
WORKER_POLL_MS=500
WORKER_CONCURRENCY=1
LOG_LEVEL=info
```
Use `.env.example` placeholders and instructions to generate secrets (openssl or local script); no real secrets in repo. Provide documented local bootstrap to create ignored `.env`, fail clearly if required missing. Demo/test env separate. Allowed Origin exact match effective port. Validate worker config lease > timeout + margin. No arbitrary secret fallback in production-like config.

## Commands to implement
| Command | Behavior |
|---|---|
| `make up` / `docker compose up --build` | core stack, migrations and seed, provider, worker, web; document .env prerequisite |
| `make down` | stop/remove containers, keep DB volume; note provider memory lost if removed; don't silently resume against reset provider with active uncertain jobs |
| `make logs` | tail sanitized logs, optional service |
| `make migrate` | one-shot migration CLI, no sync alter/force |
| `make seed` / `npm run seed:core` | idempotent core only, no overwrite; command environment documented |
| `make demo` / `npm run seed:demo` | separate demo project/database, bootstrap fixtures/provider; no core mutation |
| `make test` | unit tests, deterministic exit |
| `make test-integration` | real isolated DB + provider + API tests |
| `make test-e2e` | isolated full stack and browser tests |
| `make test-recovery` | real restart harness/acceptance |
| `make verify` (or `make up-test`) | startup isolated test stack + all required tests, nonzero on failures, collect artifacts and cleanup isolated stack |
| `make lint`, `make typecheck`, `make build` | full workspace checks/build |
| `make reset-demo` | explicitly destructive, require confirmation/env guard, demo project only; reset DB and provider together |

User asked Docker Flow: interpreted as reproducible Docker-first development workflow, not a third-party product or Kubernetes. Include Makefile plus npm scripts, optional dev hot reload Compose profile/override, document developer path. Tests available at startup via explicit verify/test profile, not on every normal API boot. Migrations transactional where possible, versions tracked, seed idempotent, explicit test DB reset only. DB persistence survives API/worker restarts. Warning on stopping provider while unresolved jobs: simulator loses state; fresh full reset for acceptance, never claim external guarantee across provider loss.

## GitHub Actions CI
Workflow on PR/push: checkout, pinned Node npm ci, lint/typecheck/unit/build, isolated integration DB+provider, E2E/recovery using Compose or compatible runner. Upload Playwright reports/test logs on failure, sanitize secrets, cleanup only CI project. No deploy or publish credentials. Keep CI commands matching local Makefile. Add dependency check and report findings, don't silently disable failing checks. Do not claim CI green before real run; local results and workflow config distinct.

## Final README (write root README.md during implementation)
- Product overview, scope and architecture diagram (Mermaid), required tool versions and prerequisites, `.env` setup, start/stop URLs, test accounts and demo/core difference.
- Migration and seed commands, worker/provider run (standalone and Compose), API docs Stoplight/Swagger and cookie+CSRF example, API contract links.
- Exact restart scenario from testing doc, configurable delay, request key location, curl/Python stats examples, how to stop/restart only API/worker, expected date/counts and limits.
- Test commands/results, CI status if verified, screenshots of actual app, compromises and unfinished items; AI-assisted workflow and human review describe actual verification, not invented manual review.
- No actual secrets or private company info. Submission repository link supplied by owner. Avoid committing confidential sources to public repo unless permission; `references/` can be excluded from public release with owner approval, but runtime simulator copy must remain available per assignment.
