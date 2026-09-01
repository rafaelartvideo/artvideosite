begin;

-- Anexos da OS vinculados a uma situação específica do fluxo.
-- Mantém service_order_media legado intacto e cria um vínculo explícito por situação.
create table if not exists public.service_order_situation_media (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  situation_id uuid not null references public.os_situations(id) on delete restrict,
  media_id uuid not null references public.media(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_order_situation_media_unique unique (service_order_id, situation_id, media_id)
);

create index if not exists service_order_situation_media_order_idx
  on public.service_order_situation_media (service_order_id, situation_id, created_at desc);

alter table public.service_order_situation_media enable row level security;

-- A chave da permissão é estável pelo UUID da situação, mesmo que o nome seja alterado.
create or replace function private.order_situation_upload_permission_key(p_situation_id uuid)
returns text
language sql
stable
set search_path = public, private
as $$
  select 'orders.images.situation.' || p_situation_id::text || '.upload';
$$;

-- Cria/atualiza automaticamente a permissão específica sempre que uma situação é cadastrada ou renomeada.
create or replace function public.sync_order_situation_attachment_permission()
returns trigger
language plpgsql
security definer
set search_path = public, private
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

  -- Preserva o acesso atual: funções que já podem visualizar imagens recebem inicialmente
  -- a nova permissão. Depois ela pode ser removida individualmente em Funções e Permissões.
  insert into public.role_permissions (role_id, permission_id)
  select distinct rp.role_id, v_permission_id
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id
  where p.key = 'orders.section.images'
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_sync_order_situation_attachment_permission on public.os_situations;
create trigger trg_sync_order_situation_attachment_permission
after insert or update of name, sort_order on public.os_situations
for each row execute function public.sync_order_situation_attachment_permission();

-- Gera as permissões para todas as situações já existentes.
do $$
declare
  v_situation record;
  v_permission_id uuid;
begin
  for v_situation in
    select id, name, sort_order from public.os_situations
  loop
    insert into public.permissions (key, label, description, module_name, sort_order)
    values (
      private.order_situation_upload_permission_key(v_situation.id),
      'Anexar imagens — ' || v_situation.name,
      'Permite anexar fotos e arquivos da situação "' || v_situation.name || '" nas imagens da ordem de serviço.',
      'Ordens de Serviço — Imagens por situação',
      1200 + coalesce(v_situation.sort_order, 0)
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
    join public.permissions p on p.id = rp.permission_id
    where p.key = 'orders.section.images'
    on conflict do nothing;
  end loop;
end $$;

-- Valida a OS, o tipo de atendimento e a permissão da situação antes do vínculo.
create or replace function private.can_attach_order_situation_media(
  p_service_order_id uuid,
  p_situation_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_service_type_id uuid;
begin
  if not private.can_view_service_order(p_service_order_id) then
    return false;
  end if;

  if not private.has_permission(private.order_situation_upload_permission_key(p_situation_id)) then
    return false;
  end if;

  select so.service_type_id
    into v_service_type_id
  from public.service_orders so
  where so.id = p_service_order_id;

  if not found then
    return false;
  end if;

  -- Se a OS possui tipo de atendimento, a situação precisa pertencer ao fluxo desse tipo.
  if v_service_type_id is not null and not exists (
    select 1
    from public.service_type_situations sts
    where sts.service_type_id = v_service_type_id
      and sts.situation_id = p_situation_id
  ) then
    return false;
  end if;

  return exists (
    select 1 from public.os_situations s
    where s.id = p_situation_id
      and s.is_active = true
  );
end;
$$;

create or replace function public.attach_service_order_situation_media(
  p_service_order_id uuid,
  p_situation_id uuid,
  p_media_id uuid
)
returns public.service_order_situation_media
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.service_order_situation_media;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not private.can_attach_order_situation_media(p_service_order_id, p_situation_id) then
    raise exception 'Você não possui permissão para anexar arquivos nesta situação da OS.';
  end if;

  if not exists (select 1 from public.media m where m.id = p_media_id) then
    raise exception 'Arquivo de mídia não encontrado.';
  end if;

  insert into public.service_order_situation_media (
    service_order_id,
    situation_id,
    media_id,
    uploaded_by
  ) values (
    p_service_order_id,
    p_situation_id,
    p_media_id,
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Leitura agrupada por situação depende da seção Imagens e da visibilidade da OS.
drop policy if exists service_order_situation_media_select on public.service_order_situation_media;
create policy service_order_situation_media_select
  on public.service_order_situation_media
  for select
  to authenticated
  using (
    private.has_permission('orders.section.images')
    and private.can_view_service_order(service_order_id)
  );

-- Escrita direta fica bloqueada: o frontend usa a RPC acima, que valida a permissão da situação.
drop policy if exists service_order_situation_media_insert on public.service_order_situation_media;
drop policy if exists service_order_situation_media_update on public.service_order_situation_media;
drop policy if exists service_order_situation_media_delete on public.service_order_situation_media;

grant select on public.service_order_situation_media to authenticated;
revoke insert, update, delete on public.service_order_situation_media from authenticated;
grant execute on function public.attach_service_order_situation_media(uuid, uuid, uuid) to authenticated;

commit;
