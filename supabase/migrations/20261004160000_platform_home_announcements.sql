begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('platform.announcements.view', 'Visualizar avisos da plataforma', 'Visualiza e acompanha os comunicados publicados pela Union World.', 'Union World', 982),
  ('platform.announcements.manage', 'Gerenciar avisos da plataforma', 'Cria, edita, publica e encerra comunicados da Union World.', 'Union World', 983)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    (p_key like 'organizations.%' and p_key <> 'organizations.audit.view')
    or p_key like 'integrations.%'
    or p_key like 'audit.%'
    or p_key like 'orders.monitor.%'
    or p_key like 'platform.billing.%'
    or p_key like 'platform.announcements.%';
$$;

revoke all on function private.is_platform_only_permission_key(text) from public;

insert into public.role_permissions (role_id, permission_id)
select distinct source_access.role_id, target_permission.id
from public.role_permissions source_access
join public.permissions source_permission on source_permission.id = source_access.permission_id
join public.roles source_role on source_role.id = source_access.role_id
cross join public.permissions target_permission
where source_role.organization_id = public.platform_operator_organization_id()
  and source_permission.key = 'organizations.view'
  and target_permission.key = 'platform.announcements.view'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct source_access.role_id, target_permission.id
from public.role_permissions source_access
join public.permissions source_permission on source_permission.id = source_access.permission_id
join public.roles source_role on source_role.id = source_access.role_id
cross join public.permissions target_permission
where source_role.organization_id = public.platform_operator_organization_id()
  and source_permission.key = 'organizations.edit'
  and target_permission.key in ('platform.announcements.view', 'platform.announcements.manage')
on conflict (role_id, permission_id) do nothing;

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  priority text not null default 'info'
    check (priority in ('info', 'attention', 'important', 'critical')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_pinned boolean not null default false,
  requires_acknowledgment boolean not null default false,
  link_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists platform_announcements_window_idx
  on public.platform_announcements (is_active, starts_at, ends_at);
create index if not exists platform_announcements_created_by_idx
  on public.platform_announcements (created_by)
  where created_by is not null;
create index if not exists platform_announcements_updated_by_idx
  on public.platform_announcements (updated_by)
  where updated_by is not null;

create table if not exists public.platform_announcement_targets (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, organization_id)
);

create index if not exists platform_announcement_targets_org_idx
  on public.platform_announcement_targets (organization_id, announcement_id);

create table if not exists public.platform_announcement_reads (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, organization_id, user_id)
);

create index if not exists platform_announcement_reads_org_idx
  on public.platform_announcement_reads (organization_id, announcement_id);
create index if not exists platform_announcement_reads_user_idx
  on public.platform_announcement_reads (user_id, acknowledged_at desc);

alter table public.platform_announcements enable row level security;
alter table public.platform_announcement_targets enable row level security;
alter table public.platform_announcement_reads enable row level security;

revoke all on table public.platform_announcements from anon, authenticated;
revoke all on table public.platform_announcement_targets from anon, authenticated;
revoke all on table public.platform_announcement_reads from anon, authenticated;

create or replace function private.platform_announcement_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function private.platform_announcement_touch_updated_at() from public, anon, authenticated;

drop trigger if exists platform_announcements_touch_updated_at on public.platform_announcements;
create trigger platform_announcements_touch_updated_at
before update on public.platform_announcements
for each row execute function private.platform_announcement_touch_updated_at();

