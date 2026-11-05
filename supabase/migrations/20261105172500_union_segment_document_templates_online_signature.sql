begin;

-- Immutable baseline owned by Union, captured once from the Artvideo document layouts.
-- Each partner receives an independent editable copy, never a live reference to Artvideo.
create table if not exists private.union_segment_document_blueprints (
  document_type text primary key,
  template_config jsonb not null,
  sections jsonb not null,
  created_at timestamptz not null default now()
);

insert into private.union_segment_document_blueprints(document_type, template_config, sections)
select t.document_type,
  to_jsonb(t) - 'id' - 'organization_id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
    || jsonb_build_object('allow_online_signature',true, 'require_external_signature',true,
      'require_employee_signature',false, 'employee_signature_source',null,
      'signature_link_ttl_hours',72, 'name',
      case t.document_type when 'ENTRADA' then 'Checklist de Entrada'
          when 'OS' then 'Ordem de Serviço de Entrada de Equipamento'
          else 'Orçamento' end,
      'settings', case when t.document_type='ORCAMENTO'
        then t.settings || jsonb_build_object('section_columns',
          coalesce(t.settings->'section_columns','{}'::jsonb) || '{"quote":2}'::jsonb)
        else t.settings end),
  (select coalesce(jsonb_agg(
     jsonb_build_object('section_key',s.section_key,'title',s.title,'sort_order',s.sort_order,
       'columns',s.columns,'is_enabled',s.is_enabled,'settings',s.settings,
       'fields',(select coalesce(jsonb_agg(
          jsonb_build_object('field_key',f.field_key,'label',f.label,'sort_order',f.sort_order,
            'is_enabled',f.is_enabled,'settings',f.settings) order by f.sort_order),'[]'::jsonb)
         from public.print_template_fields f where f.template_section_id=s.id))
     order by s.sort_order),'[]'::jsonb)
   from public.print_template_sections s where s.template_id=t.id)
from public.print_templates t
join public.organizations o on o.id=t.organization_id
where o.name='Artvideo Jmg'
  and ((t.document_type='ORCAMENTO' and t.name='Orçamento')
    or (t.document_type='OS' and t.name ilike 'Ordem De Serviço De Entrada De Equipamento')
    or (t.document_type='ENTRADA' and t.name ilike 'Checklist De Entrada'))
on conflict (document_type) do nothing;

do $check$
begin
  if (select count(*) from private.union_segment_document_blueprints
       where document_type in ('ORCAMENTO','OS','ENTRADA'))<>3 then
    raise exception 'Missing Union document blueprints: required OS, ENTRADA, ORCAMENTO';
  end if;
  if exists (
    select 1 from private.union_segment_document_blueprints b
    where not exists(select 1 from jsonb_array_elements(b.sections) s
      join lateral jsonb_array_elements(s->'fields') f on true
      where f->>'field_key'='signatures.customer' and coalesce((f->>'is_enabled')::boolean,true))
  ) then raise exception 'Required customer signature field missing from a blueprint';
  end if;
end $check$;

