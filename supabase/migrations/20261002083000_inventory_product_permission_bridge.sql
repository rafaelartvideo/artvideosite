begin;

-- Produtos agora é apenas a implementação interna do cadastro único de Estoque.
-- As chamadas e policies legadas de products.* passam a respeitar as permissões
-- equivalentes de inventory.*, sem exigir que o usuário veja um módulo separado.
create or replace function private.has_tenant_module_permission(
  p_organization_id uuid,
  p_module_key text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    p_organization_id is not null
    and private.is_organization_member(p_organization_id)
    and (
      case
        when p_module_key='products'
          and p_permission_key in (
            'products.view',
            'products.create',
            'products.update',
            'products.table.view',
            'products.table.product',
            'products.table.price',
            'products.table.status',
            'products.table.actions',
            'products.details.view',
            'products.toggle_active'
          )
        then
          private.is_organization_module_enabled(p_organization_id,'inventory')
          and private.has_effective_organization_permission(
            p_organization_id,
            case p_permission_key
              when 'products.view' then 'inventory.view'
              when 'products.create' then 'inventory.create'
              when 'products.update' then 'inventory.update'
              when 'products.table.view' then 'inventory.table.view'
              when 'products.table.product' then 'inventory.table.name'
              when 'products.table.price' then 'inventory.table.sale_price'
              when 'products.table.status' then 'inventory.table.status'
              when 'products.table.actions' then 'inventory.table.actions'
              when 'products.details.view' then 'inventory.details.view'
              when 'products.toggle_active' then 'inventory.toggle_active'
              else p_permission_key
            end
          )
        else
          private.is_organization_module_enabled(p_organization_id,p_module_key)
          and private.has_effective_organization_permission(
            p_organization_id,
            p_permission_key
          )
      end
    );
$$;

revoke all on function private.has_tenant_module_permission(uuid,text,text) from public, anon;
grant execute on function private.has_tenant_module_permission(uuid,text,text) to authenticated;


-- Funções antigas que já tinham acesso ao módulo Produtos recebem as permissões
-- equivalentes de Estoque para não perder acesso após a unificação.
with permission_map(source_key,target_key) as (
  values
    ('products.view','inventory.view'),
    ('products.table.view','inventory.table.view'),
    ('products.table.product','inventory.table.name'),
    ('products.table.price','inventory.table.sale_price'),
    ('products.table.status','inventory.table.status'),
    ('products.table.actions','inventory.table.actions'),
    ('products.details.view','inventory.details.view'),
    ('products.create','inventory.create'),
    ('products.update','inventory.update'),
    ('products.toggle_active','inventory.toggle_active')
)
insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join permission_map mapping on mapping.source_key=source.key
join public.permissions target on target.key=mapping.target_key
on conflict (role_id,permission_id) do nothing;

with permission_map(source_key,target_key) as (
  values
    ('products.view','inventory.view'),
    ('products.table.view','inventory.table.view'),
    ('products.table.product','inventory.table.name'),
    ('products.table.price','inventory.table.sale_price'),
    ('products.table.status','inventory.table.status'),
    ('products.table.actions','inventory.table.actions'),
    ('products.details.view','inventory.details.view'),
    ('products.create','inventory.create'),
    ('products.update','inventory.update'),
    ('products.toggle_active','inventory.toggle_active')
)
insert into public.user_permission_overrides (
  organization_id,user_id,permission_id,created_by
)
select distinct
  override.organization_id,
  override.user_id,
  target.id,
  override.created_by
from public.user_permission_overrides override
join public.permissions source on source.id=override.permission_id
join permission_map mapping on mapping.source_key=source.key
join public.permissions target on target.key=mapping.target_key
on conflict (organization_id,user_id,permission_id) do nothing;

commit;
