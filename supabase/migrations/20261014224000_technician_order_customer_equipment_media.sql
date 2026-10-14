-- Detalhes da OS no Painel do Técnico: cliente, equipamento e imagens privadas.
-- A RPC expõe apenas os campos autorizados da OS atribuída. Não inclui preços.
begin;

create or replace function public.get_my_technician_order_details_v1(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.view') then
    raise exception 'Esta OS não está atribuída a você ou o acesso foi revogado.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id',ord.id,
    'os_number',ord.os_number,
    'can_change_situation',private.can_access_technician_order_v1(ord.id,'technician_panel.actions.change_situation'),
    'can_edit_diagnosis',(
      private.can_access_technician_order_v1(ord.id,'technician_panel.actions.edit_diagnosis')
      and private.can_access_technician_order_v1(ord.id,'technician_panel.data.diagnosis')
    ),
    'closed',ord.completed_at is not null or ord.cancelled_at is not null,
    'solved',coalesce(ord.is_solved,false),
    'situation_id',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then ord.situation_id else null end,
    'situation_name',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then situation.name else null end,
    'available_situations',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.actions.change_situation')
        and private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.sort_order,s.name)
        from public.os_situations s
        where s.organization_id=ord.organization_id and s.is_active
          and (ord.service_type_id is null or exists(
            select 1 from public.service_type_situations sts
            where sts.organization_id=ord.organization_id
              and sts.service_type_id=ord.service_type_id and sts.situation_id=s.id
          ))
      ),'[]'::jsonb) else '[]'::jsonb end,
    'diagnosis',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.diagnosis')
      then ord.diagnosis else null end,
    'equipment_accessories',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then ord.accessories else null end,
    'equipment_condition',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then ord.equipment_condition else null end,
    'equipment_brand',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then equipment_brand.name else null end,
    'equipment_model',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then coalesce(equipment_model.name,nullif(ord.model,'')) else null end,
    'technical_values',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',val.technical_field_id,
          'label',val.label_snapshot,'type',val.field_type_snapshot,
          'value',case when val.field_type_snapshot='number'
            then val.value_number::text else val.value_text end)
          order by val.label_snapshot,val.technical_field_id)
        from public.service_order_technical_values val
        where val.service_order_id=ord.id and val.organization_id=ord.organization_id
          and (
            (val.field_type_snapshot='number' and val.value_number is not null)
            or nullif(btrim(coalesce(val.value_text,'')),'') is not null
          )
      ),'[]'::jsonb) else '[]'::jsonb end,
    'customer_document',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.customer')
      then coalesce(nullif(customer.document,''),nullif(customer.cnpj,'')) else null end,
    'customer_type',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.customer')
      then customer.customer_type else null end,
    'customer_address',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.address')
      then jsonb_build_object(
        'street',coalesce(nullif(ord.service_street,''),customer_address.street),
        'number',coalesce(nullif(ord.service_number,''),customer_address.number),
        'complement',coalesce(nullif(ord.service_complement,''),customer_address.complement),
        'neighborhood',coalesce(nullif(ord.service_neighborhood,''),customer_address.neighborhood),
        'city',coalesce(nullif(ord.service_city,''),customer_address.city),
        'state',coalesce(nullif(ord.service_state,''),customer_address.state),
        'zip_code',coalesce(nullif(ord.service_zip_code,''),customer_address.zip_code)
      ) else null end,
    'equipment_photos',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',link.id,'name',media.file_name,'path',media.storage_path,
          'kind',case when link.sort_order >= 500 then 'label' else 'equipment' end
        ) order by link.sort_order,link.id)
        from public.service_order_media link
        join public.media media on media.id=link.media_id and media.bucket_id='service-images'
        where link.service_order_id=ord.id
          and media.organization_id=ord.organization_id
          and link.sort_order < 1000
      ),'[]'::jsonb) else '[]'::jsonb end,
    'internal_notes',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.internal_notes')
      then ord.internal_notes else null end,
    'items',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.order_items')
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',item.id,'type',item.item_type,'title',item.title_snapshot,
          'description',item.description_snapshot,'quantity',item.quantity
        ) order by item.created_at,item.id)
        from public.service_order_items item
        where item.service_order_id=ord.id and item.organization_id=ord.organization_id
      ),'[]'::jsonb) else '[]'::jsonb end
  ) into v_result
  from public.service_orders ord
  left join public.os_situations situation
    on situation.id=ord.situation_id and situation.organization_id=ord.organization_id
  left join public.equipment_brands equipment_brand
    on equipment_brand.id=ord.equipment_brand_id and equipment_brand.organization_id=ord.organization_id
  left join public.equipment_models equipment_model
    on equipment_model.id=ord.equipment_model_id and equipment_model.organization_id=ord.organization_id
  left join public.customers customer
    on customer.id=ord.customer_id and customer.organization_id=ord.organization_id
  left join lateral (
    select ca.street,ca.number,ca.complement,ca.neighborhood,ca.city,ca.state,ca.zip_code
    from public.customer_addresses ca
    where ca.customer_id=ord.customer_id and ca.organization_id=ord.organization_id
    order by (ca.id=ord.service_customer_address_id) desc,ca.is_default desc,ca.created_at desc
    limit 1
  ) customer_address on true
  where ord.id=p_order_id;

  return v_result;
end;
$$;

-- Bucket de OS permanece privado. O técnico só pode assinar URLs das imagens
-- realmente associadas à sua OS e se possuir permissão de visualizar equipamento.
create or replace function private.can_view_technician_order_equipment_photo_v1(p_name text)
returns boolean language sql stable security definer set search_path=''
as $
  select (select auth.uid()) is not null and exists(
    select 1 from public.media media
    join public.service_order_media link on link.media_id=media.id
    join public.service_orders ord on ord.id=link.service_order_id
      and ord.organization_id=media.organization_id
    where media.bucket_id='service-images'
      and media.storage_path=p_name
      and link.sort_order < 1000
      and private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
  );
$;
revoke all on function private.can_view_technician_order_equipment_photo_v1(text) from public,anon;
grant execute on function private.can_view_technician_order_equipment_photo_v1(text) to authenticated;

drop policy if exists technician_assigned_order_equipment_photo_select_v1 on storage.objects;
create policy technician_assigned_order_equipment_photo_select_v1
on storage.objects for select to authenticated
using (
  bucket_id='service-images'
  and private.can_view_technician_order_equipment_photo_v1(name)
);

commit;
