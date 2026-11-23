import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=path=>readFileSync(path,"utf8");
const editor=read("src/features/partner-companies/presentation/PartnerCompanyEditorPage.tsx");
const repository=read("src/features/partner-companies/infrastructure/partner-companies.repository.ts");
const errorHandler=read("src/features/partner-companies/infrastructure/partner-companies.errors.ts");
const migration=read("supabase/migrations/20261123141911_partner_companies_reuse_document.sql");

test("Cadastro de empresas não recusa CPF existente em outra organização",async()=>{
  const transformed=await transformWithEsbuild(editor,"PartnerCompanyEditorPage.tsx",{loader:"tsx"});
  assert.ok(transformed.code.length>100);
  assert.doesNotMatch(editor,/findPartnerCompanyByDocument/);
  assert.match(editor,/lookupCpf\(requestedCpf, activeOrganizationId, null, \{ checkExisting: false \}\)/);
  assert.match(editor,/isValidCpf\(documentDigits\)/);
  assert.match(editor,/isValidCnpj\(documentDigits\)/);
  assert.doesNotMatch(editor,/CPF já cadastrado para/);
  assert.match(editor,/createPartnerCompany\(payload, canManageMonitoring \? monitoredTypes : \[\]\)/);
  assert.match(editor,/updatePartnerCompany\(company.id, payload\)/);
});

test("Cadastro não consulta documentos de outras organizações para impedir criação",()=>{
  assert.doesNotMatch(repository,/findPartnerCompanyByDocument/);
  assert.match(repository,/organization_type: "partner", parent_organization_id: null/);
  assert.match(repository,/create_partner_company_with_monitoring/);
  assert.match(errorHandler,/restrição antiga que impede reutilizar CPF\/CNPJ/);
});

test("Migração retira somente unicidade global do documento, mantendo índices de identificação",()=>{
  assert.match(migration,/drop index if exists public\.organizations_document_unique_idx/);
  assert.match(migration,/create index if not exists organizations_document_lookup_idx/);
  assert.doesNotMatch(migration,/drop index[^;]*organizations_slug_unique_idx/i);
  assert.doesNotMatch(migration,/alter table[^;]*disable row level security/i);
  assert.doesNotMatch(migration,/drop (?:table|policy|trigger)/i);
});
