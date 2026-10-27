-- Registrar somente estado e nomes das restricoes de falha no log privado; nao exibir dados pessoais.\n
CREATE OR REPLACE FUNCTION public.submit_public_quote_request(p_customer_type text DEFAULT 'PF'::text, p_full_name text DEFAULT NULL::text, p_whatsapp text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_birth_date date DEFAULT NULL::date, p_email text DEFAULT NULL::text, p_document text DEFAULT NULL::text, p_trade_name text DEFAULT NULL::text, p_legal_name text DEFAULT NULL::text, p_cnpj text DEFAULT NULL::text, p_state_registration text DEFAULT NULL::text, p_foundation_date date DEFAULT NULL::date, p_service_id uuid DEFAULT NULL::uuid, p_brand_id uuid DEFAULT NULL::uuid, p_customer_message text DEFAULT NULL::text, p_protocol text DEFAULT NULL::text, p_zip_code text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_number text DEFAULT NULL::text, p_complement text DEFAULT NULL::text, p_neighborhood text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_artvideo_organization_id constant uuid := public.artvideo_organization_id();
  v_customer_id uuid;
  v_status_id uuid;
  v_quote_id uuid;
  v_document text := nullif(regexp_replace(coalesce(p_document,''),'[^0-9]','','g'),'');
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj,''),'[^0-9]','','g'),'');
  v_whatsapp text := nullif(regexp_replace(coalesce(p_whatsapp,''),'[^0-9]','','g'),'');
  v_phone text := nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
  v_is_existing_customer boolean := false;
  v_debug_sqlstate text;
  v_debug_constraint text;
  v_debug_table text;
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
    get stacked diagnostics
      v_debug_sqlstate = returned_sqlstate,
      v_debug_constraint = constraint_name,
      v_debug_table = table_name;
    -- Interno: não inclui valores pessoais e não expõe detalhes ao cliente.
    raise log 'artvideo public quote submission failed: sqlstate=%, constraint=%, table=%',
      v_debug_sqlstate, v_debug_constraint, v_debug_table;
    return json_build_object('success',false,'error','Não foi possível enviar a solicitação. Tente novamente.');
end;
$function$
;
