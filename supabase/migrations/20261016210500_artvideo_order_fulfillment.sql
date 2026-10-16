begin;

-- Operação de entrega exclusiva da Artvideo, separada da situação financeira.
-- Nenhuma operação altera artvideo_store_orders.status ou pagamentos.
create table if not exists public.artvideo_store_fulfillments (
  order_id uuid primary key references public.artvideo_store_orders(id) on delete restrict,
  organization_id uuid not null default public.artvideo_organization_id()
    check (organization_id = public.artvideo_organization_id()),
  status text not null default 'pending'
    check (status in ('pending','preparing','ready','out_for_delivery','delivered','delivery_issue')),
  recipient_name text,
  delivered_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artvideo_fulfillment_recipient_check check
    (recipient_name is null or char_length(recipient_name) <= 120)
);

create table if not exists public.artvideo_store_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id()
    check (organization_id = public.artvideo_organization_id()),
  order_id uuid not null references public.artvideo_store_orders(id) on delete restrict,
  from_status text not null,
  to_status text not null,
  note text,
  recipient_name text,
  actor_id uuid not null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists artvideo_fulfillment_events_order_timeline
  on public.artvideo_store_fulfillment_events(order_id,created_at desc);

alter table public.artvideo_store_fulfillments enable row level security;
alter table public.artvideo_store_fulfillment_events enable row level security;
revoke all on public.artvideo_store_fulfillments from public,anon,authenticated;
revoke all on public.artvideo_store_fulfillment_events from public,anon,authenticated;
grant select on public.artvideo_store_fulfillments to authenticated;
grant select on public.artvideo_store_fulfillment_events to authenticated;

drop policy if exists artvideo_store_fulfillments_staff_select on public.artvideo_store_fulfillments;
create policy artvideo_store_fulfillments_staff_select
 on public.artvideo_store_fulfillments for select to authenticated
 using (organization_id=public.artvideo_organization_id()
   and private.has_artvideo_site_permission('site_settings.view'));

drop policy if exists artvideo_store_fulfillment_events_staff_select on public.artvideo_store_fulfillment_events;
create policy artvideo_store_fulfillment_events_staff_select
 on public.artvideo_store_fulfillment_events for select to authenticated
 using (organization_id=public.artvideo_organization_id()
   and private.has_artvideo_site_permission('site_settings.view'));

-- O servidor impõe os próximos passos. Apenas usuários Artvideo com
-- permissão de atualização podem avançar o pedido já pago pelo gateway.
create or replace function public.artvideo_store_advance_fulfillment_v1(
  p_order_id uuid,
  p_next_status text,
  p_note text default null,
  p_recipient_name text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_order public.artvideo_store_orders%rowtype;
  v_current public.artvideo_store_fulfillments%rowtype;
  v_actor uuid:=auth.uid();
  v_actor_name text;
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_recipient text:=nullif(btrim(coalesce(p_recipient_name,'')),'');
begin
  if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
    raise exception 'Você não tem permissão para atualizar a entrega.' using errcode='42501';
  end if;
  if p_next_status not in
    ('preparing','ready','out_for_delivery','delivered','delivery_issue') then
    raise exception 'Etapa inválida.' using errcode='22023';
  end if;
  if length(coalesce(v_note,''))>500 or length(coalesce(v_recipient,''))>120 then
    raise exception 'Informe uma observação de até 500 caracteres e destinatário de até 120.' using errcode='22023';
  end if;

  select * into v_order from public.artvideo_store_orders
  where id=p_order_id and organization_id=public.artvideo_organization_id()
  for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode='22023'; end if;
  if v_order.status<>'paid' or v_order.paid_at is null then
    raise exception 'O pedido precisa ter o pagamento confirmado antes de preparar a entrega.' using errcode='23514';
  end if;

  insert into public.artvideo_store_fulfillments(order_id,organization_id,status)
    values(v_order.id,v_order.organization_id,'pending')
    on conflict (order_id) do nothing;

  select * into v_current from public.artvideo_store_fulfillments
    where order_id=v_order.id for update;

  if not (
    (v_current.status='pending' and p_next_status='preparing')
    or (v_current.status='preparing' and p_next_status='ready')
    or (v_current.status='ready' and p_next_status in ('preparing','out_for_delivery'))
    or (v_current.status='out_for_delivery' and p_next_status in ('delivered','delivery_issue'))
    or (v_current.status='delivery_issue' and p_next_status='out_for_delivery')
  ) then
    raise exception 'Esta transição não é permitida. Atualize a situação do pedido.' using errcode='23514';
  end if;

  if p_next_status='delivered' and (v_recipient is null or length(v_recipient)<3) then
    raise exception 'Informe o nome de quem recebeu a entrega.' using errcode='22023';
  end if;
  if p_next_status='delivery_issue' and length(coalesce(v_note,''))<10 then
    raise exception 'Descreva a ocorrência com pelo menos 10 caracteres.' using errcode='22023';
  end if;

  update public.artvideo_store_fulfillments
    set status=p_next_status,updated_at=now(),updated_by=v_actor,
      recipient_name=case when p_next_status='delivered' then v_recipient else recipient_name end,
      delivered_at=case when p_next_status='delivered' then now() else delivered_at end
    where order_id=v_order.id;

  select nullif(btrim(full_name),'') into v_actor_name
    from public.profiles where id=v_actor;

  insert into public.artvideo_store_fulfillment_events(
    organization_id,order_id,from_status,to_status,note,recipient_name,actor_id,actor_name
  ) values (
    v_order.organization_id,v_order.id,v_current.status,p_next_status,v_note,
    case when p_next_status='delivered' then v_recipient else null end,
    v_actor,coalesce(v_actor_name,'Colaborador Artvideo')
  );

  return jsonb_build_object(
    'order_id',v_order.id,'status',p_next_status,'updated_at',now()
  );
end;
$function$;

revoke all on function public.artvideo_store_advance_fulfillment_v1(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_advance_fulfillment_v1(uuid,text,text,text)
  to authenticated;

comment on table public.artvideo_store_fulfillments is
 'Etapa logística da venda Artvideo; atualização exclusivamente via RPC após pagamento real.';
comment on table public.artvideo_store_fulfillment_events is
 'Histórico imutável de cada movimentação operacional do pedido Artvideo.';

commit;
