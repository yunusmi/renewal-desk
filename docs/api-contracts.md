# REST / OpenAPI contracts

Base `/api/v1`. Same-origin via web gateway. Names snake_case for all external fields including nested DTOs, query, error codes and documented examples. Technical statuses are those in spec. HTTP header names per protocol (Idempotency-Key etc). Dates `YYYY-MM-DD` (DATE); timestamps ISO 8601 UTC. Money integer minor units (RUB), no floating API monetary values. Internal TS camelCase permitted. Use class-validator DTO and Swagger decorators, explicit mapping; no leaking ORM models. All product endpoints auth except login; health/docs separate. No actual provider keys in public docs examples (dummy key okay).

## Endpoints
| Method/path (relative to base) | Request | Response |
|---|---|---|
| POST /auth/login | {email,password}; Origin | 200 {user}, Set-Cookie; 401 invalid_credentials, 429 rate limited |
| POST /auth/logout | Origin + CSRF | 204, revoke session + clear cookie |
| GET /auth/me | cookie | 200 User |
| GET /auth/csrf | cookie | 200 {csrf_token}, no-store |
| GET /overview | none | 200 Overview |
| GET /resources | q,category,has_active,sort,limit,offset | 200 ResourceList |
| GET /resources/:id | path | 200 {resource,requests[]} |
| POST /resources/:id/renewals | empty body `{}` or absent; resource from path | 201 Renewal |
| GET /renewals | q,status,sort,limit,offset | 200 RenewalList |
| GET /renewals/:id | path | 200 {request,resource,events[]} |
| POST /renewals/:id/approve | empty | 200 Renewal (processing) |
| POST /renewals/:id/reject | empty | 200 Renewal (rejected) |
| POST /renewals/:id/retry | empty | 200 Renewal (processing) |
| GET /audit-events | resource_id,type,from,to,limit,offset | 200 AuditList |

Endpoint paths follow design handoff; prefix is engineering choice. Auth/csrf and list envelopes extend handoff. Authenticated mutations require Origin+CSRF per security doc. No alternate `workspace_id` input. Unknown path 404; invalid DTO 400; missing/invalid auth 401; role/foreign/self/CSRF 403; transitions/snapshot/active 409; 429/500/503 as relevant. Provider 503 does not directly become HTTP 503 from approve; approval already committed, async result visible via detail. Do not expose provider proxy mutations through product API.

## DTOs
```ts
// shapes only; actual DTO classes and OpenAPI definitions generated in code
interface User {
  id: string; name: string; email: string; workspace_id: string;
  workspace_name: string; roles: ('initiator'|'approver')[];
}
type RenewalStatus = 'pending_approval'|'processing'|'completed'|'rejected'|'requires_attention';
interface Resource {
  id: string; workspace_id: string; name: string; category: string;
  expires_on: string; amount_minor: number; currency: 'RUB';
  active_request: {id: string; status: RenewalStatus} | null;
}
interface Renewal {
  id: string; resource_id: string; resource_name: string; workspace_id: string; category: string;
  previous_expires_on: string; new_expires_on: string; amount_minor: number; currency: 'RUB';
  status: RenewalStatus; idempotency_key: string;
  created_by: string; created_by_name: string; created_at: string;
  decided_by: string|null; decided_by_name: string|null; decided_at: string|null;
  post_attempts: number; post_attempts_total: number;
  last_attempt_at: string|null; next_check_at: string|null;
  provider_confirmation: 'pending'|'uncertain'|'confirmed'|'not_confirmed';
  operation_id: string|null; attention_reason: string|null;
  fixture_origin: 'demo_history'|null;
}
interface AuditEvent {
  id: string; workspace_id: string; request_id: string; resource_id: string;
  occurred_at: string; type: string; actor_id: string|null; actor_name: string|null;
  from_status: RenewalStatus|null; to_status: RenewalStatus|null;
  result: string|null; detail: string; fixture_origin: 'demo_history'|null;
}
interface List<T> { items: T[]; total: number; limit: number; offset: number; }
interface ResourceList extends List<Resource> { categories: string[]; workspace_total: number; }
interface RenewalList extends List<Renewal> {
  counts: Record<RenewalStatus, number>; workspace_total: number;
}
interface Overview {
  workspace_id: string; counts: { resources_total: number; pending_approval: number; processing: number; requires_attention: number; };
  awaiting_my_decision: Renewal[]; my_active_requests: Renewal[];
  recent_requests: Renewal[]; expiring_resources: Resource[]; recent_events: AuditEvent[];
}
interface ErrorResponse {status_code: number; error_code: string; message: string;}
```
`post_attempts` is current cycle possibly-sent reservations; total cumulative; GET not counted. Pending/rejected without job counts zero, next_check null. `next_check_at` from job scheduled phase (next planned processing/check, null terminal). `provider_confirmation` reflects real external evidence; local attention with confirmed allowed. `fixture_origin` marks seeded historical/demo-only data; display clearly. `operation_id` null before valid confirmation; historical fixture may have labeled synthetic ID. Core normal data null fixture_origin. `resource_name/category` may derive current resource (not editable by API). Request detail includes actual current resource date separately. Audit timestamps and user names come from DB. No password/token/lease metadata serialized.

