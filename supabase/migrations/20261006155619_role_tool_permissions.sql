-- Novas permissoes de modulos/ferramentas e acesso por funcao.
-- As permissoes sao concedidas inicialmente as funcoes existentes para preservar
-- o comportamento atual; depois podem ser removidas individualmente em Funcoes e Permissoes.

begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('tools.view', 'Acessar Ferramentas', 'Permite acessar a central de Ferramentas.', 'Ferramentas — Acesso', 5000),
  ('tools.sac_digital.use', 'Usar SAC Digital', 'Permite abrir o SAC Digital pela central de Ferramentas quando disponivel para a empresa.', 'Ferramentas — Uso', 5001),
  ('tools.uniq.use', 'Usar UNIQ', 'Permite abrir a plataforma UNIQ pela central de Ferramentas quando disponivel para a empresa.', 'Ferramentas — Uso', 5002),
  ('queue.view', 'Usar Union Fila', 'Permite acessar e configurar a Union Fila quando o modulo estiver habilitado para a empresa.', 'Union Fila — Acesso', 5010),
  ('pbx.view', 'Usar PABX Union', 'Permite acessar o PABX Union quando o modulo estiver habilitado para a empresa.', 'PABX Union — Acesso', 5020),
  ('marketplace.view', 'Usar Marketplace Union', 'Permite acessar o Marketplace Union quando o modulo estiver habilitado para a empresa.', 'Marketplace Union — Acesso', 5030),
  ('ai.view', 'Usar Union IA', 'Permite acessar os recursos Union IA quando o modulo estiver habilitado para a empresa.', 'Union IA — Acesso', 5040)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select role_row.id, permission_row.id
from public.roles role_row
cross join public.permissions permission_row
where permission_row.key in (
  'tools.view',
  'tools.sac_digital.use',
  'tools.uniq.use',
  'queue.view',
  'pbx.view',
  'marketplace.view',
  'ai.view'
)
on conflict (role_id, permission_id) do nothing;

commit;
