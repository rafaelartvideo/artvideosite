-- Sincronização do Catálogo Union silenciosa e não atribuída ao usuário.
-- Aciona o supressor SOMENTE dentro de DML automático e restaura contexto sempre.
-- Ações manuais permanecem auditadas normalmente; notificações derivam de auditorias.
create or replace function private.audit_log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_raw jsonb := '{}'::jsonb;
  v_new_raw jsonb := '{}'::jsonb;
  v_row_raw jsonb := '{}'::jsonb;
  v_old_safe jsonb := '{}'::jsonb;
  v_new_safe jsonb := '{}'::jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  v_org uuid;
  v_actor uuid;
  v_actor_name text;
  v_operation text;
  v_context jsonb;
  v_entity_id text;
  v_source text;
begin
  -- Alterações distribuídas pelo catálogo da Union não representam uma ação humana.
  -- Não gerar auditoria nem notificações (que derivam dos registros de auditoria).
  if current_setting('app.union_catalog_automatic',true) = 'on' then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  v_operation := lower(TG_OP);

  if TG_OP = 'INSERT' then
    v_new_raw := to_jsonb(NEW);
    v_row_raw := v_new_raw;
  elsif TG_OP = 'UPDATE' then
    v_old_raw := to_jsonb(OLD);
    v_new_raw := to_jsonb(NEW);
    v_row_raw := v_new_raw;
  else
    v_old_raw := to_jsonb(OLD);
    v_row_raw := v_old_raw;
  end if;

  v_org := private.audit_try_uuid(v_row_raw ->> 'organization_id');

  if v_org is null and TG_TABLE_NAME = 'role_permissions' then
    select r.organization_id
      into v_org
    from public.roles r
    where r.id = private.audit_try_uuid(v_row_raw ->> 'role_id');
  end if;

  if v_org is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  v_old_safe := private.audit_safe_row(v_old_raw);
  v_new_safe := private.audit_safe_row(v_new_raw);

  if TG_OP = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(
        keys.key,
        jsonb_build_object(
          'before', v_old_safe -> keys.key,
          'after', v_new_safe -> keys.key
        )
      ),
      '{}'::jsonb
    )
    into v_changed
    from (
      select key from jsonb_object_keys(v_old_safe) as old_keys(key)
      union
      select key from jsonb_object_keys(v_new_safe) as new_keys(key)
    ) keys
    where (v_old_safe -> keys.key) is distinct from (v_new_safe -> keys.key);

    if v_changed = '{}'::jsonb then
      return NEW;
    end if;
  elsif TG_OP = 'INSERT' then
    v_snapshot := v_new_safe;
  else
    v_snapshot := v_old_safe;
  end if;

  v_actor := auth.uid();
  if v_actor is null then
    v_actor := private.audit_actor_from_row(v_row_raw, v_operation);
  end if;

  if v_actor is not null then
    select p.full_name
      into v_actor_name
    from public.profiles p
    where p.id = v_actor;
  end if;

  v_source := case
    when auth.uid() is not null then 'authenticated_user'
    when v_actor is not null then 'server_on_behalf'
    else 'system'
  end;

  v_context := private.audit_context_for_row(TG_TABLE_NAME, v_row_raw);

  v_entity_id := coalesce(
    v_row_raw ->> 'id',
    v_row_raw ->> 'service_order_id',
    v_row_raw ->> 'entity_id',
    v_row_raw ->> 'customer_id',
    v_row_raw ->> 'financial_entry_id',
    v_row_raw ->> 'inventory_item_id',
    v_row_raw ->> 'appointment_id',
    v_row_raw ->> 'quote_request_id',
    v_row_raw ->> 'role_id',
    v_row_raw ->> 'user_id'
  );

  insert into public.organization_audit_logs (
    organization_id,
    actor_user_id,
    actor_name_snapshot,
    action,
    operation,
    entity_type,
    entity_id,
    table_name,
    module_key,
    context_type,
    context_id,
    source,
    changed_fields,
    row_snapshot,
    metadata
  )
  values (
    v_org,
    v_actor,
    v_actor_name,
    TG_TABLE_NAME || '.' || v_operation,
    v_operation,
    TG_TABLE_NAME,
    v_entity_id,
    TG_TABLE_NAME,
    private.audit_module_for_table(TG_TABLE_NAME),
    v_context ->> 'type',
    v_context ->> 'id',
    v_source,
    case when TG_OP = 'UPDATE' then v_changed else '{}'::jsonb end,
    v_snapshot,
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'trigger', 'universal_audit_v1'
    )
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

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
       and lower(public.normalize_visual_text(t.name))=lower(public.normalize_visual_text(v_type.name))
       limit 1;

     if v_local_type is null then
       insert into public.equipment_types(organization_id,name,slug,is_active,sort_order)
       values(p_organization_id,v_type.name,
          'union-'||replace(v_type.id::text,'-',''),true,v_type.sort_order)
       on conflict do nothing returning id into v_local_type;
       if v_local_type is null then
         select t.id into v_local_type from public.equipment_types t
         where t.organization_id=p_organization_id
         and lower(public.normalize_visual_text(t.name))=lower(public.normalize_visual_text(v_type.name))
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

