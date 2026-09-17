begin;

update public.financial_settings s
set default_receivable_category_id=(
  select c.id from public.financial_categories c
  where c.organization_id=s.organization_id and c.nature='revenue' and c.is_active=true
  order by case when lower(btrim(c.name))=lower('Serviços') then 0 else 1 end,c.created_at
  limit 1
), updated_at=now()
where s.default_receivable_category_id is null
  and exists(select 1 from public.organization_modules om where om.organization_id=s.organization_id and om.module_key='finance' and om.is_enabled=true);

update public.financial_settings s
set default_payable_category_id=(
  select c.id from public.financial_categories c
  where c.organization_id=s.organization_id and c.nature='expense' and c.is_active=true
  order by case when lower(btrim(c.name))=lower('Compras de estoque') then 0 else 1 end,c.created_at
  limit 1
), updated_at=now()
where s.default_payable_category_id is null
  and exists(select 1 from public.organization_modules om where om.organization_id=s.organization_id and om.module_key='finance' and om.is_enabled=true);

commit;
