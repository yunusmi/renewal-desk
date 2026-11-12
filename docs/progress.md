# RenewalDesk — implementation progress

Last update: starter kit creation. **No implementation or runtime tests have been executed by this kit.** This is a starting tracker; Claude Code updates it after each step using actual evidence.

## Current state
Current milestone: 0 — discovery. Next: inspect repository/tools, read references/specs and start scaffold. Accepted design: v2 under `references/design/`. Original source: `references/company/`. Architecture decisions proposed/accepted for implementation in ADRs.

| Milestone | Status | Evidence / next action |
|---|---|---|
| 0 Discovery | not_started | Read source and record dependencies/tools |
| 1 Scaffold | not_started | Compose/migration/health |
| 2 Data/auth | not_started | Real DB and security tests |
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
