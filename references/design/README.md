# Handoff: RenewalDesk — согласование и выполнение заявок на продление

## 0. Что в пакете
- `RenewalDesk.dc.html` + `support.js` — интерактивный прототип (открыть в браузере, файлы рядом). **Это дизайн-референс, не продакшен-код.** Внутри — имитация API, БД (localStorage), фонового обработчика и Python-симулятора провайдера; её задача — зафиксировать поведение, а не реализацию.
- `screenshots/` — Desktop (1440, отрисовано масштабом) и Mobile (390).
- `task.pdf` — исходное ТЗ: критерии приёмки, контрольный сценарий, требования к README и тестам.

Целевой стек: React + TypeScript + Vite · NestJS + TypeScript · PostgreSQL + Sequelize · Swagger/OpenAPI + Stoplight Elements · Docker Compose · PostgreSQL-backed jobs · отдельный Python provider simulator · интеграционные и E2E-тесты.

Fidelity: **high-fidelity** — цвета, типографика, отступы, тексты и состояния финальные.

---

## 1. Информационная архитектура

```
/login                         Вход (email + пароль)
/overview                      Обзор (dashboard пространства)
/resources                     Ресурсы  (+ drawer ресурса, + drawer «Новая заявка»)
/requests[?status=…]           Заявки на продление (главный экран, референс стр. 6 ТЗ)
/requests/:id                  Детальная страница заявки (+ диалоги согласования/отклонения/повтора)
/audit                         История операций (read-only журнал)
```
В прототипе — hash-роутинг (`#/requests/RN-1001`). В проде — React Router, те же пути.
Глобальные слои: drawer справа (ресурс / создание), модальный confirm-диалог, toast, профиль-меню, мобильное меню.
Developer / Demo Tools — **вне продукта**, см. §10.

## 2. Design tokens

**Обязательные (ТЗ):** bg `#0B1B1D` · card `#1D2C2E` · text `#F5F7F7` · secondary `#A9B8B9` · accent `#80A3FF` · card radius 20 · card padding 24 · H1 32px · Arial · body 14–16 (база 15/1.45).
**Layout:** контейнер `min(1120px, 100% - 64px)` (на мобиле −32px: `calc(100% - clamp(32px, 4.45vw, 64px))`), центр. Desktop-эталон 1440×900.

Производные:
| Токен | Значение |
|---|---|
| surface-sunken (inputs, drawer, плитки) | `#132427` |
| surface-mobile-card | `#172729` |
| row-hover / avatar | `#243537` |
| border | `#2A3C3E`; table-head `#2F4244`; divider/timeline `#33474A`; button-secondary `#3A4F52` |
| accent hover / active | `#9BB6FF` / `#6C8FEF`; accent-text на тёмном `#A9C0FF`, `#C9D7FF` |
| primary white CTA («Создать заявку») | bg `#F5F7F7`, текст `#0B1B1D`, radius 999, hover `#FFFFFF` |
| danger CTA («Отклонить заявку») | bg `#FF9C8A`, текст `#0B1B1D` |
| backdrop drawer / dialog | `rgba(4,12,13,0.6)` / `0.7` |
| error alert | border `rgba(255,156,138,.4)`, bg `rgba(255,156,138,.08)`, title `#FFB4A6` |
| dev tools | bg `#0F2123`, dashed border `#4A6266`, badge `DEV` `#F2C46B` |

Статусы (текст / фон / глиф — статус никогда не передаётся только цветом):
| status | Лейбл | Текст | Фон | Глиф |
|---|---|---|---|---|
| pending_approval | На согласовании | `#A9C0FF` | `rgba(128,163,255,.14)` | ◷ |
| processing | Выполняется | `#F2C46B` | `rgba(242,196,107,.12)` | ↻ |
| completed | Завершена | `#7FD6A4` | `rgba(127,214,164,.12)` | ✓ |
| rejected | Отклонена | `#C3CFD0` | `rgba(169,184,185,.14)` | ✕ |
| requires_attention | Требует внимания | `#FF9C8A` | `rgba(255,156,138,.14)` | ! |
| (нет активной) | Нет активной | `#A9B8B9` | `rgba(169,184,185,.06)` | – |

