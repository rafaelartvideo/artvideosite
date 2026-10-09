-- Listagem paginada de contatos SAC Digital com busca por nome, telefone e documento.
-- Utiliza privilégios do usuário e políticas RLS das tabelas.
create index if not exists sac_digital_contacts_org_updated_page_idx
on public.sac_digital_contacts (organization_id, updated_at desc, id desc);

create or replace function public.list_sac_digital_contacts_page(
  p_organization_id uuid, p_search text default '', p_page integer default 1, p_page_size integer default 10
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_search text := btrim(coalesce(p_search,''));
  v_like text;
  v_digits text;
  v_page integer := greatest(coalesce(p_page,1),1);
  v_size integer := least(greatest(coalesce(p_page_size,10),5),100);
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Empresa não informada.' using errcode='22023';
  end if;
  v_like := '%' || v_search || '%';
  v_digits := regexp_replace(v_search,'[^0-9]','','g');

  select count(*) into v_total
  from public.sac_digital_contacts c
  left join public.customers customer
    on customer.id=c.customer_id and customer.organization_id=c.organization_id
  where c.organization_id=p_organization_id
    and (v_search='' or c.name ilike v_like or c.phone ilike v_like or c.external_contact_id ilike v_like
      or customer.full_name ilike v_like or customer.trade_name ilike v_like or customer.document ilike v_like or customer.cnpj ilike v_like
      or (v_digits<>'' and (
        regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||v_digits||'%'
        or regexp_replace(coalesce(customer.document,''),'[^0-9]','','g') like '%'||v_digits||'%'
        or regexp_replace(coalesce(customer.cnpj,''),'[^0-9]','','g') like '%'||v_digits||'%')));

  select coalesce(jsonb_agg(to_jsonb(item) order by item.updated_at desc,item.id desc),'[]'::jsonb)
    into v_items
  from (
    select c.id,c.external_contact_id,c.customer_id,c.name,c.phone,c.avatar_url,c.updated_at,
      customer.full_name as customer_name, customer.document as cpf,customer.cnpj
    from public.sac_digital_contacts c
    left join public.customers customer
      on customer.id=c.customer_id and customer.organization_id=c.organization_id
    where c.organization_id=p_organization_id
      and (v_search='' or c.name ilike v_like or c.phone ilike v_like or c.external_contact_id ilike v_like
        or customer.full_name ilike v_like or customer.trade_name ilike v_like or customer.document ilike v_like or customer.cnpj ilike v_like
        or (v_digits<>'' and (
          regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||v_digits||'%'
          or regexp_replace(coalesce(customer.document,''),'[^0-9]','','g') like '%'||v_digits||'%'
          or regexp_replace(coalesce(customer.cnpj,''),'[^0-9]','','g') like '%'||v_digits||'%')))
    order by c.updated_at desc,c.id desc
    limit v_size offset (v_page-1)*v_size
  ) item;

  return jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'page_size',v_size);
end;
$$;
revoke all on function public.list_sac_digital_contacts_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_sac_digital_contacts_page(uuid,text,integer,integer) to authenticated;
