begin;
-- Index the scoped exact lookup; no scans across all organizations.
create index if not exists entity_contacts_active_whatsapp_digits_idx
  on public.entity_contacts (organization_id, (regexp_replace(coalesce(whatsapp,''),'[^0-9]','','g'))) where is_active;
create index if not exists entity_contacts_active_phone_digits_idx
  on public.entity_contacts (organization_id, (regexp_replace(coalesce(phone,''),'[^0-9]','','g'))) where is_active;
create index if not exists union_whatsapp_crm_verification_provider_phone_idx
  on public.union_whatsapp_crm_number_verifications (organization_id,provider_phone_e164);

-- Keep Union WhatsApp / PBX CRM lookups compatible with Brazilian mobile
-- numbers registered with or without the ninth digit. Match exact numbers
-- first; an ambiguous alias must never link to an arbitrary customer.
create or replace function public.union_whatsapp_find_customer_by_phone(
  p_organization uuid, p_phone text
)
returns table(customer_id uuid, customer_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with sought as (
    select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as digits
  ),
  target as (
    select case when length(digits) in (12,13) and left(digits,2)='55'
      then substring(digits from 3) else digits end as phone
    from sought
  ),
  variants as (
    -- The original number always takes precedence over a ninth-digit alias.
    select phone, 0 as preference
    from target where phone ~ '^[1-9][0-9][0-9]{8,9}$'
    union all
    -- 11-digit Brazilian mobile: remove only the 9 immediately after DDD.
    select left(phone,2) || substring(phone from 4), 1
    from target where phone ~ '^[1-9][0-9]9[6-9][0-9]{7}$'
    union all
    -- Older 10-digit mobile: insert the ninth digit immediately after DDD.
    select left(phone,2) || '9' || substring(phone from 3), 1
    from target where phone ~ '^[1-9][0-9][6-9][0-9]{7}$'
  ),
  cleaned as (
    select c.id, c.full_name,
      regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g') as wa,
      regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') as phone
    from public.customers c
    where c.organization_id = p_organization
  ),
  normalized as (
    select id, full_name,
      case when length(wa) in (12,13) and left(wa,2)='55'
        then substring(wa from 3) else wa end as wa,
      case when length(phone) in (12,13) and left(phone,2)='55'
        then substring(phone from 3) else phone end as phone
    from cleaned
  ),
  primary_matches as (
    select n.id, n.full_name, min(v.preference) as preference
    from normalized n
    join variants v on n.wa = v.phone or n.phone = v.phone
    group by n.id, n.full_name
  ),
  contact_candidates as (
    -- For additional contacts only exact numbers or aliases confirmed by the
    -- provider are used. Never infer a ninth digit for another person.
    select phone, 0 as preference from target where phone ~ '^[1-9][0-9][0-9]{8,9}
  select m.id, coalesce(nullif(btrim(m.full_name),''),'Cliente')
  from matches m
  where m.preference = (select min(preference) from matches)
  order by m.id
  limit 2;
$$;
revoke all on function public.union_whatsapp_find_customer_by_phone(uuid,text) from public,anon,authenticated;
grant execute on function public.union_whatsapp_find_customer_by_phone(uuid,text) to service_role;
comment on function public.union_whatsapp_find_customer_by_phone(uuid,text) is
  'Private tenant-scoped CRM lookup of customer and active additional contacts. Exact matches precede aliases; ambiguity returns two matches.';

    union
    select substring(v.phone_e164 from 3), 1
    from target t join public.union_whatsapp_crm_number_verifications v
      on v.organization_id=p_organization and v.provider_phone_e164='55'||t.phone
    where v.phone_e164<>v.provider_phone_e164
  ),
  additional_matches as (
    select c.id, c.full_name, min(v.preference) as preference
    from contact_candidates v
    join public.entity_contacts ec on ec.organization_id=p_organization and ec.is_active
      and (
        regexp_replace(coalesce(ec.whatsapp,''),'[^0-9]','','g') in (v.phone,'55'||v.phone)
        or regexp_replace(coalesce(ec.phone,''),'[^0-9]','','g') in (v.phone,'55'||v.phone)
      )
    join public.entities e on e.id=ec.entity_id and e.organization_id=ec.organization_id
      and e.is_active
    join public.customers c on c.id=e.legacy_customer_id and c.organization_id=e.organization_id
    group by c.id,c.full_name
  ),
  matches as (
    select candidate.id,candidate.full_name,min(candidate.preference) as preference
    from (select * from primary_matches union all select * from additional_matches) candidate
    group by candidate.id,candidate.full_name
  )
  select m.id, coalesce(nullif(btrim(m.full_name),''),'Cliente')
  from matches m
  where m.preference = (select min(preference) from matches)
  order by m.id
  limit 2;
$$;
revoke all on function public.union_whatsapp_find_customer_by_phone(uuid,text) from public,anon,authenticated;
grant execute on function public.union_whatsapp_find_customer_by_phone(uuid,text) to service_role;
comment on function public.union_whatsapp_find_customer_by_phone(uuid,text) is
  'Private tenant-scoped CRM lookup. Match exact numbers first, then Brazilian mobile aliases with/without the ninth digit; return two matches on ambiguity.';


-- One transaction for a contact added from the inbox. Existing address-book
-- identities are reused, never renamed or assigned to another CRM record.
create or replace function public.union_whatsapp_create_registration_contact(
  p_organization uuid,p_entity uuid,p_actor uuid,p_channel uuid,
  p_account_phone text,p_jid text,p_phone text,p_provider_phone text,
  p_name text,p_job_title text
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner public.entities%rowtype;
  v_contact_id uuid;
  v_agenda_id uuid;
  v_actor_name text;
  v_numbers text[];
begin
  if p_organization is null or p_entity is null or p_actor is null
    or coalesce(p_phone,'') !~ '^55[1-9][0-9]{9,10}$'
    or coalesce(p_provider_phone,'') !~ '^55[1-9][0-9]{9,10}$'
    or coalesce(p_jid,'') !~ '^[0-9]{5,20}@(s\.whatsapp\.net|lid)$'
    or char_length(btrim(coalesce(p_name,''))) not between 2 and 160
    or char_length(coalesce(p_job_title,'')) > 160 then
    raise exception 'Dados inválidos para o novo contato.' using errcode='22023';
  end if;
  select * into v_owner from public.entities e
    where e.id=p_entity and e.organization_id=p_organization and e.is_active
      and e.legacy_customer_id is not null for update;
  if not found then raise exception 'Cadastro do cliente não encontrado.' using errcode='22023'; end if;
  if not exists(select 1 from public.whatsapp_channel_connections c
    where c.id=p_channel and c.organization_id=p_organization
      and c.phone=p_account_phone and c.provider='wuzapi' and c.state='connected' and c.webhook_ready) then
    raise exception 'Conexão WhatsApp inválida.' using errcode='22023';
  end if;
  select nullif(btrim(p.full_name),'') into v_actor_name from public.profiles p where p.id=p_actor;
  if v_actor_name is null then raise exception 'Responsável não identificado.' using errcode='22023'; end if;
  v_numbers:=array[p_phone,substring(p_phone from 3),p_provider_phone,substring(p_provider_phone from 3)];
  if regexp_replace(coalesce(v_owner.phone,''),'[^0-9]','','g')=any(v_numbers)
    or regexp_replace(coalesce(v_owner.whatsapp,''),'[^0-9]','','g')=any(v_numbers)
    or exists(select 1 from public.entity_contacts ec
      where ec.organization_id=p_organization and ec.entity_id=p_entity
        and (regexp_replace(coalesce(ec.phone,''),'[^0-9]','','g')=any(v_numbers)
          or regexp_replace(coalesce(ec.whatsapp,''),'[^0-9]','','g')=any(v_numbers))) then
    raise exception 'Este número já existe neste cadastro. Edite ou reative o contato existente.' using errcode='23505';
  end if;
  insert into public.entity_contacts(organization_id,entity_id,name,job_title,whatsapp,is_primary,is_active,created_by)
    values(p_organization,p_entity,btrim(p_name),nullif(btrim(p_job_title),''),substring(p_phone from 3),false,true,p_actor)
    returning id into v_contact_id;
  insert into public.union_whatsapp_crm_number_verifications(organization_id,phone_e164,provider_phone_e164,verified_at)
    values(p_organization,p_phone,p_provider_phone,now())
    on conflict(organization_id,phone_e164) do update set provider_phone_e164=excluded.provider_phone_e164,verified_at=excluded.verified_at;
  -- Reuse an exact provider identity without overwriting an existing name.
  if not exists(select 1 from public.union_whatsapp_contacts c
    where c.organization_id=p_organization and c.channel_id=p_channel and c.account_phone=p_account_phone
      and (c.chat_jid=p_jid or c.contact_phone=p_provider_phone)) then
    insert into public.union_whatsapp_contacts(organization_id,channel_id,account_phone,chat_jid,contact_phone,display_name,updated_at)
      values(p_organization,p_channel,p_account_phone,p_jid,p_provider_phone,btrim(p_name),now())
      on conflict(channel_id,account_phone,chat_jid) do nothing returning id into v_agenda_id;
    if v_agenda_id is not null then
      insert into public.union_whatsapp_contact_audit(organization_id,channel_id,account_phone,contact_id,chat_jid,
        actor_user_id,actor_name_snapshot,action,changed_fields)
        values(p_organization,p_channel,p_account_phone,v_agenda_id,p_jid,p_actor,v_actor_name,'created',
          jsonb_build_object('display_name',jsonb_build_object('before',null,'after',btrim(p_name)),
            'contact_phone',jsonb_build_object('before',null,'after',p_provider_phone)));
    end if;
  end if;
  return v_contact_id;
end;
$$;
revoke all on function public.union_whatsapp_create_registration_contact(uuid,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.union_whatsapp_create_registration_contact(uuid,uuid,uuid,uuid,text,text,text,text,text,text) to service_role;

commit;
