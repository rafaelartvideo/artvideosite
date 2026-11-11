#!/usr/bin/env bash
# Only disposable pg_virtualenv; never a hosted or persistent database.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_sip_trunks_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261111163048_pbx_managed_sip_history.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_managed_sip_history_database.sql
