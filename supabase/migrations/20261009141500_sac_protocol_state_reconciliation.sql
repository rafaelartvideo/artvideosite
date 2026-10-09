begin;

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
      when coalesce((v_info->>'is_att')::boolean,false) then case when nullif(v_operator->>'id','') is not null then 'in_att' else 'inbox' end
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
    sector_id=case when v_info ? 'department' then excluded.sector_id else public.sac_digital_protocols.sector_id end,
    operator_id=case when v_info ? 'operator' then excluded.operator_id else public.sac_digital_protocols.operator_id end,
    operator_name=case when v_info ? 'operator' then excluded.operator_name else public.sac_digital_protocols.operator_name end,
    department_name=case when v_info ? 'department' then excluded.department_name else public.sac_digital_protocols.department_name end,
    status=case
      when excluded.closed_at is not null or public.sac_digital_protocols.closed_at is not null then 'finished'
      when not (v_info ?| array['is_att','is_open','operator','department','closed_at']) then public.sac_digital_protocols.status
      when (case when v_info ? 'operator' then excluded.operator_id else public.sac_digital_protocols.operator_id end) is not null then 'in_att'
      when (case when v_info ? 'department' then excluded.sector_id else public.sac_digital_protocols.sector_id end) is not null
        or coalesce((v_info->>'is_att')::boolean,false) then 'inbox'
      else 'open'
    end,
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


CREATE OR REPLACE FUNCTION private.normalize_sac_digital_protocol_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_info jsonb;
  v_operator jsonb;
  v_department jsonb;
  v_operator_id text;
  v_operator_name text;
  v_department_id text;
  v_department_name text;
  v_is_att boolean := false;
  v_is_open boolean := true;
  v_api_info_changed boolean := false;
  v_att_event_changed boolean := false;
begin
  v_info := coalesce(new.raw_metadata->'api_info','{}'::jsonb);

  if tg_op = 'INSERT' then
    v_api_info_changed := jsonb_typeof(v_info) = 'object' and v_info <> '{}'::jsonb;
    v_att_event_changed := new.raw_metadata->>'event' = 'protocol_in_att';
  else
    v_api_info_changed := (new.raw_metadata->'api_info') is distinct from (old.raw_metadata->'api_info');
    v_att_event_changed :=
      new.raw_metadata->>'event' = 'protocol_in_att'
      and (new.raw_metadata->>'event') is distinct from (old.raw_metadata->>'event');
  end if;

  if v_api_info_changed and jsonb_typeof(v_info) = 'object' then
    v_operator := case
      when jsonb_typeof(v_info->'operator') = 'object' then v_info->'operator'
      else '{}'::jsonb
    end;
    v_department := case
      when jsonb_typeof(v_info->'department') = 'object' then v_info->'department'
      else '{}'::jsonb
    end;

    v_operator_id := nullif(pg_catalog.btrim(coalesce(v_operator->>'id','')), '');
    v_operator_name := nullif(pg_catalog.btrim(coalesce(v_operator->>'name','')), '');
    v_department_id := nullif(pg_catalog.btrim(coalesce(v_department->>'id','')), '');
    v_department_name := nullif(pg_catalog.btrim(coalesce(v_department->>'name','')), '');

    begin
      v_is_att := coalesce((v_info->>'is_att')::boolean,false);
    exception when others then
      v_is_att := false;
    end;
    begin
      v_is_open := coalesce((v_info->>'is_open')::boolean,true);
    exception when others then
      v_is_open := true;
    end;

    if v_info ? 'operator' then
      new.operator_id := v_operator_id;
      new.operator_name := v_operator_name;
    end if;
    if v_info ? 'department' then
      new.sector_id := v_department_id;
      new.department_name := v_department_name;
    end if;

    if v_info ?| array['is_att','is_open','operator','department','closed_at'] then
    new.status := case
      when new.closed_at is not null
        or (v_is_open = false and nullif(v_info->>'closed_at','') is not null)
        then 'finished'
      when new.operator_id is not null
        then 'in_att'
      when new.sector_id is not null or v_is_att
        then 'inbox'
      else 'open'
    end;
    end if;
  end if;

  -- A recado is a message notification, not an instruction to release an Operator.
  if v_att_event_changed
     and new.closed_at is null
     and (
       new.raw_metadata->'operator' = 'false'::jsonb
       or new.raw_metadata->'operator' = 'null'::jsonb
       or new.raw_metadata->'operator' is null
     ) then
    new.status := 'inbox';
    new.operator_id := null;
    new.operator_name := null;
  end if;

  return new;
end;
$function$;


commit;
