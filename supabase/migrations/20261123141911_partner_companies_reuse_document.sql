-- As organizações da Union World são independentes mesmo quando compartilham
-- CPF de titular ou CNPJ. O documento não é um identificador de tenant.
-- Preservar o índice exclusivo de slug/ID e os controles RLS, permissões,
-- organizações reservadas e vínculos por organization_id.
begin;

drop index if exists public.organizations_document_unique_idx;

-- Mantém a busca administrativa por documento eficiente, sem impor unicidade.
create index if not exists organizations_document_lookup_idx
  on public.organizations (regexp_replace(document, '[^0-9]', '', 'g'))
  where document is not null
    and regexp_replace(document, '[^0-9]', '', 'g') <> '';

commit;
