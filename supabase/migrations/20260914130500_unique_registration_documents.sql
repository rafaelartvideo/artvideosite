begin;

create unique index if not exists entities_organization_document_unique_idx
  on public.entities (organization_id, document)
  where document is not null and btrim(document) <> '';

comment on index public.entities_organization_document_unique_idx is
  'Impede CPF/CNPJ duplicado dentro da mesma empresa; múltiplos vínculos devem usar o mesmo cadastro.';

commit;
