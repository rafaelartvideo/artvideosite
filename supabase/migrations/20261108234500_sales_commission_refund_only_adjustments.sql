-- Trocas equivalentes não cancelam receita nem comissão: somente devoluções financeiras.
begin;
create or replace function public.approve_sales_commission_v1(
 p_organization_id uuid,p_seller_id uuid,p_month date,p_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_goal public.sales_seller_goals%rowtype;
 v_settings public.financial_settings%rowtype;
 v_category public.financial_categories%rowtype;
 v_eligible numeric(14,2);
 v_amount numeric(14,2);
 v_entry uuid;
 v_approval public.sales_commission_approvals%rowtype;
 v_seller text;
 v_start date:=date_trunc('month',p_month)::date;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.targets.manage')
 then raise exception 'Sem permissão para aprovar comissões.' using errcode='42501'; end if;
 if p_month is null or v_start<>p_month or p_month >= date_trunc('month',current_date)::date
 then raise exception 'Somente meses encerrados podem ter comissão aprovada.' using errcode='22023'; end if;
 if char_length(coalesce(p_notes,''))>1000 then raise exception 'Observação muito longa.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_seller_id::text||':'||p_month::text,0));
 select * into v_approval from public.sales_commission_approvals
 where organization_id=p_organization_id and seller_id=p_seller_id and month_start=p_month for update;
 if found then return jsonb_build_object('id',v_approval.id,'financial_entry_id',v_approval.financial_entry_id,
   'amount',v_approval.approved_amount,'already_approved',true); end if;
 select * into v_goal from public.sales_seller_goals g
 where g.organization_id=p_organization_id and g.seller_id=p_seller_id and g.month_start=p_month;
 if not found or v_goal.commission_percent<=0 then
   raise exception 'Configure uma comissão positiva antes de aprovar.' using errcode='22023'; end if;
 select p.full_name into v_seller from public.organization_members m
 join public.profiles p on p.id=m.user_id
 where m.organization_id=p_organization_id and m.user_id=p_seller_id;
 if not found then raise exception 'Vendedor não pertence à empresa.' using errcode='42501'; end if;
 select coalesce(sum(greatest(0,(case when v_goal.commission_basis='received'
   then least(o.total_amount,coalesce((select sum(i.settled_amount)
     from public.financial_installments i
     where i.organization_id=p_organization_id and i.financial_entry_id=o.financial_entry_id),0))
   else o.total_amount end)-coalesce((select sum(r.gross_credit_amount)
     from public.sales_order_returns r
     where r.organization_id=p_organization_id and r.order_id=o.id
       and r.request_type='refund'
       and r.status in ('received','closed','awaiting_finance')),0))),0)
 into v_eligible from public.sales_orders o
 where o.organization_id=p_organization_id and o.created_by=p_seller_id
   and o.status='confirmed' and o.created_at>=p_month and o.created_at<p_month+interval '1 month';
 v_amount:=round(v_eligible*v_goal.commission_percent/100,2);
 if v_amount<=0 then raise exception 'Não há comissão positiva para aprovar neste período.' using errcode='22023'; end if;
 select * into v_settings from public.financial_settings where organization_id=p_organization_id;
 if not found or v_settings.default_payable_category_id is null then
   raise exception 'Configure a categoria padrão de Contas a Pagar no Financeiro.' using errcode='22023'; end if;
 select * into v_category from public.financial_categories
 where organization_id=p_organization_id and id=v_settings.default_payable_category_id and is_active;
 if not found then raise exception 'Categoria padrão de Contas a Pagar inativa.' using errcode='22023'; end if;
 insert into public.financial_entries(
  organization_id,entry_type,description,issue_date,competence_date,original_amount,
  approval_status,required_approvals,approval_cycle,approved_at,
  counterpart_name_snapshot,origin_type,origin_reference,
  source_details,notes,created_by,updated_by
 ) values(
  p_organization_id,'payable','Comissão Vendas · '||v_seller||' · '||to_char(p_month,'MM/YYYY'),
  current_date,p_month,v_amount,'approved',1,1,now(),
  v_seller,'other',p_seller_id::text||':'||to_char(p_month,'YYYY-MM'),
  jsonb_build_object('commission_month',p_month,'seller_id',p_seller_id,
     'basis',v_goal.commission_basis,'eligible_amount',v_eligible,'rate',v_goal.commission_percent),
  nullif(left(btrim(coalesce(p_notes,'')),1000),''),v_actor,v_actor
 ) returning id into v_entry;
 insert into public.financial_installments(
  organization_id,financial_entry_id,installment_number,total_installments,due_date,
  original_amount,settled_amount
 ) values(p_organization_id,v_entry,1,1,current_date,v_amount,0);
 insert into public.financial_allocations(
  organization_id,financial_entry_id,category_id,category_name_snapshot,
  category_nature_snapshot,cost_center_id,allocation_mode,percentage,amount
 ) values(p_organization_id,v_entry,v_category.id,v_category.name,
  'expense',v_settings.default_cost_center_id,'amount',100,v_amount);
 insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
 values(p_organization_id,v_entry,'created',
  jsonb_build_object('seller_id',p_seller_id,'commission_month',p_month,'amount',v_amount),v_actor);
 insert into public.sales_commission_approvals(
  organization_id,seller_id,month_start,commission_basis,commission_rate,
  eligible_amount,approved_amount,notes,financial_entry_id,approved_by
 ) values(p_organization_id,p_seller_id,p_month,v_goal.commission_basis,
  v_goal.commission_percent,v_eligible,v_amount,
  nullif(left(btrim(coalesce(p_notes,'')),1000),''),v_entry,v_actor)
 returning * into v_approval;
 return jsonb_build_object('id',v_approval.id,'financial_entry_id',v_entry,
    'amount',v_amount,'already_approved',false);
end;$function$;
revoke all on function public.approve_sales_commission_v1(uuid,uuid,date,text) from public,anon;
grant execute on function public.approve_sales_commission_v1(uuid,uuid,date,text) to authenticated;
commit;