Типографика: H1 32/700/1.15 · H2 drawer/dialog 24/700 · H2 секции 18/700 · H3 16/700 · body 15 · secondary 14 · meta 13 · KPI 32/700 tabular-nums · моно (ID, ключи, error_code) `Menlo, Consolas, monospace` 13.
Радиусы: 20 карточки/диалог · 16 карточка заявки в drawer · 14 плитки/алерты/моб. карточки · 12 кнопки · 10 инпуты/малые кнопки · 999 чипы и white CTA.
Высоты: кнопки действий ≥ 44px · тулбар-инпуты 40px · строки таблицы padding 14×12.
Без градиентов. Тени только у оверлеев (`0 12px 32px rgba(0,0,0,.45)`, диалог `0 24px 60px rgba(0,0,0,.5)`).
Фокус: `:focus-visible { outline: 2px solid #80A3FF; outline-offset: 2px }`.

## 3. Переиспользуемые компоненты
| Компонент | Назначение / props |
|---|---|
| `AppHeader` | логотип, `NavTabs` (4 раздела, `aria-current="page"`), `WorkspaceBadge`, `ProfileMenu`; < 1000px → `MobileMenu` (кнопка «Меню», панель с разделами, именем, ролью, «Выйти») |
| `Logo` | квадрат 28px `#80A3FF` r8 с разомкнутым кольцом (символ продления) + «RenewalDesk» 16/700 |
| `PageHeading` | H1 + «Рабочее пространство: X» — **над** карточкой |
| `Card` | `#1D2C2E` r20 p24 |
| `StatusChip` | `status` → лейбл, цвет, глиф |
| `KpiTile` | label, value, hint, href (переход к отфильтрованному списку) |
| `DataTable` / `CardList` | таблица ≥ 760px, карточки < 760px; одинаковые данные |
| `Toolbar` | SearchInput, Select, `StatusFilterChips` (aria-pressed, со счётчиками), `ResultCount` (role=status) |
| `EmptyState` | dashed `#33474A` r14; варианты «нет данных» и «ничего не найдено» + «Сбросить фильтры» |
| `ErrorState` | alert: `{status_code} · {заголовок}`, message, `error_code`; «Повторить» для 5xx, «К списку заявок» |
| `Skeleton` | 3 полосы + «Загрузка данных…» (role=status) |
| `Drawer` | справа, `min(480px,100%)`, focus trap, Esc, возврат фокуса |
| `ConfirmDialog` | `role=alertdialog`, сводка заявки, текст-последствие, Отмена (фокус по умолчанию) + CTA; busy-лейбл, disabled, inline-ошибка |
| `TermCompare` | Прежний срок (снимок) → «+30 календарных дней» → Новый срок; ниже текущий срок ресурса + чип состояния |
| `Timeline` | вертикальная линия, точка-цвет по типу, заголовок, переход статуса, описание, моно-результат, «время · автор» |
| `KeyValueList` | `<dl>` 2 колонки |
| `Toast` | слева снизу, `aria-live=polite`, 5 с |

## 4. Экраны (кратко; точные значения — в прототипе)
**Вход.** Логотип + «RenewalDesk / Согласование продлений ресурсов». Карточка: H1 «Вход», Email (`autocomplete=username`, принимает и логин), Пароль + кнопка «Показать/Скрыть» (`aria-pressed`), ошибка `role=alert` («Введите email и пароль» / «401 · Неверный email или пароль»), «Войти» (busy «Вход…»). Под карточкой — select «Демо-аккаунт» (заполняет email и пароль; в проде — только в demo-режиме). Регистрации, SSO, восстановления нет.

