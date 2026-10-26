#!/bin/sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
image="postgres:16-alpine"

if ! docker image inspect "$image" >/dev/null 2>&1; then
  printf '%s\n' "Missing local Docker image $image. Pull it explicitly before running this offline test."
  exit 1
fi

docker run --rm \
  --user postgres \
  --volume "$repo_root:/workspace:ro" \
  --entrypoint sh \
  "$image" \
  -ec '
    initdb -D /tmp/pgdata -A trust >/dev/null
    pg_ctl -D /tmp/pgdata -o "-h 127.0.0.1" -w start >/dev/null
    createdb -h 127.0.0.1 guest_claim_test
    psql -h 127.0.0.1 -d guest_claim_test -v ON_ERROR_STOP=1 \
      -f /workspace/supabase/tests/202610260001_optional_checkout_phone_and_guest_claim.postgres.sql
    pg_ctl -D /tmp/pgdata -m fast -w stop >/dev/null
  '
