begin;

-- Configuração dos modelos de impressão usados nas Ordens de Serviço.
create table if not exists public.print_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  document_type text not null default 'CUSTOM',
  is_active boolean not null default true,
  paper_size text not null default 'A4',
  orientation text not null default 'portrait',
  margin_top numeric(8,2) not null default 12,
  margin_right numeric(8,2) not null default 12,
  margin_bottom numeric(8,2) not null default 12,
  margin_left numeric(8,2) not null default 12,
  show_logo boolean not null default true,
  show_company_info boolean not null default true,
  show_page_number boolean not null default false,
  show_printed_at boolean not null default true,
  header_text text,
  footer_text text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_templates_name_not_blank check (btrim(name) <> ''),
  constraint print_templates_document_type_not_blank check (btrim(document_type) <> ''),
  constraint print_templates_paper_size_check check (paper_size in ('A4')),
  constraint print_templates_orientation_check check (orientation in ('portrait', 'landscape')),
  constraint print_templates_margins_check check (
    margin_top >= 0 and margin_right >= 0 and margin_bottom >= 0 and margin_left >= 0
  )
);

create table if not exists public.print_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.print_templates(id) on delete cascade,
  section_key text not null,
  title text not null,
  sort_order integer not null default 0,
  columns smallint not null default 2,
  is_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_template_sections_key_not_blank check (btrim(section_key) <> ''),
  constraint print_template_sections_title_not_blank check (btrim(title) <> ''),
  constraint print_template_sections_columns_check check (columns between 1 and 3),
  constraint print_template_sections_unique_key unique (template_id, section_key)
);

create table if not exists public.print_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_section_id uuid not null references public.print_template_sections(id) on delete cascade,
  field_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_template_fields_key_not_blank check (btrim(field_key) <> ''),
  constraint print_template_fields_label_not_blank check (btrim(label) <> ''),
  constraint print_template_fields_unique_key unique (template_section_id, field_key)
);

create index if not exists print_templates_active_sort_idx
  on public.print_templates(is_active, name);
create index if not exists print_template_sections_template_sort_idx
  on public.print_template_sections(template_id, sort_order, id);
create index if not exists print_template_fields_section_sort_idx
  on public.print_template_fields(template_section_id, sort_order, id);

-- updated_at centralizado para o módulo.
create or replace function public.set_print_template_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_print_templates_updated_at on public.print_templates;
create trigger trg_print_templates_updated_at
before update on public.print_templates
for each row execute function public.set_print_template_updated_at();

drop trigger if exists trg_print_template_sections_updated_at on public.print_template_sections;
create trigger trg_print_template_sections_updated_at
before update on public.print_template_sections
for each row execute function public.set_print_template_updated_at();

drop trigger if exists trg_print_template_fields_updated_at on public.print_template_fields;
create trigger trg_print_template_fields_updated_at
before update on public.print_template_fields
for each row execute function public.set_print_template_updated_at();

-- Permissões do módulo Operação > Documentos.
insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('documents.view', 'Visualizar documentos', 'Permite acessar os modelos de documentos e impressão.', 'Documentos', 1300),
  ('documents.create', 'Criar documentos', 'Permite criar modelos de documentos e impressão.', 'Documentos', 1310),
  ('documents.edit', 'Editar documentos', 'Permite alterar modelos, seções, campos e layout de impressão.', 'Documentos', 1320),
  ('documents.toggle_active', 'Ativar ou desativar documentos', 'Permite disponibilizar ou ocultar modelos no menu de impressão.', 'Documentos', 1330),
  ('documents.print', 'Imprimir documentos', 'Permite gerar e imprimir documentos configurados a partir de uma OS.', 'Documentos', 1340)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Compatibilidade inicial: funções que já administram OS recebem acesso ao novo módulo.
insert into public.role_permissions (role_id, permission_id)
select distinct source.role_id, target.id
from public.role_permissions source
join public.permissions source_permission
  on source_permission.id = source.permission_id
 and source_permission.key in ('orders.view', 'orders.view_all', 'orders.edit')
