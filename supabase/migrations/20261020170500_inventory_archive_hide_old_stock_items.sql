-- Esconde somente itens arquivados da consulta paginada; preserva saldos
-- e dependências históricas em ordens de serviço, pedidos e movimentações.
begin;
alter table public.inventory_items add column if not exists archived_at timestamptz;

do $block$
declare
  v_source text;
  v_args text;
  v_needle text := 'and item.organization_id = p_organization_id';
begin
  select p.prosrc, pg_get_function_arguments(p.oid) into v_source, v_args
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname='search_inventory_item_page_ids_v2'
    and pg_get_function_identity_arguments(p.oid) =
      'p_organization_id uuid, p_page integer, p_page_size integer, p_name_search text, p_sku_search text, p_address_search text, p_sort text'
  limit 1;
  if v_source is null then
    raise exception 'A rotina de paginação de estoque não foi encontrada';
  end if;
  if position('and item.archived_at is null' in v_source) = 0 then
    if position(v_needle in v_source) = 0 then
      raise exception 'Estrutura da rotina de estoque mudou; edição automática abortada';
    end if;
    v_source := replace(v_source, v_needle, v_needle || E'\n      and item.archived_at is null');
    execute 'create or replace function public.search_inventory_item_page_ids_v2(' ||
      v_args || ') returns table(id uuid,total_count bigint) ' ||
      'language sql stable security definer set search_path = '''' as ' ||
      quote_literal(v_source);
  end if;
end
$block$;
commit;
