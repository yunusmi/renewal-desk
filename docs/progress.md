# RenewalDesk — implementation progress

Last update: 2026-11-12 — Codex continuation. Earlier entries below preserve Claude Code history. Current verification is being completed; see appended continuation entries.

## Current state
Current milestone: 8 — release candidate verified locally. Backend, worker, UI, demo, docs and workflow implemented; remote CI and upstream dependency advisories disclosed below. Accepted design: v2 under `references/design/`. Original source: `references/company/`. Architecture decisions proposed/accepted for implementation in ADRs.

| Milestone | Status | Evidence / next action |
|---|---|---|
| 0 Discovery | verified | Sources, original PDF/provider, design and local skills inspected |
| 1 Scaffold | verified | Fresh core Docker build/start, migrated/seeded DB, API/web/provider readiness |
| 2 Data/auth | verified | Real PostgreSQL A01–A04; seed isolation/idempotence |
| 3 Business commands | verified | B01–B05 independent HTTP races, uniqueness and rollback |
| 4 Worker/reliability | verified | Real simulator, actual SIGKILL/restart, HTTP fault/retry, fencing, finalization rollback |
| 5 Core UI | verified | Desktop/mobile real browser core flow and error/role paths |
| 6 Accepted design/demo | verified | Separate demo stack 15/7/11, real bootstrap, responsive screenshots/focus checks |
| 7 Docs/workflow | verified | Local Swagger/Stoplight/OpenAPI, Makefile commands, README; remote CI not run |
| 8 Release candidate | verified | 33 unit + 43 integration + 8 browser tests, lint/typecheck/build; limitations below |

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
| Clean checkout build/start | verified | Docker context builds without host node_modules; fresh core DB stack ready; clean source-copy npm check below |
| Core DB seed/roles/isolation | verified | A01–A04 + C01/D01, real PG |
| Concurrent creation/approval | verified | B02/B03 independent HTTP sessions/connections |
| 503 → real restart → GET → completed | verified | Dedicated original-provider Docker, API/worker SIGKILL/restart |
| Provider stats/one date update/rejection | verified | Restart harness asserts operation_count=1, started_count=1, term_updated=1, rejected resource stats=0 |
| Retry exhaustion/manual retry/stale worker | verified | Real HTTP fault stub, three POSTs, final GET, same-job recovery; stale token rejected |
| Desktop/mobile Playwright | verified | 8/8 at 1440×900 / 390×844, installed Google Chrome |
| Demo dataset separation | verified | Separate Compose project/volume/provider; SQL 15 resources/7 users/11 requests, bootstrap idempotence |
| Swagger/Stoplight/snake_case | verified | Recursive contract checks, actual Elements rendered in browser |
| CI/lint/typecheck/tests/build | verified | Local commands passed; GitHub workflow configured, remote run not performed |

## Remaining limitations and decisions
- GitHub Actions workflow is configured; no remote CI result claimed.
- Production dependency audit: 8 moderate upstream advisories, no high/critical. Full build/dev graph includes Stoplight upstream advisories; see README/ADR-008. No forced incompatible stack changes.
- Simulator is in-memory; recovery guarantee excludes simulator restart/state loss. POST reservation may be counted before actual send after a crash.
- UI follows v2 palette/layout/flows; header uses direct logout instead of the prototype's profile dropdown. Screenshots were inspected, no pixel-perfect equivalence claimed.
- Core/demo are local fictional environments, not production deployment; no public publication/deployment performed.

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