**Обзор.** 4 KPI (ресурсы, на согласовании, выполняется, требует внимания — красное значение при > 0) → ссылки на `/requests?status=…`. Блоки 2×2: «Требуют вашего решения» (approver: pending чужие + requires_attention; initiator: «Ваши активные заявки»), «Последние заявки» (5), «Ближайшие сроки окончания» (5, «через N дн.», ≤ 30 дн. жёлтым; клик → drawer), «Последние события» (6, → заявка). Всё считается из данных пространства.

**Ресурсы.** Поиск (название/ID), категория, «С активной / без активной заявки», сортировка (срок ↑↓, стоимость ↑↓), «Найдено: N из M». Колонки: Ресурс (название + ID), Категория, Срок, Стоимость, Заявка (чип активной или «Нет активной»), Действие («Продлить» — initiator без активной; «Открыть RN-…» — при активной). Строка/название → drawer ресурса (сроки, категория, кнопка «Создать заявку на +30 дней» или причина недоступности, история заявок ресурса со ссылками).

**Заявки на продление** (главный, близок к референсу). H1 и пространство над карточкой. В карточке: компактная статистика «Всего / Ожидают / Выполняется / Требует внимания», поиск (ID, ресурс, инициатор), сортировка по дате создания, чипы статусов со счётчиками, таблица. Основные колонки — **Ресурс, Срок, Стоимость, Статус**; дополнительно Инициатор, Создана, «Открыть →». ID заявки — под названием ресурса моно. Срок: новый + «было …». Внизу — белая pill-кнопка «Создать заявку» (initiator) + подсказка. Каждая заявка — отдельная строка (у ресурса может быть несколько исторических).

**Детальная страница заявки.** «← Заявки на продление»; ID · дата создания; H1 = ресурс; StatusChip; действия справа по ролям. Баннер-пояснение состояния. Левая колонка: TermCompare, Timeline. Правая: «Сведения» (пространство, ресурс, категория, инициатор, согласующий, дата согласования/отклонения, стоимость, валюта, ключ операции), «Выполнение» (POST-попытки `n из 3 · всего N`, последняя попытка, следующая проверка, подтверждение провайдером, ID операции). Секреты, токены и сырой ответ провайдера не показываются.

**История операций.** Фильтры: ресурс, тип события, период (сутки / 7 / 30 / всё). Колонки: Дата и время, Событие, Ресурс · заявка (ссылка), Автор / «Система», Переход, Результат. Только чтение; только своё пространство.

## 5. Роли и правила отображения действий
| Действие | Кто видит | Условие | Сервер отклоняет |
|---|---|---|---|
| Создать заявку | initiator | у ресурса нет активной заявки | 403 `role_forbidden`, 403 `workspace_forbidden`, 404 `resource_not_found`, 409 `active_renewal_exists` |
| Согласовать / Отклонить | approver | `pending_approval` и `created_by ≠ me` | 403 `cannot_decide_own_request`, 409 `invalid_status_transition`, 409 `resource_changed` (только approve) |
| Повторить обработку | approver | `requires_attention` | 409 `invalid_status_transition` |
| Просмотр | все роли | только своё пространство | 403 `workspace_forbidden` (в т.ч. по известному ID), 404 |

Пояснения вместо скрытых кнопок: «Это ваша заявка — согласовать или отклонить её должен другой согласующий», «Ожидает решения согласующего», «Создавать заявки может только инициатор», «Есть активная заявка RN-… — новую можно создать после её завершения или отклонения». UI скрывает недоступное, но **источник истины — сервер**.

Тестовые учётные записи (пароль у всех `demo1234`; в проде — хэши в seed):
| email | Пространство | Роли |
|---|---|---|
| initiator.alpha@renewaldesk.test | Alpha | initiator |
| approver.alpha@renewaldesk.test | Alpha | approver |
| initiator.beta@renewaldesk.test | Beta | initiator |
| universal.alpha@renewaldesk.test | Alpha | initiator + approver |
Demo dataset добавляет: approver.beta (Beta), initiator.orion, approver.orion (Orion).

