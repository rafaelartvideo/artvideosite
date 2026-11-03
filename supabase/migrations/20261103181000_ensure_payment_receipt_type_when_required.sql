-- Ao ativar a exigência, garante que a empresa tenha o tipo de anexo ativo.
-- Isso também atende empresas criadas após a migração inicial.
begin;

create or replace function private.ensure_payment_proof_attachment_type_v1()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.require_payment_proof_on_completion then
    insert into public.attachment_types (organization_id, name, is_active)
    select new.organization_id, 'Comprovante de pagamento', true
    where not exists (
      select 1 from public.attachment_types item
      where item.organization_id = new.organization_id
        and lower(btrim(item.name)) = 'comprovante de pagamento'
    )
    on conflict do nothing;

    update public.attachment_types item
    set is_active = true
    where item.organization_id = new.organization_id
      and lower(btrim(item.name)) = 'comprovante de pagamento'
      and item.is_active is not true;
  end if;
  return new;
end;
$function$;

revoke all on function private.ensure_payment_proof_attachment_type_v1() from public, anon, authenticated;

drop trigger if exists organization_company_settings_ensure_payment_proof_type
on public.organization_company_settings;

create trigger organization_company_settings_ensure_payment_proof_type
after insert or update of require_payment_proof_on_completion
on public.organization_company_settings
for each row
when (new.require_payment_proof_on_completion is true)
execute function private.ensure_payment_proof_attachment_type_v1();

commit;
