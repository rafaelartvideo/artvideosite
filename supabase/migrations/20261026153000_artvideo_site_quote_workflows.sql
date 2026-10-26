begin;

alter table public.quote_requests add column if not exists site_request_kind text;
alter table public.quote_requests drop constraint if exists quote_requests_site_request_kind_check;
alter table public.quote_requests add constraint quote_requests_site_request_kind_check
  check (site_request_kind is null or site_request_kind in ('repair','service'));

update public.quote_requests set site_request_kind=case
  when customer_message ilike '%Tipo de solicitação: Conserto / manutenção de equipamento%' then 'repair'
  else 'service' end
where origin='site' and site_request_kind is null;

create or replace function private.classify_site_quote_request_v1()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if new.origin='site' and new.site_request_kind is null then
   new.site_request_kind:=case
     when new.customer_message ilike '%Tipo de solicitação: Conserto / manutenção de equipamento%' then 'repair'
     else 'service' end;
 end if;
 return new;
end
$fn$;
drop trigger if exists classify_site_quote_request on public.quote_requests;
create trigger classify_site_quote_request before insert on public.quote_requests
for each row execute function private.classify_site_quote_request_v1();

insert into public.request_statuses (organization_id,name,slug,color,sort_order)
select public.artvideo_organization_id(),s.name,s.slug,s.color,s.sort_order
from (values
 ('Aguardando entrega','AGUARDANDO_ENTREGA','#F59E0B',11),
 ('Coleta solicitada','COLETA_PENDENTE','#F59E0B',12),
 ('Coleta agendada','COLETA_AGENDADA','#0284C7',13),
 ('Equipamento recebido','EQUIPAMENTO_RECEBIDO','#10B981',14),
 ('Vinculada à OS','OS_VINCULADA','#10B981',15),
 ('Proposta preparada','PROPOSTA_PREPARADA','#6366F1',21),
 ('Proposta enviada','PROPOSTA_ENVIADA','#0284C7',22),
 ('Aceite confirmado','ACEITO_CLIENTE','#10B981',23),
 ('Encerrada','ENCERRADA','#64748B',90)
) s(name,slug,color,sort_order)
where not exists(select 1 from public.request_statuses r
 where r.organization_id=public.artvideo_organization_id() and r.slug=s.slug);

create table if not exists public.quote_site_workflow_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 quote_request_id uuid not null references public.quote_requests(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 from_status text not null,
 to_status text not null,
 note text,
 created_at timestamptz not null default now()
);
create index if not exists quote_site_workflow_events_lookup on public.quote_site_workflow_events(quote_request_id,created_at desc);
alter table public.quote_site_workflow_events enable row level security;
revoke all on public.quote_site_workflow_events from public,anon,authenticated;
grant select on public.quote_site_workflow_events to authenticated;
create policy quote_site_workflow_events_read on public.quote_site_workflow_events
 for select to authenticated using (
 private.is_organization_module_enabled(organization_id,'quotes')
 and private.can_access_shared_organization_resource(organization_id,'quotes','read')
 and private.has_effective_organization_permission(organization_id,'quotes.view')
 and exists(select 1 from public.quote_requests q
 where q.id=quote_request_id and q.organization_id=organization_id)
);
grant insert on public.quote_site_workflow_events to service_role;

