-- Reconhecer variações de grafia ao distribuir/atribuir equipamentos oficiais.
-- Preserva IDs, OS, marcas, modelos, configurações e nomes locais já existentes.
-- Som e Caixa de som são equipamentos distintos. Liquidificador/Multiprocessador
-- permanece como a categoria combinada, independentemente dos espaços na barra.

create or replace function private.union_catalog_equipment_match_key(p_name text)
returns text language sql immutable strict set search_path = '' as $key$
  select regexp_replace(
    regexp_replace(
      translate(
        lower(public.normalize_visual_text(p_name)),
        'áàâãäåéèêëíìîïóòôõöúùûüçñ',
        'aaaaaaeeeeiiiiooooouuuucn'
      ),
      '[[:space:]]*/[[:space:]]*', '/', 'g'
    ),
    '[[:space:]]+', ' ', 'g'
  );
$key$;

-- A mesma comparação deve valer tanto para a sincronização automática quanto
-- para a adoção manual do catálogo pela empresa.
create or replace function private.sync_union_catalog_for_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_type record;
 v_brand record;
 v_local_type uuid;
 v_local_brand uuid;
 v_existing_link uuid;
 v_error_key text;
 v_previous_catalog_context text := current_setting('app.union_catalog_automatic',true);
begin
 if not exists (
   select 1 from public.organizations o
   join public.organization_segments os on os.organization_id=o.id
   where o.id=p_organization_id and o.status='active'
     and coalesce(o.settings->>'is_platform_operator','false') <> 'true'
 ) then
   return;
 end if;
 perform set_config('app.union_catalog_automatic','on',true);
 perform pg_advisory_xact_lock(hashtextextended('union-catalog-org:'||p_organization_id::text,0));

 for v_type in
   select distinct t.id,t.name,t.sort_order from public.catalog_equipment_types t
   join public.segment_equipment_types se on se.equipment_type_id=t.id
   join public.organization_segments os on os.segment_id=se.segment_id
     and os.organization_id=p_organization_id
   join public.business_segments s on s.id=os.segment_id
   where t.is_active and t.is_published and s.is_active
   order by t.name,t.id
 loop
   v_error_key:='equipment:'||v_type.id::text;
   v_local_type:=null;
   select l.equipment_type_id into v_local_type
   from public.organization_catalog_equipment_links l
   where l.organization_id=p_organization_id and l.catalog_equipment_type_id=v_type.id;

   if v_local_type is null then
     select t.id into v_local_type from public.equipment_types t
       where t.organization_id=p_organization_id
       and private.union_catalog_equipment_match_key(t.name)=private.union_catalog_equipment_match_key(v_type.name)
       limit 1;

     if v_local_type is null then
       insert into public.equipment_types(organization_id,name,slug,is_active,sort_order)
       values(p_organization_id,v_type.name,
          'union-'||replace(v_type.id::text,'-',''),true,v_type.sort_order)
       on conflict do nothing returning id into v_local_type;
       if v_local_type is null then
         select t.id into v_local_type from public.equipment_types t
         where t.organization_id=p_organization_id
         and private.union_catalog_equipment_match_key(t.name)=private.union_catalog_equipment_match_key(v_type.name)
         limit 1;
       end if;
     end if;
     if v_local_type is null then
       insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
       values(p_organization_id,v_error_key,'Conflito de nome/slug no equipamento oficial '||v_type.name)
       on conflict (organization_id,issue_key) do update
         set details=excluded.details,occurred_at=now();
       continue;
     end if;

     insert into public.organization_catalog_equipment_links
       (organization_id,catalog_equipment_type_id,equipment_type_id,created_by)
       values(p_organization_id,v_type.id,v_local_type,null)
       on conflict do nothing;

     select l.equipment_type_id into v_existing_link
     from public.organization_catalog_equipment_links l
     where l.organization_id=p_organization_id and l.catalog_equipment_type_id=v_type.id;
     if v_existing_link is distinct from v_local_type then
       insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
       values(p_organization_id,v_error_key,'Equipamento local já vinculado a outro item oficial: '||v_type.name)
       on conflict (organization_id,issue_key) do update
         set details=excluded.details,occurred_at=now();
       continue;
     end if;
   end if;
   delete from public.organization_catalog_sync_issues
   where organization_id=p_organization_id and issue_key=v_error_key;

   for v_brand in
     select b.id,b.name from public.catalog_equipment_brands eb
       join public.catalog_brands b on b.id=eb.brand_id
     where eb.equipment_type_id=v_type.id and b.is_active and b.is_published
     order by b.name,b.id
   loop
     v_error_key:='brand:'||v_type.id::text||':'||v_brand.id::text;
     v_local_brand:=null;
     select l.equipment_brand_id into v_local_brand
       from public.organization_catalog_brand_links l
       where l.organization_id=p_organization_id
         and l.catalog_equipment_type_id=v_type.id and l.catalog_brand_id=v_brand.id;

     if v_local_brand is null then
       select b.id into v_local_brand from public.equipment_brands b
       where b.organization_id=p_organization_id and b.equipment_type_id=v_local_type
         and lower(public.normalize_visual_text(b.name))=lower(public.normalize_visual_text(v_brand.name))
       limit 1;

       if v_local_brand is null then
         insert into public.equipment_brands(
           organization_id,equipment_type_id,name,slug,is_active,sort_order
         ) values(
           p_organization_id,v_local_type,v_brand.name,
           'union-'||replace(v_brand.id::text,'-',''),true,0
         ) on conflict do nothing returning id into v_local_brand;

         if v_local_brand is null then
           select b.id into v_local_brand from public.equipment_brands b
             where b.organization_id=p_organization_id and b.equipment_type_id=v_local_type
               and lower(public.normalize_visual_text(b.name))=lower(public.normalize_visual_text(v_brand.name))
             limit 1;
         end if;
       end if;

       if v_local_brand is null then
         insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
         values(p_organization_id,v_error_key,'Conflito de nome/slug na marca oficial '||v_brand.name)
         on conflict (organization_id,issue_key) do update
           set details=excluded.details,occurred_at=now();
         continue;
       end if;

       insert into public.organization_catalog_brand_links
         (organization_id,catalog_equipment_type_id,catalog_brand_id,equipment_brand_id,created_by)
         values(p_organization_id,v_type.id,v_brand.id,v_local_brand,null)
         on conflict do nothing;

       select l.equipment_brand_id into v_existing_link
         from public.organization_catalog_brand_links l
         where l.organization_id=p_organization_id
           and l.catalog_equipment_type_id=v_type.id and l.catalog_brand_id=v_brand.id;
       if v_existing_link is distinct from v_local_brand then
         insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
         values(p_organization_id,v_error_key,'Marca local já vinculada a outro item oficial: '||v_brand.name)
         on conflict (organization_id,issue_key) do update
           set details=excluded.details,occurred_at=now();
         continue;
       end if;
     end if;
     delete from public.organization_catalog_sync_issues
       where organization_id=p_organization_id and issue_key=v_error_key;
   end loop;
 end loop;
 perform set_config('app.union_catalog_automatic',coalesce(v_previous_catalog_context,''),true);
