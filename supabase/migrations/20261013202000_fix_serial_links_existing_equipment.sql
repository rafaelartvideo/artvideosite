-- Backfill seguro em duas instruções para assegurar visibilidade dos novos campos
-- antes da inserção de associações equipamento-campo.
-- Não altera OS, modelos, tipos, marcas nem a seleção dos segmentos.

insert into public.technical_fields(
  organization_id,field_key,label,field_type,is_active,sort_order
)
select distinct t.organization_id,'numero_serie','NÚMERO DE SÉRIE','text',true,5
from public.equipment_types t
where (
 exists (
    select 1
    from public.catalog_equipment_types c
    join public.catalog_technical_field_templates ct on ct.equipment_type_id=c.id
    where ct.field_key='numero_serie' and ct.is_active
      and lower(public.normalize_visual_text(t.name)) =
          lower(public.normalize_visual_text(c.name))
 )
 or lower(public.normalize_visual_text(t.name))=any(array[
    lower(public.normalize_visual_text('Airfryer')),
    lower(public.normalize_visual_text('Ar-Condicionado')),
    lower(public.normalize_visual_text('Caixa De Som')),
    lower(public.normalize_visual_text('Ferro A Vapor')),
    lower(public.normalize_visual_text('Fone')),
    lower(public.normalize_visual_text('Forno Eletrico')),
    lower(public.normalize_visual_text('Forno Embutir')),
    lower(public.normalize_visual_text('Lavadoura De Roupas')),
    lower(public.normalize_visual_text('Liquidificador / Multiprocessador')),
    lower(public.normalize_visual_text('Microondas')),
    lower(public.normalize_visual_text('Pipoqueira')),
    lower(public.normalize_visual_text('Som')),
    lower(public.normalize_visual_text('Tv')),
    lower(public.normalize_visual_text('Tv 85 Polegadas'))
 ])
)
on conflict(organization_id,field_key) do nothing;

insert into public.equipment_type_technical_fields(
  organization_id,equipment_type_id,technical_field_id,required,sort_order
)
select t.organization_id,t.id,f.id,false,5
from public.equipment_types t
join public.technical_fields f
  on f.organization_id=t.organization_id
 and f.field_key='numero_serie' and f.field_type='text'
where (
 exists (
    select 1
    from public.catalog_equipment_types c
    join public.catalog_technical_field_templates ct on ct.equipment_type_id=c.id
    where ct.field_key='numero_serie' and ct.is_active
      and lower(public.normalize_visual_text(t.name)) =
          lower(public.normalize_visual_text(c.name))
 )
 or lower(public.normalize_visual_text(t.name))=any(array[
    lower(public.normalize_visual_text('Airfryer')),
    lower(public.normalize_visual_text('Ar-Condicionado')),
    lower(public.normalize_visual_text('Caixa De Som')),
    lower(public.normalize_visual_text('Ferro A Vapor')),
    lower(public.normalize_visual_text('Fone')),
    lower(public.normalize_visual_text('Forno Eletrico')),
    lower(public.normalize_visual_text('Forno Embutir')),
    lower(public.normalize_visual_text('Lavadoura De Roupas')),
    lower(public.normalize_visual_text('Liquidificador / Multiprocessador')),
    lower(public.normalize_visual_text('Microondas')),
    lower(public.normalize_visual_text('Pipoqueira')),
    lower(public.normalize_visual_text('Som')),
    lower(public.normalize_visual_text('Tv')),
    lower(public.normalize_visual_text('Tv 85 Polegadas'))
 ])
)
on conflict(equipment_type_id,technical_field_id) do nothing;