### 2026-11-12 — Codex continuation: implementation and two-axis review
- Recovered Claude state at `938d30c`: stage 1–3 code existed, A01–A04 verified, worker only authenticated DB, UI only rendered title; README/tracker still contained starter text. Original user changes preserved; no push/publication.
- Read repository Markdown/spec/ADRs and `.agents` skills/rules/references, original PDF extracted with pdftotext, unchanged Python simulator and design HTML/screenshots. Applied local NestJS best-practices/expert and frontend-design under the approved v2 constraints. `code-review` ran two independent read-only agents; report in `docs/review.md`.
- Implemented B01–B05 HTTP/database race, uniqueness, snapshot and transactional rollback tests; 27/27 passed before worker work.
- Implemented durable worker with independent poll lanes, ORM SKIP LOCKED claim, DB-clock scheduling, lease/fencing, persisted conservative POST reservations, GET-first reconciliation, final GET after third slot, same-job manual retry, strict response validation, confirmed mismatch handling and transactional date/status/job/audit finalization. Added sanitized audit outcomes and preserved provider evidence.
- Implemented React login, same-origin cookie/CSRF client, overview, resources/drawer/create, requests/filters/counts/sorting, details/actions/history/polling, audit/pagination, loading/error/empty/conflict, mobile navigation/cards, modal keyboard trap/escape/restore and route focus. No localStorage/mock production backend.
- Demo seeder/bootstrap: separate marker/project/volume/provider; 15 resources, 7 users, 11 requests; historical fixtures marked, RN-0903 backed by real provider, delayed runnable RN-0906. Idempotent, no core overwrite.
- Added local generated OpenAPI, Swagger UI and Stoplight web component. Stoplight build-only dependency, two assets copied to runtime image (ADR-008). Removed unused Vitest. Added Makefile, demo compose override, GitHub Actions and actual README/run/recovery instructions.
- Review findings fixed: empty filter query values, CSRF/logout session-expiry redirect; extended real HTTP fault/retry and finalization rollback tests. Also sanitized DB error logging, validated sid UUID before lookup, fixed accessible labels/default Cancel focus.
- Verified actual commands before final gates:
  - `npm test`: 33/33 unit tests, exit 0.
  - `npm run test:recovery`: actual SIGKILL + restart API/worker, fresh dedicated Docker provider alive throughout, one operation/started_count=1, unchanged operation ID and one date/audit effect, exit 0.
  - `PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`: 6/6 passed in 35.1s (1440×900, 390×844), exit 0; screenshots in `apps/web/test-results/`, HTML report in `apps/web/playwright-report/`. Includes core flow, approve/reject, tenant denial, own actions, dialog/focus/keyboard/overflow, filters, 500/404/retry, expired session and actual Stoplight rendering.
  - `COMPOSE_BAKE=false docker compose -p renewaldesk-core up -d --build --wait`: exit 0, new DB migrated/seeded, all long-running services healthy/running; Nginx `/health/ready` returns `{status:ready,database:ok}`.
  - `make demo`: exit 0, separate stack healthy, bootstrap completed. Read-only SQL in demo container: resources=15, users=7, requests=11.
  - `npm audit --omit=dev`: exit 1, 8 moderate, zero high/critical production advisories. Remaining upstream chains uuid/Sequelize and glob/minimatch/migration CLI documented in README; no unsafe forced major/downgrade updates. Full build/dev tree includes additional Stoplight upstream advisories.
- Environment observations: host default Node18 avoided with explicit Node22 PATH; local Python subprocess bound successfully but loopback fetch timed out, so real restart harness uses dedicated Docker provider. Chromium download was slow/timed out; installed Google Chrome used successfully. Docker/npm image downloads were slow but builds completed. No original provider edits.
- Final evidence: combined integration suite with added fault/rollback tests and lint/typecheck/build passed; record below.
- Limitations: CI workflow configured but no remote CI run; no formal security certification/global exactly-once. Simulator memory loss across its restart remains outside guarantee. Core/demo seed resets intentionally not automatic.

### 2026-11-12 — final verification
- `npm run build -w apps/server && npm run test:integration`: **41/41 tests, 5 suites, 69.793s, exit 0**. Includes actual restart, controllable HTTP fault provider, rollback after finalization writes, provider response-loss recovery, demo/bootstrap and recursive API/OpenAPI contracts.
- `npm run lint && npm run typecheck && npm run build`: exit 0 for both workspaces; Vite production build completed.
- `git diff --check`: exit 0. `git diff --exit-code c16c3e6 -- references/company/provider_simulator.py references/company/task.pdf`: exit 0, originals unchanged.
- Core and demo API/postgres/provider/web/worker all running. Core web refreshed to checked frontend image without restarting DB/provider.
- Final reviewer findings: 2 Standards fixed and regression covered, 2 Spec verification gaps covered; see `docs/review.md`.