create or replace function public.artvideo_site_quote_advance_v1(
 p_quote_id uuid,p_expected_slug text,p_action text,
 p_note text default null,p_price numeric default null,p_description text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_quote public.quote_requests%rowtype;
 v_current text;
 v_next text;
 v_kind text;
 v_note text:=nullif(btrim(coalesce(p_note,'')),'');
 v_description text:=nullif(btrim(coalesce(p_description,'')),'');
 v_status_id uuid;
begin
 if auth.uid() is null
  or not private.is_organization_module_enabled(public.artvideo_organization_id(),'quotes')
  or not private.can_access_shared_organization_resource(public.artvideo_organization_id(),'quotes','manage')
  or not private.has_effective_organization_permission(public.artvideo_organization_id(),'quotes.status.change')
 then raise exception 'Você não possui permissão para atualizar esta solicitação.' using errcode='42501';
 end if;
 if char_length(coalesce(p_note,''))>1500 or char_length(coalesce(p_description,''))>400
 then raise exception 'Texto excede o limite permitido.' using errcode='22023'; end if;
 select * into v_quote from public.quote_requests q
 where q.id=p_quote_id and q.organization_id=public.artvideo_organization_id() and q.origin='site'
  and q.archived_at is null for update;
 if not found then raise exception 'Solicitação indisponível.' using errcode='P0002'; end if;
 select slug into v_current from public.request_statuses
 where id=v_quote.status_id and organization_id=v_quote.organization_id;
 if v_current is distinct from p_expected_slug
 then raise exception 'A situação mudou. Atualize a página antes de continuar.' using errcode='40001'; end if;
 v_kind:=coalesce(v_quote.site_request_kind,'service');
 v_next:=case
 when p_action='start_analysis' and v_current='PENDENTE' and v_kind='service' then 'EM_ANALISE'
 when p_action='need_info' and v_current='EM_ANALISE' and v_kind='service' then 'AGUARDANDO_CLIENTE'
 when p_action='resume_analysis' and v_current='AGUARDANDO_CLIENTE' and v_kind='service' then 'EM_ANALISE'
 when p_action='prepare_offer' and v_current='EM_ANALISE' and v_kind='service' then 'PROPOSTA_PREPARADA'
 when p_action='record_sent' and v_current='PROPOSTA_PREPARADA' and v_kind='service' then 'PROPOSTA_ENVIADA'
 when p_action='record_acceptance' and v_current='PROPOSTA_ENVIADA' and v_kind='service' then 'ACEITO_CLIENTE'
 when p_action='schedule_service' and v_current='ACEITO_CLIENTE' and v_kind='service' then 'AGENDADO'
 when p_action='finish_service' and v_current='AGENDADO' and v_kind='service' then 'CONCLUIDO'
 when p_action='await_dropoff' and v_current='PENDENTE' and v_kind='repair' then 'AGUARDANDO_ENTREGA'
 when p_action='request_collection' and v_current='PENDENTE' and v_kind='repair' then 'COLETA_PENDENTE'
 when p_action='schedule_collection' and v_current='COLETA_PENDENTE' and v_kind='repair' then 'COLETA_AGENDADA'
 when p_action='receive_equipment' and v_current in ('AGUARDANDO_ENTREGA','COLETA_AGENDADA') and v_kind='repair' then 'EQUIPAMENTO_RECEBIDO'
 when p_action='link_os' and v_current='EQUIPAMENTO_RECEBIDO' and v_kind='repair' then 'OS_VINCULADA'
 when p_action='close' and v_current not in ('CONCLUIDO','CANCELADO','ENCERRADA','OS_VINCULADA') then 'ENCERRADA'
 else null end;
 if v_next is null then raise exception 'Ação incompatível com a situação atual.' using errcode='22023'; end if;
 if p_action in ('need_info','schedule_collection','record_sent','record_acceptance','schedule_service','finish_service','close','receive_equipment')
   and char_length(coalesce(v_note,''))<10
 then raise exception 'Informe uma observação com pelo menos 10 caracteres.' using errcode='22023'; end if;
 if p_action='prepare_offer' then
   if p_price is null or p_price < 0 or p_price > 999999.99 or char_length(coalesce(v_description,''))<10
   then raise exception 'Informe valor e descrição da proposta (mínimo 10 caracteres).' using errcode='22023'; end if;
 end if;
 if p_action='record_sent' and (v_quote.final_price is null or btrim(coalesce(v_quote.proposed_solution,''))='')
 then raise exception 'Prepare uma proposta com preço e descrição antes de registrar o envio.' using errcode='22023'; end if;
 if p_action='link_os' and not exists(select 1 from public.service_orders so
    where so.organization_id=v_quote.organization_id and so.quote_request_id=v_quote.id)
 then raise exception 'Crie a OS vinculada antes de concluir esta etapa.' using errcode='22023'; end if;
 select id into v_status_id from public.request_statuses
   where organization_id=v_quote.organization_id and slug=v_next order by sort_order limit 1;
 if v_status_id is null then raise exception 'Situação não configurada.' using errcode='23514'; end if;
 update public.quote_requests set status_id=v_status_id,
   final_price=case when p_action='prepare_offer' then p_price else final_price end,
   proposed_solution=case when p_action='prepare_offer' then v_description else proposed_solution end
 where id=v_quote.id;
 insert into public.quote_site_workflow_events
  (organization_id,quote_request_id,actor_id,action,from_status,to_status,note)
 values (v_quote.organization_id,v_quote.id,auth.uid(),p_action,v_current,v_next,
   case when p_action='prepare_offer' then 'Proposta preparada para avaliação; ainda não enviada ao cliente.'
   else v_note end);
 return jsonb_build_object('status',v_next,'success',true);
end;
$fn$;
revoke all on function public.artvideo_site_quote_advance_v1(uuid,text,text,text,numeric,text)
from public,anon,authenticated;
grant execute on function public.artvideo_site_quote_advance_v1(uuid,text,text,text,numeric,text) to authenticated;
commit;
