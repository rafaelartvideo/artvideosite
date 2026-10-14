import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const taxonomy = await import("./permission-taxonomy.ts");

test("tabelas e suas colunas pertencem à Visualização; operações pertencem a Ações", () => {
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.details.view" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.section.images" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "agenda.create" }), "actions");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.table.customer" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.table.actions" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "equipment.technical_fields.column.actions" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "customers.table.actions" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "inventory.table.actions" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "roles.table.actions" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.table.view" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "technician_panel.data.customer" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "technician_panel.actions.photo" }), "actions");
});

test("toda permissão de coluna aparece em Visualização, com rótulo explícito", () => {
  for (const key of [
    "orders.table.actions", "orders.table.status",
    "customers.table.email", "quotes.table.customer", "documents.table.status",
    "equipment.table.models", "equipment.technical_fields.column.actions",
    "inventory.table.sale_price", "services.table.featured",
    "categories.table.sort_order", "roles.table.permissions",
  ]) {
    assert.equal(taxonomy.permissionPresentationKind({ key }), "visual", key);
  }
  assert.equal(taxonomy.permissionLabelForEditor({ key: "orders.table.actions", label: "Ações" }), "Coluna Ações");
  assert.equal(taxonomy.permissionLabelForEditor({ key: "orders.table.view", label: "Visualizar tabela de OS" }), "Visualizar tabela de OS");
  assert.equal(taxonomy.permissionLabelForEditor({ key: "orders.table.customer", label: "Cliente" }), "Coluna Cliente");
});

test("colunas de OS aparecem exclusivamente na seção Tabela dentro de Visualização", () => {
  const keys = [
    "orders.view", "orders.table.view", "orders.table.actions",
    "orders.table.customer", "orders.details.view", "orders.create", "orders.edit",
    "inventory.table.actions", "inventory.table.view",
  ];
  const groups = taxonomy.buildPermissionGroups(keys.map((key, i) => ({
    id: String(i), key, label: key,
  })));
  const orders = groups.find(group => group.name === "Ordens de Serviço");
  assert.ok(orders);
  assert.deepEqual(
    new Set(orders.sections.find(section => section.name === "Tabela")?.permissions.map(p => p.key)),
    new Set(["orders.table.view", "orders.table.actions", "orders.table.customer"]),
  );
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.create" }), "actions");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.edit" }), "actions");
  const inventory = groups.find(group => group.name === "Estoque");
  assert.ok(inventory?.sections.some(section => section.name === "Tabela"));
});

test("existe uma única entrada visual para tabela e nenhuma aba de colunas separada", () => {
  const matrix = read("src/features/roles/presentation/PermissionMatrix.tsx");
  assert.match(matrix, /Visualização/);
  assert.match(matrix, /Ações/);
  assert.doesNotMatch(matrix, /Colunas das tabelas/);
  assert.match(matrix, /permissionLabelForEditor/);
});

