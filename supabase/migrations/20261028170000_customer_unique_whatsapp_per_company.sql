-- Um WhatsApp por cliente em cada empresa, independentemente de +55, espacos e pontuacao.
-- Duplicatas historicas sao preservadas: somente novas atribuicoes sao bloqueadas.
create or replace function public.customer_whatsapp_canonical_v1(p_number text)
returns text language sql immutable parallel safe set search_path=''
as $$
  with digits as (select regexp_replace(coalesce(p_number,''),'[^0-9]','','g') as n)
  select case
    when n ~ '^55[1-9][0-9]{9,10}$' then n
    when n ~ '^[1-9][0-9]{9,10}$' then '55'||n
    else null
  end from digits;
$$;

create index if not exists customers_whatsapp_canonical_org_idx
on public.customers(organization_id, public.customer_whatsapp_canonical_v1(whatsapp))
where whatsapp is not null;

-- Consulta para feedback inline; somente funcionários autorizados da empresa
-- enxergam o nome do outro cadastro. Não retorna CPF, telefone completo ou e-mail.
create or replace function public.customer_whatsapp_duplicate_v1(
  p_organization_id uuid,
  p_whatsapp text,
  p_exclude_customer_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_number text := public.customer_whatsapp_canonical_v1(p_whatsapp);
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.my_organization_permissions(p_organization_id) p
    where p.permission_key in ('customers.create','customers.edit','customers.update')
  ) then
    raise exception 'Sem permissão para consultar clientes.' using errcode='42501';
  end if;
  if v_number is null then return null; end if;

  select c.id,coalesce(nullif(btrim(c.full_name),''),'Cadastro existente')
    into v_id,v_name
  from public.customers c
  where c.organization_id=p_organization_id
    and public.customer_whatsapp_canonical_v1(c.whatsapp)=v_number
    and (p_exclude_customer_id is null or c.id<>p_exclude_customer_id)
  order by c.created_at,c.id
  limit 1;
  if v_id is null then return null; end if;
  return jsonb_build_object('customer_id',v_id,'customer_name',v_name);
end $$;
revoke all on function public.customer_whatsapp_duplicate_v1(uuid,text,uuid) from public,anon;
grant execute on function public.customer_whatsapp_duplicate_v1(uuid,text,uuid) to authenticated;

-- Garante a unicidade mesmo quando um fluxo ignora o frontend, incluindo
-- save_registration, a loja e quaisquer chamadas diretas. O advisory lock
-- serializa duas gravações simultâneas para o mesmo numero e empresa.
create or replace function private.prevent_customer_whatsapp_duplicate_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_number text := public.customer_whatsapp_canonical_v1(new.whatsapp);
  v_name text;
begin
  if v_number is null then return new; end if;
  if tg_op='UPDATE'
     and new.organization_id=old.organization_id
     and v_number is not distinct from public.customer_whatsapp_canonical_v1(old.whatsapp) then
    return new; -- não bloquear edição de outros campos de duplicatas antigas
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text||':customer_whatsapp:'||v_number,0)
  );

  select coalesce(nullif(btrim(c.full_name),''),'Cadastro existente')
    into v_name
  from public.customers c
  where c.organization_id=new.organization_id
    and c.id<>new.id
    and public.customer_whatsapp_canonical_v1(c.whatsapp)=v_number
  order by c.created_at,c.id limit 1;

  if found then
    raise exception using
      errcode='23505',
      message=format('WhatsApp já cadastrado para %s. Abra o cadastro existente ou informe outro número.',v_name),
      constraint='customers_whatsapp_unique_per_organization';
  end if;
  return new;
end $$;

drop trigger if exists customers_prevent_duplicate_whatsapp on public.customers;
create trigger customers_prevent_duplicate_whatsapp
before insert or update of whatsapp,organization_id on public.customers
for each row execute function private.prevent_customer_whatsapp_duplicate_v1();
