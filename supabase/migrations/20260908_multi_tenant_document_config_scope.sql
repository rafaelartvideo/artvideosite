-- Multiempresa: isolamento das configurações do módulo Documentos.
-- Escopo: modelos de impressão, seções/campos dos modelos e tipos de anexo.
-- Configurações administrativas são editáveis somente pela empresa proprietária.
-- Leitura cruzada continua condicionada ao compartilhamento explícito de OS.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_document_config_scope', 0)
);

create or replace function private.can_read_document_config(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_module_enabled(p_organization_id, 'documents')
    and (
      private.can_manage_own_operation_config(
        p_organization_id,
        'documents',
        p_permission_key
      )
      or (
        private.can_access_shared_organization_resource(
          p_organization_id,
          'orders',
          'read'
        )
        and private.has_effective_organization_permission(
          p_organization_id,
          p_permission_key
        )
      )
    );
$$;

revoke all on function private.can_read_document_config(uuid, text) from public;
grant execute on function private.can_read_document_config(uuid, text) to authenticated;

create or replace function private.ensure_print_template_section_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select template.organization_id
    into v_organization_id
  from public.print_templates template
  where template.id = new.template_id;

  if v_organization_id is null then
    raise exception 'Modelo de impressão não encontrado.' using errcode = '23503';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

revoke all on function private.ensure_print_template_section_organization() from public;

alter table public.print_templates enable row level security;
alter table public.print_template_sections enable row level security;
alter table public.print_template_fields enable row level security;
alter table public.attachment_types enable row level security;

-- organization_id é imutável nos registros raiz de configuração.
drop trigger if exists print_templates_prevent_organization_change on public.print_templates;
create trigger print_templates_prevent_organization_change
before update of organization_id on public.print_templates
for each row execute function private.prevent_organization_id_change();

drop trigger if exists attachment_types_prevent_organization_change on public.attachment_types;
create trigger attachment_types_prevent_organization_change
before update of organization_id on public.attachment_types
for each row execute function private.prevent_organization_id_change();

drop trigger if exists print_template_sections_validate_organization on public.print_template_sections;
create trigger print_template_sections_validate_organization
before insert or update of template_id, organization_id on public.print_template_sections
for each row execute function private.ensure_print_template_section_organization();

-- Tipos de anexo podem ter o mesmo nome em empresas diferentes.
drop index if exists public.attachment_types_name_unique;
create unique index if not exists attachment_types_organization_name_unique
  on public.attachment_types (organization_id, lower(btrim(name)));

-- Remove policies legadas authenticated destas configurações.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'print_templates',
        'print_template_sections',
        'print_template_fields',
        'attachment_types'
      )
      and 'authenticated' = any (roles)
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  end loop;
end
$$;

-- Modelos de impressão.
create policy print_templates_tenant_select on public.print_templates
for select to authenticated using (
  private.can_read_document_config(organization_id, 'documents.view')
  or private.can_read_document_config(organization_id, 'documents.print')
);

create policy print_templates_tenant_insert on public.print_templates
for insert to authenticated with check (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.create'
  )
);

create policy print_templates_tenant_update on public.print_templates
for update to authenticated using (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.edit'
  )
  or private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.toggle_active'
  )
) with check (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.edit'
  )
  or private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.toggle_active'
  )
);

-- Seções herdam obrigatoriamente a empresa do modelo.
create policy print_template_sections_tenant_select on public.print_template_sections
for select to authenticated using (
  private.can_read_document_config(organization_id, 'documents.view')
  or private.can_read_document_config(organization_id, 'documents.print')
);

create policy print_template_sections_tenant_insert on public.print_template_sections
for insert to authenticated with check (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.edit'
  )
);

create policy print_template_sections_tenant_update on public.print_template_sections
for update to authenticated using (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.edit'
  )
) with check (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.edit'
  )
);

create policy print_template_sections_tenant_delete on public.print_template_sections
for delete to authenticated using (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.edit'
  )
);

-- Campos herdam o tenant pela seção pai; não duplicamos organization_id aqui.
create policy print_template_fields_tenant_select on public.print_template_fields
for select to authenticated using (
  exists (
    select 1
    from public.print_template_sections section
    where section.id = print_template_fields.template_section_id
      and (
        private.can_read_document_config(section.organization_id, 'documents.view')
        or private.can_read_document_config(section.organization_id, 'documents.print')
      )
  )
);

create policy print_template_fields_tenant_insert on public.print_template_fields
for insert to authenticated with check (
  exists (
    select 1
    from public.print_template_sections section
    where section.id = print_template_fields.template_section_id
      and private.can_manage_own_operation_config(
        section.organization_id,
        'documents',
        'documents.edit'
      )
  )
);

create policy print_template_fields_tenant_update on public.print_template_fields
for update to authenticated using (
  exists (
    select 1
    from public.print_template_sections section
    where section.id = print_template_fields.template_section_id
      and private.can_manage_own_operation_config(
        section.organization_id,
        'documents',
        'documents.edit'
      )
  )
) with check (
  exists (
    select 1
    from public.print_template_sections section
    where section.id = print_template_fields.template_section_id
      and private.can_manage_own_operation_config(
        section.organization_id,
        'documents',
        'documents.edit'
      )
  )
);

