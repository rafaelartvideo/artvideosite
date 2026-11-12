#!/usr/bin/env bash
# Local disposable cluster only. Never connects to Supabase or handles real audio.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_sip_trunks_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261111163048_pbx_managed_sip_history.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_call_flows_storage_bootstrap.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261110202521_pbx_private_prompts_and_call_flows.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261111174408_pbx_automatic_recordings.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_automatic_recordings_database.sql
# Two different exact CDRs compete for 64MiB: each reserves 40MiB.
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_automatic_recordings_quota_fixture.sql
quota_log="$(mktemp)"
trap 'rm -f "$quota_log"' EXIT
psql -X -d postgres -v ON_ERROR_STOP=1 <<'SQL' &
begin;
select public.pbx_prepare_recording_upload(agent_id,jsonb_build_object('call_log_id',first_call,'event_id','quota:1','policy_revision',revision,'scope','internal','size_bytes',41943040,'sha256',repeat('a',64),'duration_seconds',1)) from private.pbx_recording_quota_fixture;
select pg_advisory_xact_lock(918273645);
select pg_sleep(2);
commit;
SQL
first_pid=$!
locked=false
for attempt in $(seq 1 40); do
 if [[ "$(psql -X -d postgres -Atqc "select exists(select 1 from pg_locks where locktype='advisory' and objid=918273645 and granted)")" == 't' ]]; then locked=true; break; fi
 sleep 0.05
done
[[ "$locked" == true ]] || { wait "$first_pid"; exit 1; }
if psql -X -d postgres -v ON_ERROR_STOP=1 >"$quota_log" 2>&1 <<'SQL'
select public.pbx_prepare_recording_upload(agent_id,jsonb_build_object('call_log_id',second_call,'event_id','quota:2','policy_revision',revision,'scope','internal','size_bytes',41943040,'sha256',repeat('b',64),'duration_seconds',1)) from private.pbx_recording_quota_fixture;
SQL
then
 echo 'Concurrent reservations exceeded quota' >&2; exit 1
fi
wait "$first_pid"
grep -q 'Recording quota exceeded' "$quota_log"
psql -X -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$begin if (select count(*) from public.pbx_call_recordings r join private.pbx_recording_quota_fixture f on f.agent_id=r.agent_id)<>1 then raise exception 'Concurrent quota reservation count';end if;end;$$;
SQL
