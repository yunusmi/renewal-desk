# Final verification — 2026-11-12

Scope: bounded final pass, no architecture or business-module changes. Final execution evidence is recorded in progress.md and the attached Compose report/screenshots.

## Corrections

- Removed unused DEMO_LOGIN_ENABLED. No account autofill/public configuration endpoint added; manual local login remains documented.
- Core/Demo seeders require explicit APP_ENV=development or test; production/missing mode is refused before DB access. API/worker refuse APP_ENV=production with the bundled fictional datasets. Optimized local Docker NODE_ENV=production + APP_ENV=development is supported and tested.
- Reproduced original static Nginx failure: health 200, API IP 172.30.219.2 → 172.30.219.4, unchanged gateway returns 502. Dynamic Docker DNS resolution fixes this without upgrading Nginx. [NGINX upstream documentation](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server) documents resolve support in the pinned 1.27.3 release.
- Added a single isolated Compose verification harness to make verify: forced API IP change, original Nginx container/process retained, production seeder refusals, real company scenario, screenshots. Test cleanup is confined to its newly created project.

## Dependency audit

Commands: `npm audit --json` and `npm audit --omit=dev --json`. Both return exit 1 because advisories remain. No audit fix --force or dependency/stack changes were applied.

| Scope | Low | Moderate | High | Critical |
|---|---:|---:|---:|---:|
| Production dependencies | 0 | 8 | 0 | 0 |
| Entire build/dev graph | 8 | 20 | 6 | 0 |

Counts are affected packages, including transitive/meta advisories, not unique vulnerabilities. Summary: [dependency-audit.json](dependency-audit.json).

Production chains: uuid through Sequelize/sequelize-typescript, and glob/minimatch through js-beautify/editorconfig/sequelize-cli. The uuid advisory concerns buffer handling in v3/v5/v6; application request/job keys use node:crypto.randomUUID. This narrows the observed use, but does not mean the dependency advisory is resolved. Migration CLI dependencies remain part of the local runtime image.

Build/dev high chains: Stoplight Elements/elements-core/http-spec → postman-collection → faker/lodash. The prebuilt Stoplight JS is served locally; moving the package to devDependencies does not prove its browser bundle is unaffected. Keep the docs local and treat upstream updates as follow-up work requiring compatibility review. No unverified claim of vulnerability-free or public production readiness.

## GitHub Actions

Before this pass, actual Verify runs completed successfully for:

- [095217c](https://github.com/yunusmi/renewal-desk/actions/runs/43260863246)
- [c3c312d](https://github.com/yunusmi/renewal-desk/actions/runs/43259871896)

These results cover their listed commits only. A final new-commit CI result must be recorded separately after publication; configured workflow alone is not evidence of success.

## Execution results

A new temporary source copy contained no node_modules, .env, dist or generated docs assets. Executed Node 22.21.1 `npm ci --no-audit --no-fund` (989 packages, exit 0), then full `make verify`, exit 0. Local isolation overrides used separate test project renewaldesk-release-tests, ports 55433/18195, TEST_DATABASE_URL/TEST_PROVIDER_URL, and system Chrome via PLAYWRIGHT_EXECUTABLE_PATH. The Makefile test recipe itself was unchanged by those overrides.

| Gate | Actual result |
|---|---|
| lint / typecheck / build | Both workspaces passed |
| Unit | 44/44 |
| Integration | 44/44, 69.261s |
| Browser | 8/8, 1.0m, desktop/mobile |
| Full Docker Compose | Built, migrated, seeded; all services ready |
| Nginx IP change | 172.30.220.5 → 172.30.220.7, gateway recovered with original web container and process start time |
| Production seeders | Core and Demo CLI refused before writes |
| Company scenario | Concurrent approve 200/409; actual persisted POST 503; stop/start API+worker, provider/PostgreSQL retained; completed 2027-03-31 |
| External/local effect | operation_count=1, started_count=1, POST total=1, term_updated=1; rejected resource operations=0 |
| Dependencies/provider | No package/lockfile change; original simulator unchanged |

Machine evidence: [Compose verification](compose-verification.json), [original Nginx failure](nginx-before.json). The isolated stack was removed after verification; no Core/Demo volumes or running processes were reset.

## Actual React screenshots

Captured through the running Nginx-served production React build, after the real company scenario. All captures asserted no horizontal page overflow. Compared with approved v2 palette, content width, cards/table, mobile flow. No redesign or pixel-perfect equivalence claim. Visible differences remain data-dependent (Core Alpha now 15 resources and two scenario requests) and the already documented direct logout instead of prototype profile dropdown.

| Page | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| Overview | [desktop](screenshots/desktop-overview.png) | [mobile](screenshots/mobile-overview.png) |
| Requests | [desktop](screenshots/desktop-requests.png) | [mobile](screenshots/mobile-requests.png) |
| Completed detail | [desktop](screenshots/desktop-completed.png) | [mobile](screenshots/mobile-completed.png) |

Final new-commit CI metadata is retrieved after the commit exists and reported with the release handoff; local checks above are not described as a remote CI result.
