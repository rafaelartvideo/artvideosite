
create or replace function public.search_financial_counterparties_v1(
  p_organization_id uuid,
  p_entry_type text,
  p_search text default '',
  p_selected_id uuid default null,
  p_limit integer default 25
)
returns table(id uuid, name text, document text, roles text[])
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_type text := lower(btrim(coalesce(p_entry_type, '')));
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_digits text := regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if v_type not in ('receivable','payable') then
    raise exception 'Tipo de lançamento financeiro inválido.' using errcode = '22023';
  end if;

  if v_type = 'receivable' then
    if not (
      private.can_access_finance(p_organization_id, 'finance.receivables.view')
      or private.can_access_finance(p_organization_id, 'finance.receivables.create')
      or private.can_access_finance(p_organization_id, 'finance.receivables.edit')
    ) then
      raise exception 'Sem permissão para consultar contrapartes financeiras.' using errcode = '42501';
    end if;
  else
    if not (
      private.can_access_finance(p_organization_id, 'finance.payables.view')
      or private.can_access_finance(p_organization_id, 'finance.payables.create')
      or private.can_access_finance(p_organization_id, 'finance.payables.edit')
    ) then
      raise exception 'Sem permissão para consultar contrapartes financeiras.' using errcode = '42501';
    end if;
  end if;

  return query
  with candidates as (
    select
      entity.id,
      coalesce(
        nullif(btrim(entity.trade_name), ''),
        nullif(btrim(entity.name), ''),
        nullif(btrim(entity.legal_name), ''),
        'Cadastro'
      ) as display_name,
      nullif(btrim(entity.document), '') as display_document,
      coalesce(
        array_agg(entity_role.role order by entity_role.role)
          filter (where entity_role.is_active = true),
        array[]::text[]
      ) as active_roles
    from public.entities entity
    left join public.entity_roles entity_role
      on entity_role.entity_id = entity.id
    where entity.organization_id = p_organization_id
      and entity.is_active = true
      and (
        entity.id = p_selected_id
        or v_search = ''
        or lower(coalesce(entity.name, '')) like '%' || v_search || '%'
        or lower(coalesce(entity.trade_name, '')) like '%' || v_search || '%'
        or lower(coalesce(entity.legal_name, '')) like '%' || v_search || '%'
        or lower(coalesce(entity.document, '')) like '%' || v_search || '%'
        or (
          v_digits <> ''
          and regexp_replace(coalesce(entity.document, ''), '[^0-9]', '', 'g')
              like '%' || v_digits || '%'
        )
      )
    group by entity.id, entity.trade_name, entity.name, entity.legal_name, entity.document
  )
  select
    candidate.id,
    candidate.display_name as name,
    candidate.display_document as document,
    candidate.active_roles as roles
  from candidates candidate
  order by
    case when candidate.id = p_selected_id then 0 else 1 end,
    case
      when v_type = 'payable' and 'supplier' = any(candidate.active_roles) then 0
      when v_type = 'receivable' and 'customer' = any(candidate.active_roles) then 0
      else 1
    end,
    candidate.display_name,
    candidate.id
  limit v_limit;
end;
$function$;

revoke all on function public.search_financial_counterparties_v1(
  uuid, text, text, uuid, integer
) from public, anon;

grant execute on function public.search_financial_counterparties_v1(
  uuid, text, text, uuid, integer
) to authenticated;
