-- Catálogo completo de módulos e matriz inicial dos planos.
-- A matriz é apenas um padrão inicial e continua totalmente editável pela Union.

begin;

insert into public.system_modules (key,name,description,category,sort_order,is_active)
values
  ('queue','Union Senhas','Fila eletrônica integrada ao ecossistema Union.','operation',300,true),
  ('pbx','PABX Union','Telefonia, ramais e recursos do PABX Union.','operation',310,true),
  ('marketplace','Marketplace Union','Catálogo e participação no marketplace do ecossistema Union.','operation',320,true),
  ('ai','Union IA','Recursos e créditos de inteligência artificial.','operation',330,true)
on conflict (key) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  is_active=true;

with core_modules(module_key) as (
  values
    ('dashboard'),('customers'),('orders'),('agenda'),('inventory'),('products'),
    ('equipment'),('checklists'),('services'),('service_types'),('order_situations'),
    ('order_statuses'),('documents'),('quotes'),('employees'),('company_settings'),
    ('finance'),('pdv')
),
eligible_plans as (
  select p.id
  from public.platform_billing_plans p
  where p.name in ('Union Essencial','Union Pro','Union Empresa','Union Enterprise')
    and not exists (
      select 1 from public.platform_billing_plan_modules existing
      where existing.plan_id=p.id
    )
)
insert into public.platform_billing_plan_modules(plan_id,module_key,is_included)
select p.id,m.module_key,true
from eligible_plans p
cross join core_modules m
where exists (
  select 1 from public.system_modules sm
  where sm.key=m.module_key and sm.is_active
)
on conflict (plan_id,module_key) do nothing;

commit;
