-- Cadastros: filtros por autor e data sem tirar a paginacao do servidor.
CREATE OR REPLACE FUNCTION public.search_registration_page_v3(p_organization_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_name_search text DEFAULT ''::text, p_document_search text DEFAULT ''::text, p_role text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_sort text DEFAULT ''::text, p_employee_only boolean DEFAULT false, p_created_by uuid DEFAULT null, p_system_only boolean DEFAULT false, p_created_from timestamptz DEFAULT null, p_created_to timestamptz DEFAULT null)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      private.has_effective_organization_permission(
        p_organization_id,
        'customers.view'
      ) as can_view
  ),
  search_values as materialized (
    select
      lower(trim(coalesce(p_name_search, ''))) as name_needle,
      lower(trim(coalesce(p_document_search, ''))) as document_needle,
      regexp_replace(coalesce(p_document_search, ''), '[^0-9]', '', 'g') as document_digits
  ),
  filtered as materialized (
    select
      entity.id,
      entity.organization_id,
      entity.person_type,
      entity.name,
      entity.legal_name,
      entity.trade_name,
      entity.document,
      entity.phone,
      entity.whatsapp,
      entity.is_active,
      entity.legacy_employee_id,
      entity.registration_source,
      entity.created_at,
      entity.updated_at
    from public.entities entity
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.can_view
      and entity.organization_id = p_organization_id
      and (
        not p_employee_only
        or exists (
          select 1
          from public.entity_roles entity_role
          where entity_role.entity_id = entity.id
            and entity_role.role = 'employee'
            and entity_role.is_active
        )
      )
      and (
        coalesce(p_role, '') in ('', 'all')
        or exists (
          select 1
          from public.entity_roles entity_role
          where entity_role.entity_id = entity.id
            and entity_role.role = p_role
            and entity_role.is_active
        )
      )
      and (
        coalesce(p_status, 'all') = 'all'
        or (p_status = 'active' and entity.is_active)
        or (p_status = 'inactive' and not entity.is_active)
      )
      and (p_created_by is null or entity.created_by = p_created_by)
      and (not coalesce(p_system_only, false) or entity.created_by is null)
      and (p_created_from is null or entity.created_at >= p_created_from)
      and (p_created_to is null or entity.created_at < p_created_to)
      and (
        search.name_needle = ''
        or lower(coalesce(entity.name, '')) like '%' || search.name_needle || '%'
        or lower(coalesce(entity.legal_name, '')) like '%' || search.name_needle || '%'
        or lower(coalesce(entity.trade_name, '')) like '%' || search.name_needle || '%'
      )
      and (
        search.document_needle = ''
        or lower(coalesce(entity.document, '')) like '%' || search.document_needle || '%'
        or (
          search.document_digits <> ''
          and regexp_replace(coalesce(entity.document, ''), '[^0-9]', '', 'g')
              like '%' || search.document_digits || '%'
        )
      )
  ),
  paged as materialized (
    select filtered.*
    from filtered
    order by
      case when p_sort = 'name_desc' then filtered.name end desc nulls last,
      case when p_sort = 'newest' then filtered.created_at end desc,
      case when p_sort = 'oldest' then filtered.created_at end asc,
      case when coalesce(p_sort, '') in ('', 'name_asc') then filtered.name end asc nulls last,
      filtered.id
    limit greatest(1, p_page_size)
    offset ((greatest(1, p_page) - 1) * greatest(1, p_page_size))
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from filtered),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entity.id,
          'organization_id', entity.organization_id,
          'person_type', entity.person_type,
          'name', entity.name,
          'legal_name', entity.legal_name,
          'trade_name', entity.trade_name,
          'document', entity.document,
          'phone', entity.phone,
          'whatsapp', entity.whatsapp,
          'is_active', entity.is_active,
          'legacy_employee_id', entity.legacy_employee_id,
          'registration_source', entity.registration_source,
          'created_at', entity.created_at,
          'updated_at', entity.updated_at,
          'roles', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'role', role.role,
                'is_active', role.is_active
              )
              order by role.role
            )
            from public.entity_roles role
            where role.entity_id = entity.id
          ), '[]'::jsonb),
          'employee_details', coalesce((
            select jsonb_agg(
              jsonb_build_object('profile_id', details.profile_id)
            )
            from public.entity_employee_details details
            where details.entity_id = entity.id
          ), '[]'::jsonb),
          'legacy_employee', case
            when employee.id is null then null
            else jsonb_build_object(
              'id', employee.id,
              'profile_id', employee.profile_id,
              'is_active', employee.is_active,
              'field_tracking_prompt_on_login', employee.field_tracking_prompt_on_login
            )
          end
        )
        order by
          case when p_sort = 'name_desc' then entity.name end desc nulls last,
          case when p_sort = 'newest' then entity.created_at end desc,
          case when p_sort = 'oldest' then entity.created_at end asc,
          case when coalesce(p_sort, '') in ('', 'name_asc') then entity.name end asc nulls last,
          entity.id
      )
      from paged entity
      left join public.employees employee
        on employee.id = entity.legacy_employee_id
       and employee.organization_id = p_organization_id
    ), '[]'::jsonb)
  );
$function$;
-- Os filtros dependem do tenant e usam índices compostos, evitando buscas totais no cliente.
CREATE INDEX IF NOT EXISTS entities_org_created_at_idx ON public.entities (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entities_org_creator_created_idx ON public.entities (organization_id, created_by, created_at DESC) WHERE created_by IS NOT NULL;

-- Retorna apenas autores distintos da empresa, não todos os cadastros.
CREATE OR REPLACE FUNCTION public.list_registration_creators_v1(p_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $creators$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL
      OR NOT private.has_effective_organization_permission(p_organization_id, 'customers.view')
    THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', author.created_by,
        'name', COALESCE(NULLIF(trim(profile.full_name), ''), 'Usuário sem nome')
      ) ORDER BY COALESCE(NULLIF(trim(profile.full_name), ''), 'Usuário sem nome'), author.created_by)
      FROM (
        SELECT DISTINCT entity.created_by
        FROM public.entities entity
        WHERE entity.organization_id = p_organization_id
          AND entity.created_by IS NOT NULL
      ) author
      LEFT JOIN public.profiles profile ON profile.id = author.created_by
    ), '[]'::jsonb)
  END;
$creators$;

REVOKE ALL ON FUNCTION public.search_registration_page_v3(uuid,integer,integer,text,text,text,text,text,boolean,uuid,boolean,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_registration_page_v3(uuid,integer,integer,text,text,text,text,text,boolean,uuid,boolean,timestamptz,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.list_registration_creators_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_registration_creators_v1(uuid) TO authenticated;
