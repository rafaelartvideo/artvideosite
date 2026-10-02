begin;

-- Garantias configuráveis por serviço geral da operação.
create table if not exists public.service_warranty_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  general_service_id uuid not null references public.general_services(id) on delete cascade,
  title text not null,
  content text not null default '',
  warranty_days integer not null default 90 check (warranty_days between 0 and 3650),
  version integer not null default 1 check (version >= 1),
  is_active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, general_service_id)
);

create index if not exists service_warranty_terms_org_service_idx
  on public.service_warranty_terms (organization_id, general_service_id);

alter table public.service_warranty_terms enable row level security;

drop policy if exists service_warranty_terms_select on public.service_warranty_terms;
create policy service_warranty_terms_select
on public.service_warranty_terms for select to authenticated
using (
  private.is_organization_member(organization_id)
  and (
    private.has_effective_organization_permission(organization_id, 'terms.view')
    or private.has_effective_organization_permission(organization_id, 'terms.manage')
  )
);

revoke insert, update, delete on public.service_warranty_terms from anon, authenticated;
grant select on public.service_warranty_terms to authenticated;

-- O módulo agora concentra termos obrigatórios e garantias dos serviços.
update public.permissions
set
  label = case
    when key = 'terms.view' then 'Visualizar termos e garantias'
    when key = 'terms.manage' then 'Gerenciar termos e garantias'
    else label
  end,
  description = case
    when key = 'terms.view' then 'Permite acessar os termos da empresa e as garantias configuradas para os serviços.'
    when key = 'terms.manage' then 'Permite editar e publicar os termos da empresa e configurar garantias por serviço.'
    else description
  end,
  module_name = 'Termos / Garantia'
where key in ('terms.view', 'terms.manage');

