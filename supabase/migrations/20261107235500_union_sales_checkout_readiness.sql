begin;
-- A vitrine deve explicar a configuração pendente, sem permitir tentativa de venda inválida.
create or replace function public.sales_checkout_options_v1(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_methods jsonb; v_ready boolean:=false;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para finalizar Vendas.' using errcode='42501'; end if;
 select exists(
   select 1 from public.organization_modules om
   join public.financial_settings fs on fs.organization_id=om.organization_id
   join public.financial_categories fc on fc.id=fs.default_receivable_category_id
     and fc.organization_id=om.organization_id and fc.nature='revenue'
   where om.organization_id=p_organization_id and om.module_key='finance' and om.is_enabled
 ) into v_ready;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'method_type',m.method_type,
   'financial_account_id',a.id,'account_name',a.name) order by m.name),'[]'::jsonb)
 into v_methods
 from public.financial_payment_methods m
 join public.financial_accounts a
   on a.id=m.default_financial_account_id and a.organization_id=m.organization_id and a.is_active
 where m.organization_id=p_organization_id and m.is_active;
 return jsonb_build_object('payment_methods',v_methods,'finance_ready',v_ready);
end;$function$;
revoke all on function public.sales_checkout_options_v1(uuid) from public;
grant execute on function public.sales_checkout_options_v1(uuid) to authenticated;
commit;