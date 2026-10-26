-- Identificador humano e estável para pedidos, sem substituir o UUID ou o token privado.
begin;
alter table public.artvideo_store_orders add column if not exists order_number bigint;
create sequence if not exists public.artvideo_store_order_number_seq as bigint start with 1;
lock table public.artvideo_store_orders in share row exclusive mode;
with numbered as (
  select id, row_number() over(order by created_at,id) as number
  from public.artvideo_store_orders where order_number is null
)
update public.artvideo_store_orders o set order_number=n.number
from numbered n where o.id=n.id;
select setval('public.artvideo_store_order_number_seq'::regclass,
  greatest(coalesce((select max(order_number) from public.artvideo_store_orders),0),1),
  exists(select 1 from public.artvideo_store_orders));
alter table public.artvideo_store_orders alter column order_number
  set default nextval('public.artvideo_store_order_number_seq'::regclass);
alter table public.artvideo_store_orders alter column order_number set not null;
alter sequence public.artvideo_store_order_number_seq
  owned by public.artvideo_store_orders.order_number;
grant usage on sequence public.artvideo_store_order_number_seq to service_role;
create unique index if not exists artvideo_store_orders_organization_number_uidx
  on public.artvideo_store_orders(organization_id,order_number);

-- Mantém os e-mails posteriores consistentes com o CRM e o acompanhamento.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.artvideo_store_claim_email_v1(uuid)'::regprocedure)
    into v_definition;
  if position('upper(left(j.order_id::text,8))' in v_definition)=0 then
    raise exception 'Formato do identificador de e-mail mudou; revisar função antes da migração.';
  end if;
  execute replace(v_definition,'upper(left(j.order_id::text,8))',
    '''PED-'' || lpad(o.order_number::text,6,''0'')');
end;
$migration$;

-- Realtime nunca deve abrir leitura pública: as policies existentes seguem válidas.
do $migration$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public'
       and tablename='artvideo_store_orders') then
    alter publication supabase_realtime add table public.artvideo_store_orders;
  end if;
end;
$migration$;
commit;