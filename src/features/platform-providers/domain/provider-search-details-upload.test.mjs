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
  assert.match(panel,/hidden grid-cols-2 gap-3 md:grid xl:grid-cols-3/);
  assert.match(panel,/field\(mobileField\)/);
  assert.match(panel,/label="Nome"/);
  assert.match(panel,/placeholder="Nome"/);
  assert.match(panel,/label="Equipamento"/);
  assert.match(panel,/Todos os equipamentos/);
  for(const value of ["equipment","services","states","cities","statuses"]){
    assert.ok(panel.includes('case "'+value+'"'),value);
  }
  assert.match(repository,/list_platform_service_providers_v5/);
  assert.match(repository,/p_service_ids: filters.serviceIds/);
  assert.match(repository,/p_equipment_names: filters.equipmentNames/);
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
  assert.match(page,/grid min-h-\[70px\] grid-cols-3 auto-rows-\[32px\]/);
  assert.match(page,/service_names\.slice\(0, provider\.service_names\.length > 6 \? 5 : 6\)/);
  assert.match(page,/service_names\.length - 5/);
  assert.match(page,/h-\[304px\]/);
  assert.match(page,/mt-auto flex items-center justify-between gap-2 border-t border-border pt-4/);
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

test("catalogo separa equipamentos e profissoes avulsas sem perder vinculos anteriores",async()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const editor=read("src/features/platform-providers/presentation/PlatformProviderEditor.tsx");
  const repository=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  const migration=read("supabase/migrations/20261103212128_union_provider_service_equipment_hierarchy.sql");
  assert.match(page,/Buscar equipamento ou serviço/);
  assert.match(page,/aria-expanded=\{isOpen\}/);
  assert.match(page,/Serviços avulsos \/ Profissões/);
  assert.match(page,/catalogGroups\.map/);
  const batch=read("src/features/platform-providers/presentation/PlatformServiceBatchEditor.tsx");
  assert.match(editor,/batchContent/);
  assert.match(page,/<PlatformServiceBatchEditor/);
  assert.match(batch,/equipmentName/);
  assert.match(batch,/xl:grid-cols-3/);
  assert.match(batch,/Adicionar outra subcategoria/);
  assert.match(batch,/Adicionar outro serviço/);
  assert.match(repository,/equipment_name: equipment \|\| null/);
  assert.match(repository,/\.select\("id,organization_id,name,is_active,equipment_name"\)/);
  assert.match(migration,/add column if not exists equipment_name/);
  assert.match(migration,/platform_provider_services_unique_equipment_name/);
  assert.match(migration,/or p\.name ilike/);
  assert.doesNotMatch(migration,/or p\.city ilike/);
  assert.ok((await transformWithEsbuild(page,"PlatformProvidersPage.tsx",{loader:"tsx"})).code.length>500);
  assert.ok((await transformWithEsbuild(editor,"PlatformProviderEditor.tsx",{loader:"tsx"})).code.length>500);
  assert.ok((await transformWithEsbuild(batch,"PlatformServiceBatchEditor.tsx",{loader:"tsx"})).code.length>500);
});

test("catalogo permite excluir com confirmacao e bloqueia exclusao vinculada, mantem RLS e valida filtro por equipamento",async()=>{
  const page=read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const repository=read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  const sql=read("supabase/migrations/20261103214943_union_provider_equipment_multiselect_filter_v5.sql");
  assert.match(page,/deleteTarget && <AdminDialog open title="Excluir serviço"/);
  assert.match(page,/confirmDeleteService/);
  assert.match(page,/variant="danger"/);
  assert.match(page,/ariaLabel=\{"Excluir " \+ service.name\}/);
  assert.match(page,/ariaLabel=\{\(service.is_active \? "Desativar " : "Ativar "\)/);
  assert.match(page,/expandedCatalog/);
  assert.match(page,/provider.gender === "F"/);
  assert.match(page,/FemaleProviderIcon/);
  assert.match(repository,/deletePlatformService/);
  assert.match(repository,/platform_provider_service_links/);
  assert.match(repository,/addPlatformServices/);
  assert.match(repository,/\.insert\(normalized\)/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/p_equipment_names/);
  assert.match(sql,/es\.equipment_name=any\(p_equipment_names\)/);
  assert.ok((await transformWithEsbuild(page,"PlatformProvidersPage.tsx",{loader:"tsx"})).code.length>500);
});

test("prestador pode ser excluido pelo card com modal simples de confirmacao azul", async () => {
  const page = read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const repository = read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  assert.match(page, /ariaLabel=\{"Excluir "\+provider\.name\}/);
  assert.match(page, /onClick=\{event=>\{event\.stopPropagation\(\);setProviderDeleteTarget\(provider\);\}\}/);
  assert.match(page, /title="Excluir prestador"/);
  assert.match(page, /variant="secondary" disabled=\{deletingProvider\}/);
  assert.match(page, /variant="primary" loading=\{deletingProvider\}/);
  assert.match(page, /Confirmar exclusão/);
  assert.match(page, /confirmDeleteProvider/);
  assert.match(repository, /export async function deletePlatformProvider/);
  assert.match(repository, /\.delete\(\)\.eq\("organization_id", orgId\)\.eq\("id", providerId\)/);
  assert.match(repository, /platform_provider_attachments/);
  assert.match(repository, /PLATFORM_PROVIDER_BUCKET/);
  assert.match(repository, /orphanedFiles/);
  assert.ok((await transformWithEsbuild(page, "PlatformProvidersPage.tsx", {loader:"tsx"})).code.length > 500);
});
