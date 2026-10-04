begin;

-- A tela monitorada reutiliza o mesmo workspace da OS normal. Para leitura,
-- uma OS explicitamente monitorada pela Union pode ler suas tabelas filhas,
-- sem conceder qualquer acesso de escrita à empresa parceira.
create or replace function private.can_access_service_order_child(
  p_service_order_id uuid,
  p_permission_key text,
  p_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and (
        (
          p_access_level = 'read'
          and private.can_monitor_service_order(service_order.id)
        )
        or (
          private.can_view_service_order(service_order.id)
          and private.can_access_shared_organization_resource(
            service_order.organization_id,
            'orders',
            p_access_level
          )
          and private.has_effective_organization_permission(
            service_order.organization_id,
            p_permission_key
          )
        )
      )
  );
$$;

revoke all on function private.can_access_service_order_child(uuid, text, text) from public;
grant execute on function private.can_access_service_order_child(uuid, text, text) to authenticated;

-- O bootstrap agrega dados de várias tabelas filhas. SECURITY DEFINER evita que
-- joins internos percam dados por RLS individual, mas só depois de validar a OS
-- com a regra central can_view_service_order, que limita a Union às OS monitoradas.
create or replace function public.get_service_order_workspace_v1(
  p_organization_id uuid,
  p_service_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order jsonb;
begin
  if (select auth.uid()) is null
     or p_organization_id is null
     or p_service_order_id is null
     or not exists (
       select 1
       from public.service_orders service_order
       where service_order.id = p_service_order_id
         and service_order.organization_id = p_organization_id
         and private.can_view_service_order(service_order.id)
     ) then
    raise exception 'OS não encontrada ou sem acesso.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'is_solved', so.is_solved,
    'solved_at', so.solved_at,
    'completed_at', so.completed_at,
    'completed_by', so.completed_by,
    'situation_started_at', so.situation_started_at,
    'service_price', so.service_price,
    'parts_total', so.parts_total,
    'subtotal', so.subtotal,
    'discount_type', so.discount_type,
    'discount_percentage', so.discount_percentage,
    'discount_amount', so.discount_amount,
    'final_total', so.final_total,
    'commercial_pricing_enabled', so.commercial_pricing_enabled,
    'cannot_be_solved', so.cannot_be_solved,
    'cannot_be_solved_reason', so.cannot_be_solved_reason,
    'diagnosis', so.diagnosis,
    'solution', so.solution,
    'loose_parts', so.loose_parts,
    'assigned_profile', case
      when assigned_profile.id is null then null
      else jsonb_build_object(
        'id', assigned_profile.id,
        'full_name', assigned_profile.full_name
      )
    end,
    'technician_links', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'employee_id', link.employee_id,
          'employee', case
            when employee.id is null then null
            else jsonb_build_object(
              'id', employee.id,
              'full_name', employee.full_name,
              'function_name', employee.function_name,
              'is_active', employee.is_active
            )
          end
        )
        order by employee.full_name nulls last, link.employee_id
      )
      from public.service_order_technicians link
      left join public.employees employee on employee.id = link.employee_id
      where link.service_order_id = so.id
    ), '[]'::jsonb),
    'seller_links', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'employee_id', link.employee_id,
          'employee', case
            when employee.id is null then null
            else jsonb_build_object(
              'id', employee.id,
              'full_name', employee.full_name,
              'function_name', employee.function_name,
              'is_active', employee.is_active
            )
          end
        )
        order by employee.full_name nulls last, link.employee_id
      )
      from public.service_order_sellers link
      left join public.employees employee on employee.id = link.employee_id
      where link.service_order_id = so.id
    ), '[]'::jsonb),
    'solution_attempt_count', (
      select count(*)
      from public.service_order_solution_attempts attempt
      where attempt.organization_id = so.organization_id
        and attempt.service_order_id = so.id
    ),
    'active_solution_attempt', (
      select jsonb_build_object(
        'id', attempt.id,
        'organization_id', attempt.organization_id,
        'service_order_id', attempt.service_order_id,
        'attempt_number', attempt.attempt_number,
        'diagnosis', attempt.diagnosis,
        'solution', attempt.solution,
        'loose_parts', attempt.loose_parts,
        'solved_at', attempt.solved_at,
        'solved_by', attempt.solved_by,
        'reverted_at', attempt.reverted_at,
        'reverted_by', attempt.reverted_by,
        'revert_reason', attempt.revert_reason,
        'created_at', attempt.created_at,
        'solved_by_profile', case
          when solved_by_profile.id is null then null
          else jsonb_build_object(
            'id', solved_by_profile.id,
            'full_name', solved_by_profile.full_name
          )
        end,
        'reverted_by_profile', case
          when reverted_by_profile.id is null then null
          else jsonb_build_object(
            'id', reverted_by_profile.id,
            'full_name', reverted_by_profile.full_name
          )
        end
      )
      from public.service_order_solution_attempts attempt
      left join public.profiles solved_by_profile on solved_by_profile.id = attempt.solved_by
      left join public.profiles reverted_by_profile on reverted_by_profile.id = attempt.reverted_by
      where attempt.organization_id = so.organization_id
        and attempt.service_order_id = so.id
        and attempt.reverted_at is null
      order by attempt.attempt_number desc
      limit 1
    )
  )
  into v_order
  from public.service_orders so
  left join public.profiles assigned_profile on assigned_profile.id = so.assigned_to
  where so.organization_id = p_organization_id
    and so.id = p_service_order_id
  limit 1;

  if v_order is null then
    return null;
  end if;

  return jsonb_build_object(
    'current_order', v_order,
    'history', coalesce((
      select jsonb_agg(
        to_jsonb(history)
        || jsonb_build_object(
          'notes', history.note,
          'order_status', case
            when status.id is null then null
            else jsonb_build_object('name', status.name)
          end
        )
        order by history.created_at desc
      )
      from public.service_order_status_history history
      left join public.order_statuses status on status.id = history.to_status_id
      where history.organization_id = p_organization_id
        and history.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'history_notes', coalesce((
      select jsonb_agg(to_jsonb(note) order by note.created_at desc)
      from public.service_order_history_notes note
      where note.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', link.id,
          'media_id', link.media_id,
          'sort_order', link.sort_order,
          'media', case
            when media.id is null then null
            else jsonb_build_object(
              'id', media.id,
              'file_name', media.file_name,
              'bucket_id', media.bucket_id,
              'storage_path', media.storage_path
            )
          end
        )
        order by link.sort_order, link.created_at
      )
      from public.service_order_media link
      left join public.media media on media.id = link.media_id
      where link.organization_id = p_organization_id
        and link.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'used_items', coalesce((
      select jsonb_agg(
        to_jsonb(used_item)
        || jsonb_build_object(
          'inventory_item', case
            when inventory_item.id is null then null
            else jsonb_build_object(
              'id', inventory_item.id,
              'name', inventory_item.name,
              'sku', inventory_item.sku,
              'unit', inventory_item.unit
            )
          end
        )
        order by used_item.created_at desc
      )
      from public.service_order_used_items used_item
      left join public.inventory_items inventory_item on inventory_item.id = used_item.inventory_item_id
      where used_item.organization_id = p_organization_id
        and used_item.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'technical_values', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.created_at)
      from public.service_order_technical_values value
      where value.organization_id = p_organization_id
        and value.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'part_requests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', request.id,
          'service_order_id', request.service_order_id,
          'requested_by', request.requested_by,
          'purpose', request.purpose,
          'status', request.status,
          'notes', request.notes,
          'reviewed_by', request.reviewed_by,
          'reviewed_at', request.reviewed_at,
          'review_notes', request.review_notes,
          'created_at', request.created_at,
          'service_order', jsonb_build_object(
            'is_solved', service_order.is_solved,
            'completed_at', service_order.completed_at
          ),
          'requested_by_profile', case
            when requester.id is null then null
            else jsonb_build_object('full_name', requester.full_name)
          end,
          'reviewed_by_profile', case
            when reviewer.id is null then null
            else jsonb_build_object('full_name', reviewer.full_name)
          end,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'inventory_item_id', item.inventory_item_id,
                'quantity', item.quantity,
                'approved_quantity', item.approved_quantity,
                'source_test_item_id', item.source_test_item_id,
                'delivered_quantity', item.delivered_quantity,
                'delivered_at', item.delivered_at,
                'delivered_by', item.delivered_by,
                'technician_received_quantity', item.technician_received_quantity,
                'technician_received_at', item.technician_received_at,
                'technician_received_by', item.technician_received_by,
                'return_pending_quantity', item.return_pending_quantity,
                'return_registered_at', item.return_registered_at,
                'return_registered_by', item.return_registered_by,
                'returned_quantity', item.returned_quantity,
                'return_received_at', item.return_received_at,
                'return_received_by', item.return_received_by,
                'damaged_quantity', item.damaged_quantity,
                'resolution_reverted_quantity', item.resolution_reverted_quantity,
                'inventory_item', case
                  when inventory_item.id is null then null
                  else jsonb_build_object(
                    'id', inventory_item.id,
                    'name', inventory_item.name,
                    'sku', inventory_item.sku,
                    'unit', inventory_item.unit,
                    'conversion_factor', inventory_item.conversion_factor,
                    'quantity', inventory_item.quantity
                  )
                end
              )
              order by item.created_at, item.id
            )
            from public.service_order_part_request_items item
            left join public.inventory_items inventory_item on inventory_item.id = item.inventory_item_id
            where item.organization_id = p_organization_id
              and item.request_id = request.id
          ), '[]'::jsonb)
        )
        order by request.created_at desc
      )
      from public.service_order_part_requests request
      join public.service_orders service_order on service_order.id = request.service_order_id
      left join public.profiles requester on requester.id = request.requested_by
      left join public.profiles reviewer on reviewer.id = request.reviewed_by
      where request.organization_id = p_organization_id
        and request.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'situation_documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', link.id,
          'service_order_id', link.service_order_id,
          'situation_id', link.situation_id,
          'media_id', link.media_id,
          'attachment_type_id', link.attachment_type_id,
          'created_at', link.created_at,
          'media', case
            when media.id is null then null
            else jsonb_build_object(
              'id', media.id,
              'file_name', media.file_name,
              'mime_type', media.mime_type
            )
          end,
          'attachment_type', case
            when attachment_type.id is null then null
            else jsonb_build_object(
              'id', attachment_type.id,
              'name', attachment_type.name,
              'is_active', attachment_type.is_active
            )
          end
        )
        order by link.created_at
      )
      from public.service_order_situation_media link
      left join public.media media on media.id = link.media_id
      left join public.attachment_types attachment_type on attachment_type.id = link.attachment_type_id
      where link.organization_id = p_organization_id
        and link.service_order_id = p_service_order_id
    ), '[]'::jsonb),
    'situation_visits', coalesce((
      select jsonb_agg(to_jsonb(visit) order by visit.entered_at desc)
      from public.service_order_situation_visits visit
      where visit.organization_id = p_organization_id
        and visit.service_order_id = p_service_order_id
    ), '[]'::jsonb)
  );
end;
$$;


revoke all on function public.get_service_order_workspace_v1(uuid, uuid) from public, anon;
grant execute on function public.get_service_order_workspace_v1(uuid, uuid) to authenticated;

commit;
