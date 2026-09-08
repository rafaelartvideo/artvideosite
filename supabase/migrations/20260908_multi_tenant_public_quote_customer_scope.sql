-- Multiempresa: o site público pertence à ArtVideo.
-- Esta RPC garante que clientes e orçamentos originados do formulário público
-- sejam sempre criados/atualizados dentro da organização ArtVideo e nunca
-- reutilizem registros pertencentes a empresas independentes.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_public_quote_customer_scope', 0)
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
set search_path = public, pg_temp
as $$
declare
  v_artvideo_organization_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_customer_id uuid;
  v_status_id uuid;
  v_quote_id uuid;
  v_address_id uuid;
begin
  if not exists (
    select 1
    from public.organizations organization
    where organization.id = v_artvideo_organization_id
      and organization.status = 'active'
  ) then
    raise exception 'Organização ArtVideo não encontrada ou inativa.';
  end if;

  if p_customer_type not in ('PF', 'PJ') then
    raise exception 'Tipo de cliente inválido.';
  end if;

  if p_customer_type = 'PF'
     and p_document is not null
     and length(regexp_replace(p_document, '[^0-9]', '', 'g')) = 11 then
    select customer.id
      into v_customer_id
    from public.customers customer
    where customer.organization_id = v_artvideo_organization_id
      and regexp_replace(coalesce(customer.document, ''), '[^0-9]', '', 'g') =
          regexp_replace(trim(p_document), '[^0-9]', '', 'g')
    order by customer.created_at
    limit 1;

    if v_customer_id is not null then
      update public.customers
      set customer_type = 'PF',
          full_name = nullif(trim(p_full_name), ''),
          whatsapp = nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), ''),
          phone = nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), ''),
          email = nullif(trim(p_email), ''),
          document = nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), ''),
          birth_date = p_birth_date,
          updated_at = now()
      where id = v_customer_id
        and organization_id = v_artvideo_organization_id;
    end if;
  end if;

  if p_customer_type = 'PJ'
     and p_cnpj is not null
     and trim(p_cnpj) <> '' then
    select customer.id
      into v_customer_id
    from public.customers customer
    where customer.organization_id = v_artvideo_organization_id
      and regexp_replace(coalesce(customer.cnpj, ''), '[^0-9]', '', 'g') =
          regexp_replace(trim(p_cnpj), '[^0-9]', '', 'g')
    order by customer.created_at
    limit 1;

    if v_customer_id is not null then
      update public.customers
      set customer_type = 'PJ',
          full_name = nullif(trim(p_trade_name), ''),
          trade_name = nullif(trim(p_trade_name), ''),
          legal_name = nullif(trim(p_legal_name), ''),
          cnpj = nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), ''),
          state_registration = nullif(trim(p_state_registration), ''),
          foundation_date = p_foundation_date,
          whatsapp = nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), ''),
          phone = nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), ''),
          email = nullif(trim(p_email), ''),
          updated_at = now()
      where id = v_customer_id
        and organization_id = v_artvideo_organization_id;
    end if;
  end if;

  if v_customer_id is null
     and p_whatsapp is not null
     and trim(p_whatsapp) <> '' then
    select customer.id
      into v_customer_id
    from public.customers customer
    where customer.organization_id = v_artvideo_organization_id
      and customer.customer_type = p_customer_type
      and regexp_replace(coalesce(customer.whatsapp, ''), '[^0-9]', '', 'g') =
          regexp_replace(trim(p_whatsapp), '[^0-9]', '', 'g')
    order by customer.created_at
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      organization_id,
      customer_type,
      full_name,
      whatsapp,
      email,
      phone,
      document,
      birth_date,
      trade_name,
      legal_name,
      cnpj,
      state_registration,
      foundation_date
    )
    values (
      v_artvideo_organization_id,
      p_customer_type,
      case when p_customer_type = 'PJ' then nullif(trim(p_trade_name), '') else nullif(trim(p_full_name), '') end,
      nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), ''),
      nullif(trim(p_email), ''),
      nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), ''),
      case when p_customer_type = 'PF' then nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), '') else null end,
      case when p_customer_type = 'PF' then p_birth_date else null end,
      case when p_customer_type = 'PJ' then nullif(trim(p_trade_name), '') else null end,
      case when p_customer_type = 'PJ' then nullif(trim(p_legal_name), '') else null end,
      case when p_customer_type = 'PJ' then nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '') else null end,
      case when p_customer_type = 'PJ' then nullif(trim(p_state_registration), '') else null end,
      case when p_customer_type = 'PJ' then p_foundation_date else null end
    )
    returning id into v_customer_id;
  end if;

  if nullif(concat_ws('', p_zip_code, p_street, p_number, p_complement, p_neighborhood, p_city, p_state), '') is not null then
    select address.id
      into v_address_id
    from public.customer_addresses address
    where address.organization_id = v_artvideo_organization_id
      and address.customer_id = v_customer_id
      and address.is_default = true
    order by address.created_at
    limit 1;

    if v_address_id is null then
      insert into public.customer_addresses (
        organization_id,
        customer_id,
        zip_code,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        is_default
      )
      values (
        v_artvideo_organization_id,
        v_customer_id,
        nullif(trim(p_zip_code), ''),
        nullif(trim(p_street), ''),
        nullif(trim(p_number), ''),
        nullif(trim(p_complement), ''),
        nullif(trim(p_neighborhood), ''),
        nullif(trim(p_city), ''),
        nullif(trim(p_state), ''),
        true
      );
    else
      update public.customer_addresses
      set zip_code = nullif(trim(p_zip_code), ''),
          street = nullif(trim(p_street), ''),
          number = nullif(trim(p_number), ''),
          complement = nullif(trim(p_complement), ''),
          neighborhood = nullif(trim(p_neighborhood), ''),
          city = nullif(trim(p_city), ''),
          state = nullif(trim(p_state), ''),
          updated_at = now()
      where id = v_address_id
        and organization_id = v_artvideo_organization_id;
    end if;
  end if;

  select status.id
    into v_status_id
  from public.request_statuses status
  where lower(status.name) like '%pend%'
  order by status.sort_order
  limit 1;

  insert into public.quote_requests (
    organization_id,
    customer_id,
    service_id,
    brand_id,
    status_id,
    customer_message,
    protocol
  )
  values (
    v_artvideo_organization_id,
    v_customer_id,
    p_service_id,
    p_brand_id,
    v_status_id,
    nullif(trim(p_customer_message), ''),
    p_protocol
  )
  returning id into v_quote_id;

  return json_build_object(
    'success', true,
    'quote_id', v_quote_id,
    'customer_id', v_customer_id,
    'protocol', p_protocol
  );
exception when others then
  return json_build_object(
    'success', false,
    'error', sqlerrm
  );
end;
$$;

revoke all on function public.submit_public_quote_request(
  text, text, text, text, date, text, text, text, text, text, text, date,
  uuid, uuid, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.submit_public_quote_request(
  text, text, text, text, date, text, text, text, text, text, text, date,
  uuid, uuid, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

comment on function public.submit_public_quote_request(
  text, text, text, text, date, text, text, text, text, text, text, date,
  uuid, uuid, text, text, text, text, text, text, text, text, text
) is
  'Recebe orçamento público do site ArtVideo e limita cliente/endereço/orçamento à organização ArtVideo.';

commit;
