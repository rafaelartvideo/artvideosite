-- Configuração por empresa: comprovante obrigatório antes de concluir uma OS.
-- Valor inicial: Artvideo ativa, demais empresas opcionais.
begin;
alter table public.organization_company_settings
  add column if not exists require_payment_proof_on_completion boolean not null default false;

update public.organization_company_settings settings
set require_payment_proof_on_completion = true
from public.organizations organization
where settings.organization_id = organization.id
  and organization.slug = 'artvideo'
  and organization.organization_type = 'parent';

CREATE OR REPLACE FUNCTION public.get_order_payment_proof_requirement_v1(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null
    or not private.can_access_shared_organization_resource(p_organization_id, 'orders', 'read')
    or not private.has_effective_organization_permission(p_organization_id, 'orders.complete') then
    raise exception 'Você não possui permissão para consultar a conclusão desta empresa.'
      using errcode = '42501';
  end if;

  return coalesce(
    (select settings.require_payment_proof_on_completion
     from public.organization_company_settings settings
     where settings.organization_id = p_organization_id),
    false
  );
end;
$function$;
revoke all on function public.get_order_payment_proof_requirement_v1(uuid) from public, anon;
grant execute on function public.get_order_payment_proof_requirement_v1(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.require_order_payment_proof_before_completion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(
    (select settings.require_payment_proof_on_completion
     from public.organization_company_settings settings
     where settings.organization_id = new.organization_id),
    false
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.service_order_situation_media attachment
    join public.attachment_types classification
      on classification.id = attachment.attachment_type_id
     and classification.organization_id = new.organization_id
    join public.media media_file
      on media_file.id = attachment.media_id
     and media_file.organization_id = new.organization_id
    where attachment.service_order_id = new.id
      and attachment.organization_id = new.organization_id
      and attachment.situation_id is null
      and lower(btrim(classification.name)) = 'comprovante de pagamento'
      and media_file.bucket_id = 'service-images'
      and nullif(media_file.storage_path, '') is not null
  ) then
    raise exception 'Anexe o comprovante de pagamento antes de concluir a OS.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;
revoke all on function private.require_order_payment_proof_before_completion_v1() from public, anon, authenticated;

drop trigger if exists service_orders_require_payment_proof on public.service_orders;
CREATE TRIGGER service_orders_require_payment_proof BEFORE UPDATE OF completed_at ON public.service_orders FOR EACH ROW WHEN (((old.completed_at IS NULL) AND (new.completed_at IS NOT NULL))) EXECUTE FUNCTION private.require_order_payment_proof_before_completion_v1();
commit;
