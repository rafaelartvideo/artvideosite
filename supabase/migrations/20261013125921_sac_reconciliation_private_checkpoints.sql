-- Move rotation checkpoints into private storage, away from Realtime-published
-- sac_digital_protocols. Inbox users only need actual protocol changes.
-- Preserves scheduling: still checks 5 active protocols per 5 min.
create table if not exists private.sac_digital_reconciliation_checks (
  protocol_id uuid primary key
    references public.sac_digital_protocols(id) on delete cascade,
  checked_at timestamptz not null
);
revoke all on private.sac_digital_reconciliation_checks
from public,anon,authenticated,service_role;

insert into private.sac_digital_reconciliation_checks(protocol_id,checked_at)
select id,reconciliation_checked_at
from public.sac_digital_protocols
where status<>'finished' and closed_at is null
  and reconciliation_checked_at is not null
on conflict(protocol_id) do nothing;

create index if not exists sac_digital_reconciliation_checks_checked_idx
on private.sac_digital_reconciliation_checks(checked_at,protocol_id);

create or replace function private.enqueue_sac_digital_reconciliation()
returns void language plpgsql security definer set search_path='' as $$
declare p record;
begin
  for p in
    select s.id,s.organization_id,s.external_protocol_id
    from public.sac_digital_protocols s
    join public.sac_digital_integrations i
      on i.organization_id=s.organization_id and i.enabled=true
    left join private.sac_digital_reconciliation_checks checkpoint
      on checkpoint.protocol_id=s.id
    where s.status<>'finished' and s.closed_at is null
    order by checkpoint.checked_at nulls first,s.id
    limit 5
    for update of s skip locked
  loop
    insert into public.sac_digital_jobs(organization_id,kind,protocol,dedupe_key)
    values(p.organization_id,'reconciliation',p.external_protocol_id,'protocol:'||p.external_protocol_id)
    on conflict(organization_id,dedupe_key) do update set
      generation=public.sac_digital_jobs.generation+1,
      status=case when public.sac_digital_jobs.status='running' then 'running' else 'pending' end,
      available_at=now();
    insert into private.sac_digital_reconciliation_checks(protocol_id,checked_at)
    values(p.id,now())
    on conflict(protocol_id) do update set checked_at=excluded.checked_at;
  end loop;
end $$;
revoke all on function private.enqueue_sac_digital_reconciliation()
from public,anon,authenticated,service_role;
