-- Exclusao definitiva de copias inativas criadas pela distribuicao automatica
-- do catalogo Union. Preserva qualquer tipo original, OS, cliente e modelo.
-- Esta migracao nao remove equipamentos inativos que tenham origem manual.

do $cleanup$
declare
  v_item record;
  v_previous_context text := current_setting('app.union_catalog_automatic',true);
  v_deleted integer;
begin
  perform set_config('app.union_catalog_automatic','on',true);

  for v_item in
    select t.id,t.organization_id,t.name
      from public.equipment_types t
     where t.is_active=false
       and t.source_artvideo_id is null
       and t.slug ~ '^union-[0-9a-f]{32}$'
     order by t.organization_id,t.id
     for update of t
  loop
    perform pg_advisory_xact_lock(hashtextextended('union-catalog-org:'||v_item.organization_id::text,0));

    -- Nunca remover registros com referencias operacionais ou catalogo publicado.
    if exists(select 1 from public.service_orders s where s.equipment_type_id=v_item.id)
       or exists(select 1 from public.customer_equipments e where e.equipment_type_id=v_item.id)
       or exists(select 1 from public.service_order_checklists c where c.equipment_type_id=v_item.id)
       or exists(select 1 from public.device_capture_sessions d where d.equipment_type_id=v_item.id)
       or exists(select 1 from public.equipment_checklist_items ci where ci.equipment_type_id=v_item.id)
       or exists(
         select 1 from public.equipment_brands b
         join public.equipment_models m on m.equipment_brand_id=b.id
         where b.equipment_type_id=v_item.id
       )
       or exists(
         select 1 from public.equipment_brands b
         join public.service_orders s on s.equipment_brand_id=b.id
         where b.equipment_type_id=v_item.id
       )
       or exists(
         select 1 from public.equipment_brands b
         join public.customer_equipments e on e.equipment_brand_id=b.id
         where b.equipment_type_id=v_item.id
       )
       or exists(
         select 1 from public.organization_catalog_equipment_links l
         join public.catalog_equipment_types c on c.id=l.catalog_equipment_type_id
         where l.equipment_type_id=v_item.id and c.is_active and c.is_published
       )
    then
      raise exception 'Copia inativa % (%) possui dependencias e nao pode ser excluida.',
        v_item.name,v_item.id using errcode='23503';
    end if;

    -- Os campos tecnicos compartilham definicoes globais: remover somente
    -- as associacoes do equipamento descartado, nao o campo em si.
    delete from public.equipment_type_technical_fields
      where equipment_type_id=v_item.id;

    -- Cada marca gerada para a copia e privativa desse tipo. Como nao ha
    -- modelos, OS ou clientes nelas, a remocao e segura.
    delete from public.organization_catalog_brand_links l
      using public.equipment_brands b
      where l.equipment_brand_id=b.id and b.equipment_type_id=v_item.id;
    delete from public.equipment_brands
      where equipment_type_id=v_item.id;

    -- Remove inclusive vinculos antigos ao catalogo composto despublicado.
    delete from public.organization_catalog_equipment_links
      where equipment_type_id=v_item.id;

    delete from public.equipment_types
      where id=v_item.id and is_active=false and source_artvideo_id is null
        and slug ~ '^union-[0-9a-f]{32}$';
    get diagnostics v_deleted = row_count;
    if v_deleted<>1 then
      raise exception 'Nao foi possivel excluir a copia inativa %.',v_item.id;
    end if;
  end loop;

  perform set_config('app.union_catalog_automatic',coalesce(v_previous_context,''),true);
exception when others then
  perform set_config('app.union_catalog_automatic',coalesce(v_previous_context,''),true);
  raise;
end;
$cleanup$;

-- Corrigir a grafia NO MESMO cadastro Artvideo: preserva ID e todas as
-- referencias historicas de OS/clientes/modelos, sem criar outro aspirador.
update public.equipment_types
   set name='Aspirador de pó',updated_at=now()
 where organization_id='00000000-0000-4000-8000-000000000001'
   and slug='aspirador-de-po' and is_active
   and lower(public.normalize_visual_text(name)) =
       lower(public.normalize_visual_text('Aspirador de po'))
   and lower(public.normalize_visual_text(name)) <>
       lower(public.normalize_visual_text('Aspirador de pó'));

-- A operacao deve ter removido todos os tipos que ficaram inativos
-- exclusivamente por serem copias criadas pelo catalogo automatico.
do $validate$
begin
  if exists(
    select 1 from public.equipment_types t
     where not t.is_active and t.source_artvideo_id is null
       and t.slug ~ '^union-[0-9a-f]{32}$'
  ) then
    raise exception 'Restaram copias automaticas inativas com dependencias.';
  end if;
end;
$validate$;
