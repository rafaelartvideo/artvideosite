begin;

create unique index if not exists entities_id_organization_uidx
  on public.entities(id, organization_id);

alter table public.print_templates
  add column if not exists allow_online_signature boolean not null default false,
  add column if not exists signature_link_ttl_hours integer not null default 72,
  add column if not exists require_external_signature boolean not null default true,
  add column if not exists require_employee_signature boolean not null default false,
  add column if not exists employee_signature_source text;

alter table public.print_templates
  drop constraint if exists print_templates_signature_link_ttl_hours_check,
  drop constraint if exists print_templates_employee_signature_source_check,
  drop constraint if exists print_templates_online_signature_required_check,
  drop constraint if exists print_templates_employee_signature_source_required_check;

alter table public.print_templates
  add constraint print_templates_signature_link_ttl_hours_check
    check (signature_link_ttl_hours between 1 and 720),
  add constraint print_templates_employee_signature_source_check
    check (
      employee_signature_source is null
      or employee_signature_source in ('responsible', 'technician', 'completed_by', 'manual')
    ),
  add constraint print_templates_online_signature_required_check
    check (
      not allow_online_signature
      or require_external_signature
      or require_employee_signature
    ),
  add constraint print_templates_employee_signature_source_required_check
    check (
      not require_employee_signature
      or employee_signature_source is not null
    );

