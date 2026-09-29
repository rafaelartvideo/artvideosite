do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'equipment_types',
    'equipment_brands',
    'equipment_models',
    'technical_fields',
    'equipment_type_technical_fields',
    'order_statuses',
    'os_situations',
    'general_services',
    'service_types',
    'service_type_situations'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;
