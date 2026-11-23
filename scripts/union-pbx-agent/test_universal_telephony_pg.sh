#!/usr/bin/env bash
# Explicit disposable PG only. Never reads a hosted URL or invokes deployment.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_call_mode_scopes_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_flows_storage_bootstrap.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261110202521_pbx_private_prompts_and_call_flows.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261122235933_universal_telephony_registry.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_universal_telephony_database.sql
