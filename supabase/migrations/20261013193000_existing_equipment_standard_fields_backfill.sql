-- Ajusta equipamentos locais já existentes com nomes idênticos ao catálogo oficial.
-- Não exige seleção prévia de segmento para padronizar campos de equipamentos já cadastrados.
-- Sem mexer em rótulos/chaves antigos, valores de OS, modelos ou FKs.
do $$
declare
 v_type record;
 v_template record;
 v_field uuid;
 v_local_type text;
 v_issue text;
begin
 for v_type in
   select local_t.id local_id,local_t.organization_id org_id,c.id catalog_id
   from public.equipment_types local_t
   join public.catalog_equipment_types c
     on lower(public.normalize_visual_text(local_t.name))=
        lower(public.normalize_visual_text(c.name))
   where c.is_active and c.is_published
 loop
   for v_template in
     select field_key,label,field_type,required,sort_order
     from public.catalog_technical_field_templates
     where equipment_type_id=v_type.catalog_id and is_active
       and field_key <> 'numero_serie'
   loop
     v_field:=null;v_local_type:=null;
     select f.id,f.field_type into v_field,v_local_type
     from public.technical_fields f
     where f.organization_id=v_type.org_id and f.field_key=v_template.field_key;

     if v_field is not null and v_local_type<>v_template.field_type then
       v_issue:='legacy-field:'||v_type.local_id::text||':'||v_template.field_key;
       insert into public.organization_catalog_sync_issues(organization_id,issue_key,details)
       values(v_type.org_id,v_issue,'Campo existente incompatível: '||v_template.label)
       on conflict (organization_id,issue_key)
       do update set details=excluded.details,occurred_at=now();
       continue;
     end if;

     if v_field is null then
       insert into public.technical_fields(
         organization_id,field_key,label,field_type,is_active,sort_order
       ) values(
         v_type.org_id,v_template.field_key,v_template.label,
         v_template.field_type,true,v_template.sort_order
       ) on conflict(organization_id,field_key) do nothing
       returning id into v_field;
       if v_field is null then
         select f.id into v_field from public.technical_fields f
           where f.organization_id=v_type.org_id
           and f.field_key=v_template.field_key
           and f.field_type=v_template.field_type;
       end if;
     end if;

     if v_field is not null then
       insert into public.equipment_type_technical_fields(
         organization_id,equipment_type_id,technical_field_id,required,sort_order
       ) values(
         v_type.org_id,v_type.local_id,v_field,v_template.required,v_template.sort_order
       ) on conflict(equipment_type_id,technical_field_id) do nothing;
     end if;
   end loop;
 end loop;
end $$;
