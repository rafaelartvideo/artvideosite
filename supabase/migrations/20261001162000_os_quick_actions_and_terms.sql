begin;

-- Ações rápidas da OS: histórico específico de alterações de situação.
create or replace function public.get_service_order_situation_history_v1(
  p_organization_id uuid,
  p_service_order_id uuid
)
returns table (
  audit_log_id bigint,
  changed_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  previous_situation_id uuid,
  previous_situation_name text,
  previous_situation_color text,
  next_situation_id uuid,
  next_situation_name text,
  next_situation_color text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    audit_log.id,
    audit_log.created_at,
    audit_log.actor_user_id,
    coalesce(audit_log.actor_name_snapshot, actor.full_name, 'Sistema') as actor_name,
    previous_situation.id,
    coalesce(previous_situation.name, 'Sem situação') as previous_situation_name,
    previous_situation.color,
    next_situation.id,
    coalesce(next_situation.name, 'Sem situação') as next_situation_name,
    next_situation.color
  from public.organization_audit_logs audit_log
  left join public.profiles actor on actor.id = audit_log.actor_user_id
  left join public.os_situations previous_situation
    on previous_situation.id = private.audit_try_uuid(audit_log.changed_fields -> 'situation_id' ->> 'before')
  left join public.os_situations next_situation
    on next_situation.id = private.audit_try_uuid(audit_log.changed_fields -> 'situation_id' ->> 'after')
  where audit_log.organization_id = p_organization_id
    and audit_log.table_name = 'service_orders'
    and audit_log.entity_id = p_service_order_id
    and audit_log.operation = 'update'
    and audit_log.changed_fields ? 'situation_id'
    and private.is_organization_member(p_organization_id)
    and (
      private.has_effective_organization_permission(p_organization_id, 'orders.table.view')
      or private.has_effective_organization_permission(p_organization_id, 'orders.details.view')
      or private.has_effective_organization_permission(p_organization_id, 'orders.view')
    )
  order by audit_log.created_at desc, audit_log.id desc;
$$;

revoke all on function public.get_service_order_situation_history_v1(uuid, uuid) from public, anon;
grant execute on function public.get_service_order_situation_history_v1(uuid, uuid) to authenticated;

-- Termos configuráveis por empresa e aceites versionados.
create table if not exists public.organization_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  term_type text not null check (term_type in ('usage', 'responsibility')),
  title text not null,
  content text not null default '',
  version integer not null default 1 check (version >= 1),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, term_type)
);

create table if not exists public.organization_term_acceptances (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  term_id uuid not null references public.organization_terms(id) on delete restrict,
  term_version integer not null check (term_version >= 1),
  user_id uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  unique (term_id, term_version, user_id)
);

create index if not exists organization_terms_org_type_idx
  on public.organization_terms (organization_id, term_type);

create index if not exists organization_term_acceptances_user_idx
  on public.organization_term_acceptances (organization_id, user_id, accepted_at desc);

alter table public.organization_terms enable row level security;
alter table public.organization_term_acceptances enable row level security;

drop policy if exists organization_terms_select on public.organization_terms;
create policy organization_terms_select
on public.organization_terms for select to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists organization_term_acceptances_select on public.organization_term_acceptances;
create policy organization_term_acceptances_select
on public.organization_term_acceptances for select to authenticated
using (
  private.is_organization_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.has_effective_organization_permission(organization_id, 'terms.manage')
  )
);

revoke insert, update, delete on public.organization_terms from anon, authenticated;
revoke insert, update, delete on public.organization_term_acceptances from anon, authenticated;
grant select on public.organization_terms to authenticated;
grant select on public.organization_term_acceptances to authenticated;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('terms.view', 'Visualizar termos', 'Permite acessar os termos configurados para a empresa.', 'Termos', 1460),
  ('terms.manage', 'Gerenciar termos', 'Permite editar e publicar os termos da empresa.', 'Termos', 1470)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct source.role_id, target.id
from public.role_permissions source
join public.permissions source_permission
  on source_permission.id = source.permission_id
 and source_permission.key = 'settings.view'
cross join public.permissions target
where target.key = 'terms.view'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct source.role_id, target.id
from public.role_permissions source
join public.permissions source_permission
  on source_permission.id = source.permission_id
 and source_permission.key = 'settings.update'
cross join public.permissions target
where target.key in ('terms.view', 'terms.manage')
on conflict (role_id, permission_id) do nothing;

