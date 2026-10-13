-- Automação não destrutiva dos campos técnicos do catálogo Union.
-- Disparada pelo vínculo do equipamento local e pela publicação de novo campo.
create or replace function private.sync_union_catalog_technical_fields_for_type(
 p_organization_id uuid,p_catalog_equipment_id uuid,p_local_type_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v record; v_field uuid; v_type text; v_issue text;
begin
 if not exists(
   select 1 from public.organization_catalog_equipment_links l
   join public.catalog_equipment_types c on c.id=l.catalog_equipment_type_id
   where l.organization_id=p_organization_id
     and l.catalog_equipment_type_id=p_catalog_equipment_id
     and l.equipment_type_id=p_local_type_id and c.is_published and c.is_active
 ) then return; end if;
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
end; $$;

create or replace function private.union_catalog_technical_template_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record;
begin
 if new.is_active and new.field_key<>'numero_serie' then
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

drop trigger if exists union_auto_technical_fields on public.catalog_technical_field_templates;
create trigger union_auto_technical_fields
 after insert or update of label,field_type,required,sort_order,is_active
 on public.catalog_technical_field_templates
 for each row execute function private.union_catalog_technical_template_changed();

create or replace function private.union_catalog_equipment_linked()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.sync_union_catalog_technical_fields_for_type(
   new.organization_id,new.catalog_equipment_type_id,new.equipment_type_id);
 return new;
end; $$;

drop trigger if exists union_auto_equipment_technical_link
 on public.organization_catalog_equipment_links;
create trigger union_auto_equipment_technical_link
 after insert on public.organization_catalog_equipment_links
 for each row execute function private.union_catalog_equipment_linked();
