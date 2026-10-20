begin;
create or replace function public.union_whatsapp_seed_contacts(
  p_organization uuid,p_channel uuid
) returns integer
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare added integer;
begin
 if auth.role()<>'service_role' and current_user<>'postgres' then
   raise exception 'access_denied';
 end if;
 insert into public.union_whatsapp_contacts
   (organization_id,channel_id,chat_jid,contact_phone,profile_name)
 select c.organization_id,c.channel_id,c.chat_jid,c.contact_phone,
   case when nullif(btrim(c.contact_name),'') is not null
      and c.contact_name is distinct from 'Contato WhatsApp'
      and c.contact_name is distinct from c.contact_phone
     then c.contact_name else null end
 from public.union_whatsapp_conversations c
 where c.organization_id=p_organization and c.channel_id=p_channel
   and c.chat_jid ~ '^[0-9]{5,20}@(s\.whatsapp\.net|lid)$'
 on conflict (channel_id,chat_jid) do nothing;
 get diagnostics added=row_count;
 return added;
end;
$$;
revoke all on function public.union_whatsapp_seed_contacts(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.union_whatsapp_seed_contacts(uuid,uuid) to service_role;

create or replace function public.union_whatsapp_apply_contact_names(
 p_organization uuid,p_channel uuid
) returns integer
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare changed integer;
begin
 if auth.role()<>'service_role' and current_user<>'postgres' then
   raise exception 'access_denied';
 end if;
 with preferred as (
  select c.id, c.contact_name, c.contact_phone,
     a.display_name,a.device_name,a.imported_name,a.profile_name
  from public.union_whatsapp_conversations c
  join lateral (
    select a.display_name,a.device_name,a.imported_name,a.profile_name
    from public.union_whatsapp_contacts a
    where a.organization_id=c.organization_id and a.channel_id=c.channel_id
      and (a.chat_jid=c.chat_jid or (
        c.contact_phone is not null and c.contact_phone <> ''
        and a.contact_phone=c.contact_phone
        and a.chat_jid like '%@s.whatsapp.net'
      ))
    order by (case
      when nullif(btrim(a.display_name),'') is not null then 3
      when nullif(btrim(a.device_name),'') is not null then 2
      when nullif(btrim(a.imported_name),'') is not null then 1
      else 0 end) desc,
      (a.chat_jid=c.chat_jid) desc
    limit 1
  ) a on true
  where c.organization_id=p_organization and c.channel_id=p_channel
 ), chosen as (
  select id, contact_name,
    coalesce(nullif(btrim(display_name),''),
             nullif(btrim(device_name),''),
             nullif(btrim(imported_name),'')) as proposed,
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
     or exists(select 1 from public.union_whatsapp_messages m
       where m.conversation_id=c.id and m.direction='incoming'
         and m.sender_name=c.contact_name)
   );
 get diagnostics changed=row_count;
 return changed;
end;
$$;
revoke all on function public.union_whatsapp_apply_contact_names(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.union_whatsapp_apply_contact_names(uuid,uuid)
 to service_role;
commit;