create or replace function private.seed_union_segment_document_templates(p_org uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare
  d record;
  section jsonb;
  f jsonb;
  v_template uuid;
  v_section uuid;
begin
  if p_org is null
     or not exists(select 1 from public.organizations where id=p_org and status='active')
     or not exists(select 1 from public.organization_segments where organization_id=p_org)
  then return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('union-document-seed:'||p_org::text,0));

  for d in
    select document_type, template_config, sections
    from private.union_segment_document_blueprints
    order by case document_type when 'OS' then 1 when 'ENTRADA' then 2 else 3 end
  loop
    -- Only add the Union default if no document of the SAME type and name exists.
    -- Existing customized documents (e.g. Orçamento Técnico) are left intact.
    if exists(select 1 from public.print_templates
      where organization_id=p_org and document_type=d.document_type
        and lower(btrim(name))=lower(btrim(d.template_config->>'name')))
    then continue;
    end if;

    insert into public.print_templates (
      organization_id,name,description,document_type,is_active,
      paper_size,orientation,margin_top,margin_right,margin_bottom,margin_left,
      show_logo,show_company_info,show_page_number,show_printed_at,
      header_text,footer_text,settings,
      allow_online_signature,signature_link_ttl_hours,require_external_signature,
      require_employee_signature,employee_signature_source
    ) values (
      p_org,d.template_config->>'name',d.template_config->>'description',d.document_type,true,
      coalesce(d.template_config->>'paper_size','A4'),
      coalesce(d.template_config->>'orientation','portrait'),
      coalesce((d.template_config->>'margin_top')::numeric,12),
      coalesce((d.template_config->>'margin_right')::numeric,12),
      coalesce((d.template_config->>'margin_bottom')::numeric,12),
      coalesce((d.template_config->>'margin_left')::numeric,12),
      coalesce((d.template_config->>'show_logo')::boolean,true),
      coalesce((d.template_config->>'show_company_info')::boolean,true),
      coalesce((d.template_config->>'show_page_number')::boolean,false),
      coalesce((d.template_config->>'show_printed_at')::boolean,true),
      d.template_config->>'header_text',d.template_config->>'footer_text',
      coalesce(d.template_config->'settings','{}'::jsonb),
      true,coalesce((d.template_config->>'signature_link_ttl_hours')::int,72),
      true,false,null
    ) returning id into v_template;

    for section in select value from pg_catalog.jsonb_array_elements(d.sections)
      with ordinality as x(value,ord) order by ord
    loop
      insert into public.print_template_sections(
        template_id, organization_id, section_key, title, sort_order, columns, is_enabled, settings
      ) values (
        v_template,p_org,section->>'section_key',section->>'title',
        (section->>'sort_order')::int,(section->>'columns')::smallint,
        coalesce((section->>'is_enabled')::boolean,true),
        coalesce(section->'settings','{}'::jsonb)
      ) returning id into v_section;
      for f in select value from pg_catalog.jsonb_array_elements(section->'fields')
        with ordinality as x(value,ord) order by ord
      loop
        insert into public.print_template_fields(
          template_section_id,field_key,label,sort_order,is_enabled,settings
        ) values (
          v_section,f->>'field_key',f->>'label',(f->>'sort_order')::int,
          coalesce((f->>'is_enabled')::boolean,true),coalesce(f->'settings','{}'::jsonb)
        );
      end loop;
    end loop;
  end loop;
end $fn$;

revoke all on function private.seed_union_segment_document_templates(uuid) from public,anon,authenticated;

create or replace function private.seed_union_segment_documents_after_assignment()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  perform private.seed_union_segment_document_templates(new.organization_id);
  return new;
end $fn$;

drop trigger if exists organization_segments_seed_union_documents on public.organization_segments;
create trigger organization_segments_seed_union_documents
after insert on public.organization_segments
for each row execute function private.seed_union_segment_documents_after_assignment();

-- Existing companies with selected segments receive missing defaults only.
do $bootstrap$
declare v record;
begin
  for v in select distinct organization_id from public.organization_segments loop
    perform private.seed_union_segment_document_templates(v.organization_id);
  end loop;
end $bootstrap$;

-- Artvideo's reference quote already has a customer signature field.
-- Enable online signing without altering its personalized layout or content.
update public.print_templates t set allow_online_signature=true
from public.organizations o
where t.organization_id=o.id and o.name='Artvideo Jmg'
  and t.document_type='ORCAMENTO' and t.name='Orçamento'
  and t.allow_online_signature=false
  and t.require_external_signature=true
  and exists (
    select 1 from public.print_template_sections s
    join public.print_template_fields f on f.template_section_id=s.id
    where s.template_id=t.id and s.section_key='signatures'
      and f.field_key='signatures.customer' and f.is_enabled=true
  );

commit;