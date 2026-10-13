-- Variações comuns já presentes na Artvideo: Airfryer, Microondas e
-- Lavadoura De Roupas. São equivalências explícitas, não fuzzy matching.
-- Não unir Ferro a Vapor/Ferro de passar, Fone/Fone de ouvido ou as
-- categorias específicas de ar-condicionado ao equipamento genérico.

create or replace function private.union_catalog_equipment_match_key(p_name text)
returns text language sql immutable strict set search_path = '' as $key$
  select case
    when norm in ('airfryer','air fryer','air-fryer') then 'airfryer'
    when norm in ('microondas','micro-ondas','micro ondas') then 'microondas'
    when norm in ('lavadoura de roupas','lavadora de roupas') then 'lavadora de roupas'
    when norm in ('tv','televisor') then 'televisor'
    else norm
  end
  from (
    select regexp_replace(
      regexp_replace(
        translate(
          lower(public.normalize_visual_text(p_name)),
          'áàâãäåéèêëíìîïóòôõöúùûüçñ',
          'aaaaaaeeeeiiiiooooouuuucn'
        ),
        '[[:space:]]*/[[:space:]]*','/','g'
      ),
      '[[:space:]]+',' ','g'
    ) as norm
  ) candidate;
$key$;

-- Reaproveita exatamente a conciliação conservadora da migração anterior:
-- só reatribui vínculo de cópia automática sem uso; nunca apaga OS/modelos.
do $repair$
declare
  item record;
  v_previous text:=current_setting('app.union_catalog_automatic',true);
  v_has_references boolean;
begin
  perform set_config('app.union_catalog_automatic','on',true);
  for item in
    select l.organization_id,l.catalog_equipment_type_id,
           generated.id as generated_id,legacy.id as legacy_id,
           catalog.name as official_name
      from public.organization_catalog_equipment_links l
      join public.catalog_equipment_types catalog
        on catalog.id=l.catalog_equipment_type_id
      join public.equipment_types generated
        on generated.id=l.equipment_type_id and generated.organization_id=l.organization_id
      join lateral (
         select candidate.id from public.equipment_types candidate
          where candidate.organization_id=l.organization_id
            and candidate.id<>generated.id and candidate.is_active
            and candidate.slug not like 'union-%'
            and private.union_catalog_equipment_match_key(candidate.name)=
                private.union_catalog_equipment_match_key(catalog.name)
            and not exists (
              select 1 from public.organization_catalog_equipment_links used
               where used.organization_id=l.organization_id
                 and used.equipment_type_id=candidate.id
            )
          order by candidate.created_at,candidate.id limit 1
      ) legacy on true
     where catalog.is_active and catalog.is_published
       and generated.slug='union-'||replace(catalog.id::text,'-','')
       and private.union_catalog_equipment_match_key(generated.name)=
           private.union_catalog_equipment_match_key(catalog.name)
  loop
    select exists(select 1 from public.service_orders so where so.equipment_type_id=item.generated_id)
       or exists(select 1 from public.customer_equipments ce where ce.equipment_type_id=item.generated_id)
       or exists(select 1 from public.service_order_checklists sc where sc.equipment_type_id=item.generated_id)
       or exists(select 1 from public.device_capture_sessions dc where dc.equipment_type_id=item.generated_id)
       or exists(
         select 1 from public.equipment_models em
          join public.equipment_brands eb on eb.id=em.equipment_brand_id
          where eb.equipment_type_id=item.generated_id
       )
       or exists(
         select 1 from public.service_orders so
          join public.equipment_brands eb on eb.id=so.equipment_brand_id
          where eb.equipment_type_id=item.generated_id
       )
       or exists(
         select 1 from public.customer_equipments ce
          join public.equipment_brands eb on eb.id=ce.equipment_brand_id
          where eb.equipment_type_id=item.generated_id
       ) into v_has_references;
    if v_has_references then
      insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
        values(item.organization_id,'duplicate-equipment:'||item.generated_id,
          'Revisar possível duplicação preservada por referências em uso: '||item.official_name)
      on conflict (organization_id,issue_key) do update
        set details=excluded.details,occurred_at=now();
      continue;
    end if;

    -- Solta somente os vínculos de distribuição; nunca apaga marcas ou modelos.
    delete from public.organization_catalog_brand_links
      where organization_id=item.organization_id
        and catalog_equipment_type_id=item.catalog_equipment_type_id;
    update public.organization_catalog_equipment_links
       set equipment_type_id=item.legacy_id, synced_at=now()
     where organization_id=item.organization_id
       and catalog_equipment_type_id=item.catalog_equipment_type_id
       and equipment_type_id=item.generated_id;
    update public.equipment_types set is_active=false,updated_at=now()
     where id=item.generated_id;
    update public.equipment_brands set is_active=false,updated_at=now()
     where equipment_type_id=item.generated_id;
    perform private.sync_union_catalog_for_organization(item.organization_id);
    perform private.sync_union_catalog_technical_fields_for_type(
      item.organization_id,item.catalog_equipment_type_id,item.legacy_id
    );
    delete from public.organization_catalog_sync_issues
      where organization_id=item.organization_id
        and issue_key='duplicate-equipment:'||item.generated_id;
  end loop;

  -- A categoria composta gerada automaticamente não deve continuar
  -- aparecendo como opção adicional em empresas sem utilização histórica.
  update public.equipment_types generated
     set is_active=false,updated_at=now()
    from public.organization_catalog_equipment_links link
    join public.catalog_equipment_types c
      on c.id=link.catalog_equipment_type_id
   where c.code='som-caixa-de-som'
     and generated.id=link.equipment_type_id
     and generated.organization_id=link.organization_id
     and generated.slug='union-'||replace(c.id::text,'-','')
     and generated.is_active
     and not exists(select 1 from public.service_orders so where so.equipment_type_id=generated.id)
     and not exists(select 1 from public.customer_equipments ce where ce.equipment_type_id=generated.id)
     and not exists(select 1 from public.service_order_checklists sc where sc.equipment_type_id=generated.id)
     and not exists(select 1 from public.device_capture_sessions dc where dc.equipment_type_id=generated.id)
     and not exists(
       select 1 from public.equipment_models em
       join public.equipment_brands eb on eb.id=em.equipment_brand_id
       where eb.equipment_type_id=generated.id
     );

  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
exception when others then
  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
  raise;
end;
$repair$;

do $test$
begin
  if private.union_catalog_equipment_match_key('Air Fryer') <>
     private.union_catalog_equipment_match_key('Airfryer')
    or private.union_catalog_equipment_match_key('Micro-Ondas') <>
       private.union_catalog_equipment_match_key('Microondas')
    or private.union_catalog_equipment_match_key('Lavadora de roupas') <>
       private.union_catalog_equipment_match_key('Lavadoura De Roupas')
    or private.union_catalog_equipment_match_key('Fone') =
       private.union_catalog_equipment_match_key('Fone de ouvido')
  then raise exception 'Falha na validação de sinônimos de equipamentos.'; end if;
end;
$test$;
