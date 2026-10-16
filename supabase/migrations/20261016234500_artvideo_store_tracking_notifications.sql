begin;

-- Código aleatório de 256 bits para consulta pública, disponível apenas
-- ao comprador que possui o link. Não há acesso às tabelas por anon/auth.
create table if not exists public.artvideo_store_tracking_access (
 order_id uuid primary key references public.artvideo_store_orders(id) on delete cascade,
 organization_id uuid not null default public.artvideo_organization_id()
   check(organization_id=public.artvideo_organization_id()),
 tracking_token text not null unique check(tracking_token ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.artvideo_store_tracking_access enable row level security;
revoke all on public.artvideo_store_tracking_access from public, anon, authenticated;
grant select, insert on public.artvideo_store_tracking_access to service_role;

create or replace function public.artvideo_store_create_tracking_v1(p_order_id uuid)
returns text language plpgsql security definer set search_path=''
as $fn$
declare v_token text;
begin
 if not exists(select 1 from public.artvideo_store_orders o
  where o.id=p_order_id and o.organization_id=public.artvideo_organization_id()) then
  raise exception 'Pedido não encontrado.' using errcode='22023';
 end if;
 insert into public.artvideo_store_tracking_access(order_id,tracking_token)
 values(p_order_id,encode(extensions.gen_random_bytes(32),'hex'))
 on conflict(order_id) do nothing;
 select tracking_token into v_token from public.artvideo_store_tracking_access
 where order_id=p_order_id;
 return v_token;
end;
$fn$;
revoke all on function public.artvideo_store_create_tracking_v1(uuid) from public,anon,authenticated;
grant execute on function public.artvideo_store_create_tracking_v1(uuid) to service_role;

-- Histórico persistente de notificações, desacoplado do pagamento e do CRM.
create table if not exists public.artvideo_store_notification_jobs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.artvideo_organization_id()
   check(organization_id=public.artvideo_organization_id()),
 order_id uuid not null references public.artvideo_store_orders(id) on delete restrict,
 event_key text not null,
 event_type text not null check(event_type in (
   'paid','ready','out_for_delivery','delivery_issue','delivered','picked_up')),
 status text not null default 'pending'
   check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 available_at timestamptz not null default now(),
 provider_id text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(event_key)
);
create index if not exists artvideo_store_notification_queue_idx
 on public.artvideo_store_notification_jobs(status,available_at,created_at);
create index if not exists artvideo_store_notification_order_idx
 on public.artvideo_store_notification_jobs(order_id,created_at desc);
alter table public.artvideo_store_notification_jobs enable row level security;
revoke all on public.artvideo_store_notification_jobs from public,anon,authenticated;
grant select on public.artvideo_store_notification_jobs to authenticated;
create policy artvideo_store_notification_staff_read on public.artvideo_store_notification_jobs
 for select to authenticated
 using(organization_id=public.artvideo_organization_id()
 and private.has_artvideo_site_permission('site_settings.view'));

-- Marcado como pago apenas pela reconciliação do Mercado Pago.
create or replace function public.artvideo_store_queue_payment_notice_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if new.status='paid' and old.status is distinct from new.status then
  insert into public.artvideo_store_notification_jobs(order_id,event_key,event_type)
  values(new.id,new.id::text||':paid','paid')
  on conflict(event_key) do nothing;
 end if;
 return new;
end;
$fn$;
drop trigger if exists artvideo_store_payment_notice on public.artvideo_store_orders;
create trigger artvideo_store_payment_notice
 after update of status on public.artvideo_store_orders for each row
 execute function public.artvideo_store_queue_payment_notice_v1();

create or replace function public.artvideo_store_queue_delivery_notice_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if new.to_status in ('ready','out_for_delivery','delivery_issue','delivered','picked_up') then
   insert into public.artvideo_store_notification_jobs(order_id,event_key,event_type)
   values(new.order_id,new.id::text,new.to_status)
   on conflict(event_key) do nothing;
 end if;
 return new;
end;
$fn$;
drop trigger if exists artvideo_store_delivery_notice on public.artvideo_store_fulfillment_events;
create trigger artvideo_store_delivery_notice
 after insert on public.artvideo_store_fulfillment_events for each row
 execute function public.artvideo_store_queue_delivery_notice_v1();

-- Um worker de cada vez reivindica um aviso. Jobs abandonados após 10 min
-- voltam à fila; a chave de idempotência do provedor evita repetições.
create or replace function public.artvideo_store_claim_email_v1(p_order_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 j public.artvideo_store_notification_jobs%rowtype;
 o public.artvideo_store_orders%rowtype;
 v_token text;
begin
 select * into j from public.artvideo_store_notification_jobs
 where (status='pending' and available_at<=now()
   or status='sending' and updated_at<now()-interval '10 minutes')
   and (p_order_id is null or order_id=p_order_id) and attempts<5
 order by created_at
 for update skip locked limit 1;
 if not found then return null; end if;
 update public.artvideo_store_notification_jobs
  set status='sending', attempts=attempts+1, updated_at=now()
  where id=j.id;
 select * into o from public.artvideo_store_orders where id=j.order_id;
 v_token:=public.artvideo_store_create_tracking_v1(j.order_id);
 return jsonb_build_object('job_id',j.id,'event_key',j.event_key,
   'event_type',j.event_type,'order_id',j.order_id,
   'order_number',upper(left(j.order_id::text,8)),
   'buyer_name',left(coalesce(o.buyer->>'buyer_name',''),100),
   'email',left(coalesce(o.buyer->>'buyer_email',''),200),
   'pickup',o.shipping_service_id='pickup',
   'token',v_token);
end;
$fn$;
revoke all on function public.artvideo_store_claim_email_v1(uuid) from public,anon,authenticated;
grant execute on function public.artvideo_store_claim_email_v1(uuid) to service_role;

create or replace function public.artvideo_store_complete_email_v1(
 p_job_id uuid,p_success boolean,p_provider_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path=''
as $fn$
begin
 update public.artvideo_store_notification_jobs set
  status=case when p_success then 'sent'
    when attempts>=5 then 'failed' else 'pending' end,
  provider_id=case when p_success then left(coalesce(p_provider_id,''),160) else null end,
  last_error=case when p_success then null else left(coalesce(p_error,'Falha ao enviar'),240) end,
  sent_at=case when p_success then now() else null end,
  available_at=case when p_success then available_at
    else now()+make_interval(mins=>least(60,5*greatest(1,attempts))) end,
  updated_at=now()
 where id=p_job_id and status='sending';
end;
$fn$;
revoke all on function public.artvideo_store_complete_email_v1(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.artvideo_store_complete_email_v1(uuid,boolean,text,text) to service_role;

-- Somente funcionários autorizados podem solicitar processamento da fila.
create or replace function public.artvideo_store_can_process_notifications_v1()
returns boolean language sql stable security definer set search_path=''
as $fn$
 select auth.uid() is not null and
  private.has_artvideo_site_permission('site_settings.update');
$fn$;
revoke all on function public.artvideo_store_can_process_notifications_v1() from public,anon,authenticated;
grant execute on function public.artvideo_store_can_process_notifications_v1() to authenticated;

commit;