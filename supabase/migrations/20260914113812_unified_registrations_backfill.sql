insert into public.entities (
  id, organization_id, person_type, name, legal_name, trade_name, document,
  state_registration, birth_date, foundation_date, phone, whatsapp, email,
  is_active, legacy_customer_id, created_at, updated_at
)
select
  c.id, c.organization_id,
  case when c.customer_type = 'PJ' then 'PJ' else 'PF' end,
  case when c.customer_type = 'PJ' then coalesce(nullif(c.trade_name,''), nullif(c.legal_name,''), c.full_name) else c.full_name end,
  c.legal_name, c.trade_name,
  case when c.customer_type = 'PJ' then coalesce(nullif(c.cnpj,''), c.document) else c.document end,
  c.state_registration, c.birth_date, c.foundation_date, c.phone, c.whatsapp, c.email,
  true, c.id, c.created_at, c.updated_at
from public.customers c
on conflict (id) do nothing;

insert into public.entity_roles(entity_id, role, is_active)
select c.id, 'customer', true from public.customers c
on conflict (entity_id, role) do update set is_active = excluded.is_active;

update public.entities e
set legacy_employee_id = emp.id,
    phone = coalesce(e.phone, emp.phone),
    updated_at = greatest(e.updated_at, emp.updated_at)
from public.employees emp
where e.organization_id = emp.organization_id
  and regexp_replace(coalesce(e.document,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(emp.cpf,''), '[^0-9]', '', 'g')
  and regexp_replace(coalesce(emp.cpf,''), '[^0-9]', '', 'g') <> ''
  and e.legacy_employee_id is null;

insert into public.entities (
  id, organization_id, person_type, name, document, phone, email, is_active,
  legacy_employee_id, created_at, updated_at
)
select emp.id, emp.organization_id, 'PF', emp.full_name, emp.cpf, emp.phone, p.email,
       emp.is_active, emp.id, emp.created_at, emp.updated_at
from public.employees emp
left join public.profiles p on p.id = emp.profile_id
where not exists (select 1 from public.entities e where e.legacy_employee_id = emp.id)
on conflict (id) do nothing;

insert into public.entity_roles(entity_id, role, is_active)
select e.id, 'employee', emp.is_active
from public.employees emp
join public.entities e on e.legacy_employee_id = emp.id
on conflict (entity_id, role) do update set is_active = excluded.is_active;

insert into public.entity_employee_details(entity_id, job_title, profile_id, role_id, uniq_subscriber_id)
select e.id, emp.function_name, emp.profile_id, emp.role_id, emp.uniq_subscriber_id
from public.employees emp
join public.entities e on e.legacy_employee_id = emp.id
on conflict (entity_id) do update set
  job_title = excluded.job_title,
  profile_id = excluded.profile_id,
  role_id = excluded.role_id,
  uniq_subscriber_id = excluded.uniq_subscriber_id;

insert into public.entity_addresses (
  id, entity_id, organization_id, type, zip_code, state, city, neighborhood, street,
  number, complement, reference, location_url, is_primary, is_active,
  legacy_customer_address_id, created_at, updated_at
)
select a.id, e.id, a.organization_id, 'Principal', a.zip_code, a.state, a.city, a.neighborhood,
       a.street, a.number, a.complement, a.reference, a.shared_map_url, a.is_default, true,
       a.id, a.created_at, a.updated_at
from public.customer_addresses a
join public.entities e on e.legacy_customer_id = a.customer_id
on conflict (id) do nothing;