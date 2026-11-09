-- Provision configurable finance basics for every active tenant.
create or replace function private.ensure_finance_defaults(p_org uuid)
returns void language plpgsql security definer set search_path=''
as $body$
begin
  if p_org is null or not exists (
    select 1 from public.organization_modules
    where organization_id=p_org and module_key='finance' and is_enabled
  ) then return; end if;

  insert into public.financial_settings(organization_id) values (p_org)
  on conflict (organization_id) do nothing;

  insert into public.financial_categories(organization_id,name,nature,report_group,description,is_active)
  select p_org,d.name,d.nature,d.group_name,'Categoria padrão editável.',true
  from (values
    ('Serviços','revenue','Receitas operacionais'),
    ('Venda de produtos','revenue','Receitas operacionais'),
    ('Outras receitas','revenue','Outras receitas'),
    ('Compras de estoque','expense','Custos operacionais'),
    ('Despesas operacionais','expense','Despesas operacionais'),
    ('Salários e encargos','expense','Despesas com pessoal'),
    ('Impostos e taxas','expense','Impostos e taxas'),
    ('Aluguel e infraestrutura','expense','Despesas operacionais'),
    ('Outras despesas','expense','Outras despesas')
  ) as d(name,nature,group_name)
  where not exists (
    select 1 from public.financial_categories c
    where c.organization_id=p_org and c.nature=d.nature
      and lower(btrim(c.name))=lower(btrim(d.name))
  )
  on conflict do nothing;

  insert into public.financial_payment_methods
  (organization_id,name,method_type,percentage_fee,fixed_fee,settlement_days,
   requires_financial_account,creates_future_settlement,is_active)
  select p_org,d.name,d.method_type,0,0,0,true,false,true
  from (values
    ('Dinheiro','cash'),('PIX','pix'),('Cartão de débito','debit_card'),
    ('Cartão de crédito','credit_card'),('Boleto','boleto'),
    ('Transferência','transfer'),('Outros','other')
  ) as d(name,method_type)
  where not exists (
    select 1 from public.financial_payment_methods m
    where m.organization_id=p_org
      and (m.method_type=d.method_type or lower(btrim(m.name))=lower(btrim(d.name)))
  )
  on conflict do nothing;

  update public.financial_settings s
  set default_receivable_category_id=coalesce(s.default_receivable_category_id,
    (select c.id from public.financial_categories c
     where c.organization_id=p_org and c.nature='revenue' and c.is_active
     order by case when lower(btrim(c.name))=lower('Serviços') then 0 else 1 end,c.created_at
     limit 1)),
      default_payable_category_id=coalesce(s.default_payable_category_id,
    (select c.id from public.financial_categories c
     where c.organization_id=p_org and c.nature='expense' and c.is_active
     order by case when lower(btrim(c.name))=lower('Compras de estoque') then 0 else 1 end,c.created_at
     limit 1))
  where s.organization_id=p_org
    and (s.default_receivable_category_id is null or s.default_payable_category_id is null);
end;
$body$;
revoke all on function private.ensure_finance_defaults(uuid) from public,anon,authenticated;

create or replace function private.finance_defaults_on_module_enabled()
returns trigger language plpgsql security definer set search_path=''
as $body$
begin
  if new.module_key='finance' and new.is_enabled then
    perform private.ensure_finance_defaults(new.organization_id);
  end if;
  return new;
end;
$body$;
revoke all on function private.finance_defaults_on_module_enabled() from public,anon,authenticated;

drop trigger if exists finance_defaults_on_module_enabled on public.organization_modules;
create trigger finance_defaults_on_module_enabled
after insert or update of is_enabled on public.organization_modules
for each row execute function private.finance_defaults_on_module_enabled();

do $seed$
declare v_org uuid;
begin
  for v_org in select distinct organization_id from public.organization_modules
    where module_key='finance' and is_enabled
  loop
    perform private.ensure_finance_defaults(v_org);
  end loop;
end;
$seed$;