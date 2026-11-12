# Frontend — accepted design v2

Implement the final handoff in `references/design/README.md`, `RenewalDesk.dc.html` and screenshots. Read them before UI work. Do not import prototype `support.js`, localStorage DB/auth, simulated API, or developer tools into actual runtime. React + TS + Vite + Router; TanStack Query recommended; CSS tokens. No redesign unless a necessary accessibility fix documented. API prefix `/api/v1`, same origin credentials; auth from `/auth/me`, CSRF in memory, all data from real API.

## Visual system
- Desktop 1440×900, content centered width `min(1120px, calc(100% - 64px))`; on mobile gutters 16px. Background #0B1B1D; card #1D2C2E; text #F5F7F7; secondary #A9B8B9; accent #80A3FF; radius 20, padding 24; Arial, H1 32, body 14–16. Title/workspace above main card. White pill CTA create on requests, blue for other primary actions. Additional tokens and component sizes from handoff §2. Preserve final screenshot visual hierarchy, no decorative redesign.
- Breakpoints handoff: <1000 mobile menu, <760 table→cards. 390px mobile no page-level horizontal scroll, wrap long names/IDs; desktop tables accessible. Use status text+glyph, not just color. Status palette per handoff. Focus visible 2px accent offset 2, targets ≥44px primary actions, toolbar 36–40px per handoff with sufficient accessibility.
- Components AppHeader/Logo/NavTabs/MobileMenu/ProfileMenu/WorkspaceBadge, PageHeading, Card, StatusChip, KpiTile, DataTable/CardList, Toolbar/Search/Filter/Sort, EmptyState, ErrorState, Skeleton, Drawer, ConfirmDialog, TermCompare, Timeline, KeyValueList, Toast. Prefer accessible primitives and native form/table semantics.

## Routes and flows
| Path | UI and behavior |
|---|---|
| `/login` | Logo RenewalDesk, email/password, show/hide, busy/errors, local demo accounts autofill only when flag enabled; submit actual login, no role switch. |
| `/overview` | 4 KPI (resources/pending/processing/attention), scoped data, links to filtered lists. Approver: чужие pending + attention; initiator: own active. Recent 5 requests, 5 expiry, 6 events. |
| `/resources` | name/ID/category/expiry/amount/active status/action. Search, category/has_active filters, sort date/amount, pagination when needed, drawer details/current date/history. Initiator with no active request can create; active → open existing. |
| `/requests` | primary page after login (or redirect to overview per handoff; choose `/overview` as default, `/requests` direct route). H1 above card, stats and status filter chips, search id/resource/creator, date sort. Each request separate row; primary columns resource, term new + old, cost, status; creator/created/open. White pill create. |
| `/requests/:id` | actual resource current expiry separate from snapshots, old → +30 days → new, cost, author/decision/role, status, banner, timeline, operation key, provider confirmation/ID, attempts cycle and total, next check. Action only per permissions. |
| `/audit` | read-only scoped history, filters resource/type/period, actor/system, time, status transition, result, link to request, pagination. |

Navigation top bar with context/workspace/name/roles and logout; same workspace only, no direct tenant switch. Browser back/forward and direct URLs work. Nginx SPA fallback not for API/docs. On unauthorized route show 403 without data; 404 distinct. `/` redirect depending on auth. Clear all query caches on logout/login/account change; avoid rendering stale prior tenant data while loading. Use route guards as UX only, API authoritative.

### Create
Drawer resource selector, current expiry, computed preview +30 calendar days, fixed amount/currency, explanation actual date changes only after confirmation. Preview must be derived from latest API resource; actual snapshot server-calculated. Use date-only parse (not browser timezone converting UTC midnight); show DD.MM.YYYY. Format minor amount as RUB `1 280,00 RUB`; no conversion to float in API. Submit empty body to resource endpoint. On 201 invalidate resources/requests/overview/audit and route to details. On 409 show inline conflict, refresh and link active request; no duplicate POST on button double click. No manual editing amount/date/period.

### Approval / rejection / retry
ConfirmDialog (summary, previous/new expiry, cost, consequences), focus default Cancel, busy state disables submit, errors inline keep dialog open; cancel closes. Role/state/self eligibility derived from user + request; server validates. Own pending request: explanatory text, no approve/reject. Initiator without approver no approve/reject/retry. Approval processing asynchronous, not optimistic completed. Rejection no provider/date change. Retry only attention approver, same key; explain provider might already have executed. No new request while active. After success invalidate queries; keep status/audit/current date consistent. 409 invalid transition refresh detail; no optimistic mutation rollback illusions.

### Provider processing
When processing, poll detail and relevant lists/overview every ~2–3s while processing visible, cancel on navigation/logout; no fake timer countdown or generated events. Use persisted next_check_at, label if time passed and worker pending. 503 uncertain banner: «Результат операции пока не подтвержден. Система проверяет состояние по тому же ключу». Attention: «Не удалось подтвердить результат; операция могла быть выполнена» (unless confirmed local mismatch, then explicit provider confirmed/local update blocked). Show reason, attempts reserved vs known outcomes (tooltip clarifies crash ambiguity), total, operation ID/key for authorized user. For local invariant mismatch do not claim operation failed; operator correction outside UI. Demo fixture marker distinguish synthetic historical IDs/events from real provider evidence. No raw provider response, secrets, or developer reset/fault toggles in normal app.

## States and accessibility
Loading skeleton with heading visible, busy buttons; empty initial vs no results reset filters; 500/503 API retry; 401 session expired return login; 403/404 readable; 409 inline conflict. Error code and human-readable localized message, critical error not toast-only. Visible focus, labeled form controls, `aria-current`, `aria-pressed`, `role=status` result count, `role=alert` error, `aria-live` toast, route heading focus. Dialog/drawer trap focus, Escape, restore focus opener or H1; respect reduced motion; don't use clickable div without keyboard semantics. No horizontal page overflow at 390, mobile menu accessible and scrollable, long names wrapped. Verify actual rendering, not just CSS assumptions.

## Handoff check
Compare screenshots desktop-01..07 and mobile-01..04 under `references/design/screenshots/`, PDF page 6. Produce actual screenshots from implemented React in Playwright for core + demo; report deviations. UI can use demo dataset for presentation, but core is default and empty lists must look intentional. See `docs/testing.md`.
