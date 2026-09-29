CREATE OR REPLACE FUNCTION public.search_service_order_page_ids_v3(p_organization_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 5, p_os_number_search text DEFAULT ''::text, p_external_os_search text DEFAULT ''::text, p_customer_name_search text DEFAULT ''::text, p_document_search text DEFAULT ''::text, p_serial_number_search text DEFAULT ''::text, p_responsible_id uuid DEFAULT NULL::uuid, p_status_id uuid DEFAULT NULL::uuid, p_situation_id uuid DEFAULT NULL::uuid, p_order_type text DEFAULT ''::text, p_service_type_id uuid DEFAULT NULL::uuid, p_states text[] DEFAULT '{}'::text[], p_state_names text[] DEFAULT '{}'::text[], p_cities jsonb DEFAULT '[]'::jsonb, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_sort text DEFAULT ''::text, p_match_order_number_or_external boolean DEFAULT false)
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if trim(coalesce(p_os_number_search,''))=''
     and trim(coalesce(p_external_os_search,''))=''
     and trim(coalesce(p_customer_name_search,''))=''
     and trim(coalesce(p_document_search,''))=''
     and trim(coalesce(p_serial_number_search,''))=''
     and coalesce(cardinality(p_states),0)=0
     and coalesce(cardinality(p_state_names),0)=0
     and jsonb_array_length(coalesce(p_cities,'[]'::jsonb))=0
  then
    return query
    with base_access as materialized (
      select
        (select auth.uid()) as user_id,
        private.is_organization_module_enabled(p_organization_id,'orders') as module_enabled,
        private.has_platform_permission('orders.monitor.view') as monitor_view,
        private.is_organization_member(p_organization_id) as is_member
    ),
    access_context as materialized (
      select
        base.user_id,
        base.module_enabled,
        base.monitor_view,
        base.is_member,
        case when base.is_member
          then private.has_effective_organization_permission(p_organization_id,'orders.view_all')
          else false
        end as can_view_all,
        case when base.is_member
          then private.has_effective_organization_permission(p_organization_id,'orders.view')
          else false
        end as can_view_assigned,
        coalesce((
          select array_agg(employee.id)
          from public.employees employee
          where employee.organization_id=p_organization_id
            and employee.profile_id=base.user_id
        ),'{}'::uuid[]) as employee_ids
      from base_access base
    ),
    filtered as (
      select
        service_order.id,
        service_order.created_at,
        service_order.os_number,
        case lower(coalesce(order_status.name,''))
          when 'aberta' then 0
          when 'fechada' then 1
          when 'cancelada' then 2
          else 3
        end as status_priority,
        case
          when service_order.is_solved is true and service_order.completed_at is null then 0
          else 1
        end as solved_priority,
        nullif(substring(coalesce(service_order.os_number,'') from '[0-9]+'),'')::numeric as numeric_os
      from public.service_orders service_order
      left join public.order_statuses order_status
        on order_status.id=service_order.status_id
      cross join access_context access
      where access.user_id is not null
        and access.module_enabled
        and service_order.organization_id=p_organization_id
        and (
          (
            access.is_member
            and (
              access.can_view_all
              or service_order.assigned_to=access.user_id
              or (
                access.can_view_assigned
                and (
                  service_order.technician_id=any(access.employee_ids)
                  or service_order.seller_id=any(access.employee_ids)
                  or exists (
                    select 1
                    from public.service_order_technicians technician_link
                    where technician_link.service_order_id=service_order.id
                      and technician_link.organization_id=service_order.organization_id
                      and technician_link.employee_id=any(access.employee_ids)
                  )
                  or exists (
                    select 1
                    from public.service_order_sellers seller_link
                    where seller_link.service_order_id=service_order.id
                      and seller_link.organization_id=service_order.organization_id
                      and seller_link.employee_id=any(access.employee_ids)
                  )
                )
              )
            )
          )
          or (
            access.monitor_view
            and exists (
              select 1
              from public.service_type_monitoring monitoring
              where monitoring.organization_id=service_order.organization_id
                and monitoring.service_type_id=service_order.service_type_id
            )
          )
        )
        and (p_responsible_id is null or service_order.assigned_to=p_responsible_id)
        and (p_status_id is null or service_order.status_id=p_status_id)
        and (p_situation_id is null or service_order.situation_id=p_situation_id)
        and (coalesce(p_order_type,'')='' or service_order.order_type=p_order_type)
        and (p_service_type_id is null or service_order.service_type_id=p_service_type_id)
        and (p_date_from is null or service_order.created_at>=p_date_from::timestamptz)
        and (p_date_to is null or service_order.created_at<(p_date_to+1)::timestamptz)
    ),
    ranked as (
      select filtered.*,count(*) over() as total_count
      from filtered
    )
    select ranked.id,ranked.total_count
    from ranked
    order by
      case when coalesce(p_sort,'')='' then ranked.status_priority end asc,
      case when coalesce(p_sort,'')='' then ranked.solved_priority end asc,
      case when coalesce(p_sort,'')='' then ranked.created_at end desc,
      case when p_sort='asc' then ranked.numeric_os end asc nulls last,
      case when p_sort='asc' then ranked.created_at end asc,
      case when p_sort='desc' then ranked.numeric_os end desc nulls last,
      case when p_sort='desc' then ranked.created_at end desc
    limit greatest(1,p_page_size)
    offset ((greatest(1,p_page)-1)*greatest(1,p_page_size));

    return;
  end if;

  return query
  select *
  from public.search_service_order_page_ids_v2(
    p_organization_id,
    p_page,
    p_page_size,
    p_os_number_search,
    p_external_os_search,
    p_customer_name_search,
    p_document_search,
    p_serial_number_search,
    p_responsible_id,
    p_status_id,
    p_situation_id,
    p_order_type,
    p_service_type_id,
    p_states,
    p_state_names,
    p_cities,
    p_date_from,
    p_date_to,
    p_sort,
    p_match_order_number_or_external
  );
end;
$function$;

revoke all on function public.search_service_order_page_ids_v3(uuid,integer,integer,text,text,text,text,text,uuid,uuid,uuid,text,uuid,text[],text[],jsonb,date,date,text,boolean)
from public, anon;

grant execute on function public.search_service_order_page_ids_v3(uuid,integer,integer,text,text,text,text,text,uuid,uuid,uuid,text,uuid,text[],text[],jsonb,date,date,text,boolean)
to authenticated;
