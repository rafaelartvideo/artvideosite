-- Autoriza o cadastro rápido também nos módulos da própria Union,
-- respeitando as mesmas permissões do sistema.
create or replace function public.add_quick_equipment_extra_fields_v1(
 p_organization_id uuid,
 p_equipment_type_id uuid,
 p_field_ids uuid[] default '{}'::uuid[],
 p_include_serial boolean default true
)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_field uuid;
 v_serial uuid;
 v_type text;
 v_order integer;
begin
 if auth.uid() is null or not exists(
   select 1 from public.organization_members om
   join public.organizations o on o.id=om.organization_id
   where om.user_id=auth.uid() and om.organization_id=p_organization_id
     and om.status='active' and o.status='active'
 ) or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.create') then
   raise exception 'Sem permissão para cadastrar campos extras.' using errcode='42501';
 end if;
 if not exists(
   select 1 from public.equipment_types t
   where t.id=p_equipment_type_id and t.organization_id=p_organization_id
 ) then
   raise exception 'Equipamento inválido para esta empresa.' using errcode='22023';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(
   p_organization_id::text||':quick-fields:'||p_equipment_type_id::text,0
 ));

 for v_field in select distinct unnest(coalesce(p_field_ids,'{}'::uuid[]))
 loop
   if not exists(
     select 1 from public.technical_fields f
     where f.id=v_field and f.organization_id=p_organization_id and f.is_active
   ) then
     raise exception 'Campo extra inválido ou desativado.' using errcode='22023';
   end if;
   select coalesce(max(x.sort_order),0)+10 into v_order
   from public.equipment_type_technical_fields x where x.equipment_type_id=p_equipment_type_id;
   insert into public.equipment_type_technical_fields(
     organization_id,equipment_type_id,technical_field_id,required,sort_order
   ) values(p_organization_id,p_equipment_type_id,v_field,false,v_order)
   on conflict(equipment_type_id,technical_field_id) do nothing;
 end loop;

 if coalesce(p_include_serial,false) then
   select f.id,f.field_type into v_serial,v_type
   from public.technical_fields f
   where f.organization_id=p_organization_id and f.field_key='numero_serie';
   if v_serial is not null and v_type <> 'text' then
     raise exception 'O campo NÚMERO DE SÉRIE cadastrado nesta empresa precisa ser do tipo texto.'
       using errcode='22023';
   end if;

   if v_serial is null then
     insert into public.technical_fields(
       organization_id,field_key,label,field_type,is_active,sort_order
     ) values(p_organization_id,'numero_serie','NÚMERO DE SÉRIE','text',true,0)
     on conflict(organization_id,field_key) do nothing
     returning id into v_serial;
     if v_serial is null then
       select id into v_serial from public.technical_fields
         where organization_id=p_organization_id and field_key='numero_serie'
           and field_type='text';
     end if;
   else
     update public.technical_fields set label='NÚMERO DE SÉRIE',is_active=true
       where id=v_serial and organization_id=p_organization_id
         and (label is distinct from 'NÚMERO DE SÉRIE' or is_active=false);
   end if;
   if v_serial is null then
     raise exception 'Não foi possível preparar o campo NÚMERO DE SÉRIE.'
       using errcode='22023';
   end if;

   insert into public.equipment_type_technical_fields(
     organization_id,equipment_type_id,technical_field_id,required,sort_order
   ) values(p_organization_id,p_equipment_type_id,v_serial,false,-10)
   on conflict(equipment_type_id,technical_field_id) do nothing;
 end if;
end; $$;