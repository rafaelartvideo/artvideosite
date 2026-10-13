-- Higienização segura de dados provisórios da Artvideo e correção retroativa
-- de auditoria/notificações geradas pela sincronização automática de 13/10/2026.
-- Não remove OS, equipamentos de clientes, histórico ou modelos reais utilizados.
-- Contexto de manutenção impede gerar nova auditoria para esta limpeza.
do $$
declare
  v_previous text := current_setting('app.union_catalog_automatic',true);
  v_artvideo uuid := '00000000-0000-4000-8000-000000000001';
  v_model_lg uuid;
  v_brand_lg uuid;
  v_tv85 uuid;
  v_bad_type uuid;
  v_removed_models integer := 0;
  v_removed_brands integer := 0;
  v_removed_types integer := 0;
  v_deleted_auto_audits integer := 0;
begin
  perform set_config('app.union_catalog_automatic','on',true);

  -- Segurança: confirmar empresa do escopo antes de alterar qualquer dado.
  if not exists(select 1 from public.organizations
      where id=v_artvideo and settings->>'is_artvideo_tenant'='true') then
    raise exception 'A empresa Artvideo não corresponde ao escopo da higienização.';
  end if;

  -- O modelo LG 85QNED70BSA é legítimo: movê-lo para Televisor > LG.
  select b.id into v_brand_lg
  from public.equipment_brands b
  join public.equipment_types t on t.id=b.equipment_type_id
  where b.organization_id=v_artvideo
    and lower(public.normalize_visual_text(t.name))=lower(public.normalize_visual_text('Televisor'))
    and lower(public.normalize_visual_text(b.name))=lower(public.normalize_visual_text('LG'))
  limit 1;

  select t.id into v_tv85
  from public.equipment_types t
  where t.organization_id=v_artvideo and t.name='Tv 85 Polegadas';

  if v_tv85 is not null then
    if v_brand_lg is null then raise exception 'Marca LG do Televisor não encontrada; não excluir categoria redundante.'; end if;

    select m.id into v_model_lg
    from public.equipment_models m
    join public.equipment_brands b on b.id=m.equipment_brand_id
    where b.equipment_type_id=v_tv85
      and m.organization_id=v_artvideo and m.name='85QNED70BSA'
    limit 1;

    if v_model_lg is not null
      and not exists(select 1 from public.equipment_models m
        where m.equipment_brand_id=v_brand_lg and m.name='85QNED70BSA') then
      update public.equipment_models
      set equipment_brand_id=v_brand_lg
      where id=v_model_lg and organization_id=v_artvideo;
    end if;
  end if;

  -- Apagar exclusivamente modelos de teste/placeholder sem OS ou clientes vinculados.
  delete from public.equipment_models m
  where m.organization_id=v_artvideo
    and (
      upper(btrim(m.name)) in ('XXX','TESTE','TESTE1','TESTE2','MARCA2')
      or (
        exists(select 1 from public.equipment_brands b
          join public.equipment_types t on t.id=b.equipment_type_id
          where b.id=m.equipment_brand_id
            and t.organization_id=v_artvideo
            and t.name in ('Teste','Teste1'))
      )
    )
    and not exists(select 1 from public.service_orders so where so.equipment_model_id=m.id)
    and not exists(select 1 from public.customer_equipments ce where ce.equipment_model_id=m.id);
  get diagnostics v_removed_models=row_count;

  -- Remover marcas de teste sem uso, inclusive Teste no equipamento Microondas.
  delete from public.equipment_brands b
  where b.organization_id=v_artvideo
    and (
      lower(b.name) like 'teste%'
      or exists(select 1 from public.equipment_types t
          where t.id=b.equipment_type_id and t.name in ('Teste','Teste1'))
    )
    and not exists(select 1 from public.equipment_models m where m.equipment_brand_id=b.id)
    and not exists(select 1 from public.service_orders so where so.equipment_brand_id=b.id)
    and not exists(select 1 from public.customer_equipments ce where ce.equipment_brand_id=b.id);
  get diagnostics v_removed_brands=row_count;

  -- Remover categorias provisórias sem uso; não apagar registros das OS históricas.
  for v_bad_type in
    select t.id from public.equipment_types t
    where t.organization_id=v_artvideo and t.name in ('Teste','Teste1','Tv 85 Polegadas')
      and not exists(select 1 from public.equipment_brands b where b.equipment_type_id=t.id)
      and not exists(select 1 from public.service_orders so where so.equipment_type_id=t.id)
      and not exists(select 1 from public.customer_equipments ce where ce.equipment_type_id=t.id)
      and not exists(select 1 from public.service_order_checklists sc where sc.equipment_type_id=t.id)
      and not exists(select 1 from public.device_capture_sessions d where d.equipment_type_id=t.id)
      and not exists(select 1 from public.organization_catalog_equipment_links l where l.equipment_type_id=t.id)
  loop
    delete from public.equipment_type_technical_fields
      where equipment_type_id=v_bad_type and organization_id=v_artvideo;
    delete from public.equipment_types where id=v_bad_type and organization_id=v_artvideo;
    v_removed_types:=v_removed_types+1;
  end loop;

  -- Inativar sem excluir os testes já ligados a OS/clientes, incluindo marcas e modelos.
  update public.equipment_models m set is_active=false
  where m.organization_id=v_artvideo and m.is_active
    and exists(select 1 from public.equipment_brands b
      join public.equipment_types t on t.id=b.equipment_type_id
      where b.id=m.equipment_brand_id and t.organization_id=v_artvideo
        and t.name in ('Teste Televisor Check','Teste01'));
  update public.equipment_brands b set is_active=false
  where b.organization_id=v_artvideo and b.is_active
    and exists(select 1 from public.equipment_types t where t.id=b.equipment_type_id
      and t.name in ('Teste Televisor Check','Teste01'));
  update public.equipment_types t set is_active=false
  where t.organization_id=v_artvideo and t.is_active
    and t.name in ('Teste Televisor Check','Teste01','Tv 85 Polegadas');

  -- Higienização de erro de digitação (mesma marca e ID, sem trocar OS).
  update public.equipment_brands b set name='Panasonic'
  where b.organization_id=v_artvideo and b.name='Panasonica'
    and exists(select 1 from public.equipment_types t
      where t.id=b.equipment_type_id and t.name='Televisor')
    and not exists(select 1 from public.equipment_brands already
      where already.equipment_type_id=b.equipment_type_id
        and already.id<>b.id
        and lower(public.normalize_visual_text(already.name))=lower(public.normalize_visual_text('Panasonic')));

  -- Remover SOMENTE os 127 eventos de catálogo automático identificados,
  -- do exato segundo de configuração do segmento da empresa Teste.
  -- Notificações vinculadas são removidas via ON DELETE CASCADE.
  delete from public.organization_audit_logs a
  using public.organizations o
  where o.id=a.organization_id and o.name='Teste'
    and a.operation='insert'
    and a.created_at >= '2026-10-13 14:17:53+00'
    and a.created_at < '2026-10-13 14:17:54+00'
    and (
      (a.table_name='equipment_types' and exists(
        select 1 from public.organization_catalog_equipment_links l
        where l.organization_id=a.organization_id and l.equipment_type_id::text=a.entity_id))
      or (a.table_name='equipment_brands' and exists(
        select 1 from public.organization_catalog_brand_links l
        where l.organization_id=a.organization_id and l.equipment_brand_id::text=a.entity_id))
    );
  get diagnostics v_deleted_auto_audits=row_count;

  raise notice 'Catálogo higienizado: modelos de teste %, marcas de teste %, tipos removidos %, auditorias automáticas removidas %',
    v_removed_models,v_removed_brands,v_removed_types,v_deleted_auto_audits;

  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
exception when others then
  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
  raise;
end $$;