create policy print_template_fields_tenant_delete on public.print_template_fields
for delete to authenticated using (
  exists (
    select 1
    from public.print_template_sections section
    where section.id = print_template_fields.template_section_id
      and private.can_manage_own_operation_config(
        section.organization_id,
        'documents',
        'documents.edit'
      )
  )
);

-- Tipos de anexo.
create policy attachment_types_tenant_select on public.attachment_types
for select to authenticated using (
  (
    private.is_organization_module_enabled(organization_id, 'documents')
    and private.is_organization_member(organization_id)
    and (
      private.has_effective_organization_permission(
        organization_id,
        'documents.attachment_types.view'
      )
      or private.has_effective_organization_permission(
        organization_id,
        'orders.section.images'
      )
    )
  )
  or (
    private.can_access_shared_organization_resource(
      organization_id,
      'orders',
      'read'
    )
    and private.has_effective_organization_permission(
      organization_id,
      'orders.section.images'
    )
  )
);

create policy attachment_types_tenant_insert on public.attachment_types
for insert to authenticated with check (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.attachment_types.create'
  )
);

create policy attachment_types_tenant_update on public.attachment_types
for update to authenticated using (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.attachment_types.edit'
  )
) with check (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.attachment_types.edit'
  )
);

create policy attachment_types_tenant_delete on public.attachment_types
for delete to authenticated using (
  private.can_manage_own_operation_config(
    organization_id,
    'documents',
    'documents.attachment_types.delete'
  )
);

-- Mantém a regra de toggle-only, agora respeitando a empresa do template.
create or replace function private.guard_print_template_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A empresa do modelo de impressão não pode ser alterada.'
      using errcode = '42501';
  end if;

  if private.can_manage_own_operation_config(
    old.organization_id,
    'documents',
    'documents.edit'
  ) then
    return new;
  end if;

  if not private.can_manage_own_operation_config(
    old.organization_id,
    'documents',
    'documents.toggle_active'
  ) then
    raise exception 'Você não possui permissão para alterar este documento.'
      using errcode = '42501';
  end if;

  if (to_jsonb(new) - 'is_active' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'is_active' - 'updated_at') then
    raise exception 'Esta permissão permite somente ativar ou desativar o documento.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Garante que um tipo de anexo usado numa OS pertença à mesma empresa da OS.
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
     or not private.can_access_shared_organization_resource(v_organization_id, 'orders', 'manage')
     or not private.has_effective_organization_permission(v_organization_id, 'orders.section.images') then
    raise exception 'Você não possui permissão para anexar arquivos nesta OS nesta empresa.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.media media
    where media.id = p_media_id
      and media.organization_id = v_organization_id
  ) then
    raise exception 'Arquivo de mídia não encontrado nesta empresa.' using errcode = '23503';
  end if;

  if p_attachment_type_id is null or not exists (
    select 1
    from public.attachment_types attachment_type
    where attachment_type.id = p_attachment_type_id
      and attachment_type.organization_id = v_organization_id
      and attachment_type.is_active = true
  ) then
    raise exception 'Tipo de anexo inválido, inativo ou pertencente a outra empresa.';
  end if;

  insert into public.service_order_situation_media (
    service_order_id,
    situation_id,
    media_id,
    attachment_type_id,
    uploaded_by,
    organization_id
  ) values (
    p_service_order_id,
    null,
    p_media_id,
    p_attachment_type_id,
    (select auth.uid()),
    v_organization_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.attach_service_order_attachment(uuid, uuid, uuid) from public;
grant execute on function public.attach_service_order_attachment(uuid, uuid, uuid) to authenticated;

create or replace function public.attach_service_order_situation_media(
  p_service_order_id uuid,
  p_situation_id uuid,
  p_media_id uuid,
  p_attachment_type_id uuid default null
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

  if not private.can_attach_order_situation_media(
    p_service_order_id,
    p_situation_id
  ) then
    raise exception 'Você não possui permissão para anexar arquivos nesta situação da OS.'
      using errcode = '42501';
  end if;

  select service_order.organization_id
    into v_organization_id
  from public.service_orders service_order
  where service_order.id = p_service_order_id;

  if not exists (
    select 1
    from public.media media
    where media.id = p_media_id
      and media.organization_id = v_organization_id
  ) then
    raise exception 'Arquivo de mídia não encontrado nesta empresa.' using errcode = '23503';
  end if;

  if p_attachment_type_id is not null and not exists (
    select 1
    from public.attachment_types attachment_type
    where attachment_type.id = p_attachment_type_id
      and attachment_type.organization_id = v_organization_id
      and attachment_type.is_active = true
  ) then
    raise exception 'Tipo de anexo inválido, inativo ou pertencente a outra empresa.';
  end if;

  insert into public.service_order_situation_media (
    service_order_id,
    situation_id,
    media_id,
    attachment_type_id,
    uploaded_by,
    organization_id
  ) values (
    p_service_order_id,
    p_situation_id,
    p_media_id,
    p_attachment_type_id,
    (select auth.uid()),
    v_organization_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.attach_service_order_situation_media(uuid, uuid, uuid, uuid) from public;
grant execute on function public.attach_service_order_situation_media(uuid, uuid, uuid, uuid) to authenticated;

comment on function private.can_read_document_config(uuid, text) is
  'Valida módulo Documentos, empresa, compartilhamento explícito de OS e permissão efetiva antes de ler configurações documentais.';

commit;