## 6. State machine
```
                 approve                  provider confirmed + срок == снимок
pending_approval ───────▶ processing ─────────────────────────────────────▶ completed
      │                    │   ▲
      │ reject             │   │ retry (approver, тот же ключ)
      ▼                    ▼   │
   rejected        requires_attention
                   (3 POST без подтверждения | 409 провайдера | срок ≠ снимок)
```
Активные: `pending_approval | processing | requires_attention` — не более одной на ресурс.
`provider_confirmation`: `pending` → `uncertain` (503) → `confirmed` | `not_confirmed`.

### Алгоритм обработчика
1. Approve + постановка задачи — **одна транзакция**.
2. Перед POST: `post_attempts++`, `last_attempt_at` — сохранить **до** запроса.
3. `POST /renewals`, заголовок `Idempotency-Key: <idempotency_key>`, тело `{resource_id, period_months: 1, amount_minor, currency}` — ключ и тело неизменны на всех попытках.
4. 503 → `uncertain`, `next_check_at = now + RETRY_DELAY`. После задержки `GET /renewals/{encodeURIComponent(key)}` (**не** увеличивает `post_attempts`): 200 → шаг 6; 404/503 → снова шаг 2.
5. `post_attempts >= 3` без подтверждения → `requires_attention`, `not_confirmed`.
6. Завершение (**одна транзакция, идемпотентно**):
   - если заявка уже `completed` → ничего не менять;
   - `UPDATE resources SET expires_on = new WHERE id = $1 AND expires_on = previous` → 1 строка: записать `operation_id`, `completed`, события;
   - 0 строк (срок неожиданно другой) → **не завершать**: `requires_attention` + событие «Срок ресурса не совпадает со снимком»;
   - повторная обработка никогда не увеличивает срок второй раз.
7. Retry: `requires_attention → processing`, `uncertain`, `next_check_at = now`, `post_attempts = 0` (`post_attempts_total` сохраняется) — сначала GET по тому же ключу.
8. При старте приложения — подобрать все `processing` и продолжить с сохранённого шага.

Ограничения БД: частичный unique `(resource_id) WHERE status IN (активные)`; переходы `UPDATE … WHERE id=$1 AND status=$expected RETURNING *` (0 строк → 409); jobs `UNIQUE(request_id)`, захват `FOR UPDATE SKIP LOCKED`; `idempotency_key` UNIQUE, никогда не перегенерируется.

> В прототипе (v1) была ошибка: заявка могла стать `completed`, даже если срок ресурса не совпал. Исправлено — см. `finalize()`.

## 7. API-контракты (snake_case)
Внешний JSON — только snake_case; внутренние переменные TS — camelCase (маппинг в DTO). Даты — `YYYY-MM-DD`, время — ISO 8601 UTC, деньги — целые `amount_minor`.

