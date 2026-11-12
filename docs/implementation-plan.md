# Implementation plan — milestone gates

Implement sequentially in small vertical slices. At each milestone read `spec.md`, relevant docs, verify commands, update `docs/progress.md` and ADR if needed. No waiting for owner approval between agreed steps; material changes require decision. P0 mandatory first. If time constrained, finish working core and report missing P1; do not spend days on infrastructure polish before domain.

| Stage | Work | Gate / tangible output |
|---|---|---|
| 0 — Discovery | Read originals, handoff/screenshots, specs; inspect git/tools; choose compatible exact dependencies; identify constraints; log plan and decisions | progress records baseline, source priority, version choices, risks; no false claims |
| 1 — Scaffold | npm workspaces, strict TS, Nest API/worker, React Vite, DB connection, Compose images, provider launcher, health, migration tooling, env validation, Makefile basics | fresh build, DB health, migration runner, web/API readiness, provider health, lockfile; original script unchanged |
| 2 — Data and auth | Sequelize models, constraints/indexes, core seed, sessions, login/logout/me/csrf, membership/role guard, error/validation/logging, resource read endpoints | migration applied real PG; A01–A04 tests (as applicable), no leak, core seed rerun safe |
| 3 — Business commands | requests/overview/audit queries, create/approve/reject/retry transaction boundaries, snapshot, job row, audit, REST DTOs | B01–B05 integration tests incl real races and rollback; approve enqueues without network, one active/request job, status/tenant correct |
| 4 — Worker and provider | HTTP adapter, persisted phases, lease/fencing, retries, delay, response validation, atomic finalize, recovery, attention/manual retry | R01–R07 tests incl real simulator, actual process restart, crash windows, stale worker and local mismatch; date +30 once, stats 1 |
| 5 — Core UI | auth, header/nav, resources, request list/detail/create, approve/reject/retry dialogs, status/history, API hooks, errors/polling, responsive | core scenario via real browser/API/worker; PDF visual fit, mobile, no simulated production backend |
| 6 — Full accepted design | overview, audit route, filters/sort/pagination, expanded demo seed/bootstrap, fixture labels, accessibility; polish using screenshots | Demo initial 15/7/11, real navigation and data, core untouched; browser tests and screenshots, keyboard/overflow |
| 7 — Docs & workflow | Swagger/OpenAPI, Stoplight, docs auth examples, all Makefile/test commands, CI, README, diagrams/ADR, test artifacts | C01/D01 and all required suites, docs load, isolated test startup; fresh clone run, documented restart |
| 8 — Release candidate | Run full verification, compare all acceptance criteria PDF p7–8, security review, fix high-priority failures, prepare demo/checklist | progress final report verified vs blocked, exact commands/results, no secrets, no unfinished hidden; owner handles submission |

## Implementation advice
- Do not make a giant single commit with all files. Keep changes reviewable; commits if owner workflow permits, never push/publicize without approval.
- Use real PostgreSQL early; don't build temporary SQLite/in-memory backend then rewrite. Test fixture helpers isolated. Implement migrations before relying on model sync. No frontend mock server in main runtime.
- API spec generated from actual DTOs. Backend module tests and integration tests accompany features, not postponed to stage 7. OpenAPI can be introduced early; final polish later.
- Worker reliability is the highest complexity. Before adding more UI, prove the actual core acceptance scenario. `docs/reliability.md` is normative; don't substitute simpler in-memory timers.
- If environment blocks Docker/Playwright, report exact error, mark implemented_unverified, provide run commands and continue independent work. No fabricated test outputs or claims. Do not mark release ready until P0 checks have actually passed.

## Completion checklist
- [x] Original PDF and provider preserved; core values exact.
- [x] Core roles, cross-tenant protection, own approval/rejection and 401/403/409 verified.
- [x] PostgreSQL active constraint and concurrent create/approve verified.
- [x] Approval+job+audit atomic, worker durable, stable key/payload, external response validated.
- [x] Actual restart after 503 preserves provider operation; date 2027-03-31, counts 1, reject stats 0.
- [x] 3 POST/GET/retry, stale worker, mismatch and rollback tested.
- [x] Full UI based on accepted v2, 1440×900 and 390, accessibility and flows verified.
- [x] Core/demo/test independent, no destructive default, migration/seed reproducible.
- [x] Swagger and Stoplight functional; all external JSON snake_case.
- [x] Docker/Compose/Makefile, CI, README commands, actual tests and limitations.

Verification recorded on 2026-11-12 in `docs/progress.md`; remote CI is configured but unrun, upstream audit findings and minor UI deviations are explicitly disclosed there.
