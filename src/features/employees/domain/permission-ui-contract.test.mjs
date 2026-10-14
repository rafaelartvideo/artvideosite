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

test("submódulos financeiros não se misturam numa lista genérica de ações", () => {
  assert.equal(taxonomy.permissionSectionName({ key: "finance.receivables.view" }), "Contas a Receber");
  assert.equal(taxonomy.permissionSectionName({ key: "finance.receivables.create" }), "Contas a Receber");
  assert.equal(taxonomy.permissionSectionName({ key: "finance.payables.approve" }), "Contas a Pagar");
  assert.equal(taxonomy.permissionSectionName({ key: "finance.reports.dre" }), "Relatórios");
  assert.equal(taxonomy.permissionPresentationKind({ key: "finance.reports.dre" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "documents.signatures.audit" }), "visual");
  assert.equal(taxonomy.permissionSectionName({ key: "equipment.technical_fields.column.name" }), "Tabela — Campos Técnicos");
});


test("o formulário nunca salva permissões da função antes de carregá-las", () => {
  const editor = read("src/features/roles/presentation/TabRoles.tsx");
  assert.match(editor, /disabled=\{!permissionListReady\}/);
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
