#!/usr/bin/env sh
# Creates an ignored .env from .env.example with random local secrets.
# Usage: scripts/init-env.sh [target-file] [KEY=VALUE overrides...]
set -eu
target="${1:-.env}"
[ "$#" -gt 0 ] && shift
if [ -f "$target" ]; then
  echo "$target already exists; not overwriting" >&2
  exit 0
fi
rand() { openssl rand -hex 32; }
sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(rand)|" \
    -e "s|^CSRF_SECRET=.*|CSRF_SECRET=$(rand)|" \
    .env.example > "$target"
for kv in "$@"; do
  key="${kv%%=*}"
  if grep -q "^${key}=" "$target"; then
    sed -i.bak "s|^${key}=.*|${kv}|" "$target" && rm -f "$target.bak"
  else
    echo "$kv" >> "$target"
  fi
done
chmod 600 "$target"
echo "created $target"
