import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const taxonomy = await import("./permission-taxonomy.ts");

test("visualizações, ações e colunas são categorias distintas", () => {
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.details.view" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.section.images" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "agenda.create" }), "actions");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.table.customer" }), "columns");
  assert.equal(taxonomy.permissionPresentationKind({ key: "orders.table.view" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "technician_panel.data.customer" }), "visual");
  assert.equal(taxonomy.permissionPresentationKind({ key: "technician_panel.actions.photo" }), "actions");
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
