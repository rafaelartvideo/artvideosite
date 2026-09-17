begin;

alter table public.document_signatures
  drop constraint if exists document_signatures_validation_method_check;

alter table public.document_signatures
  add constraint document_signatures_validation_method_check
  check (validation_method in ('stored_employee_signature', 'email_otp', 'cpf_cnpj'));

alter table public.document_signatures
  drop constraint if exists document_signatures_signer_shape_check;

alter table public.document_signatures
  add constraint document_signatures_signer_shape_check
  check (
    (
      signer_type = 'employee'
      and employee_entity_id is not null
      and employee_signature_version is not null
      and validation_method = 'stored_employee_signature'
    )
    or
    (
      signer_type = 'external'
      and employee_entity_id is null
      and employee_signature_version is null
      and validation_method in ('email_otp', 'cpf_cnpj')
      and consent_accepted = true
    )
  );

commit;
