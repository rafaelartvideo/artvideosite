-- Diretório compartilhado de nomes de marcas. Não retorna IDs de marcas de outras
-- empresas, nem cria vínculos automáticos ou altera modelos existentes.
-- Parceiras veem todas as marcas oficiais ativas e publicadas.
-- A operadora Union pode consultar também marcas ainda não publicadas.
create or replace function public.load_equipment_brand_directory_v1(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_platform boolean;
begin
  v_platform := private.is_platform_organization(p_organization_id);

  if auth.uid() is null
     or not exists (
       select 1
       from public.organization_members member
       join public.organizations org on org.id=member.organization_id
       where member.organization_id=p_organization_id
         and member.user_id=auth.uid()
         and member.status='active' and org.status='active'
     )
     or (v_platform and not private.has_platform_permission('platform.catalog.view'))
     or (not v_platform and not private.can_manage_own_operation_config(
       p_organization_id, 'equipment', 'equipment.view'
     ))
  then
    raise exception 'Sem permissão para consultar as marcas do catálogo.' using errcode='42501';
  end if;

  return coalesce(
    (select jsonb_agg(brand.name order by brand.name)
     from public.catalog_brands brand
     where brand.is_active and (v_platform or brand.is_published)),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.load_equipment_brand_directory_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.load_equipment_brand_directory_v1(uuid)
  to authenticated;
