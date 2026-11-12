SHELL := /bin/sh
export COMPOSE_BAKE := false
CORE := docker compose -p renewaldesk-core
TEST := docker compose -p renewaldesk-test -f compose.test.yaml
DEMO := docker compose --env-file .env.demo -p renewaldesk-demo -f compose.yaml -f compose.demo.yaml
.PHONY: env up down logs migrate seed demo test test-integration test-recovery test-e2e test-compose verify lint typecheck build

env:
	sh scripts/init-env.sh
up: env
	$(CORE) up -d --build --wait
# Provider is in-memory: down removes its state. Use stop/restart api worker for recovery.
down:
	$(CORE) down
logs:
	$(CORE) logs -f --tail=100
migrate:
	$(CORE) run --rm migrate
seed:
	$(CORE) run --rm seed
demo:
	sh scripts/init-env.sh .env.demo DATASET=demo WEB_PORT=8081 APP_ORIGIN=http://localhost:8081 PROVIDER_PUBLISH_PORT=18092
	$(DEMO) up -d --build --wait
lint:
	npm run lint
typecheck:
	npm run typecheck
build:
	npm run build
test:
	npm test
test-integration:
	$(TEST) up -d --build --wait
	npm run build -w apps/server
	npm run test:integration
test-recovery:
	$(TEST) up -d --build --wait
	npm run build -w apps/server
	npm run test:recovery
test-e2e:
	$(TEST) up -d --build --wait
	npm run build -w apps/server
	npm run test:e2e
test-compose:
	sh scripts/test-compose.sh
verify: lint typecheck build test test-integration test-e2e test-compose
