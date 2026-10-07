begin;
-- New private upload bucket only; legacy outbox and referenced history are retained.
alter table public.sac_digital_jobs drop constraint sac_digital_jobs_kind_check;
alter table public.sac_digital_jobs add constraint sac_digital_jobs_kind_check check(kind in ('projection','reconciliation','cleanup'));
create or replace function public.sac_digital_orphan_media_candidates(p_organization_id uuid)
returns table(path text) language sql security definer set search_path='' as $$
 select o.name from storage.objects o where o.bucket_id='sac-digital-attachments' and o.name like p_organization_id::text||'/%'
 and o.created_at<now()-interval '7 days'
 and not exists(select 1 from public.sac_digital_messages m where m.organization_id=p_organization_id and m.raw_metadata->>'temp_storage_bucket'=o.bucket_id and m.raw_metadata->>'temp_storage_path'=o.name)
 order by o.created_at limit 50;
$$;
revoke all on function public.sac_digital_orphan_media_candidates(uuid) from public,anon,authenticated;
grant execute on function public.sac_digital_orphan_media_candidates(uuid) to service_role;
create or replace function private.enqueue_sac_digital_maintenance()
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.sac_digital_jobs(organization_id,kind,dedupe_key)
 select organization_id,'cleanup','media-retention' from public.sac_digital_integrations where enabled=true
 on conflict(organization_id,dedupe_key)do update set generation=public.sac_digital_jobs.generation+1,status=case when public.sac_digital_jobs.status='running' then 'running' else 'pending' end,available_at=now();
end $$;
revoke all on function private.enqueue_sac_digital_maintenance() from public,anon,authenticated,service_role;
-- Outgoing provider messages may not produce webhooks. Reconcile active histories in rotation.
alter table public.sac_digital_protocols add column if not exists reconciliation_checked_at timestamptz;
create or replace function private.enqueue_sac_digital_reconciliation()
returns void language plpgsql security definer set search_path='' as $$
declare p record;begin
 for p in select s.id,s.organization_id,s.external_protocol_id from public.sac_digital_protocols s
 join public.sac_digital_integrations i on i.organization_id=s.organization_id and i.enabled=true
 where s.status<>'finished' and s.closed_at is null
 order by s.reconciliation_checked_at nulls first,s.id limit 5 for update of s skip locked loop
  insert into public.sac_digital_jobs(organization_id,kind,protocol,dedupe_key)values(p.organization_id,'reconciliation',p.external_protocol_id,'protocol:'||p.external_protocol_id)
  on conflict(organization_id,dedupe_key)do update set generation=public.sac_digital_jobs.generation+1,status=case when public.sac_digital_jobs.status='running' then 'running' else 'pending' end,available_at=now();
  update public.sac_digital_protocols set reconciliation_checked_at=now()where id=p.id;
 end loop;
end $$;
revoke all on function private.enqueue_sac_digital_reconciliation() from public,anon,authenticated,service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron')then
  perform cron.schedule('sac-digital-media-retention','17 3 * * *','select private.enqueue_sac_digital_maintenance();');
  perform cron.schedule('sac-digital-external-reconciliation','*/5 * * * *','select private.enqueue_sac_digital_reconciliation();');
 end if;
end $$;
commit;
