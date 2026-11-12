create or replace function public.pbx_contact_access_v1(p_organization_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.pbx_has_permission(p_organization_id, 'pbx.view'); $$;
revoke all on function public.pbx_contact_access_v1(uuid) from public, anon;
grant execute on function public.pbx_contact_access_v1(uuid) to authenticated;
