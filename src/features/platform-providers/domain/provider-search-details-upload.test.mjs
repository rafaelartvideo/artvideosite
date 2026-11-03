import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read=(path)=>readFileSync(path,"utf8");

test("busca de prestadores segue multiseleção do CRM com seletor mobile acima do campo",async()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const panel=read("src/features/platform-providers/presentation/ProviderFiltersPanel.tsx");
  const repository=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  const sql=read("supabase/migrations/20261103164747_union_provider_multiselect_filters_v4.sql");
  assert.match(page,/<ProviderFiltersPanel/);
  assert.match(panel,/AdminFilterMultiSelect/);
  assert.match(panel,/AdminSearchPanel/);
  assert.match(panel,/DropdownMenuTrigger/);
  assert.match(panel,/md:hidden/);
  assert.match(panel,/hidden grid-cols-2 gap-3 md:grid xl:grid-cols-5/);
  assert.match(panel,/field\(mobileField\)/);
  for(const value of ["services","states","cities","statuses"]){
    assert.ok(panel.includes('case "'+value+'"'),value);
  }
  assert.match(repository,/list_platform_service_providers_v4/);
  assert.match(repository,/p_service_ids: filters.serviceIds/);
  assert.match(repository,/p_states: filters.states/);
  assert.match(repository,/p_cities: filters.cities/);
  assert.match(repository,/p_statuses: filters.statuses/);
  assert.match(sql,/cardinality\(coalesce\(p_service_ids/);
  assert.match(sql,/p.state\|\|':'\|\|p.city/);
  assert.ok((await transformWithEsbuild(panel,"ProviderFiltersPanel.tsx",{loader:"tsx"})).code.length>500);
});

test("card abre detalhes, somente lápis abre editor, 3 colunas e WhatsApp alinhado à direita",async()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const details=read("src/features/platform-providers/presentation/ProviderDetailsDialog.tsx");
  assert.match(page,/onClick=\{\(\) => setViewing\(provider\)\}/);
  assert.match(page,/onClick=\{event=>\{event.stopPropagation\(\);openEdit\(provider\);\}\}/);
  assert.match(page,/role="button"/);
  assert.match(page,/variant="tertiary"/);
  assert.match(page,/WhatsAppBrandIcon/);
  assert.match(page,/className="ml-auto inline-flex h-9 w-9/);
  assert.match(page,/<Phone size=\{14\}/);
  assert.match(page,/mt-4 grid grid-cols-3 gap-1\.5/);
  assert.match(page,/mt-4 flex items-center justify-between gap-2 border-t border-border pt-4/);
  assert.doesNotMatch(page,/>Detalhes<\/button>/);
  assert.match(page,/<ProviderDetailsDialog/);
  assert.match(details,/listProviderAttachments/);
  assert.match(details,/<AdminDialog open/);
  assert.match(details,/Dados pessoais/);
  assert.doesNotMatch(details,/onSave|savePlatformProvider/);
  for(const [file,source] of [["PlatformProvidersPage.tsx",page],["ProviderDetailsDialog.tsx",details]]){
    assert.ok((await transformWithEsbuild(source,file,{loader:"tsx"})).code.length>500);
  }
});

test("anexos: RLS vincula pasta pelo nome do arquivo no storage e arquivos falhos podem ser reenviados",()=>{
  const policy=read("supabase/migrations/20261103164652_fix_union_provider_attachment_storage_policy.sql");
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const repository=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  assert.match(policy,/storage\.foldername\(storage\.objects\.name\)/);
  assert.doesNotMatch(policy,/storage\.foldername\(provider\.name\)/);
  assert.match(policy,/platform\.providers\.manage/);
  assert.match(page,/const failedFiles: File\[\] = \[\]/);
  assert.match(page,/setPendingFiles\(failedFiles\)/);
  assert.match(page,/persistedProviderId \|\| editing\?\.id/);
  assert.match(page,/setPersistedProviderId\(savedId\)/);
  assert.match(repository,/\.upload\(path, file, \{ contentType: mime, upsert: false \}\)/);
});

test("terceiro estilo compartilhado é aplicado aos ícones Editar e botões Consultar",()=>{
  const shared=read("src/shared/ui/admin/AdminLayout.tsx");
  assert.match(shared,/tertiary: "admin-action-blue-outline border/);
  assert.match(shared,/editAction \? "tertiary" : variant/);
  assert.match(shared,/lookupAction \? "tertiary" : "secondary"/);
});