create or replace function public.list_organization_terms_v1(p_organization_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  term_type text,
  title text,
  content text,
  version integer,
  is_active boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    term.id,
    term.organization_id,
    term.term_type,
    term.title,
    term.content,
    term.version,
    term.is_active,
    term.updated_at
  from public.organization_terms term
  where term.organization_id = p_organization_id
    and private.is_organization_member(p_organization_id)
    and (
      private.has_effective_organization_permission(p_organization_id, 'terms.view')
      or private.has_effective_organization_permission(p_organization_id, 'terms.manage')
    )
  order by case term.term_type when 'usage' then 1 else 2 end;
$$;

create or replace function public.save_organization_term_v1(
  p_organization_id uuid,
  p_term_type text,
  p_title text,
  p_content text,
  p_is_active boolean default true
)
returns public.organization_terms
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing public.organization_terms;
  v_result public.organization_terms;
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
begin
  if p_term_type not in ('usage', 'responsibility') then
    raise exception 'Tipo de termo inválido.' using errcode = '22023';
  end if;

  if not private.is_organization_member(p_organization_id)
     or not private.has_effective_organization_permission(p_organization_id, 'terms.manage') then
    raise exception 'Sem permissão para gerenciar os termos.' using errcode = '42501';
  end if;

  if v_title = '' then
    raise exception 'Informe o título do termo.' using errcode = '22023';
  end if;

  if p_is_active and v_content = '' then
    raise exception 'Informe o conteúdo do termo antes de ativá-lo.' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.organization_terms
  where organization_id = p_organization_id
    and term_type = p_term_type
  for update;

  if found then
    update public.organization_terms
    set
      title = v_title,
      content = v_content,
      is_active = coalesce(p_is_active, true),
      version = case
        when title is distinct from v_title
          or content is distinct from v_content
          or is_active is distinct from coalesce(p_is_active, true)
        then version + 1
        else version
      end,
      updated_by = (select auth.uid()),
      updated_at = now()
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.organization_terms (
      organization_id, term_type, title, content, version, is_active, created_by, updated_by
    )
    values (
      p_organization_id, p_term_type, v_title, v_content, 1, coalesce(p_is_active, true),
      (select auth.uid()), (select auth.uid())
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

create or replace function public.get_pending_organization_terms_v1(p_organization_id uuid)
returns table (
  id uuid,
  term_type text,
  title text,
  content text,
  version integer,
  organization_name text
)
language sql
stable
security definer
set search_path = public, private
as $$
  with membership as (
    select member.is_owner
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
    limit 1
  )
  select
    term.id,
    term.term_type,
    term.title,
    term.content,
    term.version,
    organization.name
  from public.organization_terms term
  join public.organizations organization on organization.id = term.organization_id
  cross join membership
  where term.organization_id = p_organization_id
    and term.is_active
    and btrim(term.content) <> ''
    and (
      term.term_type = 'responsibility'
      or (term.term_type = 'usage' and membership.is_owner)
    )
    and not exists (
      select 1
      from public.organization_term_acceptances acceptance
      where acceptance.term_id = term.id
        and acceptance.term_version = term.version
        and acceptance.user_id = (select auth.uid())
    )
  order by case term.term_type when 'usage' then 1 else 2 end;
$$;

create or replace function public.accept_organization_term_v1(
  p_organization_id uuid,
  p_term_id uuid,
  p_term_version integer
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_term public.organization_terms;
  v_is_owner boolean := false;
begin
  select term.*
    into v_term
  from public.organization_terms term
  where term.id = p_term_id
    and term.organization_id = p_organization_id
    and term.is_active;

  if not found then
    raise exception 'Termo não encontrado ou inativo.' using errcode = '22023';
  end if;

  if v_term.version <> p_term_version then
    raise exception 'Este termo foi atualizado. Recarregue para aceitar a versão atual.' using errcode = '40001';
  end if;

  select coalesce(member.is_owner, false)
    into v_is_owner
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = (select auth.uid())
    and member.status = 'active'
  limit 1;

  if not found then
    raise exception 'Você não possui acesso ativo a esta empresa.' using errcode = '42501';
  end if;

  if v_term.term_type = 'usage' and not v_is_owner then
    raise exception 'Somente o proprietário da empresa aceita o Termo de Uso.' using errcode = '42501';
  end if;

  insert into public.organization_term_acceptances (
    organization_id, term_id, term_version, user_id
  )
  values (
    p_organization_id, v_term.id, v_term.version, (select auth.uid())
  )
  on conflict (term_id, term_version, user_id) do nothing;
end;
$$;

revoke all on function public.list_organization_terms_v1(uuid) from public, anon;
revoke all on function public.save_organization_term_v1(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.get_pending_organization_terms_v1(uuid) from public, anon;
revoke all on function public.accept_organization_term_v1(uuid, uuid, integer) from public, anon;

grant execute on function public.list_organization_terms_v1(uuid) to authenticated;
grant execute on function public.save_organization_term_v1(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.get_pending_organization_terms_v1(uuid) to authenticated;
grant execute on function public.accept_organization_term_v1(uuid, uuid, integer) to authenticated;

commit;
