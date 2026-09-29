
do $block$
declare
  v_table text;
  v_drop_tables text[] := array[
    'brands',
    'checklist_profile_items',
    'checklist_profile_stages',
    'checklist_profiles',
    'employees',
    'equipment_brands',
    'equipment_checklist_items',
    'equipment_models',
    'equipment_type_technical_fields',
    'equipment_types',
    'general_services',
    'order_statuses',
    'os_situations',
    'products',
    'profiles',
    'service_categories',
    'service_order_checklist_events',
    'service_type_situations',
    'service_types',
    'services',
    'site_settings',
    'technical_fields'
  ];
begin
  foreach v_table in array v_drop_tables
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        v_table
      );
    end if;
  end loop;
end
$block$;
