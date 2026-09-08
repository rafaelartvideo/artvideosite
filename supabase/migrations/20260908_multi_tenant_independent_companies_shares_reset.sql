-- Compartilhamentos criados antes da correção do modelo podem refletir a lógica
-- antiga de controladora/empresa-filha. Eles não podem ser considerados consentimento
-- explícito entre empresas independentes.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_independent_companies_shares_reset', 0)
);

lock table public.organization_data_shares in access exclusive mode;

update public.organization_data_shares
set access_level = 'none',
    updated_at = now()
where access_level <> 'none';

comment on table public.organization_data_shares is
  'Compartilhamentos explícitos entre empresas independentes. Registros anteriores à correção de hierarquia foram revogados e precisam ser concedidos novamente pela empresa proprietária.';

commit;
