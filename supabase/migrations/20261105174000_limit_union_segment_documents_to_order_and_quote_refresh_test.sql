begin;

-- The Union segment starter pack has exactly two editable documents:
-- OS de Entrada and Orcamento. The Artvideo source documents remain intact.
do $update$
declare
  v_artvideo uuid := '00000000-0000-4000-8000-000000000001';
  v_teste uuid := '5bcd7ec7-38f0-4dda-a84c-10429bd46b23';
  v_source public.print_templates%rowtype;
  v_target public.print_templates%rowtype;
  v_type text;
  v_section record;
  v_new_section uuid;
  v_seed_checklist_count integer;
  v_legacy_test_count integer;
begin
  -- Do not touch original Artvideo checklist nor previously signed documents.
  select count(*) into v_seed_checklist_count
  from public.print_templates t
  where t.document_type='ENTRADA'
    and lower(btrim(t.name))=lower('Checklist de Entrada')
    and t.organization_id <> v_artvideo
    and exists(select 1 from public.organization_segments os where os.organization_id=t.organization_id)
    and t.created_at=t.updated_at
    and t.settings=(select template_config->'settings' from private.union_segment_document_blueprints
      where document_type='ENTRADA')
    and not exists(select 1 from public.document_signature_requests r where r.print_template_id=t.id);
  if v_seed_checklist_count <> 2 then
    raise exception 'Quantidade inesperada dos checklists automaticamente criados: %. Nenhum documento foi alterado.',v_seed_checklist_count;
  end if;

  delete from public.print_templates t
  where t.document_type='ENTRADA'
    and lower(btrim(t.name))=lower('Checklist de Entrada')
    and t.organization_id <> v_artvideo
    and exists(select 1 from public.organization_segments os where os.organization_id=t.organization_id)
    and t.created_at=t.updated_at
    and t.settings=(select template_config->'settings' from private.union_segment_document_blueprints
      where document_type='ENTRADA')
    and not exists(select 1 from public.document_signature_requests r where r.print_template_id=t.id);

  delete from private.union_segment_document_blueprints where document_type='ENTRADA';

  -- Refresh BOTH starters from the current Artvideo templates. The user explicitly
  -- wants the latest version in Teste; do not rewrite other partner customizations.
  foreach v_type in array array['OS','ORCAMENTO'] loop
    select t.* into strict v_source
    from public.print_templates t
    where t.organization_id=v_artvideo and t.document_type=v_type
      and (v_type='ORCAMENTO' and t.name='Orçamento'
        or v_type='OS' and t.name ilike 'Ordem De Serviço De Entrada De Equipamento');

    select t.* into strict v_target
    from public.print_templates t
    where t.organization_id=v_teste and t.document_type=v_type
      and (v_type='ORCAMENTO' and t.name='Orçamento'
        or v_type='OS' and t.name ilike 'Ordem De Serviço De Entrada De Equipamento')
    for update;

    if exists(select 1 from public.document_signature_requests r where r.print_template_id=v_target.id) then
      raise exception 'Modelo Teste % ja possui assinatura vinculada. Copia cancelada para proteger documentos.',v_type;
    end if;

    update public.print_templates t set
       name=v_source.name,
       description=v_source.description,
       is_active=v_source.is_active,
       paper_size=v_source.paper_size, orientation=v_source.orientation,
       margin_top=v_source.margin_top,margin_right=v_source.margin_right,
       margin_bottom=v_source.margin_bottom,margin_left=v_source.margin_left,
       show_logo=v_source.show_logo,show_company_info=v_source.show_company_info,
       show_page_number=v_source.show_page_number,show_printed_at=v_source.show_printed_at,
       header_text=v_source.header_text,footer_text=v_source.footer_text,
       settings=case when v_type='ORCAMENTO' then
         v_source.settings || jsonb_build_object('section_columns',
           coalesce(v_source.settings->'section_columns','{}'::jsonb) || '{"quote":2}'::jsonb)
         else v_source.settings end,
       allow_online_signature=true,
       signature_link_ttl_hours=v_source.signature_link_ttl_hours,
       require_external_signature=true,
       require_employee_signature=false,employee_signature_source=null
    where t.id=v_target.id and t.organization_id=v_teste;

    delete from public.print_template_sections where template_id=v_target.id;
    for v_section in
      select * from public.print_template_sections s
      where s.template_id=v_source.id order by s.sort_order
    loop
      insert into public.print_template_sections(
         organization_id,template_id,section_key,title,sort_order,columns,is_enabled,settings
      ) values(
         v_teste,v_target.id,v_section.section_key,v_section.title,
         v_section.sort_order,v_section.columns,v_section.is_enabled,v_section.settings
      ) returning id into v_new_section;
      insert into public.print_template_fields(template_section_id,field_key,label,sort_order,is_enabled,settings)
      select v_new_section,f.field_key,f.label,f.sort_order,f.is_enabled,f.settings
      from public.print_template_fields f
      where f.template_section_id=v_section.id;
    end loop;

    -- Future segment assignments use today's source revision, never stale copies.
    update private.union_segment_document_blueprints b set
       template_config=(to_jsonb(v_source)
         - 'id' - 'organization_id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by')
         || jsonb_build_object(
           'allow_online_signature',true,
           'require_external_signature',true,
           'require_employee_signature',false,
           'employee_signature_source',null,
           'name',case when v_type='OS' then 'Ordem de Serviço de Entrada de Equipamento' else 'Orçamento' end,
           'settings',case when v_type='ORCAMENTO' then
              v_source.settings || jsonb_build_object('section_columns',
                 coalesce(v_source.settings->'section_columns','{}'::jsonb) || '{"quote":2}'::jsonb)
              else v_source.settings end),
       sections=(
          select coalesce(jsonb_agg(
              jsonb_build_object(
                'section_key',s.section_key,'title',s.title,'sort_order',s.sort_order,
                'columns',s.columns,'is_enabled',s.is_enabled,'settings',s.settings,
                'fields',(
                   select coalesce(jsonb_agg(
                      jsonb_build_object('field_key',f.field_key,'label',f.label,'sort_order',f.sort_order,
                        'is_enabled',f.is_enabled,'settings',f.settings)
                      order by f.sort_order),'[]'::jsonb)
                   from public.print_template_fields f where f.template_section_id=s.id
                )
              ) order by s.sort_order),'[]'::jsonb)
          from public.print_template_sections s where s.template_id=v_source.id
       )
    where b.document_type=v_type;

    if not found then raise exception 'Blueprint % indisponivel',v_type; end if;
  end loop;

  -- The Test tenant had an older automatic "Orcamento Tecnico" in addition
  -- to the new "Orcamento". User requested exactly two initial documents.
  select count(*) into v_legacy_test_count
  from public.print_templates t
  where t.organization_id=v_teste and t.name='Orçamento Técnico' and t.document_type='ORCAMENTO'
    and not exists(select 1 from public.document_signature_requests r where r.print_template_id=t.id);
  if v_legacy_test_count<>1 then
    raise exception 'Documento antigo da Teste nao identificado ou em uso: nenhum registro foi alterado';
  end if;
  delete from public.print_templates t
  where t.organization_id=v_teste and t.name='Orçamento Técnico' and t.document_type='ORCAMENTO'
    and not exists(select 1 from public.document_signature_requests r where r.print_template_id=t.id);

  if (select count(*) from private.union_segment_document_blueprints)<>2
     or (select count(*) from public.print_templates where organization_id=v_teste)<>2 then
    raise exception 'A quantidade final deve ser 2 modelos: OS de Entrada e Orcamento.';
  end if;
end $update$;

commit;