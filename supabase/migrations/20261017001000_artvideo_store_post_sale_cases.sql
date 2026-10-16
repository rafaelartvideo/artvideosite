begin;

-- Notificações automáticas pausadas por decisão da Artvideo.
-- Os dados históricos da fila permanecem disponíveis, mas novos avisos
-- não são mais agendados automaticamente.
drop trigger if exists artvideo_store_payment_notice on public.artvideo_store_orders;
drop trigger if exists artvideo_store_delivery_notice on public.artvideo_store_fulfillment_events;

create table if not exists public.artvideo_store_support_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id()
    check (organization_id=public.artvideo_organization_id()),
  order_id uuid not null references public.artvideo_store_orders(id) on delete restrict,
  request_type text not null check(request_type in ('cancellation','exchange','return')),
  status text not null default 'open'
    check(status in ('open','in_review','approved','rejected','closed')),
  reason text not null check(char_length(btrim(reason)) between 10 and 1200),
  opened_by text not null check(opened_by in ('customer','staff')),
  opened_by_user uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists artvideo_support_one_open_case_per_order
  on public.artvideo_store_support_cases(order_id)
  where status in ('open','in_review','approved');
create index if not exists artvideo_store_support_recent_idx
  on public.artvideo_store_support_cases(organization_id,created_at desc);

create table if not exists public.artvideo_store_support_case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id()
    check(organization_id=public.artvideo_organization_id()),
  case_id uuid not null references public.artvideo_store_support_cases(id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_type text not null check(actor_type in ('customer','staff')),
  actor_id uuid,
  actor_name text,
  public_note text check(public_note is null or length(public_note)<=1200),
  internal_note text check(internal_note is null or length(internal_note)<=1500),
  created_at timestamptz not null default now()
);
create index if not exists artvideo_store_support_events_timeline
  on public.artvideo_store_support_case_events(case_id,created_at);

alter table public.artvideo_store_support_cases enable row level security;
alter table public.artvideo_store_support_case_events enable row level security;
revoke all on public.artvideo_store_support_cases from public,anon,authenticated;
revoke all on public.artvideo_store_support_case_events from public,anon,authenticated;
grant select on public.artvideo_store_support_cases to authenticated;
grant select on public.artvideo_store_support_case_events to authenticated;

