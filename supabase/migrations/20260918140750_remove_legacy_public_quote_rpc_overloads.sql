begin;

revoke all on function public.submit_public_quote_request(
  text,text,text,text,text,text,text,text,text,text,date,uuid,uuid,text,text,text,text,text,text,text,text,text,date
) from public, anon, authenticated;

revoke all on function public.submit_public_quote_request(
  text,text,text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,text
) from public, anon, authenticated;

drop function if exists public.submit_public_quote_request(
  text,text,text,text,text,text,text,text,text,text,date,uuid,uuid,text,text,text,text,text,text,text,text,text,date
);

drop function if exists public.submit_public_quote_request(
  text,text,text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,text
);

commit;