```
POST /auth/login            {email, password}            → 200 {user}  (+ httpOnly cookie)
POST /auth/logout                                         → 204
GET  /auth/me                                             → {id, name, email, workspace_id, roles[]}
GET  /overview                                            → {workspace_id, counts{resources_total, pending_approval, processing, requires_attention}, awaiting_my_decision[], my_active_requests[], recent_requests[], expiring_resources[], recent_events[]}
GET  /resources?q=&category=&has_active=&sort=expires_on|-expires_on|amount_minor|-amount_minor
GET  /resources/:id                                       → {resource, requests[]}
POST /resources/:id/renewals                              → 201 Renewal
GET  /renewals?q=&status=&sort=-created_at|created_at
GET  /renewals/:id                                        → {request, resource, events[]}
POST /renewals/:id/approve | /reject | /retry             → 200 Renewal
GET  /audit-events?resource_id=&type=&from=&to=
```
Resource:
```json
{ "id": "res-a-01", "workspace_id": "alpha", "name": "Хранилище A", "category": "Облачные хранилища",
  "expires_on": "2027-03-01", "amount_minor": 128000, "currency": "RUB",
  "active_request": { "id": "RN-1001", "status": "pending_approval" } }
```
Renewal:
```json
{ "id": "RN-1001", "resource_id": "res-a-01", "resource_name": "Хранилище A", "workspace_id": "alpha",
  "previous_expires_on": "2027-03-01", "new_expires_on": "2027-03-31",
  "amount_minor": 128000, "currency": "RUB", "status": "processing",
  "idempotency_key": "renewal-alpha-rn-1001-x7k2q9",
  "created_by": "u-ini-a", "created_by_name": "Инициатор Alpha", "created_at": "2026-11-12T10:00:00Z",
  "decided_by": "u-apr-a", "decided_by_name": "Согласующий Alpha", "decided_at": "2026-11-12T10:05:00Z",
  "post_attempts": 1, "post_attempts_total": 1, "last_attempt_at": "2026-11-12T10:05:04Z",
  "next_check_at": "2026-11-12T10:05:10Z", "provider_confirmation": "uncertain", "operation_id": null }
```
AuditEvent:
```json
{ "id": "ev-00042", "workspace_id": "alpha", "request_id": "RN-1001", "resource_id": "res-a-01",
  "occurred_at": "2026-11-12T10:05:04Z", "type": "provider_post", "actor_id": null, "actor_name": null,
  "from_status": null, "to_status": null, "result": "503 · результат неопределён", "detail": "POST /renewals · попытка 1 из 3" }
```
Типы событий: `request_created, request_approved, request_rejected, job_enqueued, provider_post, provider_check, provider_confirmed, term_updated, requires_attention, retry_requested`.
Ошибка:
```json
{ "status_code": 409, "error_code": "active_renewal_exists", "message": "У ресурса уже есть активная заявка" }
```
Коды: `unauthenticated, invalid_credentials, role_forbidden, workspace_forbidden, cannot_decide_own_request, resource_not_found, request_not_found, active_renewal_exists, invalid_status_transition, resource_changed, internal_error`. UI показывает `"{status_code} · {message}"` и `error_code` моно.

## 8. Состояния
- **Loading:** скелетон в карточке; заголовок страницы виден сразу. Кнопки действий — busy-лейбл + disabled (защита от двойного клика).
- **Empty:** «В пространстве нет ресурсов», «Заявок пока нет» (+ подсказка по роли), «Событий пока нет»; при фильтрах — «Ничего не найдено» + «Сбросить фильтры».
- **Error:** 5xx — карточка ошибки + «Повторить»; 403/404 на детальной странице или в drawer — ErrorState с `error_code`, без утечки данных.
- **Conflict (409):** в диалоге или форме — inline-alert, диалог остаётся открытым; список обновляется.
- **Uncertain (503):** жёлтый баннер «результат неопределён, проверка по тому же ключу в HH:MM:SS».
- Данные обновляются после действий и шагов обработчика (в проде — polling 2–3 с на `processing` или SSE).

## 9. Datasets
**Core** (контрольный сценарий): Alpha `res-a-01` Хранилище A 2027-03-01 128000; Alpha `res-a-02` Сервис B 2027-05-20 250000; Beta `res-b-01` Сервис C 2027-06-01 150000; 4 обязательные учётки; **ноль заявок**.
**Demo**: Core + 12 ресурсов (итого 15) в Alpha / Beta / Orion: облачные хранилища, базы данных, лицензии, мониторинг, аналитика, резервное копирование, инфраструктура, корпоративные подписки (есть ресурс с очень длинным названием). Заявки во всех 5 статусах: completed RN-0895/RN-0901 (два последовательных продления res-a-03 — текущий срок = итог второй), RN-0907, RN-0909; rejected RN-0902, RN-0910; requires_attention RN-0903 (у симулятора операция есть, started_count 1 — повтор найдёт её через GET); pending RN-0904 (initiator), RN-0905 (universal — сам себе согласовать не может); processing RN-0906 (завершится примерно через 90 с после загрузки). Новые заявки нумеруются с RN-1001 в обоих наборах. В проде: `npm run seed:core` / `seed:demo`, разные БД или схемы.

