begin;

create or replace function public.can_document_signature_action(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_permission_key not in (
    'documents.print',
    'documents.signatures.view',
    'documents.signatures.send',
    'documents.signatures.resend',
    'documents.signatures.cancel',
    'documents.signatures.audit'
  ) then
    return false;
  end if;

  return private.has_effective_organization_permission(
    p_organization_id,
    p_permission_key
  );
end;
$$;

revoke all on function public.can_document_signature_action(uuid,text) from public, anon;
grant execute on function public.can_document_signature_action(uuid,text) to authenticated;

commit;
