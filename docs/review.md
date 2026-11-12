# Review after continuation — 2026-11-12

Scope: current source tree, including untracked files, against starter `c16c3e6` and engineering documents. Two independent read-only review agents followed `.agents/skills/code-review/SKILL.md`; fixes were made by the implementing agent. NestJS skills informed transaction, DI, input, error and migration checks; frontend skill was applied under the approved design, without redesign.

## Standards

1. Clearing status/active filters retained empty query values and caused HTTP 400. Fixed: empty filter values remove the parameter. Browser regression covers selecting a status then “Все”.
2. Expired-session responses from CSRF/logout could leave an authenticated shell open. Fixed: these 401 responses clear the in-memory token and dispatch session expiration; only login and initial session bootstrap suppress that event.

No other high-confidence backend correctness/security findings were identified by that review. This is bounded review evidence, not a claim that all defects are absent.

## Spec

1. Retry exhaustion test supplied synthetic results and did not prove HTTP recovery. Added a separate real HTTP fault service: exactly three POSTs plus GET checks, same-key/job retry, restored service, one operation and one local date change.
2. Finalization rollback was untested. Added test-only Sequelize audit hook failure after resource/request/job writes, assertions that the transaction rolls back all effects/evidence/audit, followed by lease recovery, GET and a single committed update.

Browser checks also cover manual retry against an actual pre-existing simulator operation, long-name overflow at both viewports, modal cancel focus and expired CSRF/session handling.

Additional implementing-agent fixes: safe logs omit internal DB error messages; malformed signed session IDs return 401 before UUID database lookup; explicit accessible name for password input; no unused Vitest dependency; Stoplight only at build time, two static assets in production. No production fault endpoints introduced.

Initial findings: 2 Standards and 2 Spec. Each is addressed in source/tests; actual verification results are tracked in `progress.md`.
