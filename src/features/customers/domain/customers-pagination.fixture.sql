-- Synthetic, disposable database ONLY. Run before the customer-page migration.
create role authenticated;
create role anon;
create table public.customers (
  id uuid primary key, organization_id uuid not null,
  full_name text, trade_name text, legal_name text, document text, cnpj text
);
create table public.customer_addresses (
  customer_id uuid not null, organization_id uuid not null, state text, city text
);
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
grant usage on schema public to authenticated;
grant select on public.customers, public.customer_addresses to authenticated;
-- Represents both owned and explicitly shared organizations; a third is hidden.
create policy fixture_customer_read on public.customers for select to authenticated
  using (organization_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'));
create policy fixture_address_read on public.customer_addresses for select to authenticated
  using (organization_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'));
insert into public.customers(id, organization_id, full_name)
select ('10000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001', 'Cliente ' || lpad(i::text, 4, '0')
from generate_series(1, 1205) i;
insert into public.customers values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',U&'\00A0\00C1CME_%\FEFF',null,null,'123.456.789-01','12.345.678/0001-09'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','ACME normal',null,null,null,null),
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','ZZZ','Empresa 2',null,null,null),
 ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','AAA','Empresa 10',null,null,null),
 ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','','','Legal fallback',null,null),
 ('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','Multi address',null,null,null,null),
 ('20000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002','Álvaro',null,null,null,null),
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Hidden tenant',null,null,null,null);
insert into public.customer_addresses values
 ('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002',' SE ','Aracaju'),
 ('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','BA',U&'\00A0S\00E3o: Jos\00E9\FEFF');