create or replace function private.can_receive_platform_announcement(
  p_announcement_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    (select auth.uid()) is not null
    and (
      private.is_platform_organization(p_organization_id)
      or private.is_organization_member(p_organization_id)
    )
    and exists (
      select 1
      from public.platform_announcements announcement
      where announcement.id = p_announcement_id
        and announcement.is_active
        and announcement.starts_at <= now()
        and (announcement.ends_at is null or announcement.ends_at > now())
        and (
          private.is_platform_organization(p_organization_id)
          or not exists (
            select 1
            from public.platform_announcement_targets any_target
            where any_target.announcement_id = announcement.id
          )
          or exists (
            select 1
            from public.platform_announcement_targets target
            where target.announcement_id = announcement.id
              and target.organization_id = p_organization_id
          )
        )
    );
$$;

revoke all on function private.can_receive_platform_announcement(uuid, uuid) from public, anon, authenticated;

create or replace function public.load_home_announcements_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_organization_id is null
     or not (
       private.is_organization_member(p_organization_id)
       or (
         private.is_platform_organization(p_organization_id)
         and private.has_platform_permission('platform.announcements.view')
       )
     ) then
    raise exception 'Sem acesso aos avisos desta empresa.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', announcement.id,
        'title', announcement.title,
        'message', announcement.message,
        'priority', announcement.priority,
        'starts_at', announcement.starts_at,
        'ends_at', announcement.ends_at,
        'is_pinned', announcement.is_pinned,
        'requires_acknowledgment', announcement.requires_acknowledgment,
        'link_url', announcement.link_url,
        'acknowledged_at', read_row.acknowledged_at,
        'created_at', announcement.created_at
      )
      order by
        announcement.is_pinned desc,
        case announcement.priority
          when 'critical' then 4
          when 'important' then 3
          when 'attention' then 2
          else 1
        end desc,
        announcement.starts_at desc
    )
    from public.platform_announcements announcement
    left join public.platform_announcement_reads read_row
      on read_row.announcement_id = announcement.id
     and read_row.organization_id = p_organization_id
     and read_row.user_id = v_user_id
    where private.can_receive_platform_announcement(announcement.id, p_organization_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.load_home_announcements_v1(uuid) from public, anon;
grant execute on function public.load_home_announcements_v1(uuid) to authenticated;

create or replace function public.acknowledge_home_announcement_v1(
  p_announcement_id uuid,
  p_organization_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_acknowledged_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.can_receive_platform_announcement(p_announcement_id, p_organization_id) then
    raise exception 'Aviso não encontrado ou sem acesso.' using errcode = '42501';
  end if;

  insert into public.platform_announcement_reads(
    announcement_id,
    organization_id,
    user_id,
    acknowledged_at
  )
  values (
    p_announcement_id,
    p_organization_id,
    v_user_id,
    now()
  )
  on conflict (announcement_id, organization_id, user_id) do update
  set acknowledged_at = excluded.acknowledged_at
  returning acknowledged_at into v_acknowledged_at;

  return v_acknowledged_at;
end;
$$;

revoke all on function public.acknowledge_home_announcement_v1(uuid, uuid) from public, anon;
grant execute on function public.acknowledge_home_announcement_v1(uuid, uuid) to authenticated;

create or replace function public.load_platform_announcements_admin_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.announcements.view') then
    raise exception 'Sem permissão para visualizar avisos da plataforma.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'announcements',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', announcement.id,
          'title', announcement.title,
          'message', announcement.message,
          'priority', announcement.priority,
          'starts_at', announcement.starts_at,
          'ends_at', announcement.ends_at,
          'is_pinned', announcement.is_pinned,
          'requires_acknowledgment', announcement.requires_acknowledgment,
          'link_url', announcement.link_url,
          'is_active', announcement.is_active,
          'created_at', announcement.created_at,
          'updated_at', announcement.updated_at,
          'target_organization_ids', coalesce((
            select jsonb_agg(target.organization_id order by organization.name)
            from public.platform_announcement_targets target
            join public.organizations organization on organization.id = target.organization_id
            where target.announcement_id = announcement.id
          ), '[]'::jsonb),
          'target_organization_names', coalesce((
            select jsonb_agg(organization.name order by organization.name)
            from public.platform_announcement_targets target
            join public.organizations organization on organization.id = target.organization_id
            where target.announcement_id = announcement.id
          ), '[]'::jsonb),
          'acknowledgment_count', (
            select count(*)
            from public.platform_announcement_reads read_row
            where read_row.announcement_id = announcement.id
          )
        )
        order by announcement.is_active desc, announcement.created_at desc
      )
      from public.platform_announcements announcement
    ), '[]'::jsonb),
    'companies',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', organization.id,
          'name', organization.name,
          'status', organization.status
        )
        order by organization.name
      )
      from public.organizations organization
      where not private.is_platform_organization(organization.id)
        and organization.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.load_platform_announcements_admin_v1() from public, anon;
