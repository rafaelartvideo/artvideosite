begin;

create or replace function public.sync_order_situation_attachment_permission()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_permission_id uuid;
begin
  insert into public.permissions (key, label, description, module_name, sort_order)
  values (
    private.order_situation_upload_permission_key(new.id),
    'Anexar imagens — ' || new.name,
    'Permite anexar fotos e arquivos da situação "' || new.name || '" nas imagens da ordem de serviço.',
    'Ordens de Serviço — Imagens por situação',
    1200 + coalesce(new.sort_order, 0)
  )
  on conflict (key) do update set
    label = excluded.label,
    description = excluded.description,
    module_name = excluded.module_name,
    sort_order = excluded.sort_order
  returning id into v_permission_id;

  insert into public.role_permissions (role_id, permission_id)
  select distinct rp.role_id, v_permission_id
  from public.role_permissions rp
  join public.roles role on role.id = rp.role_id
  join public.permissions permission on permission.id = rp.permission_id
  where permission.key = 'orders.section.images'
    and role.organization_id = new.organization_id
  on conflict do nothing;

  return new;
end;
$$;

-- Remove permissões dinâmicas de situações que pertencem a outra empresa.
delete from public.role_permissions rp
using public.roles role, public.permissions permission, public.os_situations situation
where role.id = rp.role_id
  and permission.id = rp.permission_id
  and permission.key = private.order_situation_upload_permission_key(situation.id)
  and role.organization_id <> situation.organization_id;

-- Garante os status fixos mínimos quando OS/Status são habilitados.
create or replace function private.ensure_organization_module_defaults(
  p_organization_id uuid,
  p_module_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null then
    return;
  end if;

  if p_module_key in ('orders','order_statuses') then
    perform private.ensure_fixed_order_statuses(p_organization_id);
  elsif p_module_key = 'agenda' then
    insert into public.appointment_situations (
      organization_id, name, color, is_active, sort_order
    )
    values
      (p_organization_id, 'Agendado', '#0057e7', true, 1),
      (p_organization_id, 'Confirmado', '#7c3aed', true, 2),
      (p_organization_id, 'Em Andamento', '#f59e0b', true, 3),
      (p_organization_id, 'Concluído', '#16a34a', true, 4),
      (p_organization_id, 'Cancelado', '#dc2626', true, 5)
    on conflict (organization_id, name) do nothing;
  elsif p_module_key = 'quotes' then
    insert into public.request_statuses (
      organization_id, name, slug, color, sort_order, is_final
    )
    values
      (p_organization_id, 'Pendente', 'PENDENTE', '#F59E0B', 1, false),
      (p_organization_id, 'Em Análise', 'EM_ANALISE', '#3B82F6', 2, false),
      (p_organization_id, 'Aguardando Cliente', 'AGUARDANDO_CLIENTE', '#F59E0B', 3, false),
      (p_organization_id, 'Aprovado', 'APROVADO', '#22C55E', 4, false),
      (p_organization_id, 'Agendado', 'AGENDADO', '#3B82F6', 5, false),
      (p_organization_id, 'Concluído', 'CONCLUIDO', '#22C55E', 6, true),
      (p_organization_id, 'Cancelado', 'CANCELADO', '#EF4444', 7, true)
    on conflict (organization_id, slug) do nothing;
  end if;
end;
$$;

revoke all on function private.ensure_organization_module_defaults(uuid,text) from public;

do $$
declare
  r record;
begin
  for r in
    select organization_id,module_key
    from public.organization_modules
    where is_enabled
      and module_key in ('orders','order_statuses','agenda','quotes')
  loop
    perform private.ensure_organization_module_defaults(r.organization_id,r.module_key);
  end loop;
end;
$$;

commit;
