#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_call_modes_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into private.pbx_call_mode_generations(organization_id) select org from private.pbx_call_modes_test_fixture on conflict do nothing;
insert into private.pbx_extension_call_modes(extension_id,organization_id,mode,applied_mode,status) select manual,org,'receive_only','make_only','pending' from private.pbx_call_modes_test_fixture;
SQL
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261113144405_pbx_separate_internal_external_call_modes.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_mode_scopes_database.sql
