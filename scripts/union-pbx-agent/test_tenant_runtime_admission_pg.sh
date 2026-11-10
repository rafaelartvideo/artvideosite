#!/usr/bin/env bash
# Run only inside a disposable PostgreSQL cluster, never against production.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' ]] || { echo 'Use somente em cluster descartavel.' >&2; exit 2; }
[[ -n "${PGPORT:-}" ]] || { echo 'pg_virtualenv deve definir a porta do cluster temporario.' >&2; exit 2; }
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
files=(
 scripts/union-pbx-agent/test_tenant_runtime_admission_bootstrap.sql
 supabase/migrations/20261104022003_pbx_extension_registry_foundation.sql
 supabase/migrations/20261104022025_pbx_extension_trigger_ownership_fix.sql
 supabase/migrations/20261104111730_pbx_signed_agent_enrollment.sql
 supabase/migrations/20261104114833_pbx_browser_one_time_credential_handoff.sql
 supabase/migrations/20261104125015_pbx_queue_configuration_and_member_acl.sql
 supabase/migrations/20261104125815_pbx_queue_employee_test_directory.sql
 supabase/migrations/20261104133948_pbx_queue_live_status_snapshots.sql
 supabase/migrations/20261104141218_pbx_inbound_route_plan_inert.sql
 supabase/migrations/20261110010215_pbx_signed_call_history_foundation.sql
 supabase/migrations/20261110015339_pbx_queue_member_availability_controls.sql
 supabase/migrations/20261110021308_pbx_queue_control_generation_order.sql
 supabase/migrations/20261110022733_pbx_call_history_reports.sql
 supabase/migrations/20261110140045_pbx_tenant_runtime_admission.sql
 scripts/union-pbx-agent/test_tenant_runtime_admission_database.sql
)
for file in "${files[@]}"; do
 [[ -f "$file" ]] || exit 2
 psql -X -d postgres -v ON_ERROR_STOP=1 -f "$file"
done
