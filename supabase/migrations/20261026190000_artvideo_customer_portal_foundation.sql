-- Portal do cliente Artvideo: identidade pública vinculada ao cadastro unificado do CRM.
-- Nenhum acesso administrativo e concedido aos clientes do site.
alter table public.entities
  add column if not exists registration_source text not null default 'crm';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='entities_registration_source_check') then
    alter table public.entities add constraint entities_registration_source_check
      check (registration_source in ('crm','site','import'));
  end if;
end $$;

create table if not exists public.artvideo_customer_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_id uuid not null unique references public.entities(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists artvideo_customer_accounts_entity_org_idx
  on public.artvideo_customer_accounts (organization_id,entity_id);
create index if not exists entities_artvideo_site_email_idx
  on public.entities (organization_id, lower(btrim(email))) where email is not null;
create index if not exists artvideo_store_orders_site_buyer_email_idx
  on public.artvideo_store_orders (organization_id, lower(btrim(buyer->>'email')));

alter table public.artvideo_customer_accounts enable row level security;
revoke all on public.artvideo_customer_accounts from public, anon, authenticated;
grant select on public.artvideo_customer_accounts to authenticated;
drop policy if exists artvideo_customer_accounts_self_select on public.artvideo_customer_accounts;
create policy artvideo_customer_accounts_self_select
  on public.artvideo_customer_accounts for select to authenticated
  using (user_id = (select auth.uid()) and organization_id = public.artvideo_organization_id());

-- Auth do site nao deve herdar por padrao o perfil administrativo FUNCIONARIO.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare default_role_id uuid;
begin
  if new.raw_user_meta_data ->> 'registration_origin' in ('marketplace_buyer', 'artvideo_customer') then
    return new;
  end if;
  select id into default_role_id from public.roles
   where name='FUNCIONARIO' and is_active=true limit 1;
  insert into public.profiles (id, full_name, email, role_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, default_role_id);
  return new;
end $$;

-- Vincula por e-mail efetivamente confirmado no Auth; CPF/telefone nunca bastam.
-- Empates, inativos e vinculos de outra conta vao para revisao humana.
create or replace function public.artvideo_customer_activate_v1(
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_meta jsonb;
  v_org uuid;
  v_entity uuid;
  v_customer uuid;
  v_count integer;
  v_name text;
  v_phone text;
begin
  if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
  select lower(btrim(u.email)), u.email_confirmed_at, u.raw_user_meta_data
  into v_email, v_confirmed, v_meta from auth.users u where u.id=v_uid;
  if v_email is null or v_confirmed is null then
    return jsonb_build_object('status','verify_email');
  end if;
  v_org := public.artvideo_organization_id();
  if v_org is null then raise exception 'Loja indisponivel.'; end if;

  select a.entity_id into v_entity from public.artvideo_customer_accounts a
  where a.user_id=v_uid and a.organization_id=v_org;
  if v_entity is not null then return jsonb_build_object('status','linked'); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':site:'||v_email, 0));
  select count(*), min(e.id) into v_count, v_entity
  from public.entities e
  where e.organization_id=v_org and lower(btrim(e.email))=v_email;
  if v_count > 1 then return jsonb_build_object('status','needs_review'); end if;

  if v_count = 1 then
    if not exists (
      select 1 from public.entities e
      join public.entity_roles r on r.entity_id=e.id
      where e.id=v_entity and e.organization_id=v_org and e.is_active
        and r.role='customer' and r.is_active
    ) then return jsonb_build_object('status','needs_review'); end if;
    if exists (select 1 from public.artvideo_customer_accounts a where a.entity_id=v_entity) then
      return jsonb_build_object('status','needs_review');
    end if;
  else
    v_name := left(btrim(coalesce(nullif(p_full_name,''),v_meta->>'full_name','')),120);
    if length(v_name)<3 then return jsonb_build_object('status','needs_name'); end if;
    v_phone := nullif(regexp_replace(coalesce(p_phone,v_meta->>'phone',''),'[^0-9]','','g'),'');
    if v_phone is not null and length(v_phone) not between 10 and 13 then
      return jsonb_build_object('status','invalid_phone');
    end if;
    v_customer := gen_random_uuid();
    -- O trigger customers_sync_registration gera entities + role customer.
    insert into public.customers(id,organization_id,customer_type,full_name,email,phone,whatsapp)
      values(v_customer,v_org,'PF',v_name,v_email,v_phone,v_phone);
    v_entity := v_customer;
    update public.entities set registration_source='site'
    where id=v_entity and organization_id=v_org;
  end if;

  insert into public.artvideo_customer_accounts(user_id,organization_id,entity_id)
    values(v_uid,v_org,v_entity);
  return jsonb_build_object('status','linked');