create table if not exists public.employee_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_id uuid not null,
  version integer not null,
  is_active boolean not null default true,
  storage_path text not null,
  signature_hash text not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  deactivated_at timestamptz,
  constraint employee_signatures_entity_organization_fkey
    foreign key (entity_id, organization_id)
    references public.entities(id, organization_id)
    on delete restrict,
  constraint employee_signatures_version_check check (version > 0),
  constraint employee_signatures_storage_path_check check (btrim(storage_path) <> ''),
  constraint employee_signatures_signature_hash_check check (signature_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists employee_signatures_entity_version_uidx
  on public.employee_signatures(organization_id, entity_id, version);

create unique index if not exists employee_signatures_one_active_uidx
  on public.employee_signatures(organization_id, entity_id)
  where is_active = true;

create index if not exists employee_signatures_org_entity_created_idx
  on public.employee_signatures(organization_id, entity_id, created_at desc);

create or replace function private.protect_employee_signature_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if row(
    new.organization_id,
    new.entity_id,
    new.version,
    new.storage_path,
    new.signature_hash,
    new.created_by,
    new.created_at
  ) is distinct from row(
    old.organization_id,
    old.entity_id,
    old.version,
    old.storage_path,
    old.signature_hash,
    old.created_by,
    old.created_at
  ) then
    raise exception 'Versões de assinatura do funcionário são imutáveis.' using errcode = '42501';
  end if;

  if old.is_active = false and (
    new.is_active is distinct from old.is_active
    or new.deactivated_at is distinct from old.deactivated_at
  ) then
    raise exception 'Uma assinatura histórica não pode ser reativada ou alterada.' using errcode = '42501';
  end if;

  if old.is_active = true and new.is_active = true
     and new.deactivated_at is distinct from old.deactivated_at then
    raise exception 'A data de desativação só pode ser definida ao substituir a assinatura.' using errcode = '42501';
  end if;

  if old.is_active = true and new.is_active = false and new.deactivated_at is null then
    raise exception 'Informe a data de desativação da assinatura substituída.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_employee_signature_history on public.employee_signatures;
create trigger protect_employee_signature_history
before update on public.employee_signatures
for each row execute function private.protect_employee_signature_history();

insert into public.permissions (key, label, description, module_name, sort_order)
select
  'registrations.employee_signature.manage',
  'Gerenciar assinatura do funcionário',
  'Permite cadastrar e substituir a assinatura eletrônica armazenada no cadastro de um funcionário.',
  'Cadastros — Funcionários',
  74
where not exists (
  select 1 from public.permissions p
  where p.key = 'registrations.employee_signature.manage'
);

with permission_map(source_key) as (
  values ('employees.edit'), ('customers.edit'), ('customers.update')
), inherited as (
  select distinct rp.role_id, target.id as permission_id
  from permission_map m
  join public.permissions source on source.key = m.source_key
  join public.role_permissions rp on rp.permission_id = source.id
  join public.permissions target on target.key = 'registrations.employee_signature.manage'
)
insert into public.role_permissions(role_id, permission_id)
select i.role_id, i.permission_id
from inherited i
where not exists (
  select 1
  from public.role_permissions current
  where current.role_id = i.role_id
    and current.permission_id = i.permission_id
);

alter table public.employee_signatures enable row level security;
revoke all on table public.employee_signatures from anon, authenticated;
grant select on table public.employee_signatures to authenticated;

drop policy if exists employee_signatures_select on public.employee_signatures;
create policy employee_signatures_select
on public.employee_signatures
for select
to authenticated
using (
  private.has_effective_organization_permission(
    organization_id,
    'registrations.employee_signature.manage'
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'employee-signatures',
  'employee-signatures',
  false,
  1048576,
  array['image/png']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists employee_signatures_storage_select on storage.objects;
drop policy if exists employee_signatures_storage_insert on storage.objects;
drop policy if exists employee_signatures_storage_update on storage.objects;
drop policy if exists employee_signatures_storage_delete on storage.objects;

create policy employee_signatures_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-signatures'
  and exists (
    select 1
    from public.entities e
    join public.entity_roles er
      on er.entity_id = e.id
     and er.role = 'employee'
     and er.is_active = true
    where e.organization_id::text = (storage.foldername(storage.objects.name))[1]
      and e.id::text = (storage.foldername(storage.objects.name))[2]
      and e.is_active = true
      and private.has_effective_organization_permission(
        e.organization_id,
        'registrations.employee_signature.manage'
      )
  )
);

create policy employee_signatures_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-signatures'
  and exists (
    select 1
    from public.entities e
    join public.entity_roles er
      on er.entity_id = e.id
     and er.role = 'employee'
     and er.is_active = true
    where e.organization_id::text = (storage.foldername(storage.objects.name))[1]
      and e.id::text = (storage.foldername(storage.objects.name))[2]
      and e.is_active = true
      and private.has_effective_organization_permission(
        e.organization_id,
        'registrations.employee_signature.manage'
      )
  )
);

create or replace function public.save_employee_signature(
  p_organization_id uuid,
  p_entity_id uuid,
  p_storage_path text,
  p_signature_hash text
)
returns public.employee_signatures
language plpgsql
security definer
set search_path = public, private, storage, pg_temp
as $$
declare
  v_next_version integer;
  v_signature public.employee_signatures;
  v_expected_prefix text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_effective_organization_permission(
    p_organization_id,
    'registrations.employee_signature.manage'
  ) then
    raise exception 'Sem permissão para gerenciar a assinatura deste funcionário.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.entities e
    join public.entity_roles er
      on er.entity_id = e.id
     and er.role = 'employee'
     and er.is_active = true
    where e.id = p_entity_id
      and e.organization_id = p_organization_id
      and e.is_active = true
  ) then
    raise exception 'Funcionário ativo não encontrado neste cadastro.' using errcode = '23503';
  end if;

  v_expected_prefix := p_organization_id::text || '/' || p_entity_id::text || '/';
  if p_storage_path is null
     or left(p_storage_path, char_length(v_expected_prefix)) <> v_expected_prefix
     or right(lower(p_storage_path), 4) <> '.png' then
    raise exception 'Caminho de assinatura inválido.' using errcode = '23514';
  end if;

  if p_signature_hash is null or p_signature_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash da assinatura inválido.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'employee-signatures'
      and object.name = p_storage_path
  ) then
    raise exception 'Arquivo da assinatura não encontrado no armazenamento.' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_entity_id::text, 0)
  );

  update public.employee_signatures
  set is_active = false,
      deactivated_at = timezone('utc', now())
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and is_active = true;

  select coalesce(max(version), 0) + 1
  into v_next_version
  from public.employee_signatures
  where organization_id = p_organization_id
    and entity_id = p_entity_id;

  insert into public.employee_signatures (
    organization_id,
    entity_id,
    version,
    is_active,
    storage_path,
    signature_hash,
    created_by
  )
  values (
    p_organization_id,
    p_entity_id,
    v_next_version,
    true,
    p_storage_path,
    lower(p_signature_hash),
    auth.uid()
  )
  returning * into v_signature;

  return v_signature;
end;
$$;

revoke all on function public.save_employee_signature(uuid, uuid, text, text) from public, anon;
grant execute on function public.save_employee_signature(uuid, uuid, text, text) to authenticated;

commit;
