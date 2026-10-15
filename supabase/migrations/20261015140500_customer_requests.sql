-- Pedidos Avulsos: lista interna de desejos; nao cria OS, reserva ou venda.
-- Usa o modulo comercial customers ja existente, mas permissões independentes.
begin;

insert into public.permissions(key,label,description,module_name,sort_order) values
  ('customers.requests.view','Visualizar pedidos avulsos','Consultar a lista de desejos dos clientes.','Pedidos Avulsos',3250),
  ('customers.requests.create','Criar pedidos avulsos','Registrar o produto ou servico solicitado.','Pedidos Avulsos',3251),
  ('customers.requests.update','Alterar situacao de pedidos','Marcar pedidos como pendentes, atendidos ou cancelados.','Pedidos Avulsos',3252)
on conflict(key) do update set
  label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Preserva o trabalho dos cargos que ja operam cadastros de clientes.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,extra.id
from public.role_permissions rp
join public.permissions original on original.id=rp.permission_id
join public.roles role_row on role_row.id=rp.role_id and role_row.is_active
join public.permissions extra on (
   (original.key='customers.view' and extra.key='customers.requests.view')
   or (original.key='customers.create' and extra.key='customers.requests.create')
   or (original.key='customers.edit' and extra.key='customers.requests.update')
)
where private.permission_belongs_to_organization(role_row.organization_id,extra.key)
on conflict(role_id,permission_id) do nothing;

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  request_kind text not null check(request_kind in ('product','service')),
  description text not null check(length(btrim(description)) between 3 and 1000),
  status text not null default 'pending' check(status in ('pending','fulfilled','cancelled')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_requests_org_date_idx on public.customer_requests(organization_id,created_at desc);
create index if not exists customer_requests_org_status_idx on public.customer_requests(organization_id,status,request_kind,created_at desc);
create index if not exists customer_requests_customer_idx on public.customer_requests(organization_id,customer_id);

create or replace function private.customer_request_before_write()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.created_by := (select auth.uid());
  else
    if new.organization_id is distinct from old.organization_id
       or new.customer_id is distinct from old.customer_id
       or new.request_kind is distinct from old.request_kind
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Somente a situacao ou a descricao do pedido podem ser alteradas.' using errcode='42501';
    end if;
  end if;
  if not exists (
    select 1 from public.customers c
    where c.id=new.customer_id and c.organization_id=new.organization_id
  ) then
    raise exception 'O cliente deve pertencer a empresa ativa.' using errcode='23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customer_request_before_write on public.customer_requests;
create trigger customer_request_before_write
before insert or update on public.customer_requests
for each row execute function private.customer_request_before_write();

alter table public.customer_requests enable row level security;

drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests
for select to authenticated
using (
  (select auth.uid()) is not null
  and private.has_effective_organization_permission(organization_id,'customers.requests.view')
);

drop policy if exists customer_requests_insert on public.customer_requests;
create policy customer_requests_insert on public.customer_requests
for insert to authenticated
with check (
  (select auth.uid()) is not null
  and created_by=(select auth.uid())
  and private.has_effective_organization_permission(organization_id,'customers.requests.create')
  and exists (select 1 from public.customers c where c.id=customer_id and c.organization_id=organization_id)
);

drop policy if exists customer_requests_update on public.customer_requests;
create policy customer_requests_update on public.customer_requests
for update to authenticated
using (
  (select auth.uid()) is not null
  and private.has_effective_organization_permission(organization_id,'customers.requests.update')
)
with check (
  (select auth.uid()) is not null
  and private.has_effective_organization_permission(organization_id,'customers.requests.update')
);

revoke all on public.customer_requests from public,anon;
grant select,insert,update on public.customer_requests to authenticated;
-- Nenhuma politica de DELETE: cancelamentos preservam historico.

commit;
