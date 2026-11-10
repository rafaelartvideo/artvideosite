#!/usr/bin/env bash
# NEVER point this runner at a persistent or hosted database.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' ]] || { echo 'Use somente em cluster descartavel.' >&2; exit 2; }
[[ -n "${PGPORT:-}" ]] || { echo 'pg_virtualenv deve definir a porta do cluster temporario.' >&2; exit 2; }
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_tenant_runtime_admission_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_flows_storage_bootstrap.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261110202521_pbx_private_prompts_and_call_flows.sql
PGOPTIONS="${PGOPTIONS:-} -c pbx.disposable=true" psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_flows_database.sql
