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


test("agenda semanal de acesso permite vários intervalos sem sobreposição e separa expediente técnico", async () => {
  const domain = read("src/features/registrations/domain/employee-access-hours.ts");
  const repo = read("src/features/registrations/infrastructure/employee-access-hours.repository.ts");
  const modal = read("src/features/registrations/presentation/EmployeeAccessHoursDialog.tsx");
  const editor = read("src/features/registrations/presentation/RegistrationEditor.tsx");
  const details = read("src/features/registrations/presentation/RegistrationDetails.tsx");
  const registrations = read("src/features/registrations/presentation/TabRegistrations.tsx");
  const auth = read("src/lib/auth.tsx");
  const app = read("src/app/App.tsx");
  const sql = read("supabase/migrations/20261110210000_employee_crm_access_hours.sql");
  for (const [path, source] of [
    ["EmployeeAccessHoursDialog.tsx", modal], ["RegistrationEditor.tsx", editor],
    ["RegistrationDetails.tsx", details], ["TabRegistrations.tsx", registrations], ["auth.tsx", auth], ["App.tsx", app],
  ]) assert.ok((await transformWithEsbuild(source, path, { loader: "tsx" })).code.length > 100, path);
  assert.ok((await transformWithEsbuild(repo, "employee-access-hours.repository.ts", { loader: "ts" })).code.length > 100);
  const transformed = await transformWithEsbuild(domain, "employee-access-hours.ts", { loader: "ts" });
  const logic = await import("data:text/javascript;base64," + Buffer.from(transformed.code).toString("base64"));
  const empty = logic.emptyEmployeeAccessHours();
  assert.equal(empty.enabled, false, "escalas não configuradas não bloqueiam funcionários atuais");
  assert.equal(empty.days.length, 7);
  const monday = empty.days.find(d => d.weekday === 1);
  monday.intervals = [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "18:00" }];
  assert.equal(logic.validateEmployeeAccessHours(empty), null);
  monday.intervals.push({ start: "11:00", end: "14:00" });
  assert.match(logic.validateEmployeeAccessHours(empty), /sobrepostos/);
  monday.intervals.pop();
  monday.intervals[0].end = "08:00";
  assert.match(logic.validateEmployeeAccessHours(empty), /início/);
  assert.equal(logic.nextFreeAccessInterval([{ start: "08:00", end: "12:00" }]).start, "13:00");
  assert.doesNotMatch(editor, /onOpenHours|<CalendarClock size=\{16\}\/> Horários/);
  assert.match(details, /title="Acesso e Permissões"/);
  assert.match(details, /Horários de acesso/);
  assert.match(registrations, /Preparando cadastro/);
  assert.match(modal, /Agenda semanal/);
  assert.match(modal, /Copiar horários de outro funcionário/);
  assert.match(modal, /variant="secondary" disabled=\{busy\} onClick=\{onClose\}>Voltar/);
  assert.match(registrations, /stagedAccessHours/);
  assert.match(registrations, /saveEmployeeAccessHours/);
  assert.match(auth, /checkMyEmployeeAccessWindow/);
  assert.match(app, /Fora do horário de acesso/);
  for (const token of [
    "employee_crm_access_hours", "validate_employee_crm_access_days",
    "private.employee_crm_access_now", "private.has_effective_organization_permission",
    "private.has_organization_permission", "get_employee_crm_access_hours_v1",
    "save_employee_crm_access_hours_v1", "check_my_employee_crm_access_hours_v1",
    "list_employee_crm_access_sources_v1", "enable row level security",
  ]) assert.ok(sql.includes(token), token);
});

test("agenda de acesso usa a entidade de cadastro unificado, inclusive funcionários sem registro legado", () => {
  const repo=read("src/features/registrations/infrastructure/employee-access-hours.repository.ts");
  const modal=read("src/features/registrations/presentation/EmployeeAccessHoursDialog.tsx");
  const form=read("src/features/registrations/presentation/TabRegistrations.tsx");
  const sql=read("supabase/migrations/20261110213000_employee_crm_hours_unified_entities.sql");
  assert.match(sql,/entity_crm_access_hours|employee_crm_access_hours/);
  assert.match(sql,/entity_id/);
  assert.match(sql,/entity_employee_details/);
  assert.match(sql,/private\.employee_crm_access_now/);
  assert.match(sql,/get_employee_crm_access_hours_v2/);
  assert.match(sql,/save_employee_crm_access_hours_v2/);
  assert.match(sql,/check_my_employee_crm_access_hours_v2/);
  assert.match(repo,/get_employee_crm_access_hours_v2/);
  assert.match(repo,/save_employee_crm_access_hours_v2/);
  assert.match(repo,/p_entity_id: entityId/);
  assert.match(modal,/entityId/);
  assert.match(form,/saveEmployeeAccessHours\(activeOrganizationId, savedId, stagedAccessHours\)/);
  assert.match(form,/entityId=\{routeRegistration\.id\}/);
});
