begin;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'site_settings',
    'services',
    'service_categories',
    'service_variants',
    'service_inclusions',
    'service_exclusions',
    'service_price_factors',
    'service_faqs',
    'service_sections',
    'products',
    'brands',
    'checklist_profiles',
    'checklist_profile_stages',
    'checklist_profile_items',
    'equipment_checklist_items',
    'equipment_types',
    'equipment_brands',
    'equipment_models',
    'technical_fields',
    'equipment_type_technical_fields',
    'order_statuses',
    'general_services',
    'service_types',
    'service_type_situations',
    'service_type_monitoring',
    'os_situations',
    'employees',
    'attachment_types',
    'print_templates'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = v_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

commit;
