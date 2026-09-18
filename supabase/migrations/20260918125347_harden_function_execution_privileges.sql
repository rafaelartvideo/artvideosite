begin;

alter function public.set_employees_updated_at() set search_path = '';
alter function public.prevent_direct_service_order_resolution() set search_path = '';
alter function public.prevent_external_os_number_update() set search_path = '';
alter function private.block_business_record_delete() set search_path = '';
alter function public.normalize_visual_text(text) set search_path = '';
alter function private.normalize_visual_text_fields() set search_path = '';
alter function private.try_uuid(text) set search_path = '';

do $$
declare
  r record;
  v_authenticated_had_execute boolean;
  v_signature text;
begin
  for r in
    select
      p.oid,
      p.proname,
      p.prorettype,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.prosecdef
  loop
    v_signature := format(
      'public.%I(%s)',
      r.proname,
      r.args
    );
    v_authenticated_had_execute :=
      has_function_privilege('authenticated',r.oid,'EXECUTE');

    execute format('revoke execute on function %s from public',v_signature);
    execute format('revoke execute on function %s from anon',v_signature);

    if r.prorettype = 'trigger'::regtype
       or r.proname like '%_legacy_internal'
       or r.proname in (
         'create_customer_public',
         'find_customer_by_document',
         'submit_quote_request',
         'create_employee_record',
         'create_service_order'
       ) then
      execute format(
        'revoke execute on function %s from authenticated',
        v_signature
      );
    elsif r.proname = 'submit_public_quote_request' then
      execute format(
        'grant execute on function %s to anon, authenticated',
        v_signature
      );
    elsif v_authenticated_had_execute then
      execute format(
        'grant execute on function %s to authenticated',
        v_signature
      );
    end if;
  end loop;
end;
$$;

commit;
