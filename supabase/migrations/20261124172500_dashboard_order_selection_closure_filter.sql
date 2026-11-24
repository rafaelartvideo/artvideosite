-- Drill-down of dashboard charts. Only authorized identifiers/counts are resolved
-- inside private schema (catalog joins must match aggregate even without customers.view).
-- Public function remains SECURITY INVOKER for customer and OS fields.
create or replace function private.dashboard_order_selection_ids_v2(
  p_organization_id uuid, p_kind text, p_group_id uuid, p_value text,
  p_sla_state text, p_period_days integer, p_page integer, p_page_size integer, p_closure_filter text
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_member boolean := false;
  v_monitor boolean := false;
  v_view boolean := false;
  v_all boolean := false;
  v_start timestamptz := now() - make_interval(days=>greatest(1,least(coalesce(p_period_days,30),365)));
  v_day date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_size integer := least(50,greatest(1,coalesce(p_page_size,10)));
  v_offset bigint := (greatest(1,coalesce(p_page,1))::bigint-1) * least(50,greatest(1,coalesce(p_page_size,10)));
begin
  if v_actor is null or p_organization_id is null
    or not private.is_organization_module_enabled(p_organization_id,'orders') then
    raise exception 'Sem autorização para consultar dashboard de OS.' using errcode='42501';
  end if;
  v_member := private.is_organization_member(p_organization_id);
  v_monitor := private.has_platform_permission('orders.monitor.view');
  if not (v_member or v_monitor) then
    raise exception 'Sem acesso às ordens dessa empresa.' using errcode='42501';
  end if;
  if v_member then
    v_view := private.has_effective_organization_permission(p_organization_id,'orders.view');
    v_all := private.has_effective_organization_permission(p_organization_id,'orders.view_all');
  end if;
  if p_closure_filter is null or p_closure_filter not in ('all','open','closed') then
    raise exception 'Filtro de fechamento inválido.' using errcode='22023';
  end if;
  if p_kind is null or p_kind not in ('situation','status','opened','service_type','equipment_type','equipment_model','quote_approved','quote_rejected','metric_opened','metric_active','metric_waiting','metric_completed') then
    raise exception 'Seleção de gráfico inválida.' using errcode='22023';
  end if;
  if p_sla_state is not null and (p_kind <> 'situation' or p_sla_state not in ('success','warning','danger','neutral')) then
    raise exception 'Seleção de SLA inválida.' using errcode='22023';
  end if;
  if p_kind in ('opened','quote_approved','quote_rejected') then
    if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Data de seleção inválida.' using errcode='22023';
    end if;
    v_day := p_value::date;
    v_day_start := v_day::timestamp at time zone 'America/Sao_Paulo';
    v_day_end := (v_day+1)::timestamp at time zone 'America/Sao_Paulo';
  end if;
  if p_kind in ('quote_approved','quote_rejected') then
    -- Same current proposal statuses and decision date as the chart, not OS opening date.
    if not (v_member and v_view) then
      return jsonb_build_object('total',0,'rows','[]'::jsonb);
    end if;
    return (
      with matches as materialized (
        select so.id as order_id,q.id as row_key,q.version as quote_version,
          case when q.status='approved' then q.approved_at else q.updated_at end as event_at
        from public.service_order_quote_proposals q
        join public.service_orders so on so.id=q.service_order_id and so.organization_id=q.organization_id
        where q.organization_id=p_organization_id
          and (p_closure_filter='all' or (p_closure_filter='open' and so.completed_at is null) or (p_closure_filter='closed' and so.completed_at is not null))
          and q.status=case when p_kind='quote_approved' then 'approved' else 'rejected' end
          and (v_all or so.assigned_to=v_actor or private.is_current_user_service_order_staff(so.id,so.organization_id,so.technician_id,so.seller_id))
          and (case when q.status='approved' then q.approved_at else q.updated_at end) >= greatest(v_start,v_day_start)
          and (case when q.status='approved' then q.approved_at else q.updated_at end) < v_day_end
      ), page as (select * from matches order by event_at desc,row_key desc limit v_size offset v_offset)
      select jsonb_build_object('total',(select count(*) from matches),
        'rows',coalesce((select jsonb_agg(to_jsonb(page) order by event_at desc,row_key desc) from page),'[]'::jsonb))
    );
  end if;
  return (
    with matches as materialized (
      select so.id as order_id, so.id as row_key, null::integer as quote_version,
        case when p_kind='metric_completed' then so.completed_at else so.created_at end as event_at
      from public.service_orders so
      left join public.order_statuses st on p_kind in ('status','metric_waiting') and st.id=so.status_id and st.organization_id=so.organization_id
      left join public.os_situations si on p_kind in ('situation','metric_waiting') and si.id=so.situation_id and si.organization_id=so.organization_id
      left join public.service_types ty on p_kind='service_type' and ty.id=so.service_type_id and ty.organization_id=so.organization_id
      left join public.customer_equipments ce on p_kind in ('equipment_type','equipment_model') and ce.id=so.customer_equipment_id and ce.organization_id=so.organization_id
      left join public.equipment_types et on p_kind='equipment_type' and et.id=coalesce(so.equipment_type_id,ce.equipment_type_id) and et.organization_id=so.organization_id
      left join public.equipment_models em on p_kind='equipment_model' and em.id=coalesce(so.equipment_model_id,ce.equipment_model_id) and em.organization_id=so.organization_id
      where so.organization_id=p_organization_id
        and (p_closure_filter='all' or (p_closure_filter='open' and so.completed_at is null) or (p_closure_filter='closed' and so.completed_at is not null))
        and ((v_monitor and private.is_monitored_service_type(p_organization_id,so.service_type_id))
          or (v_member and (so.assigned_to=v_actor or v_all or (v_view and private.is_current_user_service_order_staff(so.id,so.organization_id,so.technician_id,so.seller_id)))))
        and case p_kind
          when 'status' then st.id is not distinct from p_group_id
          when 'situation' then si.id is not distinct from p_group_id and (p_sla_state is null or
            case when si.hours is null or si.hours<=0 then 'neutral'
              when greatest(0::numeric,extract(epoch from (coalesce(so.completed_at,now())-coalesce(so.situation_started_at,so.updated_at,so.created_at)))::numeric/3600)/si.hours>1 then 'danger'
              when greatest(0::numeric,extract(epoch from (coalesce(so.completed_at,now())-coalesce(so.situation_started_at,so.updated_at,so.created_at)))::numeric/3600)/si.hours>=0.8 then 'warning'
              else 'success' end=p_sla_state)
          when 'opened' then so.created_at >= greatest(v_start,v_day_start) and so.created_at < v_day_end
          when 'service_type' then so.created_at>=v_start and coalesce(nullif(btrim(ty.title),''),'Sem tipo de atendimento')=p_value
          when 'equipment_type' then so.created_at>=v_start and coalesce(nullif(btrim(et.name),''),'Sem tipo de equipamento')=p_value
          when 'equipment_model' then so.created_at>=v_start and coalesce(nullif(btrim(em.name),''),nullif(btrim(so.model),''),'Sem modelo')=p_value
          when 'metric_opened' then so.created_at>=v_start
          when 'metric_active' then so.completed_at is null
          when 'metric_waiting' then so.completed_at is null and
            (lower(coalesce(st.name,'')) like any(array['%aguard%','%client%','%pendent%'])
              or lower(coalesce(si.name,'')) like any(array['%aguard%','%client%','%pendent%']))
          when 'metric_completed' then so.completed_at>=v_start
          else false end
    ), page as (select * from matches order by event_at desc,row_key desc limit v_size offset v_offset)
    select jsonb_build_object('total',(select count(*) from matches),
      'rows',coalesce((select jsonb_agg(to_jsonb(page) order by event_at desc,row_key desc) from page),'[]'::jsonb))
  );
end;
$function$;
revoke all on function private.dashboard_order_selection_ids_v2(uuid,text,uuid,text,text,integer,integer,integer,text) from public,anon;
grant execute on function private.dashboard_order_selection_ids_v2(uuid,text,uuid,text,text,integer,integer,integer,text) to authenticated;

create or replace function public.load_dashboard_order_selection_page_v2(
  p_organization_id uuid,p_kind text,p_group_id uuid,p_value text,p_sla_state text,
  p_period_days integer,p_page integer,p_page_size integer, p_closure_filter text
) returns jsonb
language sql stable security invoker set search_path = ''
as $function$
  with selected as materialized (
    select private.dashboard_order_selection_ids_v2(p_organization_id,p_kind,p_group_id,p_value,p_sla_state,p_period_days,p_page,p_page_size,p_closure_filter) as result
  ), page as materialized (
    select records.*
    from selected cross join lateral jsonb_to_recordset(selected.result->'rows')
      as records(order_id uuid,row_key uuid,quote_version integer,event_at timestamptz)
  )
  select jsonb_build_object(
    'total',(select result->'total' from selected),
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',so.id,'row_key',p.row_key,'event_at',p.event_at,'quote_version',p.quote_version,
        'os_number',so.os_number,'created_at',so.created_at,'updated_at',so.updated_at,'completed_at',so.completed_at,
        'customer',case when c.id is not null then jsonb_build_object('id',c.id,'full_name',c.full_name) else null end,
        'order_status',case when st.id is not null then jsonb_build_object('id',st.id,'name',st.name,'color',st.color) else null end,
        'situation',case when si.id is not null then jsonb_build_object('id',si.id,'name',si.name,'color',si.color) else null end
      ) order by p.event_at desc,p.row_key desc)
      from page p join public.service_orders so on so.id=p.order_id and so.organization_id=p_organization_id
      left join public.customers c on c.id=so.customer_id and c.organization_id=so.organization_id
      left join public.order_statuses st on st.id=so.status_id and st.organization_id=so.organization_id
      left join public.os_situations si on si.id=so.situation_id and si.organization_id=so.organization_id
    ),'[]'::jsonb)
  );
$function$;
revoke all on function public.load_dashboard_order_selection_page_v2(uuid,text,uuid,text,text,integer,integer,integer,text) from public,anon;
grant execute on function public.load_dashboard_order_selection_page_v2(uuid,text,uuid,text,text,integer,integer,integer,text) to authenticated;
