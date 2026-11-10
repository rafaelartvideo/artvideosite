import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("prestadores são um módulo exclusivo da Union, sem vínculo de usuários ou cadastros das empresas", async () => {
  const editor = read("src/features/registrations/presentation/RegistrationEditor.tsx");
  const list = read("src/features/registrations/presentation/TabRegistrations.tsx");
  const dashboard = read("src/features/dashboard/presentation/TabDashboard.tsx");
  const routes = read("src/app/Admin.tsx");
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const providerScreen = read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");

  for (const file of [editor, list, dashboard]) {
    assert.doesNotMatch(file, /service_provider|ProviderServicesEditor|Prestadores de serviço/);
  }
  assert.match(routes, /tab === "serviceProviders"\) return isPlatformOperatorOrganization && !crmMode/);
  assert.match(sidebar, /tab === "serviceProviders"\) return isPlatformOperatorOrganization/);
  assert.match(providerScreen, /canManage = isUnion && hasPermission\("platform.providers.manage"\)/);
  const result = await transformWithEsbuild(providerScreen, "PlatformProvidersPage.tsx", {loader:"tsx"});
  assert.ok(result.code.length > 1000);
});

test("filtros paginados, cards, seleção alfabética com marcados no topo e novos serviços", () => {
  const ui = read("src/features/platform-providers/presentation/PlatformProvidersPage.tsx");
  const repository = read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  const migration = read("supabase/migrations/20261103152339_union_platform_provider_directory_search.sql");
  assert.match(ui, /grid gap-4 md:grid-cols-2 xl:grid-cols-3/);
  assert.match(ui, /selected.includes\(b.id\)/);
  assert.match(ui, /normalSort\(a.name, b.name\)/);
  // O cadastro em lote abre no modal; a selecao depende de onde ele foi aberto.
  // Nao exigir a forma textual do callback (inline x funcao assíncrona).
  assert.match(ui, /serviceModal && <AdminDialog open title="Novo serviço"/);
  assert.match(ui, /onCreateBatch=/);
  assert.match(ui, /addBatch\(items,\s*serviceModal\.selectNew\)/);
  assert.match(ui, /if\s*\(selectNew\)\s*setSelectedServiceIds/);
  assert.match(ui, /setSelectedServiceIds\(current => \[\.\.\.new Set\(\[\.\.\.current, \.\.\.added\.map\(item => item\.id\)\]\)\]\)/);
  assert.match(repository, /addPlatformServices/);
  const batchEditor = read("src/features/platform-providers/presentation/PlatformServiceBatchEditor.tsx");
  assert.match(batchEditor, /Adicionar outra subcategoria/);
  assert.match(batchEditor, /Adicionar outro serviço/);
  assert.match(ui, /<AdminSubsectionTabs value=\{section\}/);
  assert.match(ui, /onChange=\{setSection\}/);
  assert.match(repository, /list_platform_service_providers/);
  assert.match(migration, /p_service_id uuid/);
  assert.match(migration, /p_state text/);
  assert.match(migration, /p_city text/);
  assert.match(migration, /limit least\(/);
});

test("prestadores, serviços e anexos são isolados por permissão Union e RLS", () => {
  const sql = read("supabase/migrations/20261103152225_union_platform_service_provider_directory.sql");
  const repository = read("src/features/platform-providers/infrastructure/platform-providers.repository.ts");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /private\.has_organization_permission/);
  assert.match(sql, /platform_operator_organization_id/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /platform_provider_files_insert/);
  assert.match(sql, /public\.entity_roles add constraint entity_roles_role_check/);
  assert.match(repository, /createSignedUrl/);
  assert.match(repository, /file.size > 10 \* 1024 \* 1024/);
});

test("salvar cliente não insere vínculo de prestador removido da base dos parceiros", () => {
  const split = read("supabase/migrations/20261103152225_union_platform_service_provider_directory.sql");
  const fix = read("supabase/migrations/20261105212500_fix_registration_save_after_union_provider_split.sql");
  assert.match(split, /check \(role = any\(array\['customer','employee','supplier'\]/);
  assert.match(fix, /v_old_insert/);
  assert.match(fix, /v_definition := replace\(v_definition, v_old_insert, ''\)/);
  assert.match(fix, /where role_input not in \('customer','employee','supplier'\)/);
  assert.match(fix, /if not \(v_has_customer or v_has_employee or v_has_supplier\) then/);
});
