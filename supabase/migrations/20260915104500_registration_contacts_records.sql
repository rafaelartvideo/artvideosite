begin;

-- Cadastros already has entity_contacts from the unified registrations migration.
-- Harden it for tenant isolation and add the permanent entity records timeline.

create unique index if not exists entities_id_organization_uidx
  on public.entities(id, organization_id);

alter table public.entity_contacts
  add column if not exists created_by uuid default auth.uid();

DO $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.entity_contacts'::regclass
      and conname = 'entity_contacts_created_by_fkey'
  ) then
    alter table public.entity_contacts
      add constraint entity_contacts_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;

DO $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.entity_contacts'::regclass
      and conname = 'entity_contacts_entity_id_fkey'
  ) then
    alter table public.entity_contacts
      drop constraint entity_contacts_entity_id_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.entity_contacts'::regclass
      and conname = 'entity_contacts_entity_organization_fkey'
  ) then
    alter table public.entity_contacts
      add constraint entity_contacts_entity_organization_fkey
      foreign key (entity_id, organization_id)
      references public.entities(id, organization_id)
      on delete cascade;
  end if;
end $$;

create index if not exists entity_contacts_org_entity_idx
  on public.entity_contacts(organization_id, entity_id, is_active);

create unique index if not exists entity_contacts_one_primary_active_idx
  on public.entity_contacts(entity_id)
  where is_primary = true and is_active = true;

DO $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.entity_contacts'::regclass
      and tgname = 'set_entity_contacts_updated_at'
      and not tgisinternal
  ) then
    create trigger set_entity_contacts_updated_at
      before update on public.entity_contacts
      for each row execute function private.set_updated_at();
  end if;
end $$;

create table if not exists public.entity_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  record_type text not null default 'note',
  title text not null default 'Registro',
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint entity_records_entity_organization_fkey
    foreign key (entity_id, organization_id)
    references public.entities(id, organization_id)
    on delete cascade,
  constraint entity_records_content_check
    check (char_length(btrim(content)) between 1 and 2000)
);

create index if not exists entity_records_org_entity_created_idx
  on public.entity_records(organization_id, entity_id, created_at desc);
create index if not exists entity_records_created_by_idx
  on public.entity_records(created_by);

insert into public.permissions (key, label, description, module_name, sort_order)
select v.key, v.label, v.description, v.module_name, v.sort_order
from (values
  ('registrations.contacts.view', 'Visualizar contatos', 'Permite visualizar os contatos adicionais de um cadastro.', 'Cadastros — Contatos', 70),
  ('registrations.contacts.manage', 'Gerenciar contatos', 'Permite criar, editar, ativar e inativar contatos adicionais de um cadastro.', 'Cadastros — Contatos', 71),
  ('registrations.records.view', 'Visualizar registros', 'Permite visualizar a linha do tempo de registros de um cadastro.', 'Cadastros — Registros', 72),
  ('registrations.records.create', 'Adicionar registros', 'Permite adicionar registros permanentes à linha do tempo de um cadastro.', 'Cadastros — Registros', 73)
) as v(key, label, description, module_name, sort_order)
where not exists (select 1 from public.permissions p where p.key = v.key);

-- Preserve the practical access of existing roles: users who could already view/edit
-- Cadastros inherit the equivalent new contact/record permissions.
with permission_map(new_key, source_key) as (
  values
    ('registrations.contacts.view', 'customers.view'),
    ('registrations.contacts.manage', 'customers.edit'),
    ('registrations.contacts.manage', 'customers.update'),
    ('registrations.records.view', 'customers.view'),
    ('registrations.records.create', 'customers.edit'),
    ('registrations.records.create', 'customers.update')
), inherited as (
  select distinct rp.role_id, np.id as permission_id
  from permission_map m
  join public.permissions sp on sp.key = m.source_key
  join public.role_permissions rp on rp.permission_id = sp.id
  join public.permissions np on np.key = m.new_key
)
insert into public.role_permissions(role_id, permission_id)
select i.role_id, i.permission_id
from inherited i
where not exists (
  select 1 from public.role_permissions existing
  where existing.role_id = i.role_id
    and existing.permission_id = i.permission_id
);

alter table public.entity_contacts enable row level security;
alter table public.entity_records enable row level security;

revoke all on table public.entity_contacts from anon, authenticated;
revoke all on table public.entity_records from anon, authenticated;
grant select, insert, update on table public.entity_contacts to authenticated;
grant select, insert on table public.entity_records to authenticated;

drop policy if exists entity_contacts_select on public.entity_contacts;
drop policy if exists entity_contacts_insert on public.entity_contacts;
drop policy if exists entity_contacts_update on public.entity_contacts;
drop policy if exists entity_contacts_delete on public.entity_contacts;

create policy entity_contacts_select
on public.entity_contacts
for select
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'registrations.contacts.view')
  or private.has_effective_organization_permission(organization_id, 'registrations.contacts.manage')
);

create policy entity_contacts_insert
on public.entity_contacts
for insert
to authenticated
with check (
  private.has_effective_organization_permission(organization_id, 'registrations.contacts.manage')
  and exists (
    select 1 from public.entities e
    where e.id = entity_contacts.entity_id
      and e.organization_id = entity_contacts.organization_id
  )
  and (created_by is null or created_by = (select auth.uid()))
);

create policy entity_contacts_update
on public.entity_contacts
for update
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'registrations.contacts.manage')
)
with check (
  private.has_effective_organization_permission(organization_id, 'registrations.contacts.manage')
  and exists (
    select 1 from public.entities e
    where e.id = entity_contacts.entity_id
      and e.organization_id = entity_contacts.organization_id
  )
);

drop policy if exists entity_records_select on public.entity_records;
drop policy if exists entity_records_insert on public.entity_records;
drop policy if exists entity_records_update on public.entity_records;
drop policy if exists entity_records_delete on public.entity_records;

create policy entity_records_select
on public.entity_records
for select
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'registrations.records.view')
  or private.has_effective_organization_permission(organization_id, 'registrations.records.create')
);

create policy entity_records_insert
on public.entity_records
for insert
to authenticated
with check (
  private.has_effective_organization_permission(organization_id, 'registrations.records.create')
  and exists (
    select 1 from public.entities e
    where e.id = entity_records.entity_id
      and e.organization_id = entity_records.organization_id
  )
  and created_by = (select auth.uid())
  and char_length(btrim(content)) between 1 and 2000
);

commit;
