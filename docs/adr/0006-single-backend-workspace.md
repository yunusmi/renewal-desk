# ADR-006 — one backend workspace with two entrypoints
Status: accepted (2026-11-12).

Context: architecture doc proposes `apps/api`, `apps/worker`, `packages/{database,domain,contracts}`. Requirement is "separate worker on the same backend codebase", no duplicated repositories/services.
Decision: one npm workspace `apps/server` containing domain, database (models, migrations, seeders), API modules and worker; entrypoints `main-api.ts`, `main-worker.ts`, `cli/migrate.ts`, `cli/seed.ts`. One Docker image, different commands. Frontend `apps/web` does not import server code; API types are mirrored in `apps/web/src/api/types.ts` and checked by contract tests against OpenAPI.
Alternatives: multiple packages with TS project references — more build wiring and Docker complexity without behavioral benefit at this size.
Consequences: simpler build/test; module boundaries kept by directories (`src/domain`, `src/database`, `src/api`, `src/worker`). Can be split later without changing behavior.
