-- Protocolo público curto, sequencial e único; não expõe a sequência diretamente.
-- Também aplicado no projeto conectado em 22/10/2026.
begin;
create sequence if not exists public.artvideo_quote_protocol_seq as bigint minvalue 1 start with 1;
revoke all on sequence public.artvideo_quote_protocol_seq from public, anon, authenticated;
select setval('public.artvideo_quote_protocol_seq'::regclass,
 greatest((select last_value from public.artvideo_quote_protocol_seq),
 coalesce((select max(substring(protocol from '^ORC-([0-9]{6,})$')::bigint)
 from public.quote_requests
 where organization_id='00000000-0000-4000-8000-000000000001'::uuid
 and protocol ~ '^ORC-[0-9]{6,}$'),0),1),true);
create or replace function public.artvideo_next_quote_protocol_v1()
returns text
language sql volatile security definer set search_path=''
as $$
 select 'ORC-' || lpad(nextval('public.artvideo_quote_protocol_seq'::regclass)::text,6,'0');
$$;
revoke all on function public.artvideo_next_quote_protocol_v1() from public;
grant execute on function public.artvideo_next_quote_protocol_v1() to anon, authenticated, service_role;
commit;
