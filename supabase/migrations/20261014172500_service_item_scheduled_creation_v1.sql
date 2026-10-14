-- Incluir serviço, equipe e horário na mesma transação PostgreSQL.
-- A função existente de agenda revalida expediente, conflitos e permissões.
create or replace function public.add_service_order_catalog_item_scheduled_v1(
  p_service_order_id uuid,
  p_catalog_id uuid,
  p_employee_ids uuid[],
  p_quantity integer,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if p_catalog_id is null or p_service_order_id is null
    or coalesce(cardinality(p_employee_ids),0)=0
    or p_start_at is null or p_end_at is null
    or p_start_at>=p_end_at
    or p_quantity is null or p_quantity<1 or p_quantity>99 then
    raise exception 'Selecione um serviço, técnicos disponíveis e um horário válido.' using errcode='22023';
  end if;

  -- Não incrementar/reatribuir silenciosamente serviço já existente na OS.
  if exists(
    select 1
    from public.service_order_items item
    where item.service_order_id=p_service_order_id
      and item.item_type='service'
      and item.general_service_id=p_catalog_id
  ) then
    raise exception 'Este serviço já está nesta OS. Para modificar o horário, use Reagendar.' using errcode='22023';
  end if;

  -- As RPCs chamadas validam orders.edit/orders.update, tenant,
  -- colaboradores e disponibilidade real antes do COMMIT.
  v_result:=public.add_service_order_catalog_item_with_technicians_v1(
    p_service_order_id,p_catalog_id,p_employee_ids,p_quantity
  );
  perform public.set_order_service_task_schedule_v1(
    (v_result->>'item_id')::uuid,p_start_at,p_end_at
  );
  return v_result;
end;
$$;

revoke all on function public.add_service_order_catalog_item_scheduled_v1(uuid,uuid,uuid[],integer,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.add_service_order_catalog_item_scheduled_v1(uuid,uuid,uuid[],integer,timestamptz,timestamptz)
  to authenticated;
