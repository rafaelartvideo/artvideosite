#!/usr/bin/env bash
# Only disposable pg_virtualenv; no hosted database or deployment.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_tenant_runtime_admission_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_sip_trunks_vault_bootstrap.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261111101756_pbx_sip_trunk_registry.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_sip_trunks_database.sql
