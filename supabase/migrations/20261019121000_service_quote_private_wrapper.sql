begin;
revoke all on function private.submit_public_service_quote_v1(jsonb,jsonb,jsonb,text) from anon,authenticated;
create or replace function public.submit_public_service_quote_v1(p_form jsonb,p_address jsonb,p_selection jsonb,p_protocol text)
returns jsonb language sql security definer set search_path='' as $$
 select private.submit_public_service_quote_v1(p_form,p_address,p_selection,p_protocol);
$$;
revoke all on function public.submit_public_service_quote_v1(jsonb,jsonb,jsonb,text) from public;
grant execute on function public.submit_public_service_quote_v1(jsonb,jsonb,jsonb,text) to anon,authenticated;
commit;