## 10. Developer / Demo Tools (только прототип)
Набор данных Core/Demo · ответ провайдера «503, затем 200 (как симулятор)» / «Всегда 503 — исчерпание попыток» · задержка проверки после 503 · состояние списков Данные / Загрузка / Пусто / Ошибка 500 · открыть ресурс/заявку по ID (проверка изоляции) · `GET /stats` (`operation_count`, `started_count`) и операции по ключам · «Перезапустить прототип» (reload, задачи продолжаются) · «Сбросить набор данных».
**В продукте не переносится.** Заменяется: env `RETRY_DELAY_MS`; режим отказа — тестовый stub провайдера в интеграционных тестах (настоящий Python-симулятор **не меняется** — первый POST выполняет и отвечает 503, повтор с тем же ключом и телом → 200, тот же ключ с другим телом → 409); рестарт — `docker compose restart api`; состояния UI — Storybook/MSW; demo-режим — отдельный seed и feature flag.

## 11. Accessibility и адаптив
Брейкпоинты: < 1000px — мобильное меню; < 760px — таблицы → карточки. Без горизонтального скролла страницы (таблицы скроллятся внутри карточки), длинные названия переносятся (`overflow-wrap: anywhere`). Drawer и диалог: `aria-modal`, focus trap (Tab/Shift+Tab), Esc, фокус на «✕»/«Отмена» при открытии, возврат фокуса к исходному элементу (если его больше нет — на H1 страницы). При смене маршрута фокус переходит на H1. Все поля с `<label>` или `aria-label`; счётчики результатов `role=status`; ошибки `role=alert`. Зоны нажатия ≥ 44px (тулбар 36–40px).

## 12. User flows и сценарии проверки
Проверено в прототипе (frontend-имитация; **настоящие транзакции, конкурентность и безопасность backend не проверялись**):
1. initiator.alpha → «Заявки» → «Создать заявку» → Хранилище A → RN-1001 `pending_approval`. ✓
2. approver.alpha → RN-1001 → «Согласовать…» → диалог → «Согласовать заявку». ✓
3. POST → симулятор сохраняет операцию, отвечает 503 → баннер «неопределён». ✓
4. Через задержку GET по тому же ключу → 200. ✓
5. `completed`, срок res-a-01 = 31.03.2027. ✓
6. `operation_count = 1`, `started_count = 1`. ✓
7. Повторная обработка завершённой заявки ничего не меняет (`finalize` выходит сразу; кнопки нет). ✓
8. Reject → `rejected`, провайдер не вызывается (stats не меняются). ✓
9. Вторая активная заявка на ресурс невозможна (UI скрывает, API 409). ✓
10. universal.alpha: на своей заявке нет «Согласовать/Отклонить», API → 403 `cannot_decide_own_request`. ✓
11. initiator.beta → `#/requests/RN-1001` и drawer `res-a-01` → 403 `workspace_forbidden`. ✓
12. Режим «Всегда 503» → 3 POST + 3 GET → `requires_attention`. ✓
13. Retry → тот же `idempotency_key`, GET 200 → `completed`; новой операции у провайдера нет. ✓
14. Поиск, фильтры, сортировки, навигация, KPI-ссылки. ✓
15. Счётчики обзора, история и текущие сроки согласованы с данными. ✓
16. Мобильная версия 390px: меню, карточки, детальная страница, диалоги. ✓

Как повторить: Developer / Demo Tools → Core dataset → «Сбросить набор данных» → задержка 2 с → шаги 1–13.
