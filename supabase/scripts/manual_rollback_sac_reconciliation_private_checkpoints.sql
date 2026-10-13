-- RUN ONLY IF THE USER APPROVES A ROLLBACK.
-- Keep the private checkpoints until the original behavior is restored.
begin;
set local lock_timeout='4s';

create or replace function private.enqueue_sac_digital_reconciliation()
returns void language plpgsql security definer set search_path='' as $$
declare p record;
begin
  for p in
    select s.id,s.organization_id,s.external_protocol_id
    from public.sac_digital_protocols s
    join public.sac_digital_integrations i
      on i.organization_id=s.organization_id and i.enabled=true
    where s.status<>'finished' and s.closed_at is null
    order by s.reconciliation_checked_at nulls first,s.id
    limit 5 for update of s skip locked
  loop
    insert into public.sac_digital_jobs(organization_id,kind,protocol,dedupe_key)
    values(p.organization_id,'reconciliation',p.external_protocol_id,'protocol:'||p.external_protocol_id)
    on conflict(organization_id,dedupe_key) do update set
      generation=public.sac_digital_jobs.generation+1,
      status=case when public.sac_digital_jobs.status='running' then 'running' else 'pending' end,
      available_at=now();
    update public.sac_digital_protocols
    set reconciliation_checked_at=now() where id=p.id;
  end loop;
end $$;
revoke all on function private.enqueue_sac_digital_reconciliation()
from public,anon,authenticated,service_role;

update public.sac_digital_protocols p
set reconciliation_checked_at=checkpoint.checked_at
from private.sac_digital_reconciliation_checks checkpoint
where checkpoint.protocol_id=p.id
  and p.reconciliation_checked_at is distinct from checkpoint.checked_at;
commit;

-- Only after confirming fallback works, optionally drop the unused private
-- sac_digital_reconciliation_checks table and its indexes separately.
