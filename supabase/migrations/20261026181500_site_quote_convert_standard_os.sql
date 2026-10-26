-- Converte uma solicitação pública para a OS de orçamento existente no CRM.
-- Cancela solicitações sem criar OS, preservando histórico e dados originais.
begin;

create or replace function public.artvideo_site_quote_convert_to_os_v1(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  v_org uuid:=public.artvideo_organization_id();
  v_quote public.quote_requests%rowtype;
  v_service_type uuid;
  v_status uuid;
  v_link_status uuid;
  v_order_id uuid;
  v_mode text;
  v_address jsonb;
  v_existing uuid;
  v_current text;
begin
  if auth.uid() is null
    or not private.is_organization_module_enabled(v_org,'quotes')
    or not private.can_access_shared_organization_resource(v_org,'quotes','manage')
    or not private.has_effective_organization_permission(v_org,'quotes.convert_to_order')
  then raise exception 'Sem permissão para converter a solicitação.' using errcode='42501'; end if;

  select * into v_quote from public.quote_requests
    where id=p_quote_id and organization_id=v_org and origin='site'
      and archived_at is null for update;
  if not found then raise exception 'Solicitação indisponível.' using errcode='P0002'; end if;

  select id into v_existing from public.service_orders
    where quote_request_id=p_quote_id and organization_id=v_org limit 1;
  if v_existing is not null then
    return jsonb_build_object('success',true,'order_id',v_existing,'already_exists',true);
  end if;

  select slug into v_current from public.request_statuses
    where id=v_quote.status_id and organization_id=v_org;
  if v_current in ('CANCELADO','ENCERRADA','CONCLUIDO')
    then raise exception 'Solicitação encerrada ou cancelada.' using errcode='22023'; end if;

  select id into v_service_type from public.service_types
    where organization_id=v_org and is_active=true and quote_workflow_enabled=true
    order by case when lower(title)='orçamento' then 0 else 1 end,sort_order limit 1;
  if v_service_type is null then
    raise exception 'Configure um tipo de serviço Orçamento ativo no CRM.' using errcode='23514'; end if;
  select id into v_status from public.order_statuses
    where organization_id=v_org order by sort_order limit 1;
  if v_status is null then
    raise exception 'Configure a situação inicial da OS.' using errcode='23514'; end if;

  v_address:=coalesce(v_quote.service_address,'{}'::jsonb);
  v_mode:=case when v_address->>'attendance_mode'='onsite' then 'external' else 'internal' end;
  if v_mode='external' and (
    nullif(v_address->>'street','') is null
    or nullif(v_address->>'city','') is null
    or nullif(v_address->>'state','') is null)
  then raise exception 'Endereço do atendimento incompleto na solicitação.' using errcode='23514'; end if;

  insert into public.service_orders (
    organization_id,customer_id,service_id,service_type_id,quote_request_id,
    status_id,situation_id,customer_notes,brand_id,model,order_type,
    service_zip_code,service_state,service_city,service_neighborhood,
    service_street,service_number,service_complement,service_address_source,
    internal_notes
  ) values (
    v_org,v_quote.customer_id,v_quote.service_id,v_service_type,v_quote.id,
    v_status,null,
    coalesce(nullif(v_quote.issue_reported,''),nullif(v_quote.customer_message,''),'Solicitação de orçamento pelo site'),
    v_quote.brand_id,nullif(v_address->>'equipment_model',''),v_mode,
    case when v_mode='external' then v_address->>'zip_code' end,
    case when v_mode='external' then v_address->>'state' end,
    case when v_mode='external' then v_address->>'city' end,
    case when v_mode='external' then v_address->>'neighborhood' end,
    case when v_mode='external' then v_address->>'street' end,
    case when v_mode='external' then v_address->>'number' end,
    case when v_mode='external' then v_address->>'complement' end,
    case when v_mode='external' then 'custom' end,
    concat_ws(E'\n',
      'Origem: solicitação do site '||coalesce(v_quote.protocol,v_quote.id::text),
      'Modalidade: '||case when v_mode='external' then 'Atendimento no local' else 'Levar à loja' end,
      nullif('Marca: '||coalesce(v_address->>'equipment_brand',''),'Marca: '),
      nullif('Modelo: '||coalesce(v_address->>'equipment_model',''),'Modelo: '),
      case when v_mode='external' and coalesce(v_address->>'preferred_date','')<>'' then
        'Horário preferido (não confirmado): '||v_address->>'preferred_date'||' '||coalesce(v_address->>'preferred_slot','')
      end)
  ) returning id into v_order_id;

  select id into v_link_status from public.request_statuses
    where organization_id=v_org and slug='OS_VINCULADA' limit 1;
  if v_link_status is not null then
    update public.quote_requests set status_id=v_link_status where id=v_quote.id;
  end if;
  insert into public.quote_site_workflow_events
    (organization_id,quote_request_id,actor_id,action,from_status,to_status,note)
  values (v_org,v_quote.id,auth.uid(),'convert_to_os',coalesce(v_current,'PENDENTE'),
    'OS_VINCULADA','Convertida em OS de Orçamento');
  return jsonb_build_object('success',true,'order_id',v_order_id,'already_exists',false);
end;
$fn$;

create or replace function public.artvideo_site_quote_cancel_v1(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  v_org uuid:=public.artvideo_organization_id();
  v_quote public.quote_requests%rowtype;
  v_current text;
  v_cancel uuid;
begin
  if auth.uid() is null
    or not private.is_organization_module_enabled(v_org,'quotes')
    or not private.can_access_shared_organization_resource(v_org,'quotes','manage')
    or not private.has_effective_organization_permission(v_org,'quotes.status.change')
  then raise exception 'Sem permissão para cancelar a solicitação.' using errcode='42501'; end if;
  select * into v_quote from public.quote_requests
    where id=p_quote_id and organization_id=v_org and origin='site'
    and archived_at is null for update;
  if not found then raise exception 'Solicitação não encontrada.' using errcode='P0002'; end if;
  if exists(select 1 from public.service_orders
    where quote_request_id=p_quote_id and organization_id=v_org)
  then raise exception 'Solicitação já convertida. Gerencie pela OS.' using errcode='22023'; end if;
  select slug into v_current from public.request_statuses where id=v_quote.status_id;
  if v_current='CANCELADO' then return jsonb_build_object('success',true,'status','CANCELADO'); end if;
  select id into v_cancel from public.request_statuses
    where organization_id=v_org and slug='CANCELADO' limit 1;
  if v_cancel is null then raise exception 'Situação Cancelado não configurada.' using errcode='23514'; end if;
  update public.quote_requests set status_id=v_cancel where id=v_quote.id;
  insert into public.quote_site_workflow_events
    (organization_id,quote_request_id,actor_id,action,from_status,to_status,note)
  values(v_org,v_quote.id,auth.uid(),'cancel',coalesce(v_current,'PENDENTE'),
    'CANCELADO','Solicitação cancelada pela equipe');
  return jsonb_build_object('success',true,'status','CANCELADO');
end;
$fn$;

revoke all on function public.artvideo_site_quote_convert_to_os_v1(uuid)
  from public,anon,authenticated;
revoke all on function public.artvideo_site_quote_cancel_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.artvideo_site_quote_convert_to_os_v1(uuid) to authenticated;
grant execute on function public.artvideo_site_quote_cancel_v1(uuid) to authenticated;
commit;
