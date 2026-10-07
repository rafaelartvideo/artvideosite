begin;
-- Optional HTTP scheduler, authorized explicitly for durable reconciliation recovery.
create schema if not exists private;
create table if not exists private.sac_digital_worker_credentials (
 singleton boolean primary key default true check(singleton),
 token text not null check(length(token)=64),created_at timestamptz not null default now()
);
alter table private.sac_digital_worker_credentials enable row level security;
revoke all on private.sac_digital_worker_credentials from public,anon,authenticated,service_role;
insert into private.sac_digital_worker_credentials(singleton,token)
values(true,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')) on conflict do nothing;
create or replace function public.verify_sac_digital_worker_token(p_token text)
returns boolean language sql security definer set search_path='' as $$
 select coalesce(length(p_token)=64 and exists(select 1 from private.sac_digital_worker_credentials where token=p_token),false);
$$;
revoke all on function public.verify_sac_digital_worker_token(text) from public,anon,authenticated;
grant execute on function public.verify_sac_digital_worker_token(text) to service_role;
-- Extension installation is optional; unavailable deployments retain SQL-only projection recovery.
do $$begin
 if not exists(select 1 from pg_extension where extname='pg_net') and exists(select 1 from pg_available_extensions where name='pg_net') then
   begin execute 'create extension pg_net'; exception when insufficient_privilege or feature_not_supported then raise notice 'SAC worker HTTP scheduler unavailable; external service-role scheduler required'; end;
 end if;
end $$;
create or replace function private.schedule_sac_digital_worker()
returns void language plpgsql security definer set search_path='' as $$
declare v_token text;begin
 if not exists(select 1 from pg_extension where extname='pg_net') then return; end if;
 if not exists(select 1 from public.sac_digital_jobs where (status='pending' and available_at<=now()) or (status='running' and lease_until<now())) then return; end if;
 select token into v_token from private.sac_digital_worker_credentials where singleton=true;
 -- Private header is never returned to the caller. The URL is fixed, not caller-controlled.
 execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
 using 'https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/sac-digital-worker',
 jsonb_build_object('Content-Type','application/json','x-sac-worker-key',v_token),jsonb_build_object('limit',1);
end $$;
revoke all on function private.schedule_sac_digital_worker() from public,anon,authenticated,service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
   perform cron.schedule('sac-digital-worker-recovery','* * * * *','select private.schedule_sac_digital_worker();');
 else raise notice 'SAC reconciliation requires external service-role worker scheduler: pg_cron/pg_net unavailable'; end if;
end $$;
commit;
