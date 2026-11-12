# RenewalDesk — обязательные инструкции для Claude Code

## Mission
Реализовать рабочее Fullstack-приложение по заданию компании, с надежностью и понятным UX. Не заменять реализацию генерацией документации или симуляцией. Весь продукт — на вымышленных данных. Дизайн утвержден; не редизайнить.

## Read before editing
- `spec.md` — source of truth для инженерной реализации.
- `references/company/task.pdf` и `references/company/provider_simulator.py` — первичные требования; не менять.
- `references/design/README.md`, HTML и скриншоты — принятый дизайн и сценарии, не production backend.
- `docs/implementation-plan.md`, `docs/progress.md` — текущая задача и завершенные проверки.
- Для соответствующих изменений читать `docs/architecture.md`, `docs/api-contracts.md`, `docs/reliability.md`, `docs/security.md`, `docs/frontend.md`, `docs/testing.md`, `docs/development-workflow.md`.
- `docs/adr/` — принятые решения. Если есть конфликт: PDF и контракт провайдера > spec/инженерные docs > handoff > предположения. Не подменять требования компании.

## Workflow and context recovery
1. В начале сессии и после compaction прочитать `spec.md` и `docs/progress.md`; сверить git status и актуальный этап. Не считать прежние устные утверждения доказательством.
2. Перед реализацией компонента читать профильный документ. Писать небольшой план, реализовывать вертикальными срезами, тестировать, затем обновлять progress. Не переписывать работающие модули без причины.
3. После каждого этапа отметить фактические команды, результаты, файлы, открытые риски, следующий шаг. Статусы: `not_started`, `in_progress`, `blocked`, `verified`, `implemented_unverified`. Не ставить verified без проверок. Не выдумывать результаты.
4. Если нужно изменить спецификацию, добавить уточнение в `spec.md`/соответствующий doc и ADR с датой, контекстом, альтернативами, последствиями. Не менять бизнес-инварианты, стек или дизайн без согласия владельца. Существенные конфликты и destructive actions — запросить решение.
5. `CLAUDE.md` поддерживать актуальным и компактным. Детали держать в `spec.md` и `docs/`, не плодить конкурирующие спецификации. При потере контекста не генерировать новый spec из догадок.

## Non-negotiable engineering rules
- NestJS/TypeScript, PostgreSQL, Sequelize v6 + sequelize-typescript (проверить совместимость), React/TS/Vite, Swagger/OpenAPI + Stoplight Elements, Docker Compose, Jest/Supertest/Playwright. Lockfile, strict TypeScript, lint/format, воспроизводимые сборки.
- Внешние API поля, query, error codes — snake_case. Внутренний TS camelCase допустим. Не сериализовать ORM напрямую; DTO и явное отображение.
- Только миграции изменяют схему; сиды идемпотентны и явно разделены core/demo/test. Не выполнять drop/truncate/reset на рабочей БД без явной команды. Никаких реальных секретов в git, логах, скриншотах или тестах.
- Даты срока — PostgreSQL DATE/ISO `YYYY-MM-DD`, +30 календарных дней, не +1 месяц и не локальные миллисекунды. Деньги — целые копейки, RUB; сервер рассчитывает snapshots.
- Автор и роли определяются сервером из сессии и членства. 401 без авторизации, 403 при чужом пространстве/действии/собственном решении, 409 при конфликте состояния. Не доверять user/role/workspace/amount/dates из клиента.
- Один active renewal на ресурс: partial unique index. Approval + durable job + audit атомарно; reject без provider. Lock ordering и условные переходы; никаких сетевых вызовов в открытой транзакции.
- Provider key/payload immutable; jobs persisted; claim SKIP LOCKED + lease + fencing; счетчик возможных POST persisted до отправки; GET не увеличивает; после 503 выдержать задержку; recovery с тем же ключом; максимум 3 POST reservations на цикл; manual retry того же job. Finalize только по валидированному подтверждению и атомарно с датой/статусом/audit. Не обещать глобальное exactly-once.
- Оригинальный Python-скрипт не менять. Для Docker launcher импортирует Handler и слушает 0.0.0.0. Для fault injection только отдельный test-only stub/proxy. При restart проверке не перезапускать provider/DB.
- Никаких фиктивных production API, localStorage авторизации/данных, demo reset/role switch в обычном UI. Прототип — reference, не runtime dependency.
- Все ошибки и логи безопасны; не логировать пароль, JWT, Cookie, CSRF, секреты, полный provider response; ключ операции доступен только авторизованному workspace для проверки.

## Quality gates
- Прежде чем объявить этап завершенным: lint/typecheck/build и релевантные тесты; интеграционные тесты на реальном PostgreSQL; основной provider scenario на оригинальном симуляторе; реальные конкурентные HTTP запросы; рестарт процесса с сохранением DB/provider. Не подменять обязательные проверки unit-моками.
- Playwright: desktop 1440×900, mobile 390, основные flows и focus/keyboard, фильтры, errors/loading; проверить горизонтальный overflow. Скриншоты в тестовых artifacts, не выдавать handoff за реализованный UI.
- Итог: чистый checkout → команды README → приложение/тесты работают; docs/ADR соответствуют фактам. Отдельно указать непроверенные пункты и ограничения. Деплой и публикация репозитория вне scope без согласия.
