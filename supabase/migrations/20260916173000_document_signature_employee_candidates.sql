begin;

create or replace function public.list_document_signature_employee_candidates(p_organization_id uuid)
returns table (
  entity_id uuid,
  employee_name text,
  signature_version integer
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_effective_organization_permission(p_organization_id, 'documents.signatures.send') then
    raise exception 'Sem permissão para enviar documentos para assinatura.' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    coalesce(nullif(btrim(e.name), ''), nullif(btrim(e.trade_name), ''), nullif(btrim(e.legal_name), ''), 'Funcionário')::text,
    es.version
  from public.entities e
  join public.entity_roles er
    on er.entity_id = e.id
   and er.role = 'employee'
   and er.is_active = true
  join public.employee_signatures es
    on es.organization_id = e.organization_id
   and es.entity_id = e.id
   and es.is_active = true
  where e.organization_id = p_organization_id
    and e.is_active = true
  order by 2, e.id;
end;
$$;

revoke all on function public.list_document_signature_employee_candidates(uuid) from public, anon;
grant execute on function public.list_document_signature_employee_candidates(uuid) to authenticated;

commit;
