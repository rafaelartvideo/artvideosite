delete from public.user_permission_overrides
where permission_id in (
  select id from public.permissions where key in ('employees.delete','inventory.delete')
);

delete from public.role_permissions
where permission_id in (
  select id from public.permissions where key in ('employees.delete','inventory.delete')
);

delete from public.permissions
where key in ('employees.delete','inventory.delete');
