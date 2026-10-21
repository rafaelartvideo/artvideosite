begin;
-- Apenas as OS de tipos com fluxo de orçamento exigem aprovação.
-- A função fica no esquema não exposto e não modifica nenhum dado.
create or replace function private.require_approved_quote_for_order_execution()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_organization_id uuid;
begin
  if tg_table_name = 'service_orders' then
    v_order_id := new.id;
    v_organization_id := new.organization_id;
  else
    v_order_id := new.service_order_id;
    v_organization_id := new.organization_id;
  end if;
  if exists (
    select 1 from public.service_orders os
    join public.service_types st on st.id=os.service_type_id and st.organization_id=os.organization_id
    where os.id=v_order_id and os.organization_id=v_organization_id
      and st.quote_workflow_enabled
  ) and not exists (
    select 1 from public.service_order_quote_proposals quote
    where quote.service_order_id=v_order_id
      and quote.organization_id=v_organization_id
      and quote.status='approved'
      and quote.approved_at is not null
  ) then
    raise exception 'O orçamento precisa ser aprovado antes de pedir peças ou solucionar esta OS.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists require_quote_approval_before_order_solution on public.service_orders;
create trigger require_quote_approval_before_order_solution
  before update of is_solved on public.service_orders
  for each row when (old.is_solved is distinct from true and new.is_solved is true)
  execute function private.require_approved_quote_for_order_execution();
drop trigger if exists require_quote_approval_before_part_request on public.service_order_part_requests;
create trigger require_quote_approval_before_part_request
  before insert on public.service_order_part_requests
  for each row execute function private.require_approved_quote_for_order_execution();
commit;