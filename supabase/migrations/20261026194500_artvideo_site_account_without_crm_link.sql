-- Site account owns only site-origin purchases and quote requests.
-- Deliberately remove the old CRM entity link: an email match must never grant OS history.
alter table public.artvideo_customer_accounts
  alter column entity_id drop not null;
alter table public.artvideo_customer_accounts
  add column if not exists full_name text,
  add column if not exists phone text;
update public.artvideo_customer_accounts
set full_name=coalesce(nullif(btrim(full_name),''),e.name,'Cliente Artvideo'),
    phone=coalesce(phone,e.phone),
    entity_id=null
from public.entities e
where e.id=artvideo_customer_accounts.entity_id;
comment on table public.artvideo_customer_accounts is
  'Site-only login identity. No automatic association with CRM entities, OS or CPF.';

create or replace function public.artvideo_customer_activate_v1(
  p_full_name text default null,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_confirmed timestamptz;
  v_org uuid;
  v_name text;
  v_phone text;
  v_existing public.artvideo_customer_accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'Sessão não autenticada.' using errcode='42501';
  end if;
  select u.email_confirmed_at into v_confirmed
  from auth.users u where u.id=v_uid and nullif(btrim(u.email),'') is not null;
  if v_confirmed is null then
    return jsonb_build_object('status','verify_email');
  end if;
  v_org := public.artvideo_organization_id();
  if v_org is null then raise exception 'Loja indisponível.'; end if;

  select * into v_existing
  from public.artvideo_customer_accounts a where a.user_id=v_uid;
  if found then
    if v_existing.organization_id<>v_org then
      return jsonb_build_object('status','needs_review');
    end if;
    -- A client may update their own display name only by an authenticated RPC.
    if nullif(btrim(coalesce(p_full_name,'')),'') is not null then
      update public.artvideo_customer_accounts
      set full_name=left(btrim(p_full_name),120),
          phone=coalesce(nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''),phone),
          entity_id=null
      where user_id=v_uid and organization_id=v_org;
    elsif v_existing.entity_id is not null then
      update public.artvideo_customer_accounts set entity_id=null
      where user_id=v_uid and organization_id=v_org;
    end if;
    return jsonb_build_object('status','linked');
  end if;

  select left(btrim(coalesce(nullif(p_full_name,''),u.raw_user_meta_data->>'full_name','')),120)
  into v_name from auth.users u where u.id=v_uid;
  if length(v_name)<3 then return jsonb_build_object('status','needs_name'); end if;

  select nullif(regexp_replace(coalesce(p_phone,u.raw_user_meta_data->>'phone',''),'[^0-9]','','g'),'')
  into v_phone from auth.users u where u.id=v_uid;
  if v_phone is not null and length(v_phone) not between 10 and 13 then
    return jsonb_build_object('status','invalid_phone');
  end if;

  insert into public.artvideo_customer_accounts(user_id,organization_id,entity_id,full_name,phone)
  values(v_uid,v_org,null,v_name,v_phone)
  on conflict (user_id) do nothing;

  return jsonb_build_object('status','linked');
end $$;

create or replace function public.artvideo_customer_portal_v1()
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_email text;
  v_account public.artvideo_customer_accounts%rowtype;
  v_orders jsonb;
  v_quotes jsonb;
begin
  if v_uid is null then
    raise exception 'Sessão não autenticada.' using errcode='42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u
  where u.id=v_uid and u.email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('status','verify_email'); end if;
  v_org := public.artvideo_organization_id();
  select * into v_account
  from public.artvideo_customer_accounts a
  where a.user_id=v_uid and a.organization_id=v_org;
  if not found then return jsonb_build_object('status','unlinked'); end if;

  -- Website purchases only. Never read from service_orders, entities or CPF.
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
  into v_orders from (
    select o.id,coalesce(o.order_number::text,'') as number,o.status,o.created_at,
      case when (select count(*) from public.artvideo_store_order_items i
         where i.order_id=o.id and i.organization_id=o.organization_id)>1
       then 'Compra com '||(select count(*)::text from public.artvideo_store_order_items i
         where i.order_id=o.id and i.organization_id=o.organization_id)||' produtos'
       else coalesce(o.product_name,'Produto') end as product_name,
      (coalesce((select sum(coalesce(i.unit_price,0)*coalesce(i.quantity,1))
       from public.artvideo_store_order_items i
       where i.order_id=o.id and i.organization_id=o.organization_id),
       coalesce(o.unit_price,0)*coalesce(o.quantity,1)) + coalesce(o.shipping_price,0)) as total,
      coalesce(f.status,'') as delivery_status
    from public.artvideo_store_orders o
    left join public.artvideo_store_fulfillments f
      on f.order_id=o.id and f.organization_id=o.organization_id
    where o.organization_id=v_org
      and lower(btrim(o.buyer->>'buyer_email'))=v_email
    order by o.created_at desc limit 50
  ) t;

  -- Only public website quote requests, never CRM-created budgets or service orders.
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
  into v_quotes from (
    select q.id,q.protocol as number,
      coalesce(nullif(q.equipment_name,''),'Serviço solicitado') as description,
      coalesce(case when st.visible_to_customer then st.name end,'Em acompanhamento') as status,
      q.created_at
    from public.quote_requests q
    join public.customers c on c.id=q.customer_id and c.organization_id=q.organization_id
    left join public.order_statuses st
      on st.id=q.status_id and st.organization_id=q.organization_id
    where q.organization_id=v_org
      and q.origin='site'
      and q.archived_at is null
      and lower(btrim(c.email))=v_email
    order by q.created_at desc limit 50
  ) t;

  return jsonb_build_object('status','ready',
    'customer',jsonb_build_object('name',v_account.full_name,'email',v_email,'phone',v_account.phone),
    'orders',v_orders,'quotes',v_quotes);
end $$;

revoke all on function public.artvideo_customer_activate_v1(text,text) from public,anon;
revoke all on function public.artvideo_customer_portal_v1() from public,anon;
grant execute on function public.artvideo_customer_activate_v1(text,text) to authenticated;
grant execute on function public.artvideo_customer_portal_v1() to authenticated;
