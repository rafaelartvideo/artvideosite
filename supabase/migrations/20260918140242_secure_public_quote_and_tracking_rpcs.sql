begin;

-- Remove versões públicas antigas do orçamento; permanece uma única assinatura segura.
drop function if exists public.submit_public_quote_request(
  text,text,text,text,text,uuid,uuid,text,text,text,text,text,text,text,text
);
drop function if exists public.submit_public_quote_request(
  text,text,text,text,text,text,text,text,text,text,date,uuid,uuid,text,text,text,text,text,text,text,text,text,text,date
);
drop function if exists public.submit_public_quote_request(
  text,text,text,text,uuid,uuid,text,text,text,text,text,text,text,text,text
);

create or replace function public.submit_public_quote_request(
  p_customer_type text default 'PF',
  p_full_name text default null,
  p_whatsapp text default null,
  p_phone text default null,
  p_birth_date date default null,
  p_email text default null,
  p_document text default null,
  p_trade_name text default null,
  p_legal_name text default null,
  p_cnpj text default null,
  p_state_registration text default null,
  p_foundation_date date default null,
  p_service_id uuid default null,
  p_brand_id uuid default null,
  p_customer_message text default null,
  p_protocol text default null,
  p_zip_code text default null,
  p_street text default null,
  p_number text default null,
  p_complement text default null,
  p_neighborhood text default null,
  p_city text default null,
  p_state text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artvideo_organization_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_customer_id uuid;
  v_status_id uuid;
  v_quote_id uuid;
  v_document text := nullif(regexp_replace(coalesce(p_document,''),'[^0-9]','','g'),'');
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj,''),'[^0-9]','','g'),'');
  v_whatsapp text := nullif(regexp_replace(coalesce(p_whatsapp,''),'[^0-9]','','g'),'');
  v_phone text := nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
  v_is_existing_customer boolean := false;
begin
  if not exists (
    select 1
    from public.organizations organization
    where organization.id = v_artvideo_organization_id
      and organization.status = 'active'
  ) then
    return json_build_object('success',false,'error','O atendimento online está indisponível no momento.');
  end if;

  if p_customer_type not in ('PF','PJ') then
    return json_build_object('success',false,'error','Tipo de cliente inválido.');
  end if;

  if p_customer_type='PF' then
    if v_document is null or length(v_document) <> 11 then
      return json_build_object('success',false,'error','CPF inválido.');
    end if;
    if p_birth_date is null or p_birth_date > current_date then
      return json_build_object('success',false,'error','Data de nascimento inválida.');
    end if;
  else
    if v_cnpj is null or length(v_cnpj) <> 14 then
      return json_build_object('success',false,'error','CNPJ inválido.');
    end if;
    if p_foundation_date is not null and p_foundation_date > current_date then
      return json_build_object('success',false,'error','Data de fundação inválida.');
    end if;
  end if;

  if nullif(btrim(coalesce(p_full_name,'')),'') is null
     and nullif(btrim(coalesce(p_trade_name,'')),'') is null then
    return json_build_object('success',false,'error','Informe o nome do cliente.');
  end if;

  if v_whatsapp is null and v_phone is null then
    return json_build_object('success',false,'error','Informe telefone ou WhatsApp.');
  end if;

  if nullif(btrim(coalesce(p_protocol,'')),'') is null then
    return json_build_object('success',false,'error','Protocolo inválido.');
  end if;

  if p_service_id is not null and not exists (
    select 1 from public.services service
    where service.id=p_service_id
      and service.organization_id=v_artvideo_organization_id
      and service.is_active
  ) then
    return json_build_object('success',false,'error','Serviço inválido ou indisponível.');
  end if;

  if p_brand_id is not null and not exists (
    select 1 from public.brands brand
    where brand.id=p_brand_id
      and brand.organization_id=v_artvideo_organization_id
      and brand.is_active
  ) then
    return json_build_object('success',false,'error','Marca inválida ou indisponível.');
  end if;

  if p_customer_type='PF' then
    select customer.id
      into v_customer_id
    from public.customers customer
    where customer.organization_id=v_artvideo_organization_id
      and regexp_replace(coalesce(customer.document,''),'[^0-9]','','g')=v_document
    order by customer.created_at
    limit 1;
  else
    select customer.id
      into v_customer_id
    from public.customers customer
    where customer.organization_id=v_artvideo_organization_id
      and regexp_replace(coalesce(customer.cnpj,''),'[^0-9]','','g')=v_cnpj
    order by customer.created_at
    limit 1;
  end if;

  v_is_existing_customer := v_customer_id is not null;

  if not v_is_existing_customer then
    insert into public.customers (
      organization_id,customer_type,full_name,whatsapp,email,phone,document,birth_date,
      trade_name,legal_name,cnpj,state_registration,foundation_date
    ) values (
      v_artvideo_organization_id,
      p_customer_type,
      case
        when p_customer_type='PJ'
          then coalesce(nullif(btrim(p_trade_name),''),nullif(btrim(p_legal_name),''))
        else nullif(btrim(p_full_name),'')
      end,
      v_whatsapp,
      nullif(lower(btrim(coalesce(p_email,''))),''),
      v_phone,
      case when p_customer_type='PF' then v_document else null end,
      case when p_customer_type='PF' then p_birth_date else null end,
      case when p_customer_type='PJ' then nullif(btrim(p_trade_name),'') else null end,
      case when p_customer_type='PJ' then nullif(btrim(p_legal_name),'') else null end,
      case when p_customer_type='PJ' then v_cnpj else null end,
      case when p_customer_type='PJ' then nullif(btrim(p_state_registration),'') else null end,
      case when p_customer_type='PJ' then p_foundation_date else null end
    )
    returning id into v_customer_id;

    if nullif(concat_ws('',p_zip_code,p_street,p_number,p_complement,p_neighborhood,p_city,p_state),'') is not null then
      insert into public.customer_addresses (
        organization_id,customer_id,zip_code,street,number,complement,neighborhood,city,state,is_default
      ) values (
        v_artvideo_organization_id,
        v_customer_id,
        nullif(btrim(p_zip_code),''),
        nullif(btrim(p_street),''),
        nullif(btrim(p_number),''),
        nullif(btrim(p_complement),''),
        nullif(btrim(p_neighborhood),''),
        nullif(btrim(p_city),''),
        nullif(upper(btrim(p_state)),''),
        true
      );
    end if;
  end if;

  select status.id
    into v_status_id
  from public.request_statuses status
  where status.organization_id=v_artvideo_organization_id
    and (
      upper(coalesce(status.slug,''))='PENDENTE'
      or lower(coalesce(status.name,'')) like '%pend%'
    )
  order by
    case when upper(coalesce(status.slug,''))='PENDENTE' then 0 else 1 end,
    status.sort_order,
    status.id
  limit 1;

  if v_status_id is null then
    return json_build_object('success',false,'error','Status inicial do orçamento não está configurado.');
  end if;

  insert into public.quote_requests (
    organization_id,customer_id,service_id,brand_id,status_id,customer_message,protocol
  ) values (
    v_artvideo_organization_id,
    v_customer_id,
    p_service_id,
    p_brand_id,
    v_status_id,
    nullif(btrim(coalesce(p_customer_message,'')),''),
    btrim(p_protocol)
  )
  returning id into v_quote_id;

  return json_build_object(
    'success',true,
    'quote_id',v_quote_id,
    'customer_id',v_customer_id,
    'protocol',btrim(p_protocol),
    'existing_customer',v_is_existing_customer
  );