drop policy if exists artvideo_store_support_cases_staff_read on public.artvideo_store_support_cases;
create policy artvideo_store_support_cases_staff_read
  on public.artvideo_store_support_cases for select to authenticated
  using(organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.view'));
drop policy if exists artvideo_store_support_events_staff_read on public.artvideo_store_support_case_events;
create policy artvideo_store_support_events_staff_read
  on public.artvideo_store_support_case_events for select to authenticated
  using(organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.view')
    and exists(select 1 from public.artvideo_store_support_cases c
      where c.id=case_id and c.organization_id=organization_id));

-- Serviço interno: token secreto prova acesso ao pedido, sem login;
-- o status da compra e o estoque nunca são alterados por solicitações.
create or replace function public.artvideo_store_request_support_v1(
 p_token text,p_type text,p_reason text
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v_order public.artvideo_store_orders%rowtype;
 v_case_id uuid;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$'
   or p_type not in ('cancellation','exchange','return')
   or length(v_reason) not between 10 and 1200 then
   raise exception 'Dados de solicitação inválidos.' using errcode='22023';
 end if;
 select o.* into v_order from public.artvideo_store_orders o
   join public.artvideo_store_tracking_access t on t.order_id=o.id
   where t.tracking_token=p_token and o.organization_id=public.artvideo_organization_id()
   for update of o;
 if not found then raise exception 'Acesso ao pedido inválido.' using errcode='22023'; end if;
 if v_order.status not in ('paid','awaiting_payment')
   or (p_type<>'cancellation' and v_order.status<>'paid') then
   raise exception 'Esta solicitação não está disponível para a situação do pedido.' using errcode='23514';
 end if;
 if (select count(*) from public.artvideo_store_support_cases where order_id=v_order.id)>=5 then
   raise exception 'Limite de solicitações atingido. Entre em contato com a Artvideo.' using errcode='23514';
 end if;
 if exists(select 1 from public.artvideo_store_support_cases
    where order_id=v_order.id and status in ('open','in_review','approved')) then
   raise exception 'Já existe uma solicitação em andamento para este pedido.' using errcode='23514';
 end if;
 insert into public.artvideo_store_support_cases
   (order_id,organization_id,request_type,reason,opened_by)
 values(v_order.id,v_order.organization_id,p_type,v_reason,'customer')
 returning id into v_case_id;
 insert into public.artvideo_store_support_case_events
   (organization_id,case_id,to_status,actor_type,public_note)
 values(v_order.organization_id,v_case_id,'open','customer','Solicitação recebida pela Artvideo.');
 return jsonb_build_object('id',v_case_id,'status','open','type',p_type);
end;
$fn$;
revoke all on function public.artvideo_store_request_support_v1(text,text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_request_support_v1(text,text,text) to service_role;

create or replace function public.artvideo_store_open_support_staff_v1(
 p_order_id uuid,p_type text,p_reason text
) returns uuid language plpgsql security definer set search_path=''
as $fn$
declare
 v_order public.artvideo_store_orders%rowtype;
 v_case uuid;
 v_actor uuid:=auth.uid();
 v_name text;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
   raise exception 'Sem permissão para registrar a solicitação.' using errcode='42501';
 end if;
 if p_type not in ('cancellation','exchange','return')
   or length(v_reason) not between 10 and 1200 then
   raise exception 'Informe o tipo e o motivo da solicitação.' using errcode='22023';
 end if;
 select * into v_order from public.artvideo_store_orders
   where id=p_order_id and organization_id=public.artvideo_organization_id()
   for update;
 if not found or v_order.status not in ('paid','awaiting_payment')
   or (p_type<>'cancellation' and v_order.status<>'paid') then
   raise exception 'Pedido não permite esta solicitação.' using errcode='23514';
 end if;
 if exists(select 1 from public.artvideo_store_support_cases
   where order_id=v_order.id and status in ('open','in_review','approved')) then
   raise exception 'Já existe uma solicitação em andamento.' using errcode='23514';
 end if;
 if (select count(*) from public.artvideo_store_support_cases where order_id=v_order.id)>=5 then
   raise exception 'Limite de solicitações do pedido atingido.' using errcode='23514';
 end if;
 select nullif(btrim(full_name),'') into v_name from public.profiles where id=v_actor;
 insert into public.artvideo_store_support_cases
  (organization_id,order_id,request_type,reason,opened_by,opened_by_user)
 values(v_order.organization_id,v_order.id,p_type,v_reason,'staff',v_actor)
 returning id into v_case;
 insert into public.artvideo_store_support_case_events
   (organization_id,case_id,to_status,actor_type,actor_id,actor_name,public_note)
 values(v_order.organization_id,v_case,'open','staff',v_actor,
    coalesce(v_name,'Colaborador Artvideo'),'Solicitação registrada para análise.');
 return v_case;
end;
$fn$;
revoke all on function public.artvideo_store_open_support_staff_v1(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_open_support_staff_v1(uuid,text,text) to authenticated;

-- O CRM pode registrar apenas o parecer da solicitação. Aprovação NÃO
-- reembolsa pagamentos, cancela transações, nem altera o inventário.
create or replace function public.artvideo_store_review_support_v1(
 p_case_id uuid,p_next_status text,p_public_note text default null,p_internal_note text default null
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v_case public.artvideo_store_support_cases%rowtype;
 v_actor uuid:=auth.uid();
 v_name text;
 v_public text:=nullif(btrim(coalesce(p_public_note,'')),'');
 v_private text:=nullif(btrim(coalesce(p_internal_note,'')),'');
begin
 if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
   raise exception 'Sem permissão para analisar esta solicitação.' using errcode='42501';
 end if;
 if length(coalesce(v_public,''))>1200 or length(coalesce(v_private,''))>1500 then
   raise exception 'Uma das observações ultrapassou o limite.' using errcode='22023';
 end if;
 select * into v_case from public.artvideo_store_support_cases
   where id=p_case_id and organization_id=public.artvideo_organization_id() for update;
 if not found then raise exception 'Solicitação não encontrada.' using errcode='22023'; end if;
 if not ((v_case.status='open' and p_next_status in ('in_review','rejected'))
    or (v_case.status='in_review' and p_next_status in ('approved','rejected'))
    or (v_case.status='approved' and p_next_status='closed')) then
   raise exception 'Mudança de situação não permitida.' using errcode='23514';
 end if;
 if p_next_status in ('approved','rejected','closed')
   and length(coalesce(v_public,''))<10 then
   raise exception 'Descreva a decisão para o cliente (mínimo 10 caracteres).' using errcode='22023';
 end if;
 select nullif(btrim(full_name),'') into v_name from public.profiles where id=v_actor;
 update public.artvideo_store_support_cases set status=p_next_status,updated_at=now()
  where id=v_case.id;
 insert into public.artvideo_store_support_case_events
   (organization_id,case_id,from_status,to_status,actor_type,
    actor_id,actor_name,public_note,internal_note)
 values(v_case.organization_id,v_case.id,v_case.status,p_next_status,'staff',
   v_actor,coalesce(v_name,'Colaborador Artvideo'),v_public,v_private);
 return jsonb_build_object('id',v_case.id,'status',p_next_status);
end;
$fn$;
revoke all on function public.artvideo_store_review_support_v1(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_review_support_v1(uuid,text,text,text) to authenticated;

commit;