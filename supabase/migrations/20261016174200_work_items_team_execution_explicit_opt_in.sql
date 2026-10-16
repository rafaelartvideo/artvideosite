-- Newly inserted permissions are automatically granted to system Gestor roles
-- by the platform's permission seeding trigger. Team execution is explicitly
-- opt-in: the Gestor may view/assign tasks, but can perform another employee's
-- work only after this switch is enabled in Funções e Permissões.
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND p.key = 'work_items.execute_team'
  AND r.is_system = true AND r.name = 'Gestor';
