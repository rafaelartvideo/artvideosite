-- Vínculo explícito entre pedidos da loja e cadastro CRM. Nunca vincular por nome/e-mail.
begin;
create table if not exists public.artvideo_store_order_registration_links (
 order_id uuid primary key references public.artvideo_store_orders(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 entity_id uuid not null references public.entities(id) on delete cascade,
 linked_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists artvideo_store_order_registration_links_customer_idx
 on public.artvideo_store_order_registration_links(organization_id,entity_id,created_at desc);

create or replace function private.validate_store_order_registration_link()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select o.organization_id from public.artvideo_store_orders o where o.id=new.order_id) is distinct from new.organization_id
   or (select e.organization_id from public.entities e where e.id=new.entity_id) is distinct from new.organization_id
 then raise exception 'Pedido e cadastro devem pertencer à mesma empresa.' using errcode='23514';
 end if;
 return new;
end; $$;
revoke all on function private.validate_store_order_registration_link() from public,anon,authenticated;
drop trigger if exists validate_store_order_registration_link on public.artvideo_store_order_registration_links;
create trigger validate_store_order_registration_link before insert or update
 on public.artvideo_store_order_registration_links for each row
 execute function private.validate_store_order_registration_link();

alter table public.artvideo_store_order_registration_links enable row level security;
revoke all on public.artvideo_store_order_registration_links from anon;
grant select,insert,delete on public.artvideo_store_order_registration_links to authenticated;

create policy store_order_registration_read on public.artvideo_store_order_registration_links
 for select to authenticated using (
  private.has_effective_organization_permission(organization_id,'customers.view')
  and private.has_effective_organization_permission(organization_id,'site_settings.view')
 );
create policy store_order_registration_insert on public.artvideo_store_order_registration_links
 for insert to authenticated with check (
  linked_by=(select auth.uid())
  and private.has_effective_organization_permission(organization_id,'customers.edit')
  and private.has_effective_organization_permission(organization_id,'site_settings.update')
 );
create policy store_order_registration_delete on public.artvideo_store_order_registration_links
 for delete to authenticated using (
  private.has_effective_organization_permission(organization_id,'customers.edit')
  and private.has_effective_organization_permission(organization_id,'site_settings.update')
 );
comment on table public.artvideo_store_order_registration_links
 is 'Associações explícitas de pedidos da loja com cadastros CRM, validadas pela organização. Sem heurística por nome ou e-mail.';
commit;