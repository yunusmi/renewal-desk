# RenewalDesk — implementation progress

Last update: starter kit creation. **No implementation or runtime tests have been executed by this kit.** This is a starting tracker; Claude Code updates it after each step using actual evidence.

## Current state
Current milestone: 0 — discovery. Next: inspect repository/tools, read references/specs and start scaffold. Accepted design: v2 under `references/design/`. Original source: `references/company/`. Architecture decisions proposed/accepted for implementation in ADRs.

| Milestone | Status | Evidence / next action |
|---|---|---|
| 0 Discovery | verified | Sources read, tools checked, versions pinned in lockfile — see 2026-11-12 entry |
| 1 Scaffold | in_progress | Migrations/seed/compose written; full Docker stack start not yet verified |
| 2 Data/auth | in_progress | A01–A04 18/18 passed on real PG |
| 3 Business commands | not_started | Races, DB constraints, atomic approval |
| 4 Worker/reliability | not_started | Real restart, provider counts, failure paths |
| 5 Core UI | not_started | Core browser flow |
| 6 Accepted design/demo | not_started | Responsive UI, dataset fixtures |
| 7 Docs/workflow | not_started | Swagger/Stoplight/CI/README |
| 8 Release candidate | not_started | Full verification and limitations |

Statuses: `not_started`, `in_progress`, `blocked`, `implemented_unverified`, `verified`. A stage is verified only when its required checks actually ran successfully.

## Session log template (append entries, don't erase history)
### YYYY-MM-DD — milestone / change
- Goal:
- Changes and files:
- Decisions / ADR:
- Commands run and results (exit codes, relevant evidence; no secrets):
- Tests not run / blockers:
- Known limitations:
- Next step:

## Acceptance evidence (fill on actual execution)
| Check | Status | Command/artifact/result |
|---|---|---|
| Clean checkout build/start | not_started | — |
| Core DB seed/roles/isolation | not_started | — |
| Concurrent creation/approval | not_started | — |
| 503 → real restart → GET → completed | not_started | — |
| Provider stats/one date update/rejection | not_started | — |
| Retry exhaustion/manual retry/stale worker | not_started | — |
| Desktop/mobile Playwright | not_started | — |
| Demo dataset separation | not_started | — |
| Swagger/Stoplight/snake_case | not_started | — |
| CI/lint/typecheck/tests/build | not_started | — |

## Open issues and decisions
- Exact dependency versions and compatible migration tool: select during stage 0, record in ADR/lockfile.
- Environment availability for Docker and browser: unknown until checked.
- Demo provider historical fixture bootstrap and exact UI label: implement per architecture doc and verify.
- No runtime code in starter kit. Do not describe it as working software yet.

### 2026-11-12 — milestone 0 discovery
- Goal: read originals/specs/design, inspect repo and tools, choose versions.
- Read: CLAUDE.md, spec.md, PROMPT_FOR_CLAUDE_CODE.md, START_HERE.md, all docs/ and ADR-001..005, `references/company/task.pdf` (8 pages, extracted with `pdftotext -layout`; the embedded `reference_renewals.png` image was not extracted — page 6 text/table read), `provider_simulator.py`, `references/design/README.md`, screenshots desktop-02/04. `references/design/task.pdf` is byte-identical to the company PDF (`cmp`).
- Repository: project directory is its own git repo (`git rev-parse --show-toplevel`), had no commits. Initial commit `c16c3e6` with starter kit + `.gitignore`. Local git identity set for this repo only.
- Tools (actual): Docker 28.3.3, Compose v2.39.2, Node 22.21.1 via nvm (system default is 18 — use `nvm use` / `.nvmrc`), npm 10.9.4, Python 3.14.7 (host), psql 17, pdftotext.
- Version choice (resolved in `package-lock.json`): NestJS 11.2.9, @nestjs/swagger 11.4.8, Sequelize 6.37.8, sequelize-typescript 2.1.6, pg 8.23.1, Umzug 3.8.3 (migration tool, programmatic, SQL migrations), TypeScript 5.9.3, Jest 29.7.0, ts-jest 29.4.15, bcryptjs 3.0.3. Deliberately not newest majors (TS 7, NestJS 12, Jest 30) to keep ts-jest/sequelize-typescript compatibility.
- Issues: npm registry slow (~7s/request); first install failed with ERESOLVE because `@stoplight/elements` needs React peers — moved Stoplight out of server deps, to be served as static web-components assets (stage 7).
- Plan/module boundaries: single backend workspace `apps/server` (API + worker entrypoints, shared domain/DB code, migrations, seeders, CLI) + `apps/web` (Vite/React); `infrastructure/{provider,nginx}`. See ADR-006.
- Risks: worker reliability complexity; slow npm in Docker builds; Playwright image size; demo bootstrap needs live provider.
- Next step: stage 1 scaffold (env validation, DB, migrations, health, Compose, provider launcher).

### 2026-11-12 — milestones 1–3 (in progress)
- Done: env validation; Sequelize models + associations; migration via sequelize-cli/queryInterface (all CHECK, composite FK, partial unique index `uq_renewal_active_resource`, immutability/append-only triggers) — verified up → undo:all → up on real PG 16; core seeder verified idempotent (2/3/4/4/0 after rerun, bcrypt `$2b$12$`), dataset guard refuses core over test. Auth (JWT cookie + DB session, Origin, HMAC CSRF, rate limit), read model and commands (create/approve/reject/retry) on ORM; provider launcher + Dockerfiles + compose.yaml + compose.test.yaml; Vite scaffold builds.
- Owner decision: ORM queries + sequelize-cli → ADR-007 (Umzug removed).
- Tests run: unit `npx jest --config jest.unit.config.js` 19/19 passed; integration `npx jest --config jest.integration.config.js --runInBand` (test DB `docker compose -p renewaldesk-test -f compose.test.yaml up -d --wait`) A01–A04: 18/18 passed.
- Issues found/fixed: Docker bake fails on non-ASCII project path → `COMPOSE_BAKE=false`; `COMPOSE_PROJECT_NAME` in `.env` overrode test project name (test containers started as renewaldesk-core; no core data existed) → removed from `.env`, always `-p`.
- Not yet verified: full `docker compose up` of core stack (images built before ORM switch need rebuild), B01–B05 tests, worker (stage 4), UI, Makefile, CI, Stoplight.
- Next: B01–B05 integration tests (races, rollback), then worker with SKIP LOCKED/lease/fencing and R01–R07.
