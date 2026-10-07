begin;

-- SAC Digital: nao escolher arbitrariamente um dos clientes com mesmo telefone.
CREATE OR REPLACE FUNCTION public.apply_sac_digital_protocol_info(p_organization_id uuid, p_protocol text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_info jsonb := coalesce(p_payload->'info', p_payload);
  v_contact jsonb;
  v_channel jsonb;
  v_operator jsonb;
  v_department jsonb;
  v_external_contact_id text;
  v_contact_name text;
  v_contact_phone text;
  v_contact_phone_local text;
  v_customer_id uuid;
  v_contact_id uuid;
  v_protocol_id uuid;
  v_protocol text := nullif(pg_catalog.btrim(coalesce(p_protocol,'')), '');
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Operação exclusiva do backend.' using errcode='42501';
  end if;

  if v_protocol is null then
    raise exception 'Protocolo não informado.' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.organization_modules m
    where m.organization_id=p_organization_id
      and m.module_key='sac_digital'
      and m.is_enabled
  ) then
    raise exception 'Módulo SAC Digital desabilitado para esta empresa.' using errcode='42501';
  end if;

  v_contact := coalesce(v_info->'contact','{}'::jsonb);
  v_channel := coalesce(v_info->'channel','{}'::jsonb);
  v_operator := coalesce(v_info->'operator','{}'::jsonb);
  v_department := coalesce(v_info->'department','{}'::jsonb);

  v_external_contact_id := nullif(pg_catalog.btrim(coalesce(v_contact->>'id','')), '');
  v_contact_name := nullif(pg_catalog.btrim(coalesce(v_contact->>'name','')), '');
  v_contact_phone := regexp_replace(coalesce(v_contact->>'number',''), '[^0-9]', '', 'g');
  if v_contact_phone = '' then v_contact_phone := null; end if;

  if v_contact_phone is not null and left(v_contact_phone,2)='55' and length(v_contact_phone) in (12,13) then
    v_contact_phone_local := substring(v_contact_phone from 3);
  else
    v_contact_phone_local := v_contact_phone;
  end if;

  if v_contact_phone_local is not null then
    -- Vincular automaticamente somente se houver correspondencia unica.
    -- Em caso de ambiguidade, deixar o vinculo para escolha manual.
    select (array_agg(c.id))[1]
      into v_customer_id
    from public.customers c
    cross join lateral (
      select regexp_replace(coalesce(nullif(c.whatsapp,''), nullif(c.phone,''), ''), '[^0-9]', '', 'g') as primary_phone,
             regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g') as phone_digits,
             regexp_replace(coalesce(c.whatsapp,''), '[^0-9]', '', 'g') as whatsapp_digits
    ) n
    where c.organization_id=p_organization_id
      and (
        n.phone_digits = v_contact_phone
        or n.whatsapp_digits = v_contact_phone
        or (left(n.phone_digits,2)='55' and substring(n.phone_digits from 3)=v_contact_phone_local)
        or (left(n.whatsapp_digits,2)='55' and substring(n.whatsapp_digits from 3)=v_contact_phone_local)
        or n.phone_digits = v_contact_phone_local
        or n.whatsapp_digits = v_contact_phone_local
      )
    having count(distinct c.id) = 1;
  end if;

  if v_external_contact_id is not null then
    insert into public.sac_digital_contacts (
      organization_id,
      external_contact_id,
      customer_id,
      name,
      phone,
      raw_metadata,
      updated_at
    ) values (
      p_organization_id,
      v_external_contact_id,
      v_customer_id,
      v_contact_name,
      v_contact_phone,
      v_contact,
      now()
    )
    on conflict (organization_id,external_contact_id) do update set
      customer_id=coalesce(excluded.customer_id,public.sac_digital_contacts.customer_id),
      name=coalesce(excluded.name,public.sac_digital_contacts.name),
      phone=coalesce(excluded.phone,public.sac_digital_contacts.phone),
      raw_metadata=public.sac_digital_contacts.raw_metadata || excluded.raw_metadata,
      updated_at=now()
    returning id into v_contact_id;
  end if;

  insert into public.sac_digital_protocols (
    organization_id,
    external_protocol_id,
    contact_id,
    channel_id,
    channel_number,
    sector_id,
    operator_id,
    operator_name,
    department_name,
    status,
    opened_at,
    closed_at,
    raw_metadata,
    updated_at
  ) values (
    p_organization_id,
    v_protocol,
    v_contact_id,
    nullif(v_channel->>'id',''),
    nullif(regexp_replace(coalesce(v_channel->>'number',''),'[^0-9]','','g'),''),
    nullif(v_department->>'id',''),
    nullif(v_operator->>'id',''),
    nullif(v_operator->>'name',''),
    nullif(v_department->>'name',''),
    case
      when coalesce((v_info->>'is_open')::boolean,false)=false and nullif(v_info->>'closed_at','') is not null then 'finished'
      when coalesce((v_info->>'is_att')::boolean,false) then 'in_att'
      else 'open'
    end,
    case
      when nullif(v_info->>'opened_at','') is not null
        then (v_info->>'opened_at')::timestamp at time zone 'America/Sao_Paulo'
      else null
    end,
    case
      when nullif(v_info->>'closed_at','') is not null
        then (v_info->>'closed_at')::timestamp at time zone 'America/Sao_Paulo'
      else null
    end,
    jsonb_build_object('api_info',v_info),
    now()
  )
  on conflict (organization_id,external_protocol_id) do update set
    contact_id=coalesce(excluded.contact_id,public.sac_digital_protocols.contact_id),
    channel_id=coalesce(excluded.channel_id,public.sac_digital_protocols.channel_id),
    channel_number=coalesce(excluded.channel_number,public.sac_digital_protocols.channel_number),
    sector_id=coalesce(excluded.sector_id,public.sac_digital_protocols.sector_id),
    operator_id=coalesce(excluded.operator_id,public.sac_digital_protocols.operator_id),
    operator_name=coalesce(excluded.operator_name,public.sac_digital_protocols.operator_name),
    department_name=coalesce(excluded.department_name,public.sac_digital_protocols.department_name),
    status=excluded.status,
    opened_at=coalesce(public.sac_digital_protocols.opened_at,excluded.opened_at),
    closed_at=coalesce(excluded.closed_at,public.sac_digital_protocols.closed_at),
    raw_metadata=public.sac_digital_protocols.raw_metadata || excluded.raw_metadata,
    updated_at=now()
  returning id into v_protocol_id;

  return jsonb_build_object(
    'protocol_id',v_protocol_id,
    'contact_id',v_contact_id,
    'customer_id',v_customer_id,
    'customer_linked',v_customer_id is not null,
    'contact_found',v_external_contact_id is not null
  );
end;
$function$;

revoke all on function public.apply_sac_digital_protocol_info(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_sac_digital_protocol_info(uuid,text,jsonb) to service_role;

commit;
