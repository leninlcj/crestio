#!/usr/bin/env bash
# Runs an agency migration against a throwaway local PostgreSQL cluster and
# exercises its triggers. Needs the postgresql server binaries on the machine
# (brew install postgresql@16 on a Mac; apt install postgresql on Linux).
#
#   scripts/dev/migration-harness/run.sh supabase/migrations/20260906_agency_chunk5.sql [more.sql ...]
#
# Each migration is applied twice, in order, to prove it is idempotent, then
# the scenarios in scenarios.sql run. Nothing here touches Supabase.
set -euo pipefail

[ "$#" -ge 1 ] || { echo "usage: $0 migration.sql [more.sql ...]" >&2; exit 2; }
MIGRATIONS=("$@")
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | tail -1)")}"
DATA="$(mktemp -d /tmp/crestio-pg.XXXXXX)"
PORT="${PGPORT:-54329}"
export PGHOST=localhost PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres

cleanup() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

RUNAS=""
if [ "$(id -u)" = "0" ]; then
  # initdb refuses to run as root; hand the cluster to the postgres user.
  RUNAS="runuser -u postgres --"
  chown postgres "$DATA"
fi

$RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=localhost" -l "$DATA/log" start >/dev/null
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q && break; sleep 0.5; done

psql -v ON_ERROR_STOP=1 -q -f "$HERE/stub-schema.sql"
echo "stub schema loaded"
for MIGRATION in "${MIGRATIONS[@]}"; do
  psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION"
  echo "$(basename "$MIGRATION") applied (1st run)"
  psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION"
  echo "$(basename "$MIGRATION") applied (2nd run: idempotent)"
done
psql -v ON_ERROR_STOP=1 -q -f "$HERE/scenarios.sql" 2>&1 | sed 's/^psql:.*NOTICE:  //'
