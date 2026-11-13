#!/usr/bin/env bash
# Disposable PostgreSQL only; no hosted access.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_legacy_trunks_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_modes_fixture.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261113133131_pbx_extension_call_modes.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_modes_database.sql
