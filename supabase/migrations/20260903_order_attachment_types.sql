begin;

create table if not exists public.attachment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attachment_types_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists attachment_types_name_unique
  on public.attachment_types (lower(btrim(name)));

alter table public.attachment_types enable row level security;

alter table public.service_order_situation_media
  add column if not exists attachment_type_id uuid
  references public.attachment_types(id) on delete restrict;

create index if not exists service_order_situation_media_type_idx
  on public.service_order_situation_media (attachment_type_id);

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('documents.attachment_types.view', 'Visualizar tipos de anexo', 'Permite consultar os tipos de anexo das ordens de serviço.', 'Documentos — Anexos', 1360),
  ('documents.attachment_types.create', 'Criar tipos de anexo', 'Permite cadastrar tipos de anexo.', 'Documentos — Anexos', 1361),
  ('documents.attachment_types.edit', 'Editar tipos de anexo', 'Permite alterar tipos de anexo.', 'Documentos — Anexos', 1362),
  ('documents.attachment_types.delete', 'Excluir tipos de anexo', 'Permite excluir tipos de anexo sem uso.', 'Documentos — Anexos', 1363)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, new_permission.id
from public.role_permissions rp
join public.permissions existing_permission on existing_permission.id = rp.permission_id
cross join public.permissions new_permission
where existing_permission.key = 'documents.view'
  and new_permission.key like 'documents.attachment_types.%'
on conflict do nothing;

drop policy if exists attachment_types_select on public.attachment_types;
create policy attachment_types_select on public.attachment_types
for select to authenticated
using (
  private.has_permission('documents.attachment_types.view')
  or private.has_permission('orders.section.images')
);

drop policy if exists attachment_types_insert on public.attachment_types;
create policy attachment_types_insert on public.attachment_types
for insert to authenticated
with check (private.has_permission('documents.attachment_types.create'));

drop policy if exists attachment_types_update on public.attachment_types;
create policy attachment_types_update on public.attachment_types
for update to authenticated
using (private.has_permission('documents.attachment_types.edit'))
with check (private.has_permission('documents.attachment_types.edit'));

drop policy if exists attachment_types_delete on public.attachment_types;
create policy attachment_types_delete on public.attachment_types
for delete to authenticated
using (private.has_permission('documents.attachment_types.delete'));

grant select, insert, update, delete on public.attachment_types to authenticated;

drop function if exists public.attach_service_order_situation_media(uuid, uuid, uuid);\n\ncreate or replace function public.attach_service_order_situation_media(
  p_service_order_id uuid,
  p_situation_id uuid,
  p_media_id uuid,
  p_attachment_type_id uuid default null
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

  if p_attachment_type_id is not null and not exists (
    select 1 from public.attachment_types t
    where t.id = p_attachment_type_id and t.is_active = true
  ) then
    raise exception 'Tipo de anexo inválido ou inativo.';
  end if;

  insert into public.service_order_situation_media (
    service_order_id, situation_id, media_id, attachment_type_id, uploaded_by
  ) values (
    p_service_order_id, p_situation_id, p_media_id, p_attachment_type_id, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.attach_service_order_situation_media(uuid, uuid, uuid, uuid) to authenticated;

commit;