## List/filter semantics
Default limit=50, max=100, offset=0, validated nonnegative integer; deterministic sorting with ID tie break, total matching before page. UI add simple pagination when > limit. q trimmed, max 200; case-insensitive contains over fields from handoff using parameterized query and escaped LIKE wildcards. Resource q name/id, category exact, has_active true/false; sort expires_on|-expires_on|amount_minor|-amount_minor (default expires_on); categories from entire workspace, not across tenants. Renewal q id/resource_name/creator name; status one allowed value or absent; sort created_at|-created_at (default newest). counts are all workspace requests across statuses before filters, workspace_total sum; result total filtered. Audit type known enum, from/to ISO timestamps (UTC, inclusive from/exclusive to), from<=to, sort newest; foreign resource filter 403, nonexistent 404, never disclose foreign data. Overview recent 5 requests, upcoming 5 resources sorted expiry, recent 6 events; awaiting_my_decision pending other authors + attention for approver; initiator's active requests scoped to creator; counts all in workspace. Use DB date/current timezone policy UTC for relative days. Detail history all entries for small assignment; order timestamp+ID, document limit if introduced.

## Example
Create `POST /api/v1/resources/res-a-01/renewals`, Cookie + Origin + CSRF, body `{}`. Response 201 includes `id: RN-1001`, `resource_id: res-a-01`, `previous_expires_on: 2027-03-01`, `new_expires_on: 2027-03-31`, `amount_minor: 128000`, `currency: RUB`, `status: pending_approval`, stable key and creator. GET details returns actual resource expires_on still 2027-03-01 until completed. No amount/date fields accepted from caller.

Errors:
```json
{"status_code":409,"error_code":"active_renewal_exists","message":"У ресурса уже есть активная заявка"}
```
Codes: `validation_error` (400), `unauthenticated`, `invalid_credentials` (401), `role_forbidden`, `workspace_forbidden`, `cannot_decide_own_request`, `csrf_invalid`, `origin_forbidden` (403), `resource_not_found`, `request_not_found`, `not_found` (404), `active_renewal_exists`, `invalid_status_transition`, `resource_changed` (409), `rate_limited` (429), `internal_error` (500), `service_unavailable` (503 readiness or actual service failure). Global exception filter normalizes Nest default errors (`statusCode` must not leak), log sanitized correlation id. No raw SQL/provider stack.

## Developer documentation
`/docs` Stoplight Elements, `/docs/swagger` Swagger UI, `/docs/openapi.json` machine spec, `/health`, `/health/ready`. Host assets locally, document CSP/route-specific exceptions if necessary, keep strict main UI policy. Swagger describes cookie security scheme, Origin/CSRF requirements and DTO errors/status codes, examples for four roles and scenario. Try It same-origin cookie, CSRF manual header if UI cannot auto-populate; verify and document exact procedure. OpenAPI generation/check in CI (no stale checked-in spec), tests for paths, snake_case DTO and auth examples. `/health` process liveness; `/health/ready` DB connectivity/schema ready, not provider dependency. Health no secrets.
