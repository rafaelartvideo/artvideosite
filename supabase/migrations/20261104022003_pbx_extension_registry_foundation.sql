-- PABX Union: cadastros administrativos, sem alterar o tronco FVX ou Asterisk.
-- Novos ramais ficam pendentes ate um agente da VPS provisiona-los.
insert into public.permissions (key, label, description, module_name, sort_order)
values ('pbx.manage', 'Gerenciar ramais', 'Cadastrar, vincular e solicitar ativacao de ramais do PABX Union.', 'pbx', 5021)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Os papeis da propria Union ja autorizados para pbx.view recebem gerencia nesta fase.
insert into public.role_permissions (role_id,permission_id)
select old_role.role_id,new_permission.id
from public.role_permissions old_role
join public.permissions old_permission on old_permission.id=old_role.permission_id and old_permission.key='pbx.view'
join public.permissions new_permission on new_permission.key='pbx.manage'
join public.roles role on role.id=old_role.role_id
where private.is_platform_organization(role.organization_id)
on conflict do nothing;

create table if not exists public.pbx_extensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  number integer not null check (number between 100 and 9999),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  employee_id uuid references public.employees(id) on delete set null,
  endpoint_name text not null unique default ('uw-' || replace(gen_random_uuid()::text, '-', '')),
  desired_enabled boolean not null default true,
  provisioning_status text not null default 'pending'
    check (provisioning_status in ('pending','applied','failed','manual')),
  is_managed boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbx_extensions_number_unique unique (organization_id, number),
  constraint pbx_extensions_safe_endpoint check (endpoint_name ~ '^uw-[a-f0-9]{32}$' or endpoint_name = 'union-301')
);
create index if not exists pbx_extensions_org_updated_idx on public.pbx_extensions (organization_id,updated_at desc);
create unique index if not exists pbx_extensions_org_employee_unique
  on public.pbx_extensions(organization_id,employee_id) where employee_id is not null;

create or replace function private.validate_pbx_extension()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.employee_id is not null and not exists (
    select 1 from public.employees e
    where e.id=new.employee_id and e.organization_id=new.organization_id and e.is_active=true
  ) then
    raise exception 'O funcionario nao pertence a esta empresa ou esta inativo.' using errcode='23514';
  end if;
  new.updated_at=now();
  if tg_op='UPDATE' then
    if old.is_managed=false and
      (new.number is distinct from old.number or new.desired_enabled is distinct from old.desired_enabled)
    then
      raise exception 'O ramal manual deve continuar gerenciado na VPS ate a migracao.' using errcode='23514';
    end if;
    if old.is_managed=true and (
       new.number is distinct from old.number or
       new.display_name is distinct from old.display_name or
       new.desired_enabled is distinct from old.desired_enabled
    ) then
      new.provisioning_status='pending';
      new.last_error=null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_pbx_extension() from public,anon,authenticated;
drop trigger if exists pbx_extensions_validate on public.pbx_extensions;
create trigger pbx_extensions_validate
before insert or update on public.pbx_extensions
for each row execute function private.validate_pbx_extension();

-- Auditoria privada: os eventos nao sao expostos ao navegador.
create table if not exists private.pbx_extension_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  extension_id uuid not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  actor_id uuid,
  changed_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb
);
create index if not exists pbx_extension_events_org_time_idx
 on private.pbx_extension_events(organization_id,changed_at desc);
revoke all on private.pbx_extension_events from public,anon,authenticated;

create or replace function private.audit_pbx_extension()
returns trigger language plpgsql set search_path='' as $$
begin
  insert into private.pbx_extension_events (organization_id,extension_id,operation,actor_id,before_state,after_state)
  values (
    coalesce(new.organization_id,old.organization_id),
    coalesce(new.id,old.id),
    tg_op,
    auth.uid(),
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new,old);
end;
$$;
revoke all on function private.audit_pbx_extension() from public,anon,authenticated;
drop trigger if exists pbx_extensions_audit on public.pbx_extensions;
create trigger pbx_extensions_audit
after insert or update or delete on public.pbx_extensions
for each row execute function private.audit_pbx_extension();

alter table public.pbx_extensions enable row level security;
drop policy if exists pbx_extensions_select on public.pbx_extensions;
create policy pbx_extensions_select on public.pbx_extensions
for select to authenticated
using (
  private.is_platform_organization(organization_id)
  and private.has_organization_permission(organization_id,'pbx.view')
);
drop policy if exists pbx_extensions_insert on public.pbx_extensions;
create policy pbx_extensions_insert on public.pbx_extensions
for insert to authenticated
with check (
  private.is_platform_organization(organization_id)
  and private.has_organization_permission(organization_id,'pbx.manage')
);
drop policy if exists pbx_extensions_update on public.pbx_extensions;
create policy pbx_extensions_update on public.pbx_extensions
for update to authenticated
using (
  private.is_platform_organization(organization_id)
  and private.has_organization_permission(organization_id,'pbx.manage')
)
with check (
  private.is_platform_organization(organization_id)
  and private.has_organization_permission(organization_id,'pbx.manage')
);

revoke all on public.pbx_extensions from public,anon,authenticated;
grant select on public.pbx_extensions to authenticated;
grant insert (organization_id,number,display_name,employee_id,desired_enabled) on public.pbx_extensions to authenticated;
grant update (display_name,employee_id,desired_enabled) on public.pbx_extensions to authenticated;

-- Importa apenas o inventario do ramal ja validado, nao cria ou altera PJSIP e nao armazena sua senha.
insert into public.pbx_extensions
  (organization_id,number,display_name,endpoint_name,desired_enabled,provisioning_status,is_managed)
select id,301,'Ramal 301 (configuração existente)','union-301',true,'manual',false
from public.organizations
where private.is_platform_organization(id)
on conflict do nothing;