exception
  when unique_violation then
    return json_build_object('success',false,'error','Já existe uma solicitação com este protocolo. Tente novamente.');
  when others then
    return json_build_object('success',false,'error','Não foi possível enviar a solicitação. Tente novamente.');
end;
$$;

revoke all on function public.submit_public_quote_request(
  text,text,text,text,date,text,text,text,text,text,text,date,uuid,uuid,text,text,text,text,text,text,text,text,text
) from public;
grant execute on function public.submit_public_quote_request(
  text,text,text,text,date,text,text,text,text,text,text,date,uuid,uuid,text,text,text,text,text,text,text,text,text
) to anon, authenticated;

-- Rastreamento público: somente ArtVideo e somente dados explicitamente públicos.
create or replace function public.track_service_order(
  p_os_number text,
  p_tracking_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artvideo_organization_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_order record;
  v_history jsonb;
begin
  if nullif(btrim(coalesce(p_os_number,'')),'') is null then
    return null;
  end if;

  select
    service_order.id,
    service_order.os_number,
    service_order.created_at,
    service_order.updated_at,
    service_order.scheduled_at,
    service_order.completed_at,
    coalesce(general_service.name,site_service.title,'Assistência Técnica / Manutenção') as service_title,
    status.name as status_name
  into v_order
  from public.service_orders service_order
  left join public.general_services general_service
    on general_service.id=service_order.general_service_id
   and general_service.organization_id=service_order.organization_id
  left join public.services site_service
    on site_service.id=service_order.service_id
   and site_service.organization_id=v_artvideo_organization_id
  left join public.order_statuses status
    on status.id=service_order.status_id
   and status.organization_id=service_order.organization_id
  where service_order.organization_id=v_artvideo_organization_id
    and upper(service_order.os_number)=upper(btrim(p_os_number))
    and (
      p_tracking_token is null
      or service_order.tracking_token=p_tracking_token
    )
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'created_at',history.created_at,
        'notes',history.notes,
        'order_status',jsonb_build_object('name',status.name)
      )
      order by history.created_at
    ),
    '[]'::jsonb
  )
  into v_history
  from public.service_order_status_history history
  left join public.order_statuses status
    on status.id=history.status_id
   and status.organization_id=v_artvideo_organization_id
  where history.organization_id=v_artvideo_organization_id
    and history.service_order_id=v_order.id
    and history.is_visible_to_customer=true;

  return jsonb_build_object(
    'id',v_order.id,
    'os_number',v_order.os_number,
    'created_at',v_order.created_at,
    'updated_at',v_order.updated_at,
    'status',coalesce(v_order.status_name,'Em andamento'),
    'title',v_order.service_title,
    'estimated_delivery',v_order.scheduled_at,
    'completed_at',v_order.completed_at,
    'history',v_history
  );
end;
$$;

revoke all on function public.track_service_order(text,uuid) from public;
grant execute on function public.track_service_order(text,uuid) to anon, authenticated;

commit;
