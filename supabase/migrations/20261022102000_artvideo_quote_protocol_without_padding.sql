-- Novos protocolos públicos: ORC-1, ORC-2, ORC-3, sem zeros à esquerda.
-- A sequência existente não é reiniciada; protocolos já emitidos permanecem válidos.
begin;
create or replace function public.artvideo_next_quote_protocol_v1()
returns text
language sql volatile security definer set search_path=''
as $$
  select 'ORC-' || nextval('public.artvideo_quote_protocol_seq'::regclass)::text;
$$;
revoke all on function public.artvideo_next_quote_protocol_v1() from public;
grant execute on function public.artvideo_next_quote_protocol_v1() to anon, authenticated, service_role;
commit;
