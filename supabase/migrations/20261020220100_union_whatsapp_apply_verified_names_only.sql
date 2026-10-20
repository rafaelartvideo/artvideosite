-- Do not relabel chats from unverified WuzAPI contact cache entries.
CREATE OR REPLACE FUNCTION public.union_whatsapp_apply_contact_names(p_organization uuid, p_channel uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare changed integer;
begin
  if auth.role()<>'service_role' and current_user<>'postgres' then
    raise exception 'access_denied';
  end if;
  with preferred as (
    select c.id,c.contact_name,c.contact_phone,
      a.display_name,a.device_name,a.imported_name,a.profile_name,
      a.wuzapi_verified_saved
    from public.union_whatsapp_conversations c
    join lateral (
      select a.display_name,a.device_name,a.imported_name,
        a.profile_name,a.wuzapi_verified_saved
      from public.union_whatsapp_contacts a
      where a.organization_id=c.organization_id and a.channel_id=c.channel_id
        and (a.chat_jid=c.chat_jid or (
          c.contact_phone is not null and c.contact_phone<>''
          and a.contact_phone=c.contact_phone
          and a.chat_jid like '%@s.whatsapp.net'
        ))
      order by (case
        when nullif(btrim(a.display_name),'') is not null then 3
        when nullif(btrim(a.device_name),'') is not null then 2
        when a.wuzapi_verified_saved and nullif(btrim(a.imported_name),'') is not null then 1
        else 0 end) desc,
        (a.chat_jid=c.chat_jid) desc
      limit 1
    ) a on true
    where c.organization_id=p_organization and c.channel_id=p_channel
  ), chosen as (
    select id,contact_name,
      coalesce(nullif(btrim(display_name),''),
               nullif(btrim(device_name),''),
               case when wuzapi_verified_saved
                 then nullif(btrim(imported_name),'') else null end) as proposed,
      nullif(btrim(display_name),'') is not null as manual,
      contact_phone,profile_name
    from preferred
  )
  update public.union_whatsapp_conversations c
  set contact_name=p.proposed,updated_at=now()
  from chosen p
  where c.id=p.id and p.proposed is not null
    and c.contact_name is distinct from p.proposed
    and (
      p.manual
      or c.contact_name is null or c.contact_name='Contato WhatsApp'
      or c.contact_name=p.contact_phone
      or c.contact_name=p.profile_name
      or exists(
        select 1 from public.union_whatsapp_messages m
        where m.conversation_id=c.id and m.direction='incoming'
          and m.sender_name=c.contact_name
      )
    );
  get diagnostics changed=row_count;
  return changed;
end;
$function$;
