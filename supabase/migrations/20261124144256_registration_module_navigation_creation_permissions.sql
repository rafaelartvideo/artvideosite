-- Separate registration module navigation and creation without changing operational permissions.
-- Seed only newly introduced permissions: a repeated migration must not re-grant revoked access.
with pairs(old_key,new_key,label,description,sort_order) as (
  values
    ('customers.view','customers.menu.view','Visualizar módulo Cadastros','Exibe Cadastros no menu e permite acessar a listagem. A leitura de perfis individuais continua independente.',2030),
    ('customers.create','customers.module.create','Criar pelo módulo Cadastros','Permite Novo cadastro na listagem. A criação de clientes pela OS e outros fluxos conserva customers.create.',2031)
), inserted as (
  insert into public.permissions(key,label,description,module_name,sort_order)
  select new_key,label,description,'Cadastros — Navegação',sort_order from pairs
  on conflict (key) do nothing
  returning id,key
), previous as (
  select old_permission.id as old_id, inserted.id as new_id
  from pairs join inserted on inserted.key=pairs.new_key
  join public.permissions old_permission on old_permission.key=pairs.old_key
), roles_copied as (
  insert into public.role_permissions(role_id,permission_id)
  select rp.role_id,previous.new_id from previous join public.role_permissions rp on rp.permission_id=previous.old_id
  on conflict(role_id,permission_id) do nothing
  returning role_id
)
insert into public.user_permission_overrides(organization_id,user_id,permission_id,created_by,is_allowed)
select u.organization_id,u.user_id,previous.new_id,u.created_by,u.is_allowed
from previous join public.user_permission_overrides u on u.permission_id=previous.old_id
on conflict(organization_id,user_id,permission_id) do nothing;
