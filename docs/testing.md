# Test strategy & acceptance

Tests are part of implementation, not future work. Use Jest for domain/unit and integration, Supertest against Nest API with migrated real PostgreSQL, Playwright against running web+API+worker+provider. Test env separate DB, provider and credentials, never point at core/demo. Do not mock database for required integration tests. Use deterministic clock/config/fixtures where appropriate; test isolation by separate test DB/schema or explicit isolated reset, provider reset only between independent scenarios (never during recovery). Tests that share provider state run serial or separate instances. Assert HTTP, DB rows/constraints, audit and provider state, not only UI labels. No hard sleeps for success; bounded poll on persisted conditions, timeouts with diagnostics. Actual runs and outputs recorded in progress.

## Unit coverage
- Date-only +30 calendar days across March, leap years/month/year boundaries and DST (2027-03-01 → 2027-03-31; no timezone shift); minor units and DTO validation.
- State/permission predicates all roles, own decisions, immutable payload builder, provider response schema, URL encode, error mapping, retry decision/counter rules, lease/fence checks. Unit tests supplement, never replace DB tests.

## Integration / API E2E matrix
| ID | Scenario and assertions |
|---|---|
| A01 | Fresh migrated minimal acceptance fixture (DATASET=test): exact 2 spaces/3 resources/4 accounts/0 requests, all role login, password hash not plaintext, server session/cookie flags, no token in JSON. |
| A02 | Missing/invalid/expired/revoked auth →401; logout revokes old sid; incorrect login generic 401; rate limit; missing/wrong CSRF and wrong Origin →403, valid same-origin mutation works. |
| A03 | Alpha/Beta list/overview/audit scoped; known foreign resource/request detail/create/approve/reject/retry →403; nonexistent ID →404; no data leak; foreign audit filter denied. |
| A04 | Approver cannot create; initiator cannot approve/reject/retry; universal cannot approve/reject own; test both actions; role/workspace/author/amount/date payload spoofing rejected 400, no mutation. |
| B01 | Create res-a-01 →201 pending, snapshot 128000 RUB, old 2027-03-01/new 2027-03-31, resource unchanged, no jobs/provider, actor+time audit. |
| B02 | Sequential duplicate →409; simultaneous creates from independent sessions/connections via Promise.all barrier → exactly one 201 one 409, one active DB row; direct DB duplicate violates partial index. |
| B03 | Concurrent approve/approve and approve/reject on pending, worker paused: exactly one 200 one 409; at most one job, one decision transition, no duplicate provider operation; repeated completed/rejected decision →409. |
| B04 | Approve after change current expiry OR amount/currency via controlled test DB fixture →409 resource_changed, pending remains, zero jobs/calls; rollback injection during enqueue/audit proves no partially approved request. |
| B05 | Reject other request →rejected, no job, date unchanged, provider operation_count=0; after terminal reject or complete new request allowed, after attention denied. |
| R01 | Real original Python simulator: first POST stores op and returns 503; wait for persisted uncertain+next_run_at; stop/restart worker and API only, DB+provider untouched; same key GET200; completed; date 2027-03-31; operation_count=1 and started_count=1; exact operation_id unchanged. |
| R02 | Simulate crash after DB approve commit before worker starts; restart worker picks job. Crash after reserve before send; no silent exhaustion, GET first, same key, bounded accounting. Crash after provider performed POST before response write; recover by lease expiry/GET. Crash after confirmed response before local commit and after commit; one local effect, no duplicate audit. Use explicit test-only hook/barrier or process kill; do not ship dangerous hooks enabled. |
| R03 | Multi-worker concurrent claim via SKIP LOCKED; force lease expiry and stale worker result, new token wins, stale mutation/audit rejected; job completes once. Conditional update/finalize repeated does not add 30 days twice. |
| R04 | Fault-only provider stub returns 503/timeout for POST and 404/503 for GET: three reserved POST sends, GET not counted, delays persisted, status attention, still active. Retry by approver → processing same key/payload/job, cycle reset, total retained; restore stub, GET or POST confirms, one external operation in stub, one local effect. |
| R05 | Provider 409 changed payload, malformed 200, wrong resource/amount/period/currency/status/operation_id, timeout/connection reset: never finalize invalid; permanent conflict attention, no new key. Real simulator same-key different payload 409, same payload repeated 200 and stats unchanged. |
| R06 | Finalize local expiry/amount mismatch after confirmed provider: attention with confirmation preserved, date unchanged, no completed; retry never creates new operation after known confirmation. DB transaction failure during finalization rolls back all fields; recovery completes exactly once. |
| R07 | Restart during delay: next_run_at survives, no early GET/POST when delay persisted. Recovery with third reserved slot still performs final GET before attention. Manual retry concurrent one success one 409. |
| C01 | JSON all external DTO keys snake_case (including nested errors), correct nulls/dates/amount types, pagination/filter/sort/count semantics and deterministic ties, audit actor/time transitions. OpenAPI generated real paths/schemas/statuses and cookie/CSRF. |
| D01 | Core seed rerun non-destructive, original dates not reset after renewal; demo separate 15 resources/7 users/11 initial requests, all statuses, fixture marker, coherent data and jobs; demo bootstrap idempotent, no effect on core provider stats. |

