#!/bin/sh
# Own fresh verification project only; never deletes Core/Demo volumes.
set -eu
release_tmp=$(mktemp -d)
RELEASE_PROJECT="renewaldesk-release-$(date +%s)-$$"
RELEASE_ENV_FILE="$release_tmp/.env"
export RELEASE_PROJECT RELEASE_ENV_FILE
export COMPOSE_BAKE=false
mkdir -p artifacts/release
cleanup() {
  docker rm -f "${RELEASE_PROJECT}-ip-holder" >/dev/null 2>&1 || true
  docker compose --env-file "$RELEASE_ENV_FILE" -p "$RELEASE_PROJECT" -f compose.yaml -f compose.release.yaml logs --no-color > artifacts/release/compose.log 2>&1 || true
  docker compose --env-file "$RELEASE_ENV_FILE" -p "$RELEASE_PROJECT" -f compose.yaml -f compose.release.yaml down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$release_tmp"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
sh scripts/init-env.sh "$RELEASE_ENV_FILE" APP_ENV=development DATASET=core \
  WEB_PORT=18082 APP_ORIGIN=http://localhost:18082 PROVIDER_PUBLISH_PORT=18094 RETRY_DELAY_MS=10000
# Secrets live only in a temporary ignored env file, never in uploaded artifacts.
docker compose --env-file "$RELEASE_ENV_FILE" -p "$RELEASE_PROJECT" -f compose.yaml -f compose.release.yaml up -d --build --wait
node scripts/verify-compose.cjs