create or replace function private.sync_union_catalog_technical_fields_for_type(
 p_organization_id uuid,p_catalog_equipment_id uuid,p_local_type_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v record; v_field uuid; v_type text; v_issue text;
 v_previous_catalog_context text := current_setting('app.union_catalog_automatic',true);
begin
 if not exists(
   select 1 from public.organization_catalog_equipment_links l
   join public.catalog_equipment_types c on c.id=l.catalog_equipment_type_id
   where l.organization_id=p_organization_id
     and l.catalog_equipment_type_id=p_catalog_equipment_id
     and l.equipment_type_id=p_local_type_id and c.is_published and c.is_active
 ) then return; end if;
 perform set_config('app.union_catalog_automatic','on',true);
 for v in select field_key,label,field_type,required,sort_order
    from public.catalog_technical_field_templates
    where equipment_type_id=p_catalog_equipment_id and is_active
      and field_key <> 'numero_serie'
    order by sort_order,field_key
 loop
   v_issue:='field:'||p_catalog_equipment_id||':'||v.field_key;
   v_field:=null;v_type:=null;
   select id,field_type into v_field,v_type from public.technical_fields
    where organization_id=p_organization_id and field_key=v.field_key;
   if v_field is not null and v_type<>v.field_type then
     insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
     values(p_organization_id,v_issue,'Tipo incompatível para o campo: '||v.label)
     on conflict(organization_id,issue_key) do update set details=excluded.details,occurred_at=now();
     continue;
   end if;
   if v_field is null then
     insert into public.technical_fields(
       organization_id,field_key,label,field_type,is_active,sort_order
     ) values(p_organization_id,v.field_key,v.label,v.field_type,true,v.sort_order)
     on conflict(organization_id,field_key) do nothing returning id into v_field;
     if v_field is null then
       select id into v_field from public.technical_fields
       where organization_id=p_organization_id and field_key=v.field_key and field_type=v.field_type;
     end if;
   end if;
   if v_field is not null then
     insert into public.equipment_type_technical_fields(
       organization_id,equipment_type_id,technical_field_id,required,sort_order
     ) values(p_organization_id,p_local_type_id,v_field,v.required,v.sort_order)
     on conflict(equipment_type_id,technical_field_id) do nothing;
     delete from public.organization_catalog_sync_issues
       where organization_id=p_organization_id and issue_key=v_issue;
   end if;
 end loop;
 perform set_config('app.union_catalog_automatic',coalesce(v_previous_catalog_context,''),true);
exception when others then
 perform set_config('app.union_catalog_automatic',coalesce(v_previous_catalog_context,''),true);
 raise;
end; $$;

create or replace function private.sync_union_catalog_official_name()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_conflicting_company text;
  v_previous_catalog_context text := current_setting('app.union_catalog_automatic',true);
begin
  if not new.is_published then
    return new;
  end if;
  if new.name is not distinct from old.name and old.is_published then
    return new;
  end if;
  perform set_config('app.union_catalog_automatic','on',true);

  if tg_table_name='catalog_equipment_types' then
    select o.name into v_conflicting_company
    from public.organization_catalog_equipment_links l
    join public.equipment_types local_type on local_type.id=l.equipment_type_id
      and local_type.organization_id=l.organization_id
    join public.equipment_types conflict_type on conflict_type.organization_id=l.organization_id
      and conflict_type.id <> local_type.id
      and lower(public.normalize_visual_text(conflict_type.name))=
          lower(public.normalize_visual_text(new.name))
    join public.organizations o on o.id=l.organization_id
    where l.catalog_equipment_type_id=new.id
    limit 1;

    if v_conflicting_company is not null then
      raise exception 'Nome oficial "%" já existe em outro equipamento da empresa "%". Corrija o conflito antes de publicar.',new.name,v_conflicting_company
      using errcode='22023';
    end if;
    update public.equipment_types local_type
      set name=new.name,updated_at=now()
      from public.organization_catalog_equipment_links l
      where l.catalog_equipment_type_id=new.id
        and l.equipment_type_id=local_type.id
        and l.organization_id=local_type.organization_id
        and local_type.name is distinct from new.name;
    update public.organization_catalog_equipment_links l
      set official_name_snapshot=new.name,synced_at=now()
      where l.catalog_equipment_type_id=new.id;

  elsif tg_table_name='catalog_brands' then
    select o.name into v_conflicting_company
    from public.organization_catalog_brand_links l
    join public.equipment_brands local_brand on local_brand.id=l.equipment_brand_id
      and local_brand.organization_id=l.organization_id
    join public.equipment_brands conflict_brand on conflict_brand.organization_id=l.organization_id
      and conflict_brand.equipment_type_id=local_brand.equipment_type_id
      and conflict_brand.id <> local_brand.id
      and lower(public.normalize_visual_text(conflict_brand.name))=
          lower(public.normalize_visual_text(new.name))
    join public.organizations o on o.id=l.organization_id
    where l.catalog_brand_id=new.id
    limit 1;

    if v_conflicting_company is not null then
      raise exception 'Marca "%" já existe no mesmo equipamento da empresa "%". Corrija o conflito antes de publicar.',new.name,v_conflicting_company
      using errcode='22023';
    end if;
    update public.equipment_brands local_brand
      set name=new.name,updated_at=now()
      from public.organization_catalog_brand_links l
      where l.catalog_brand_id=new.id
        and l.equipment_brand_id=local_brand.id
        and l.organization_id=local_brand.organization_id
        and local_brand.name is distinct from new.name;
    update public.organization_catalog_brand_links l
      set official_name_snapshot=new.name,synced_at=now()
      where l.catalog_brand_id=new.id;
  end if;
  perform set_config('app.union_catalog_automatic',coalesce(v_previous_catalog_context,''),true);
  return new;
exception when others then
  perform set_config('app.union_catalog_automatic',coalesce(v_previous_catalog_context,''),true);
  raise;
end;
$$;

create or replace function private.union_catalog_technical_template_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record;
begin
 if new.is_active then
   for l in select x.organization_id,x.equipment_type_id
     from public.organization_catalog_equipment_links x
     where x.catalog_equipment_type_id=new.equipment_type_id
   loop
     perform private.sync_union_catalog_technical_fields_for_type(
       l.organization_id,new.equipment_type_id,l.equipment_type_id);
   end loop;
 end if;
 return new;
end; $$;