create or replace function public.list_service_warranty_terms_v1(p_organization_id uuid)
returns table (
  general_service_id uuid,
  service_name text,
  service_is_active boolean,
  warranty_id uuid,
  title text,
  content text,
  warranty_days integer,
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
    service.id as general_service_id,
    service.name as service_name,
    service.is_active as service_is_active,
    warranty.id as warranty_id,
    warranty.title,
    warranty.content,
    warranty.warranty_days,
    coalesce(warranty.version, 0) as version,
    coalesce(warranty.is_active, false) as is_active,
    warranty.updated_at
  from public.general_services service
  left join public.service_warranty_terms warranty
    on warranty.organization_id = service.organization_id
   and warranty.general_service_id = service.id
  where service.organization_id = p_organization_id
    and private.is_organization_member(p_organization_id)
    and (
      private.has_effective_organization_permission(p_organization_id, 'terms.view')
      or private.has_effective_organization_permission(p_organization_id, 'terms.manage')
    )
  order by service.is_active desc, lower(service.name), service.id;
$$;

create or replace function public.save_service_warranty_term_v1(
  p_organization_id uuid,
  p_general_service_id uuid,
  p_title text,
  p_content text,
  p_warranty_days integer,
  p_is_active boolean default true
)
returns public.service_warranty_terms
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing public.service_warranty_terms;
  v_result public.service_warranty_terms;
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
  v_days integer := coalesce(p_warranty_days, 0);
begin
  if not private.is_organization_member(p_organization_id)
     or not private.has_effective_organization_permission(p_organization_id, 'terms.manage') then
    raise exception 'Sem permissão para gerenciar termos e garantias.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.general_services service
    where service.id = p_general_service_id
      and service.organization_id = p_organization_id
  ) then
    raise exception 'Serviço não encontrado para esta empresa.' using errcode = '22023';
  end if;

  if v_title = '' then
    raise exception 'Informe o título do termo de garantia.' using errcode = '22023';
  end if;

  if v_days < 0 or v_days > 3650 then
    raise exception 'O prazo da garantia deve estar entre 0 e 3650 dias.' using errcode = '22023';
  end if;

  if coalesce(p_is_active, false) and v_days <= 0 then
    raise exception 'Informe um prazo de garantia maior que zero antes de ativar.' using errcode = '22023';
  end if;

  if coalesce(p_is_active, false) and v_content = '' then
    raise exception 'Informe o conteúdo do termo de garantia antes de ativar.' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.service_warranty_terms
  where organization_id = p_organization_id
    and general_service_id = p_general_service_id
  for update;

  if found then
    update public.service_warranty_terms
    set
      title = v_title,
      content = v_content,
      warranty_days = v_days,
      is_active = coalesce(p_is_active, false),
      version = case
        when title is distinct from v_title
          or content is distinct from v_content
          or warranty_days is distinct from v_days
          or is_active is distinct from coalesce(p_is_active, false)
        then version + 1
        else version
      end,
      updated_by = (select auth.uid()),
      updated_at = now()
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.service_warranty_terms (
      organization_id,
      general_service_id,
      title,
      content,
      warranty_days,
      version,
      is_active,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_general_service_id,
      v_title,
      v_content,
      v_days,
      1,
      coalesce(p_is_active, false),
      (select auth.uid()),
      (select auth.uid())
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.list_service_warranty_terms_v1(uuid) from public, anon;
revoke all on function public.save_service_warranty_term_v1(uuid, uuid, text, text, integer, boolean) from public, anon;
grant execute on function public.list_service_warranty_terms_v1(uuid) to authenticated;
grant execute on function public.save_service_warranty_term_v1(uuid, uuid, text, text, integer, boolean) to authenticated;

-- Auditoria: termos, aceites e garantias pertencem ao mesmo módulo.
create or replace function private.audit_module_for_table(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_table like 'financial_%' then 'finance'
    when p_table like 'inventory_%' or p_table = 'entity_supplier_items' then 'inventory'
    when p_table like 'service_order_%' or p_table = 'service_orders' or p_table like 'checklist_%' then 'orders'
    when p_table like 'appointment_%' or p_table = 'appointments' then 'agenda'
    when p_table in ('customers','customer_addresses','customer_equipments') then 'customers'
    when p_table in ('entities','entity_addresses','entity_contacts','entity_records','entity_record_media') then 'registrations'
    when p_table in ('employees','roles','role_permissions','user_permission_overrides','organization_members') then 'employees'
    when p_table like 'equipment_%' or p_table = 'technical_fields' then 'equipment'
    when p_table in ('service_types','service_type_situations') then 'service_types'
    when p_table in ('os_situations') then 'order_situations'
    when p_table in ('order_statuses') then 'order_statuses'
    when p_table like 'print_template%' or p_table like 'document_signature%' or p_table = 'attachment_types' then 'documents'
    when p_table like 'quote_%' or p_table = 'request_statuses' then 'quotes'
    when p_table in ('organization_terms','organization_term_acceptances','service_warranty_terms') then 'terms'
    when p_table in ('services','service_categories','service_sections','service_inclusions','service_exclusions','service_faqs','service_price_factors','service_variants','service_filter_options') then 'site_services'
    when p_table in ('products','product_categories') then 'site_products'
    when p_table = 'brands' then 'site_brands'
    when p_table in ('site_pages','site_page_sections','site_settings','navigation_items','contact_fields','filters','filter_options') then 'site_settings'
    when p_table = 'organization_company_settings' then 'company_settings'
    when p_table = 'organization_modules' then 'organizations'
    when p_table = 'general_services' then 'services'
    else 'system'
  end;
$$;

drop trigger if exists universal_audit_row_changes on public.organization_terms;
create trigger universal_audit_row_changes
after insert or update or delete on public.organization_terms
for each row execute function private.audit_log_row_change();

drop trigger if exists universal_audit_row_changes on public.organization_term_acceptances;
create trigger universal_audit_row_changes
after insert or update or delete on public.organization_term_acceptances
for each row execute function private.audit_log_row_change();

drop trigger if exists universal_audit_row_changes on public.service_warranty_terms;
create trigger universal_audit_row_changes
after insert or update or delete on public.service_warranty_terms
for each row execute function private.audit_log_row_change();

commit;