test("visualizar e ações aparecem dentro do mesmo módulo, sem abas globais", () => {
  const matrix = read("src/features/roles/presentation/PermissionMatrix.tsx");
  assert.doesNotMatch(matrix, /role="tablist"/);
  assert.doesNotMatch(matrix, /setMode/);
  assert.match(matrix, /groups\.map\(group =>/);
  assert.match(matrix, /kinds\.map\(kind =>/);
  assert.match(matrix, /kind\.title/);
  assert.match(matrix, /permissionPresentationKind\(permission\) === kind\.key/);
  assert.match(matrix, /title: "Visualizar"/);
  assert.match(matrix, /title: "Ações"/);
});

test("o editor mantém a seleção ao atualizar a lista de funções e só salva após carregar o catálogo", () => {
  const editor = read("src/features/roles/presentation/TabRoles.tsx");
  assert.match(editor, /roleBeingEdited\?\.id, canViewDetails/);
  assert.match(editor, /permissionListReady \|\| !catalogReady/);
  assert.match(editor, /getRolePermissionIds\(roleId\)/);
  assert.match(editor, /persistedIds/);
});

test("permissões de tabelas dos 17 módulos nunca são classificadas como ação", () => {
  for (const module of [
    "agenda", "brands", "categories", "customers", "documents", "employees",
    "equipment", "general_services", "inventory", "order_statuses", "orders",
    "products", "quotes", "roles", "service_types", "services", "situations",
  ]) {
    for (const suffix of ["table.view", "table.status", "table.actions"]) {
      assert.equal(taxonomy.permissionPresentationKind({ key: module + "." + suffix }), "visual", module + "." + suffix);
    }
  }
});

test("não exibe checkboxes de colunas antigas que a tabela de funções não usa", () => {
  const keys = [
    "roles.view", "roles.table.view", "roles.table.name", "roles.table.description",
    "roles.table.permissions", "roles.table.type", "roles.table.users", "roles.table.actions",
  ];
  const grouped = taxonomy.buildPermissionGroups(keys.map((key, i) => ({ id: String(i), key, label: key })));
  const roleGroup = grouped.find(group => group.name === "Funções e Permissões");
  assert.ok(roleGroup);
  assert.deepEqual(new Set(roleGroup.permissions.map(p => p.key)), new Set(["roles.view", "roles.table.view"]));
});

test("submódulos financeiros não se misturam numa lista genérica de ações", () => {
  assert.equal(taxonomy.permissionSectionName({ key: "finance.receivables.view" }), "Contas a Receber");
  assert.equal(taxonomy.permissionSectionName({ key: "finance.receivables.create" }), "Contas a Receber");
  assert.equal(taxonomy.permissionSectionName({ key: "finance.payables.approve" }), "Contas a Pagar");
  assert.equal(taxonomy.permissionSectionName({ key: "finance.reports.dre" }), "Relatórios");
  assert.equal(taxonomy.permissionPresentationKind({ key: "finance.reports.dre" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "documents.signatures.audit" }), "visual");
  assert.equal(taxonomy.permissionSectionName({ key: "equipment.technical_fields.column.name" }), "Tabela — Campos Técnicos");
});



test("Painel do Técnico é exibido em Funções, com dados e ações separados", () => {
  const keys = [
    "technician_panel.view", "technician_panel.data.customer",
    "technician_panel.data.equipment", "technician_panel.data.diagnosis",
    "technician_panel.actions.start", "technician_panel.actions.complete",
    "technician_panel.actions.photo",
  ];
  const groups = taxonomy.buildPermissionGroups(
    keys.map((key, index) => ({ id: String(index), key, label: key })),
  );
  const tech = groups.find(group => group.name === "Painel do Técnico");
  assert.ok(tech, "o grupo do Painel do Técnico deve aparecer");
  assert.equal(tech.permissions.length, keys.length);
  assert.deepEqual(
    new Set(tech.permissions.filter(item => taxonomy.permissionPresentationKind(item) === "visual").map(item => item.key)),
    new Set(keys.slice(0, 4)),
  );
  assert.deepEqual(
    new Set(tech.permissions.filter(item => taxonomy.permissionPresentationKind(item) === "actions").map(item => item.key)),
    new Set(keys.slice(4)),
  );
});

test("Painel do Técnico segue orders e não exige módulo técnico inexistente", async () => {
  const scope = await import("../../access/domain/permission-scope.ts");
  const isVisible = (modules) => scope.isPermissionVisibleForOrganization(
    "technician_panel.view",
    { isPlatformOperator: false, isArtvideoTenant: true, enabledModules: new Set(modules) },
  );
  assert.equal(isVisible(["orders"]), true);
  assert.equal(isVisible([]), false);
  assert.equal(scope.isPermissionVisibleForOrganization("technician_panel.view", {
    isPlatformOperator: true, isArtvideoTenant: false, enabledModules: new Set(),
  }), true);
  const migration = read("supabase/migrations/20261014170500_technician_panel_orders_scope_and_role_defaults.sql");
  assert.match(migration, /when p_key like 'technician_panel.%' then array\['orders'\]/);
  assert.match(migration, /private.permission_belongs_to_organization\(r.organization_id, p.key\)/);
});

test("o formulário nunca salva permissões da função antes de carregá-las", () => {
  const editor = read("src/features/roles/presentation/TabRoles.tsx");
  assert.match(editor, /disabled=\{!permissionListReady \|\| !catalogReady\}/);
  assert.match(editor, /saving \|\| !permissionListReady/);
  assert.match(editor, /saveRolePermissions\(/);
  assert.doesNotMatch(editor, /await addRolePermission\(/);
});

test("atualizações do cargo preservam permissões invisíveis no catálogo", () => {
  const editor = read("src/features/roles/presentation/TabRoles.tsx");
  assert.match(editor, /selectedVisible = form.selected.filter/);
  const migration = read("supabase/migrations/20261014155000_atomic_role_permission_save.sql");
  assert.match(migration, /security invoker/i);
  assert.match(migration, /link.permission_id = any\(p_visible_permission_ids\)/);
  assert.match(migration, /not link.permission_id = any\(p_selected_permission_ids\)/);
});

test("funções e usuários consultam o mesmo catálogo centralizado", () => {
  const rolesRepo = read("src/features/roles/infrastructure/roles.repository.ts");
  const usersRepo = read("src/features/access/infrastructure/user-access.repository.ts");
  assert.match(rolesRepo, /list_organization_permission_catalog_v1/);
  assert.match(usersRepo, /list_organization_permission_catalog_v1/);
  const migration = read("supabase/migrations/20261014153000_centralize_role_permission_catalog.sql");
  assert.match(migration, /private.permission_belongs_to_organization/);
  assert.match(migration, /security invoker/i);
});

test("a consulta do login usa o mesmo escopo de módulos", () => {
  const migration = read("supabase/migrations/20261014161500_auth_permissions_module_scope_alignment.sql");
  assert.match(migration, /where private.permission_belongs_to_organization/);
  assert.doesNotMatch(migration, /candidate.permission_key not like 'orders.images.situation.%'/);
});

test("Painel do Técnico aparece no catálogo usando o módulo orders", () => {
  const migration = read("supabase/migrations/20261014170000_fix_technician_panel_permission_catalog.sql");
  assert.ok(migration.includes("when p_key like 'technician_panel.%' then array['orders']"));
  assert.ok(migration.includes("private.permission_required_module_keys('technician_panel.view')"));
  assert.ok(!migration.includes("insert into public.role_permissions"));

  const permissions = [
    { id: "tp-1", key: "technician_panel.view", label: "Acessar painel técnico" },
    { id: "tp-2", key: "technician_panel.data.customer", label: "Ver cliente" },
    { id: "tp-3", key: "technician_panel.actions.start", label: "Iniciar serviço" },
  ];
  const moduleGroup = taxonomy.buildPermissionGroups(permissions)
    .find(group => group.name === "Painel do Técnico");
  assert.ok(moduleGroup, "o grupo precisa estar disponível para selecionar permissões");
  assert.deepEqual(
    new Set(moduleGroup.sections.map(section => section.name)),
    new Set(["Acesso", "Dados", "Ações"]),
  );
  assert.equal(taxonomy.permissionPresentationKind(permissions[0]), "visual");
  assert.equal(taxonomy.permissionPresentationKind(permissions[1]), "visual");
  assert.equal(taxonomy.permissionPresentationKind(permissions[2]), "actions");
});


test("cada módulo reúne visualização e ações sem abas globais de permissão", () => {
  const matrix = read("src/features/roles/presentation/PermissionMatrix.tsx");
  assert.match(matrix, /kinds\.map\(kind/);
  assert.match(matrix, /group\.sections\.map/);
  assert.doesNotMatch(matrix, /role="tablist"/);
});

test("a permissão Visualizar Operação governa menu, rota e submódulos", () => {
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const admin = read("src/app/Admin.tsx");
  assert.match(sidebar, /const canAccessOperation = !isPlatformOperatorOrganization && hasPermission\("operation\.view"\)/);
  assert.match(sidebar, /parentAdminTab\(tab\) === "operation" && !hasPermission\("operation\.view"\)/);
  assert.match(admin, /if \(tab === "operation"\) return !isPlatformOperatorOrganization && hasPermission\("operation\.view"\)/);
  assert.match(admin, /parentAdminTab\(tab\) === "operation" && !hasPermission\("operation\.view"\)/);
});

test("visualização não é reativada implicitamente por permissões de ação", () => {
  for (const [path, key] of [
    ["src/features/finance/presentation/FinanceAccountsSection.tsx", "finance.accounts.view"],
    ["src/features/finance/presentation/FinanceDocumentsPanel.tsx", "finance.documents.view"],
    ["src/features/finance/presentation/FinanceCollectionsPanel.tsx", "finance.collections.view"],
    ["src/features/finance/presentation/FinanceRecurringSection.tsx", "finance.recurring.view"],
    ["src/features/checklists/presentation/ChecklistAdminPanel.tsx", "checklists.view"],
    ["src/features/terms/presentation/TabTerms.tsx", "terms.view"],
  ]) {
    assert.match(read(path), new RegExp('const canView = hasPermission\\("' + key.replaceAll(".", "\\.") + '"\\);'), path);
  }
  for (const [action, view] of [
    ["finance.accounts.manage", "finance.accounts.view"],
    ["finance.documents.manage", "finance.documents.view"],
    ["finance.collections.create", "finance.collections.view"],
    ["finance.recurring.manage", "finance.recurring.view"],
  ]) {
    assert.ok(taxonomy.permissionDependencies(action).includes(view), action);
  }
});

test("salvamento de função confere resultado persistido e atualização ao foco é leve", () => {
  const roleEditor = read("src/features/roles/presentation/TabRoles.tsx");
  const auth = read("src/lib/auth.tsx");
  assert.match(roleEditor, /const verification = await getRolePermissionIds\(roleId\)/);
  assert.match(roleEditor, /const canViewTable = hasPermission\("roles\.table\.view"\);/);
  assert.match(roleEditor, /const canViewDetails = hasPermission\("roles\.details\.view"\);/);
  assert.match(auth, /now - lastCheck < 10_000/);
});
