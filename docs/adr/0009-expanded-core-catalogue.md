# ADR-009 — расширенный каталог Core по запросу владельца

Status: accepted, 2026-11-12. Explicit owner instruction supersedes the earlier default-Core size in ADR-004/spec/architecture.

Context: the minimal Core catalogue made the everyday interface look empty compared with the accepted design. The owner explicitly requested 15–20 resources in Core and detailed instructions for more scenarios.

Decision: Core inserts 18 resources: 15 in Alpha, 3 in Beta. Keep the original three IDs/initial dates/amounts and four users. Extra catalogue rows live in `db/data/core-extra.js`, used only for DATASET=core. No synthetic Core requests or provider operations are added. Re-seeding inserts missing records only and never resets existing dates, prices, history, jobs or requests. Apply to the running Core via a one-shot seeder, without restarting provider/DB.

Tests: DATASET=test intentionally retains the three-resource acceptance fixture. A dedicated integration test executes the real Core seed twice and checks expanded counts, tenant scope, changed expiry/amount preservation, and unchanged requests/jobs/audit. Demo still imports the original three base resources and adds its own catalogue/history, keeping its 15/7/11 contract.

Consequences: UI users in Alpha see 15 resources immediately; Beta sees 3. Core totals exceed the PDF's minimal initial fixture by explicit owner choice; the mandatory three resources remain present. This is a catalogue expansion, not a data reset. Original PDF/provider are unchanged.