grant execute on function public.load_platform_announcements_admin_v1() to authenticated;

create or replace function public.save_platform_announcement_v1(
  p_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_pinned boolean,
  p_requires_acknowledgment boolean,
  p_link_url text,
  p_is_active boolean,
  p_target_organization_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_priority text := lower(coalesce(p_priority, 'info'));
  v_targets uuid[] := coalesce(p_target_organization_ids, '{}'::uuid[]);
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.announcements.manage') then
    raise exception 'Sem permissão para gerenciar avisos da plataforma.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'Informe o título do aviso.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_message, '')), '') is null then
    raise exception 'Informe a mensagem do aviso.' using errcode = '22023';
  end if;
  if char_length(btrim(p_title)) > 160 then
    raise exception 'O título deve ter no máximo 160 caracteres.' using errcode = '22023';
  end if;
  if char_length(btrim(p_message)) > 5000 then
    raise exception 'A mensagem deve ter no máximo 5000 caracteres.' using errcode = '22023';
  end if;
  if v_priority not in ('info', 'attention', 'important', 'critical') then
    raise exception 'Prioridade inválida.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()) then
    raise exception 'A data final deve ser posterior ao início.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_targets) target_id
    where not exists (
      select 1
      from public.organizations organization
      where organization.id = target_id
        and not private.is_platform_organization(organization.id)
    )
  ) then
    raise exception 'Uma das empresas selecionadas é inválida.' using errcode = '23503';
  end if;

  if p_id is null then
    insert into public.platform_announcements(
      title,
      message,
      priority,
      starts_at,
      ends_at,
      is_pinned,
      requires_acknowledgment,
      link_url,
      is_active
    )
    values (
      btrim(p_title),
      btrim(p_message),
      v_priority,
      coalesce(p_starts_at, now()),
      p_ends_at,
      coalesce(p_is_pinned, false),
      coalesce(p_requires_acknowledgment, false),
      nullif(btrim(coalesce(p_link_url, '')), ''),
      coalesce(p_is_active, true)
    )
    returning id into v_id;
  else
    update public.platform_announcements
    set title = btrim(p_title),
        message = btrim(p_message),
        priority = v_priority,
        starts_at = coalesce(p_starts_at, starts_at),
        ends_at = p_ends_at,
        is_pinned = coalesce(p_is_pinned, false),
        requires_acknowledgment = coalesce(p_requires_acknowledgment, false),
        link_url = nullif(btrim(coalesce(p_link_url, '')), ''),
        is_active = coalesce(p_is_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Aviso não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.platform_announcement_targets
  where announcement_id = v_id;

  insert into public.platform_announcement_targets(announcement_id, organization_id)
  select v_id, target_id
  from unnest(v_targets) target_id
  on conflict (announcement_id, organization_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.save_platform_announcement_v1(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text, boolean, uuid[]) from public, anon;
grant execute on function public.save_platform_announcement_v1(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text, boolean, uuid[]) to authenticated;

create or replace function public.set_platform_announcement_active_v1(
  p_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.announcements.manage') then
    raise exception 'Sem permissão para gerenciar avisos da plataforma.' using errcode = '42501';
  end if;

  update public.platform_announcements
  set is_active = p_is_active
  where id = p_id;

  if not found then
    raise exception 'Aviso não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_platform_announcement_active_v1(uuid, boolean) from public, anon;
grant execute on function public.set_platform_announcement_active_v1(uuid, boolean) to authenticated;

comment on table public.platform_announcements is 'Comunicados e avisos operacionais publicados pela Union World.';
comment on table public.platform_announcement_targets is 'Empresas específicas que recebem um aviso; ausência de linhas significa todas as empresas.';
comment on table public.platform_announcement_reads is 'Confirmações de leitura dos avisos por usuário e empresa.';

commit;
