delete from public.role_permissions rp
using public.roles role, public.permissions permission
where rp.role_id = role.id
  and rp.permission_id = permission.id
  and role.organization_id = public.artvideo_organization_id()
  and private.is_platform_only_permission_key(permission.key);
