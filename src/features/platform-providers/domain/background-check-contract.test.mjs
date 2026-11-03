import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read=(path)=>readFileSync(path,"utf8");

test("a seção de antecedentes não aparece na listagem nem no cadastro",async()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const editor=read("src/features/platform-providers/presentation/PlatformProviderEditor.tsx");
  assert.doesNotMatch(page,/ProviderCertificateLinks|ProviderBackgroundChecks|Antecedentes criminais/);
  assert.doesNotMatch(editor,/certidões criminais|Prestador ativo/);
  assert.ok((await transformWithEsbuild(editor,"PlatformProviderEditor.tsx",{loader:"tsx"})).code.length>300);
  assert.ok((await transformWithEsbuild(page,"PlatformProvidersPage.tsx",{loader:"tsx"})).code.length>300);
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
  assert.match(repository,/list_platform_service_providers_v3/);
  assert.match(migration,/person_type/);
  assert.match(migration,/complement/);
  assert.match(migration,/birth_date/);
  assert.match(migration,/security invoker/);
  const instagramSql=read("supabase/migrations/20261103162346_union_provider_instagram_profile.sql");
  assert.match(instagramSql,/add column if not exists instagram/);
  assert.match(instagramSql,/p_payload->>'instagram'/);
  assert.match(instagramSql,/list_platform_service_providers_v3/);
  assert.match(repository,/instagram: string/);
  assert.match(repository,/instagram: provider.instagram/);

  const birthDateIndex=editor.indexOf('label="Data de nascimento"');
  const emailIndex=editor.indexOf('label="E-mail de contato"',birthDateIndex);
  const genderIndex=editor.indexOf('<FGenderRadio',emailIndex);
  assert.ok(birthDateIndex > 0 && emailIndex > birthDateIndex && genderIndex > emailIndex,
    "email must follow birth date in the same grid row");
  assert.match(editor,/label="Instagram"/);
  assert.ok(editor.indexOf('label="Instagram"') > editor.indexOf('label="WhatsApp"'));
  assert.doesNotMatch(editor,/<Checkbox|Prestador ativo/);
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
