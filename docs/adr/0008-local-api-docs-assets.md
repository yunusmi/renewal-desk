# ADR-008 — build-time Stoplight assets, process restart harness
Status: accepted (2026-11-12).

Context: Stoplight React libraries have a large dependency tree and older React peer requirements. The API only needs the prebuilt Elements web component, not Node-side rendering. The provided simulator must stay unchanged and alive during restart tests.

Decision: keep `@stoplight/elements` as a development dependency, copy only `web-components.min.js` and `styles.min.css` to `apps/server/public/docs` during the build, include those files in the runtime image and serve locally. Swagger is generated from real DTOs/routes. Public docs are developer documentation, all product API routes retain authentication/CSRF. No CDN required. Dependency audit still reports upstream package issues; moving build dependencies is not a claim that the prebuilt bundle is free of vulnerabilities.

Recovery harness uses a fresh dedicated Docker provider, a real isolated PostgreSQL DB, compiled API/worker child processes, SIGKILL and restart. Provider container stays alive during the scenario and is removed only in final cleanup. Local Python subprocess listener in this environment timed out on loopback HTTP despite successful startup, so Docker avoids that environment-specific limitation. E2E uses the original test provider container too. No original simulator edits or production fault endpoints.

Consequences: building the server needs dev dependencies; production needs only copied static assets. Integration/recovery scripts require a built server and Docker. Browser tests may use installed Chrome when a Chromium download is unavailable. Test database resets are explicit and must not overlap suites.
