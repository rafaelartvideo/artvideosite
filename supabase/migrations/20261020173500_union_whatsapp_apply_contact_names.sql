begin;
create or replace function public.union_whatsapp_apply_contact_names(
 p_organization uuid, p_channel uuid
)
returns integer
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare changed integer;
begin
 if auth.role() <> 'service_role' and current_user <> 'postgres' then
   raise exception 'access_denied';
 end if;
 update public.union_whatsapp_conversations c
 set contact_name=coalesce(nullif(btrim(a.display_name),''),
                          nullif(btrim(a.imported_name),''),c.contact_name),
     updated_at=now()
 from public.union_whatsapp_contacts a
 where c.organization_id=p_organization and c.channel_id=p_channel
   and a.organization_id=c.organization_id and a.channel_id=c.channel_id
   and a.chat_jid=c.chat_jid
   and (nullif(btrim(a.display_name),'') is not null
     or (nullif(btrim(a.imported_name),'') is not null and (
       c.contact_name is null or c.contact_name='Contato WhatsApp'
       or c.contact_name=a.contact_phone or c.contact_name=a.profile_name
     )))
   and c.contact_name is distinct from coalesce(nullif(btrim(a.display_name),''),
                        nullif(btrim(a.imported_name),''),c.contact_name);
 get diagnostics changed=row_count;
 return changed;
end;
$$;
revoke all on function public.union_whatsapp_apply_contact_names(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.union_whatsapp_apply_contact_names(uuid,uuid)
 to service_role;
commit;