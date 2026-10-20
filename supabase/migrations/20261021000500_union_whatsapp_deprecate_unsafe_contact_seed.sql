-- Historical compatibility RPC; no longer seed the saved address book from
-- conversation participants. This avoids treating group-only numbers as saved.
create or replace function public.union_whatsapp_seed_contacts(
  p_organization uuid,p_channel uuid
) returns integer
language plpgsql security definer
set search_path to 'pg_catalog','public'
as $seed$
begin
  if auth.role()<>'service_role' and current_user<>'postgres' then
    raise exception 'access_denied';
  end if;
  return 0;
end;
$seed$;
revoke all on function public.union_whatsapp_seed_contacts(uuid,uuid) from public,anon,authenticated;
grant execute on function public.union_whatsapp_seed_contacts(uuid,uuid) to service_role;
