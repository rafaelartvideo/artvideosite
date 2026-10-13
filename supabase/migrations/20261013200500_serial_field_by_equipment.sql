-- NÚMERO DE SÉRIE como campo EXTRA condicional, nunca fixo em todas as OS.
-- Tipos identificáveis por série de fabricante: 36 equipamentos oficiais.
-- Oficina mecânica utiliza PLACA/CHASSI em vez de série por padrão.
-- Preserva OS antigas e modelos. Não remove nenhuma associação existente.

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

insert into public.catalog_technical_field_templates(
  equipment_type_id,field_key,label,field_type,required,sort_order,is_active
)
select t.id,'numero_serie','NÚMERO DE SÉRIE','text',false,5,true
from public.catalog_equipment_types t
where t.code = any(array['celular','tablet','smartwatch','fone-de-ouvido','televisor','micro-ondas','refrigerador','freezer','lavadora-de-roupas','lava-e-seca','fogao','forno-eletrico','air-fryer','liquidificador-multiprocessador','cafeteira','ferro-de-passar','aspirador-de-po','som-caixa-de-som','adega','ar-condicionado-split','ar-condicionado-de-janela','ar-condicionado-portatil','climatizador','cortina-de-ar','camara-fria','notebook','desktop','all-in-one','monitor','impressora','roteador','nobreak','painel-solar','inversor-solar','bateria-solar','controlador-de-carga'])
on conflict(equipment_type_id,field_key) do update
  set label='NÚMERO DE SÉRIE',
      field_type='text',
      required=false,
      is_active=true,
      updated_at=now()
  where public.catalog_technical_field_templates.label is distinct from 'NÚMERO DE SÉRIE'
     or public.catalog_technical_field_templates.field_type is distinct from 'text'
     or public.catalog_technical_field_templates.required
     or not public.catalog_technical_field_templates.is_active;

-- Aplica a mesma regra a equipamentos locais já cadastrados, inclusive grafias legadas.
-- Não cria vínculos de catálogo nem força um segmento na empresa.
with matched_types as (
  select t.id equipment_type_id,t.organization_id
  from public.equipment_types t
  where exists (
    select 1
    from public.catalog_equipment_types c
    join public.catalog_technical_field_templates ct on ct.equipment_type_id=c.id
    where ct.field_key='numero_serie' and ct.is_active
      and lower(public.normalize_visual_text(t.name))=
          lower(public.normalize_visual_text(c.name))
  ) or lower(public.normalize_visual_text(t.name))=any(
    array[lower(public.normalize_visual_text('Airfryer')),lower(public.normalize_visual_text('Ar-Condicionado')),lower(public.normalize_visual_text('Caixa De Som')),lower(public.normalize_visual_text('Ferro A Vapor')),lower(public.normalize_visual_text('Fone')),lower(public.normalize_visual_text('Forno Eletrico')),lower(public.normalize_visual_text('Forno Embutir')),lower(public.normalize_visual_text('Lavadoura De Roupas')),lower(public.normalize_visual_text('Liquidificador / Multiprocessador')),lower(public.normalize_visual_text('Microondas')),lower(public.normalize_visual_text('Pipoqueira')),lower(public.normalize_visual_text('Som')),lower(public.normalize_visual_text('Tv')),lower(public.normalize_visual_text('Tv 85 Polegadas'))]
  )
), orgs as (
  select distinct organization_id from matched_types
), registered_fields as (
  insert into public.technical_fields(
     organization_id,field_key,label,field_type,is_active,sort_order
  )
  select o.organization_id,'numero_serie','NÚMERO DE SÉRIE','text',true,5
  from orgs o
  on conflict(organization_id,field_key) do nothing
  returning id,organization_id
)
insert into public.equipment_type_technical_fields(
  organization_id,equipment_type_id,technical_field_id,required,sort_order
)
select m.organization_id,m.equipment_type_id,f.id,false,5
from matched_types m
join public.technical_fields f
  on f.organization_id=m.organization_id
 and f.field_key='numero_serie' and f.field_type='text'
on conflict(equipment_type_id,technical_field_id) do nothing;

-- Reusa também campos já cadastrados como numero_serie, padronizando o rótulo.
update public.technical_fields f
set label='NÚMERO DE SÉRIE',is_active=true
where f.field_key='numero_serie' and f.field_type='text'
  and (f.label is distinct from 'NÚMERO DE SÉRIE' or f.is_active=false);
