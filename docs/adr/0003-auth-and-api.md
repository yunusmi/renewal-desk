# ADR-003 — server-authoritative session and same-origin API
Status: accepted for implementation.

Context: handoff uses HttpOnly cookie; assignment requires role isolation and known foreign IDs →403. Owner wants all external API snake_case, Swagger and Stoplight.
Decision: JWT HttpOnly cookie + DB session revocation; DB membership checked per request; strict same-origin and session-bound CSRF for writes; explicit DTO serialization; /api/v1, OpenAPI generated from Nest, both docs UIs same origin. No localStorage auth, role spoofing or direct provider proxy.
Alternatives: bearer JWT in JS storage, stateless JWT with role claims, opaque server cookie. Opaque cookie viable; JWT chosen per agreed stack, DB sid allows revocation and server authority.
Consequences: extra session lookup and CSRF handling; documented curl/Swagger/Stoplight flow. Local HTTP cookie Secure false only for local dev; secure true for HTTPS. No production SSO required.
