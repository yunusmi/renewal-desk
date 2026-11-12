# ADR-010 — final verification corrections
Status: accepted, 2026-11-12 (explicit bounded verification request).

- Remove unused DEMO_LOGIN_ENABLED from configuration, Compose and env template. Manual login with documented fictional credentials remains; no public endpoint or frontend credential autofill is added.
- Reject bundled fictional core/demo/test datasets in APP_ENV=production. Core/Demo seeders require explicit APP_ENV=development or test before database access. NODE_ENV=production remains valid for optimized local Docker images when APP_ENV is explicitly development/test. This project provides local fictional environments, not a production provisioning preset.
- Nginx static upstream was reproduced returning 502 after API IP changed. Use Docker embedded resolver, shared upstream zone and server resolve with pinned Nginx 1.27.3. Official compatibility: https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server . No image-major change needed.
- Add one isolated Compose verification harness to make verify: explicit private subnet, forced API IP change with original web container, seeder refusal, real original-provider company restart scenario and React screenshots. All cleanup is confined to a newly created renewaldesk-release-* project, never Core/Demo. No new runtime dependency or business module.