For race tests use real independent transactions/connections, not serial awaits; barriers/test hooks when necessary, assert DB uniqueness independently. For worker fault tests controllable stub is separate from original simulator, never modify provided script. Test-only flags disabled in normal images/config or require explicit test environment. No API endpoint for fault injection in normal deployment. If process-kill harness unavailable, mark test blocked and provide manual reproducible command; do not count simulated reload as restart.

## Actual restart acceptance runbook
1. Fresh isolated core environment, fresh provider; set `RETRY_DELAY_MS=20000` or larger before start and record effective config. Wait for readiness. Login initiator and create res-a-01. Save request ID/key from detail. Date stays 2027-03-01; second active create 409; Beta/own approvals denied. Log in separate approver. Concurrent approval via API test or curl script (one 200 + one 409).
2. Poll details until `provider_confirmation=uncertain`, first POST attempt and `next_check_at` set, before scheduled GET. Verify provider GET by URL-encoded key shows `started_count=1`, `/stats?resource_id=res-a-01` shows 1. This independent inspector GET is not app worker processing; no counter changes. Capture operation_id.
3. Stop API and worker before next check: `docker compose stop api worker` (test harness may kill worker for abrupt crash). **Do not restart postgres or provider.** Start again: `docker compose up -d api worker` (or documented equivalent), same Compose project and volumes. If using leases wait bounded expiry + retry schedule; no reset/seed overwrites.
4. Poll GET request until completed. Assert actual resource expiry 2027-03-31, same operation_id, key unchanged, job done, provider GET started_count=1 and stats operation_count=1 including other keys. Verify after additional worker polling/restart date unchanged. Capture audit and SQL counts. Provider URL accessible via `docker compose exec provider ...` using Python urllib or documented loopback inspection; URL-encode key (not raw path). Use provider `GET /health`.
5. Reject a request for res-a-02, assert expiry 2027-05-20 and operation_count=0. Check history and error UI. Run attention/manual retry fault scenario separately on test stub.

## Browser E2E (Playwright)
- Desktop 1440×900 and mobile 390×844: login, nav, overview, resources, create and duplicate conflict, account logout/switch, approver dialog confirm/cancel, processing then completed (real worker+provider), audit, rejected request, own pending action hidden, Beta foreign URL denied; manual retry attention test-only environment. Role checks also API, not just UI.
- Search/filter/sort, status chips, counters, details links, route reload/back, empty and no results, 401 expiration, 403/404, conflict inline, 500 retry via route interception only for UI states (not domain integration).
- Keyboard Tab/Shift+Tab, focus visible, modal focus trap/escape/restore, screen-reader labels, status text, no horizontal page overflow (`scrollWidth <= clientWidth`), long name. Capture screenshots actual React; compare approved v2 screenshots and PDF page6 visually. Use test artifacts on failure.

## Gates
`make lint`, `make typecheck`, `make build`, `make test`, `make test-integration`, `make test-e2e`, `make test-recovery` must be documented and executable; actual CI equivalents. Verify clean checkout build/start, migrations, seed, API docs loaded, test runs. Report commands/pass/fail/blocked, not invented counts or coverage. No arbitrary coverage threshold substituting required matrix. Tests use test DB/provider only, ordinary `make up` not destructive and not auto-running tests; `make verify` or `make up-test` one-command optional startup+tests. Prioritize P0; disclose incomplete cases.

## Expanded Core (owner change, ADR-009)

The default Core seed now inserts 18 resources (Alpha 15 / Beta 3). A01 and browser test fixtures intentionally retain the original minimal 3-resource DATASET=test. D01 additionally executes the actual DATASET=core seed twice in an explicitly isolated fixture and checks 18 total / 15 Alpha / 3 Beta / 4 users, tenant scoping, preservation of modified expiry/amount, requests/jobs and audit. Demo remains 15 resources / 7 users / 11 initial requests.

## Final Compose verification

`make test-compose` (also the last gate of `make verify`) builds and starts a fresh isolated full stack, forces API recreation with a different IP while preserving the Nginx container/start time, checks API/docs/health routes, refuses production Core/Demo seeders, then runs concurrent approval → original POST 503 → API/worker stop/start → completed. Assertions include date 2027-03-31, operation_count=1, started_count=1, one term_updated event and unchanged provider/PostgreSQL process start times. Real React screenshots use 1440×900 and 390×844. No additional runtime dependency.

Only newly created `renewaldesk-release-*` resources are removed in cleanup. Required ports: 18082/18094, explicit test subnet 172.30.220.0/24 (override RELEASE_SUBNET if occupied). Artifacts: artifacts/release/compose-verification.json, compose.log and screenshots/. Generated secrets are stored outside artifacts in a temporary env file and are not uploaded by CI.
