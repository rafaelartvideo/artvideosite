begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('operation.view', 'Acessar Operação', 'Permite acessar o agrupador de módulos operacionais.', 'Operação', 900),
  ('site_settings.view', 'Acessar Configurações do Site', 'Permite acessar o módulo de configurações do site público.', 'Configurações do Site', 3590),
  ('site_settings.update', 'Editar Configurações do Site', 'Permite alterar identidade visual e conteúdo do site público.', 'Configurações do Site — Ações', 3591)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

with inheritance(child_key, parent_key) as (
  values
    ('operation.view','orders.view'),
    ('site_settings.view','settings.view'),
    ('site_settings.update','settings.update'),
    ('site_settings.details.view','settings.view')
)
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, child.id
from inheritance i
join public.permissions parent on parent.key = i.parent_key
join public.permissions child on child.key = i.child_key
join public.role_permissions rp on rp.permission_id = parent.id
on conflict (role_id, permission_id) do nothing;

commit;