exception when others then
 perform set_config('app.union_catalog_automatic',coalesce(v_previous_catalog_context,''),true);
 raise;
end; $$;

create or replace function public.adopt_union_catalog_equipment_v1(
  p_organization_id uuid, p_catalog_equipment_type_id uuid
)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
  v_catalog public.catalog_equipment_types%rowtype;
  v_equipment_id uuid;
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.user_id=auth.uid() and om.organization_id=p_organization_id
        and om.status='active' and o.status='active'
        and not private.is_platform_organization(o.id)
    )
    or not private.can_manage_own_operation_config(
      p_organization_id,'equipment','equipment.create'
    )
  then
    raise exception 'Sem permissão para adicionar equipamentos.' using errcode='42501';
  end if;

  select t.* into v_catalog
  from public.catalog_equipment_types t
  where t.id=p_catalog_equipment_type_id and t.is_active and t.is_published
    and exists(
      select 1
      from public.segment_equipment_types ste
      join public.organization_segments os on os.segment_id=ste.segment_id
      join public.business_segments s on s.id=os.segment_id
      where ste.equipment_type_id=t.id and os.organization_id=p_organization_id
        and s.is_active
    );
  if not found then
    raise exception 'Equipamento não disponível para os segmentos desta empresa.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':union-type:'||p_catalog_equipment_type_id::text,0
  ));
  select link.equipment_type_id into v_equipment_id
  from public.organization_catalog_equipment_links link
  where link.organization_id=p_organization_id
    and link.catalog_equipment_type_id=p_catalog_equipment_type_id;

  if v_equipment_id is not null then
    return v_equipment_id;
  end if;

  select t.id into v_equipment_id
  from public.equipment_types t
  where t.organization_id=p_organization_id
    and private.union_catalog_equipment_match_key(t.name) =
        private.union_catalog_equipment_match_key(v_catalog.name)
  limit 1;

  if v_equipment_id is null then
    insert into public.equipment_types(organization_id,name,slug,is_active,sort_order)
      values(
        p_organization_id,v_catalog.name,
        'union-'||replace(v_catalog.id::text,'-',''),true,v_catalog.sort_order
      )
      on conflict do nothing
      returning id into v_equipment_id;

    if v_equipment_id is null then
      select t.id into v_equipment_id
      from public.equipment_types t
      where t.organization_id=p_organization_id
        and private.union_catalog_equipment_match_key(t.name) =
            private.union_catalog_equipment_match_key(v_catalog.name)
      limit 1;
    end if;
  end if;

  if v_equipment_id is null then
    raise exception 'Não foi possível vincular o equipamento ao cadastro local.' using errcode='23505';
  end if;

  insert into public.organization_catalog_equipment_links(
    organization_id,catalog_equipment_type_id,equipment_type_id,created_by
  ) values(
    p_organization_id,p_catalog_equipment_type_id,v_equipment_id,auth.uid()
  ) on conflict do nothing;

  if not exists (
    select 1 from public.organization_catalog_equipment_links
    where organization_id=p_organization_id
      and catalog_equipment_type_id=p_catalog_equipment_type_id
      and equipment_type_id=v_equipment_id
  ) then
    raise exception 'Já existe outro vínculo oficial para este cadastro local.' using errcode='23505';
  end if;
  return v_equipment_id;
