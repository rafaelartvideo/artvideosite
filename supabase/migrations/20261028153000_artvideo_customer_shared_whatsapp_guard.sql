-- Impede acesso automatico quando o WhatsApp e compartilhado por cadastros distintos.
create or replace function public.artvideo_customer_has_shared_whatsapp_v1(
  p_organization_id uuid,p_customer_id uuid,p_phone text
) returns boolean language plpgsql stable security invoker set search_path=''
as $$
begin
  if current_user <> 'service_role' then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return exists (
    select 1 from public.customers c
    where c.organization_id=p_organization_id and c.id<>p_customer_id
      and nullif(regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g'),'') is not null
      and p_phone in (
        regexp_replace(c.whatsapp,'[^0-9]','','g'),
        '55'||regexp_replace(c.whatsapp,'[^0-9]','','g')
      )
  );
end $$;
revoke all on function public.artvideo_customer_has_shared_whatsapp_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.artvideo_customer_has_shared_whatsapp_v1(uuid,uuid,text) to service_role;