- Clean source snapshot (tracked + untracked source files only, no ignored `.env`, dependencies or build outputs) copied to a separate temporary directory: `npm ci --no-audit --no-fund && npm run build && npm test` passed, exit 0; 989 packages installed from lockfile, both production builds succeeded, 33/33 unit tests passed. Snapshot installation does not depend on the original workspace node_modules.

- Extended protocol checks: final full integration suite **43/43, 5 suites, 70.395s, exit 0**. Additional tests prove original simulator encoded key lookup, same-key/body same operation, changed payload 409, and real HTTP timeout classification.

- Browser matrix extended with a test-only isolated attention fixture backed by a real original-provider operation: approver manual retry completes through GET, cycle counter 0 / total 3 preserved, long-name overflow checked on both viewports. No production fault/reset endpoint added.
- Environment fix: system Chrome 156 exited normally but an inherited diagnostic stderr pipe delayed Playwright worker teardown. Optional system-Chrome wrapper detaches stderr only; standard bundled Chromium path is unchanged, protocol pipes remain intact. Browser artifacts/traces stay enabled. Initial 8-test run eventually passed (6.2m); wrapper verification recorded next.

- Final optional-system-Chrome wrapper run: `PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e` — **8/8 passed, 1.4m, exit 0**, with normal process termination. Covers all earlier browser checks plus actual attention/manual retry and long-name overflow. Final HTML report and screenshots correspond to this complete 8-test run.
- Final state: local implementation/verification complete; core http://localhost:8080 and demo http://localhost:8081 remain running. Source changes remain in the working tree for owner review; no repository publication or cloud deployment.

### 2026-11-12 — Jest termination cleanup
- User reported `Jest did not exit one second after the test run has completed`.
- Found status-only fetch responses in docs asset checks, readiness probes and provider protocol checks. Added explicit response-body consumption; timeout stub now stops accepting connections before closing remaining sockets.
- Verification: `npm run test:integration -w apps/server -- --detectOpenHandles`: 43/43, exit 0, no open-handle report. Ordinary `npm run test:integration -w apps/server`: 43/43 in 67.289s, exit 0, no Jest termination warning. `npm test`: 33/33, exit 0. Server lint/typecheck and `git diff --check` passed.
- No forced-exit flag or enlarged warning timeout added. Production code unchanged. Added troubleshooting command to `docs/manual-testing.md`.

### 2026-11-12 — owner-requested Core expansion and scenario guide
- Owner explicitly requested 15–20 Core resources and broader step-by-step scenarios. ADR-009 supersedes the earlier default Core catalogue size; original task/provider remain unchanged.
- Added `db/data/core-extra.js`: Core now has 18 resources, Alpha 15 / Beta 3, with the same four accounts. Minimal DATASET=test remains the original three resources; Demo remains 15/7/11. No synthetic Core requests/provider effects added.
- Added an integration test executing the actual DATASET=core seed twice, verifying 18/15/3 counts, tenant scope and preservation of changed expiry/amount, existing requests/jobs/audit.
- Applied new seed to running Core with `docker compose -p renewaldesk-core run --rm --no-deps -e DATASET=core seed` after building only the server image. No provider/DB/API/worker restart. Before/after snapshot: all 3 original resource dates/amounts preserved, request IDs and job IDs unchanged, now 18 resources. Real Core API login/list confirms 15 Alpha resources including Redis/long name.
- Expanded `docs/manual-testing.md` to 18 UI/API/restart/retry/access/filter/error/mobile scenarios with expected outcomes, a same-origin CSRF Console helper, safe worker-only restart and temporary unavailable-provider configuration, plus separate commands for rollback/mismatch/fencing/crash-window tests. Updated README/spec/architecture/testing/ADR-004 cross-reference.
- Verification: targeted contract/dataset suite 4/4; full integration 44/44 in 68.215s, exit 0; server lint/typecheck passed. `git diff --check` passed.
- Controlled fault/restart instructions are opt-in manual procedures; they were not executed against the user's live Core during this catalogue update. Existing automated fault/recovery tests passed in the isolated test environment.

