alter function public.my_organization_permissions(uuid) security definer;
alter function public.set_user_permission_overrides(uuid, uuid, uuid[]) security definer;

revoke all on function public.my_organization_permissions(uuid) from public;
grant execute on function public.my_organization_permissions(uuid) to authenticated;

revoke all on function public.set_user_permission_overrides(uuid, uuid, uuid[]) from public;
grant execute on function public.set_user_permission_overrides(uuid, uuid, uuid[]) to authenticated;