cross join public.permissions target
where target.key in ('documents.view', 'documents.create', 'documents.edit', 'documents.toggle_active', 'documents.print')
on conflict (role_id, permission_id) do nothing;

alter table public.print_templates enable row level security;
alter table public.print_template_sections enable row level security;
alter table public.print_template_fields enable row level security;

-- Leitura: quem pode acessar ou imprimir documentos.
drop policy if exists print_templates_select on public.print_templates;
create policy print_templates_select
on public.print_templates for select
to authenticated
using (
  private.has_permission('documents.view')
  or private.has_permission('documents.print')
);

drop policy if exists print_template_sections_select on public.print_template_sections;
create policy print_template_sections_select
on public.print_template_sections for select
to authenticated
using (
  exists (
    select 1
    from public.print_templates template
    where template.id = print_template_sections.template_id
  )
);

drop policy if exists print_template_fields_select on public.print_template_fields;
create policy print_template_fields_select
on public.print_template_fields for select
to authenticated
using (
  exists (
    select 1
    from public.print_template_sections section
    where section.id = print_template_fields.template_section_id
  )
);

-- Criação/edição dos templates principais.
drop policy if exists print_templates_insert on public.print_templates;
create policy print_templates_insert
on public.print_templates for insert
to authenticated
with check (private.has_permission('documents.create'));

drop policy if exists print_templates_update on public.print_templates;
create policy print_templates_update
on public.print_templates for update
to authenticated
using (
  private.has_permission('documents.edit')
  or private.has_permission('documents.toggle_active')
)
with check (
  private.has_permission('documents.edit')
  or private.has_permission('documents.toggle_active')
);

-- Seções e campos só podem ser alterados por quem edita modelos.
drop policy if exists print_template_sections_insert on public.print_template_sections;
create policy print_template_sections_insert
on public.print_template_sections for insert
to authenticated
with check (private.has_permission('documents.edit'));

drop policy if exists print_template_sections_update on public.print_template_sections;
create policy print_template_sections_update
on public.print_template_sections for update
to authenticated
using (private.has_permission('documents.edit'))
with check (private.has_permission('documents.edit'));

drop policy if exists print_template_sections_delete on public.print_template_sections;
create policy print_template_sections_delete
on public.print_template_sections for delete
to authenticated
using (private.has_permission('documents.edit'));

drop policy if exists print_template_fields_insert on public.print_template_fields;
create policy print_template_fields_insert
on public.print_template_fields for insert
to authenticated
with check (private.has_permission('documents.edit'));

drop policy if exists print_template_fields_update on public.print_template_fields;
create policy print_template_fields_update
on public.print_template_fields for update
to authenticated
using (private.has_permission('documents.edit'))
with check (private.has_permission('documents.edit'));

drop policy if exists print_template_fields_delete on public.print_template_fields;
create policy print_template_fields_delete
on public.print_template_fields for delete
to authenticated
using (private.has_permission('documents.edit'));

-- Templates não são apagados pelo painel: devem ser desativados para preservar configurações.
-- Não existe policy DELETE em print_templates intencionalmente.


-- Quem possui apenas documents.toggle_active pode alterar somente o estado ativo.
create or replace function private.guard_print_template_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if private.has_permission('documents.edit') then
    return new;
  end if;

  if not private.has_permission('documents.toggle_active') then
    raise exception 'Você não possui permissão para alterar este documento.' using errcode = '42501';
  end if;

  if (to_jsonb(new) - 'is_active' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'is_active' - 'updated_at') then
    raise exception 'Esta permissão permite somente ativar ou desativar o documento.' using errcode = '42501';
  end if;

  return new;
end;
$;

drop trigger if exists trg_guard_print_template_update on public.print_templates;
create trigger trg_guard_print_template_update
before update on public.print_templates
for each row execute function private.guard_print_template_update();

commit;
