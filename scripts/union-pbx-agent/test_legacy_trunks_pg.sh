#!/usr/bin/env bash
# Disposable PostgreSQL only; no hosted access.
set -euo pipefail
[[ "${1:-}" == '--disposable-cluster' && -n "${PGPORT:-}" ]] || exit 2
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$root"
bash scripts/union-pbx-agent/test_sip_trunks_pg.sh --disposable-cluster
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_legacy_trunks_fixture.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261113124416_pbx_legacy_trunk_controls.sql
psql -X -d postgres -v ON_ERROR_STOP=1 -f scripts/union-pbx-agent/test_legacy_trunks_database.sql
# Two transactions cannot both reserve the same canonical account.
claim_log="$(mktemp)"
trap 'rm -f "$claim_log"' EXIT
psql -X -d postgres -v ON_ERROR_STOP=1 <<'SQL' &
begin;
select private.pbx_claim_sip_account('managed','11111111-1111-4111-8111-111111111111','Concurrent.example.com','fixture');
select pg_advisory_xact_lock(786252002);
select pg_sleep(2);
commit;
SQL
first_pid=$!
locked=false
for attempt in $(seq 1 40); do
 if [[ "$(psql -X -d postgres -Atqc "select exists(select 1 from pg_locks where locktype='advisory' and objid=786252002 and granted)")" == 't' ]]; then locked=true; break; fi
 sleep 0.05
done
[[ "$locked" == true ]] || { wait "$first_pid"; exit 1; }
if psql -X -d postgres -v ON_ERROR_STOP=1 >"$claim_log" 2>&1 <<'SQL'
select private.pbx_claim_sip_account('legacy','22222222-2222-4222-8222-222222222222','concurrent.example.com','fixture');
SQL
then
 echo 'Concurrent SIP account reservation accepted' >&2; exit 1
fi
wait "$first_pid"
grep -q 'Conta SIP indisponivel para ativacao' "$claim_log"
psql -X -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$begin if (select count(*) from private.pbx_sip_account_claims where host='concurrent.example.com' and username='fixture')<>1 then raise exception 'Concurrent claim count'; end if; end;$$;
SQL
