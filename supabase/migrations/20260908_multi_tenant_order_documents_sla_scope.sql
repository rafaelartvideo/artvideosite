-- Fechamento multiempresa dos dados auxiliares da OS:
-- documentos/imagens por situação e histórico de permanência/SLA.
--
-- As tabelas já herdam organization_id da OS pelas migrations de filhos.
-- Aqui substituímos permissões globais legadas por permissões efetivas na
-- empresa proprietária da OS, mantendo o compartilhamento explícito de orders.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_order_documents_sla_scope', 0)
);

-- ---------------------------------------------------------------------------
-- Imagens/documentos por situação
-- ---------------------------------------------------------------------------
create or replace function private.can_attach_order_situation_media(
  p_service_order_id uuid,
  p_situation_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service_type_id uuid;
  v_organization_id uuid;
begin
  select service_order.service_type_id, service_order.organization_id
    into v_service_type_id, v_organization_id
  from public.service_orders service_order
  where service_order.id = p_service_order_id;

  if v_organization_id is null then
    return false;
  end if;

  if not private.can_view_service_order(p_service_order_id) then
    return false;
  end if;

  if not private.can_access_shared_organization_resource(
    v_organization_id,
    'orders',
    'manage'
  ) then
    return false;
  end if;

  if not private.has_effective_organization_permission(
    v_organization_id,
    private.order_situation_upload_permission_key(p_situation_id)
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.os_situations situation
    where situation.id = p_situation_id
      and situation.organization_id = v_organization_id
      and situation.is_active = true
  ) then
    return false;
  end if;

  if v_service_type_id is not null and not exists (
    select 1
    from public.service_type_situations link
    where link.service_type_id = v_service_type_id
      and link.situation_id = p_situation_id
      and link.organization_id = v_organization_id
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.can_attach_order_situation_media(uuid, uuid) from public;
grant execute on function private.can_attach_order_situation_media(uuid, uuid) to authenticated;

alter table public.service_order_situation_media enable row level security;

drop policy if exists service_order_situation_media_select on public.service_order_situation_media;
create policy service_order_situation_media_select
on public.service_order_situation_media
for select
to authenticated
using (
  organization_id is not null
  and private.can_view_service_order(service_order_id)
  and private.can_access_shared_organization_resource(
    organization_id,
    'orders',
    'read'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'orders.section.images'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'orders.documents.view'
    )
  )
);

-- Escrita direta permanece bloqueada; anexos usam as RPCs validadas.
drop policy if exists service_order_situation_media_insert on public.service_order_situation_media;
drop policy if exists service_order_situation_media_update on public.service_order_situation_media;
drop policy if exists service_order_situation_media_delete on public.service_order_situation_media;
revoke insert, update, delete on public.service_order_situation_media from authenticated;

grant select on public.service_order_situation_media to authenticated;

-- ---------------------------------------------------------------------------
-- Anexo classificado da OS (sem situação)
-- ---------------------------------------------------------------------------
create or replace function public.attach_service_order_attachment(
  p_service_order_id uuid,
  p_media_id uuid,
  p_attachment_type_id uuid
)
returns public.service_order_situation_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.service_order_situation_media;
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select service_order.organization_id
    into v_organization_id
  from public.service_orders service_order
  where service_order.id = p_service_order_id;

  if v_organization_id is null then
    raise exception 'OS não encontrada.' using errcode = '23503';
  end if;

  if not private.can_view_service_order(p_service_order_id)
     or not private.can_access_shared_organization_resource(
       v_organization_id,
       'orders',
       'manage'
     )
     or not private.has_effective_organization_permission(
       v_organization_id,
       'orders.section.images'
     ) then
    raise exception 'Você não possui permissão para anexar arquivos nesta OS.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.media media where media.id = p_media_id) then
    raise exception 'Arquivo de mídia não encontrado.' using errcode = '23503';
  end if;

  if p_attachment_type_id is null or not exists (
    select 1
    from public.attachment_types attachment_type
    where attachment_type.id = p_attachment_type_id
      and attachment_type.is_active = true
  ) then
    raise exception 'Tipo de anexo inválido ou inativo.';
  end if;

  insert into public.service_order_situation_media (
    service_order_id,
    situation_id,
    media_id,
    attachment_type_id,
    uploaded_by
  ) values (
    p_service_order_id,
    null,
    p_media_id,
    p_attachment_type_id,
    (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.attach_service_order_attachment(uuid, uuid, uuid) from public;
grant execute on function public.attach_service_order_attachment(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Remoção de documento/imagem da OS
-- ---------------------------------------------------------------------------
create or replace function public.remove_service_order_situation_media(
  p_link_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.service_order_situation_media%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
    into v_link
  from public.service_order_situation_media
  where id = p_link_id;

  if not found then
    raise exception 'Documento não encontrado.';
  end if;

  if not private.can_view_service_order(v_link.service_order_id)
     or not private.can_access_shared_organization_resource(
       v_link.organization_id,
       'orders',
       'manage'
     )
     or not private.has_effective_organization_permission(
       v_link.organization_id,
       'orders.documents.remove'
     ) then
    raise exception 'Você não possui permissão para remover documentos desta OS nesta empresa.'
      using errcode = '42501';
  end if;

  delete from public.service_order_situation_media
  where id = p_link_id
    and organization_id = v_link.organization_id;

  return p_link_id;
end;
$$;

revoke all on function public.remove_service_order_situation_media(uuid) from public;
grant execute on function public.remove_service_order_situation_media(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Histórico de permanência / SLA da situação
-- ---------------------------------------------------------------------------
alter table public.service_order_situation_visits enable row level security;

drop policy if exists service_order_situation_visits_select on public.service_order_situation_visits;
create policy service_order_situation_visits_select
on public.service_order_situation_visits
for select
to authenticated
using (
  organization_id is not null
  and private.can_view_service_order(service_order_id)
  and private.can_access_shared_organization_resource(
    organization_id,
    'orders',
    'read'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'orders.section.sla_cards'
  )
);

grant select on public.service_order_situation_visits to authenticated;
revoke insert, update, delete on public.service_order_situation_visits from authenticated;

comment on function private.can_attach_order_situation_media(uuid, uuid) is
  'Valida OS, empresa, compartilhamento, situação do mesmo tenant e permissão específica para anexar mídia na situação.';

commit;
