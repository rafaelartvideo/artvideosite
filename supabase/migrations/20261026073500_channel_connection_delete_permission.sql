-- Exclusão de conexões exige um direito independente do gerenciamento cotidiano.
insert into public.permissions (key, label, description, module_name, sort_order)
values (
  'settings.channels.delete',
  'Excluir conexão de atendimento',
  'Permite excluir permanentemente uma conexão WhatsApp e os dados vinculados.',
  'Canais de Atendimento',
  250
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Conceder inicialmente apenas aos gestores que já administravam canais;
-- os papéis continuam podendo retirar essa permissão na matriz de acesso.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission
  on permission.key = 'settings.channels.delete'
where role.name in ('Gestor', 'Gestor Do Sistema')
  and exists (
    select 1
    from public.role_permissions as granted
    join public.permissions as source on source.id = granted.permission_id
    where granted.role_id = role.id
      and source.key = 'settings.channels.manage'
  )
on conflict do nothing;