### 2026-11-12 — reviewer entry guide
- Added root `REVIEWER_GUIDE.md` and prominent README link: prerequisites, ordered startup, automatic Docker build/migration/seed explanation, readiness, accounts, PDF acceptance scenario with real restart/stats, additional scenario links, test commands/artifacts/limitations.
- Added isolated local rehearsal instructions (`renewaldesk-review`, .env.review, ports 8082/18093), avoiding resets of existing Core data. Explained that cloning into a new folder alone does not isolate a fixed-name Compose volume.
- Documentation-only change: verified local links and `git diff --check`; commands matched existing Makefile/Compose. No runtime/test rerun or destructive reset performed for this documentation update.

### 2026-11-12 — source handoff requested by owner
- Owner explicitly authorized archiving the project, committing all current changes and pushing main to the configured origin.
- Final pre-commit checks: workspace lint/typecheck/build and 33 unit tests passed; `git diff --check` passed. Source-file scan found no private-key/token patterns; only `.env.example` is tracked. Earlier integration/browser evidence remains 44/44 and 8/8.
- Handoff archive is generated from the final Git commit, including source, migrations, seeders, tests, documentation and references. node_modules, local .env/secrets, .git and generated build/test artifacts are excluded. Archive path and final commit/push outcome are reported in the handoff message.

### 2026-11-12 — bounded final verification after independent review
- Removed unused DEMO_LOGIN_ENABLED from API config, test config, Compose and env example; kept manual local login, documented the removal. No new UI credential endpoint or account bypass.
- Core/Demo seeders now require explicit APP_ENV=development/test before database access. API/worker reject APP_ENV=production with known-credential bundled datasets. Local optimized Docker NODE_ENV=production remains supported under explicit development/test APP_ENV. Added 11 focused safety unit cases (unit total 44).
- Reproduced original static Nginx upstream defect in an isolated network: 200 before API IP change, old 172.30.219.2/new 172.30.219.4, then 502. Added shared upstream zone, Docker resolver and resolve to pinned Nginx 1.27.3; no image upgrade.
- Added isolated `make test-compose` as the final `make verify` gate. Fresh project only; explicit subnet allows forcing IP changes. Verifies API/docs/health proxy after changed IP, same web container and process start time, production seeder refusal, company scenario and actual React screenshots. Temporary secrets are outside uploaded artifacts. Cleanup never targets Core/Demo.
- Clean source copy without .env/node_modules/dist: npm ci installed 989 packages, exit 0. Full make verify exited 0: lint/typecheck/build passed, 44 unit, 44 integration (69.261s), 8 browser (1.0m), then full Docker Compose build/migrate/seed/start and verification.
- Actual Compose proof: API IP 172.30.220.5 → 172.30.220.7 with unchanged Nginx; fresh res-a-01 2027-03-01; create; duplicate denied; concurrent approve 200/409; original POST 503 persisted; stop/start API+worker only; completed 2027-03-31; operation_count=1, started_count=1, POST total=1, one term_updated; res-a-02 rejection has operation_count=0. Provider/PostgreSQL container IDs and process start times preserved throughout recovery.
- Six actual React production screenshots at 1440×900 and 390×844 saved under docs/release/screenshots, overflow assertions passed. Reviewed against approved design; existing direct-logout/data-dependent differences disclosed. Machine evidence and detailed report: docs/release/verification.md and compose-verification.json.
- Repeated npm audit: production 8 moderate / 0 high / 0 critical; full graph 8 low / 20 moderate / 6 high / 0 critical (affected packages including meta advisories). No force fix, no dependency/lockfile or stack change. Remaining chains documented in docs/release/dependency-audit.json and verification.md; prebuilt Stoplight browser asset not declared immune.
- GitHub Actions actual prior results: Verify success for 095217c (run 43260863246) and c3c312d (43259871896). These are not substituted for final new-commit CI; current release CI is checked after publication and reported in the release handoff.
