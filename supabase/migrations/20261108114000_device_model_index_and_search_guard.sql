begin;
-- Indexes adicionais para as FKs que não são cobertas pelos índices compostos por empresa.
create index if not exists product_device_compatible_models_product_fk_idx
 on public.product_device_compatible_models(product_id);
create index if not exists product_device_compatible_models_creator_idx
 on public.product_device_compatible_models(created_by) where created_by is not null;
create index if not exists product_device_compatible_settings_updater_idx
 on public.product_device_compatible_settings(updated_by) where updated_by is not null;

-- Evita buscas somente por pontuação coincidirem com todos os modelos normalizados.
create or replace function private.product_device_model_search_match_v1(
 p_organization_id uuid,p_product_id uuid,p_search text
) returns boolean language sql stable security definer set search_path='' as $function$
 select exists (
 select 1 from private.effective_device_compatible_models_v1(p_organization_id,array[p_product_id]) m
 where m.model ilike '%'||btrim(coalesce(p_search,''))||'%'
    or (m.brand||' '||m.model) ilike '%'||btrim(coalesce(p_search,''))||'%'
    or (m.device_type||' '||m.brand||' '||m.model) ilike '%'||btrim(coalesce(p_search,''))||'%'
    or (regexp_replace(upper(btrim(coalesce(p_search,''))),'[^A-Z0-9]+','','g') <> ''
      and regexp_replace(upper(m.model),'[^A-Z0-9]+','','g')
       like '%'||regexp_replace(upper(btrim(coalesce(p_search,''))),'[^A-Z0-9]+','','g')||'%')
 );
$function$;
revoke all on function private.product_device_model_search_match_v1(uuid,uuid,text) from public;
commit;
