import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read=(path)=>readFileSync(path,"utf8");

test("consulta de antecedentes é manual no catálogo de prestadores, sem execução automática",async()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const links=read("src/features/platform-providers/presentation/ProviderCertificateLinks.tsx");
  const editor=read("src/features/platform-providers/presentation/PlatformProviderEditor.tsx");
  assert.match(page,/<ProviderCertificateLinks state=\{filters\.state\}/);
  assert.doesNotMatch(page,/ProviderBackgroundChecks/);
  assert.doesNotMatch(links,/supabase\.functions\.invoke|requestProviderBackgroundCheck/);
  assert.match(links,/gov\.br\/pf\/pt-br\/assuntos\/antecedentes-criminais/);
  assert.match(links,/certidoes\.trf5\.jus\.br/);
  assert.match(links,/tjse\.jus\.br/);
  assert.match(links,/declaracoes-e-formularios\/certidoes-criminais/);
  assert.match(editor,/certidões criminais emitidas nos portais oficiais/);
  for(const [name,source] of [["ProviderCertificateLinks.tsx",links],["PlatformProviderEditor.tsx",editor]]){
    assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code.length>300);
  }
});

test("novo prestador reaproveita CPF, CNPJ e CEP e usa seções do CRM",()=>{
  const editor=read("src/features/platform-providers/presentation/PlatformProviderEditor.tsx");
  const lookup=read("supabase/functions/lookup-cpf/index.ts");
  const repository=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  const migration=read("supabase/migrations/20261103155402_union_provider_crm_form_fields.sql");
  for(const label of ["Dados Pessoais","Endereço","Serviços Prestados","Anexos","Observações"]){
    assert.ok(editor.includes(label),label);
  }
  assert.match(editor,/from "@\/shared\/ui\/admin\/AdminLayout"/);
  assert.match(editor,/<AdminPage open/);
  assert.match(editor,/<AdminStickyToolbar/);
  assert.match(editor,/FCpfInput/);
  assert.match(editor,/FCnpjInput/);
  assert.match(editor,/lookupCpf\(draft\.document,organizationId,null,\{checkExisting:false\}\)/);
  assert.match(lookup,/platform\.providers\.manage/);
  assert.match(editor,/<AddressFields/);
  assert.match(editor,/validateCustomerAddress/);
  assert.match(repository,/list_platform_service_providers_v2/);
  assert.match(migration,/person_type/);
  assert.match(migration,/complement/);
  assert.match(migration,/birth_date/);
  assert.match(migration,/security invoker/);
});

test("contador total fica no subtítulo e não no filtro",()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const repository=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  assert.match(page,/totalCountQuery\.data \?\? 0/);
  assert.match(page,/cadastrado\$\{totalCountQuery\.data === 1/);
  assert.match(page,/countPlatformProviders/);
  assert.doesNotMatch(page,/prestador\{total === 1/);
  assert.match(repository,/count:"exact"/);
});
