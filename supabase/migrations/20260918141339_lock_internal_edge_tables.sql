begin;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'device_capture_events',
    'device_capture_sessions',
    'document_signature_otp_challenges',
    'kv_store_529bf66c',
    'uniq_call_legs',
    'uniq_webhook_events'
  ]
  loop
    if to_regclass(format('public.%I',v_table)) is null then
      continue;
    end if;

    execute format('revoke all on table public.%I from anon',v_table);
    execute format('revoke all on table public.%I from authenticated',v_table);
    execute format('drop policy if exists internal_server_only on public.%I',v_table);
    execute format(
      'create policy internal_server_only on public.%I for all to anon, authenticated using (false) with check (false)',
      v_table
    );
  end loop;
end;
$$;

commit;