exception
  when unique_violation then
    return jsonb_build_object('status','needs_review');
end $$;

-- A saida e cuidadosamente limitada aos dados comerciais visiveis ao consumidor.
-- Nenhuma tabela interna de OS e exposta ao papel authenticated.
create or replace function public.artvideo_customer_portal_v1()
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_entity public.entities%rowtype;
  v_customer uuid;
  v_email text;
  v_orders jsonb;
  v_services jsonb;
  v_quotes jsonb;
begin
  if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
  select lower(btrim(u.email)) into v_email
  from auth.users u where u.id=v_uid and u.email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('status','verify_email'); end if;
  v_org := public.artvideo_organization_id();
  select e.* into v_entity
  from public.artvideo_customer_accounts a
  join public.entities e on e.id=a.entity_id and e.organization_id=a.organization_id
  where a.user_id=v_uid and a.organization_id=v_org and e.is_active;
  if not found then return jsonb_build_object('status','unlinked'); end if;
  v_customer := v_entity.legacy_customer_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_orders from (
    select o.id, coalesce(o.order_number::text,'') as number, o.status,
      o.created_at,
      coalesce(o.product_name,'Produto') as product_name,
      (coalesce(o.unit_price,0)*coalesce(o.quantity,1)+coalesce(o.shipping_price,0)) as total,
      coalesce(f.status,'') as delivery_status
    from public.artvideo_store_orders o
    left join public.artvideo_store_fulfillments f on f.order_id=o.id and f.organization_id=o.organization_id
    where o.organization_id=v_org and lower(btrim(o.buyer->>'email'))=v_email
    order by o.created_at desc limit 50
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_services from (
    select s.id, s.os_number as number,
      coalesce(nullif(btrim(concat_ws(' ',s.model,s.serial_number)),''),'Equipamento ou serviço') as equipment,
      case when st.visible_to_customer then st.name else 'Em acompanhamento' end as status,
      s.created_at
    from public.service_orders s
    left join public.order_statuses st on st.id=s.status_id and st.organization_id=s.organization_id
    where s.organization_id=v_org and s.customer_id=v_customer
    order by s.created_at desc limit 50
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_quotes from (
    select q.id, q.protocol as number,
      coalesce(nullif(q.equipment_name,''),'Serviço solicitado') as description,
      coalesce(case when st.visible_to_customer then st.name end,'Em acompanhamento') as status,
      q.created_at
    from public.quote_requests q
    left join public.order_statuses st on st.id=q.status_id and st.organization_id=q.organization_id
    where q.organization_id=v_org and q.customer_id=v_customer and q.archived_at is null
    order by q.created_at desc limit 50
  ) t;

  return jsonb_build_object('status','ready',
    'customer',jsonb_build_object('name',v_entity.name,'email',v_email,'phone',v_entity.phone),
    'orders',v_orders,'services',v_services,'quotes',v_quotes);
end $$;

revoke all on function public.artvideo_customer_activate_v1(text,text) from public,anon;
revoke all on function public.artvideo_customer_portal_v1() from public,anon;
grant execute on function public.artvideo_customer_activate_v1(text,text) to authenticated;
grant execute on function public.artvideo_customer_portal_v1() to authenticated;
