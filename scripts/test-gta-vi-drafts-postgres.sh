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
    createdb -h 127.0.0.1 gta_vi_drafts_test
    psql -h 127.0.0.1 -d gta_vi_drafts_test -v ON_ERROR_STOP=1 \
      -v expect_slug_conflict=off \
      -f /workspace/supabase/tests/202610270001_gta_vi_xbox_drafts.postgres.sql

    createdb -h 127.0.0.1 gta_vi_slug_conflict_test
    if output="$(psql -h 127.0.0.1 -d gta_vi_slug_conflict_test \
        -v ON_ERROR_STOP=1 -v expect_slug_conflict=on \
        -f /workspace/supabase/tests/202610270001_gta_vi_xbox_drafts.postgres.sql 2>&1)"; then
      printf "%s\n" "Expected GTA VI slug-conflict migration failure, but it succeeded."
      exit 1
    fi
    case "$output" in
      *"GTA VI product IDs/slugs conflict with existing catalog data"*)
        printf "%s\n" "Verified: conflicting GTA VI slug is rejected before migration changes."
        ;;
      *)
        printf "%s\n" "$output"
        printf "%s\n" "Slug-conflict scenario failed for an unexpected reason."
        exit 1
        ;;
    esac

    pg_ctl -D /tmp/pgdata -m fast -w stop >/dev/null
  '
