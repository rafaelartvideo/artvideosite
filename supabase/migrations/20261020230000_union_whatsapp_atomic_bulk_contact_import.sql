-- Import valid contact batches atomically without rewriting manually saved names.
create or replace function public.union_whatsapp_import_contacts_batch(
  p_organization uuid,p_channel uuid,p_contacts jsonb
) returns integer
language plpgsql security invoker set search_path to 'pg_catalog','public'
as $function$
declare processed integer;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'access_denied';
  end if;
  if p_contacts is null or jsonb_typeof(p_contacts)<>'array'
      or jsonb_array_length(p_contacts)>250
      or jsonb_array_length(p_contacts)<1 then
    raise exception 'invalid_batch';
  end if;
  if not exists(
    select 1 from public.whatsapp_channel_connections c
    where c.id=p_channel and c.organization_id=p_organization
      and c.provider='wuzapi'
  ) then
    raise exception 'channel_not_found';
  end if;
  with valid as (
    select distinct on (x.phone)
      x.phone as phone,
      left(btrim(regexp_replace(x.name,'[[:space:]]+',' ','g')),160) as name
    from jsonb_to_recordset(p_contacts) as x(name text,phone text)
    where x.phone ~ '^55[1-9][0-9][0-9]{8,9}$'
      and x.name is not null and length(btrim(x.name)) between 2 and 160
    order by x.phone
  )
  insert into public.union_whatsapp_contacts(
    organization_id,channel_id,chat_jid,contact_phone,device_name,updated_at
  )
  select p_organization,p_channel,
    valid.phone||'@s.whatsapp.net',valid.phone,valid.name,now()
  from valid
  on conflict (channel_id,chat_jid) do update
    set device_name=excluded.device_name,
        contact_phone=coalesce(excluded.contact_phone,
                               public.union_whatsapp_contacts.contact_phone),
        updated_at=now();
  get diagnostics processed=row_count;
  return processed;
end;
$function$;

revoke all on function public.union_whatsapp_import_contacts_batch(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.union_whatsapp_import_contacts_batch(uuid,uuid,jsonb)
  to service_role;