end;
$$;

-- Despublica SOMENTE a categoria composta oficial. Os registros locais
-- previamente criados continuam preservados para análise e histórico.
update public.catalog_equipment_types
   set is_active=false, is_published=false, updated_at=now()
 where code='som-caixa-de-som' and (is_active or is_published);

-- Cria duas categorias oficiais distintas, inicialmente despublicadas para
-- evitar distribuição antes das associações com segmentos e marcas.
insert into public.catalog_equipment_types
  (code,name,sort_order,is_active,is_published)
values
  ('som','Som',140,true,false),
  ('caixa-de-som','Caixa de som',141,true,false)
on conflict (code) do nothing;

insert into public.segment_equipment_types(segment_id,equipment_type_id)
select src.segment_id,dest.id
  from public.segment_equipment_types src
  join public.catalog_equipment_types original on original.id=src.equipment_type_id
  cross join public.catalog_equipment_types dest
 where original.code='som-caixa-de-som' and dest.code in ('som','caixa-de-som')
on conflict do nothing;

insert into public.catalog_equipment_brands(equipment_type_id,brand_id)
select dest.id,src.brand_id
  from public.catalog_equipment_brands src
  join public.catalog_equipment_types original on original.id=src.equipment_type_id
  cross join public.catalog_equipment_types dest
 where original.code='som-caixa-de-som' and dest.code in ('som','caixa-de-som')
on conflict do nothing;

insert into public.catalog_technical_field_templates
  (equipment_type_id,field_key,label,field_type,required,sort_order,is_active)
select dest.id,src.field_key,src.label,src.field_type,src.required,src.sort_order,src.is_active
  from public.catalog_technical_field_templates src
  join public.catalog_equipment_types original on original.id=src.equipment_type_id
  cross join public.catalog_equipment_types dest
 where original.code='som-caixa-de-som' and dest.code in ('som','caixa-de-som')
on conflict(equipment_type_id,field_key) do nothing;

insert into public.catalog_checklist_item_templates
  (equipment_type_id,stage_code,title,description,response_type,allow_na,
   is_required,photo_requirement,observation_requirement,sort_order,is_active)
select dest.id,src.stage_code,src.title,src.description,src.response_type,src.allow_na,
       src.is_required,src.photo_requirement,src.observation_requirement,
       src.sort_order,src.is_active
  from public.catalog_checklist_item_templates src
  join public.catalog_equipment_types original on original.id=src.equipment_type_id
  cross join public.catalog_equipment_types dest
 where original.code='som-caixa-de-som' and dest.code in ('som','caixa-de-som')
   and not exists (
     select 1 from public.catalog_checklist_item_templates existing
      where existing.equipment_type_id=dest.id
        and existing.stage_code=src.stage_code
        and existing.title=src.title
        and existing.sort_order=src.sort_order
   );

-- A publicação só acontece depois de popular segmentos, marcas e campos.
update public.catalog_equipment_types
   set is_active=true, is_published=true, updated_at=now()
 where code in ('som','caixa-de-som') and (not is_active or not is_published);

-- Corrige vínculos cuja criação automática gerou uma segunda categoria com
-- diferença APENAS de acento ou espaçamento de barra. Remapeia somente se
-- não houver OS, clientes, capturas, checklists ou modelos dependentes.
-- Não exclui qualquer categoria, marca ou outro dado operacional existente.
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

-- Regra verificável e independente dos dados da empresa.
do $test$
begin
  if private.union_catalog_equipment_match_key('Aspirador de pó')<>
     private.union_catalog_equipment_match_key('Aspirador de po')
    or private.union_catalog_equipment_match_key('Liquidificador / Multiprocessador')<>
       private.union_catalog_equipment_match_key('Liquidificador/Multiprocessador')
    or private.union_catalog_equipment_match_key('Som')=
       private.union_catalog_equipment_match_key('Caixa de som')
  then
    raise exception 'Normalização de equipamentos do catálogo não passou na verificação.';
  end if;
end;
$test$;
