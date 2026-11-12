-- Uniq desativada: remover escrita ativa, rotina agendada, permissões e RPCs.
-- Dados históricos de chamadas mantidos inacessíveis ao cliente até backup auditável.
begin;
do $$
declare v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job
    where jobname = 'uniq-webhook-retention'
       or command ilike '%cleanup_uniq_webhook_events%'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

delete from public.user_permission_overrides
where permission_id in (select id from public.permissions where key = 'tools.uniq.use');
delete from public.role_permissions
where permission_id in (select id from public.permissions where key = 'tools.uniq.use');
delete from public.permissions where key = 'tools.uniq.use';

update public.employees set uniq_subscriber_id = null where uniq_subscriber_id is not null;
update public.entity_employee_details set uniq_subscriber_id = null where uniq_subscriber_id is not null;

revoke all on table public.uniq_calls, public.uniq_call_legs, public.uniq_webhook_events from public, anon, authenticated;
drop function if exists public.observed_uniq_subscribers();
drop function if exists public.set_employee_uniq_subscriber(uuid,text);
drop function if exists public.apply_uniq_call_event(uuid,jsonb);
drop function if exists private.cleanup_uniq_webhook_events();
commit;
