import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { permissionDependencies, permissionSectionName } from "../../employees/domain/permission-taxonomy.ts";

const read = path => readFileSync(path, "utf8");

test("Agenda e WhatsApp mantêm acesso no modal sem exigirem permissão de menu", () => {
  const technician = read("src/features/technician-panel/presentation/TechnicianPanel.tsx");
  assert.match(technician, /const canViewAgenda = hasPermission\("agenda\.view"\)/);
  assert.match(technician, /const canViewWhatsApp = hasPermission\("whatsapp\.inbox\.view"\)/);
  assert.doesNotMatch(technician, /agenda\.menu\.view|whatsapp\.inbox\.menu\.view/);
});

test("Agenda do menu e rota exigem permissão exclusiva de navegação", () => {
  for (const path of ["src/app/Admin.tsx", "src/features/admin-shell/presentation/AdminSidebar.tsx"]) {
    const source = read(path);
    assert.match(source, /if \(tab === "agenda"\) return hasPermission\("agenda\.view"\) && hasPermission\("agenda\.menu\.view"\)/, path);
  }
});

test("Central WhatsApp e Ferramentas não se liberam só por visualizar conversas", () => {
  const admin = read("src/app/Admin.tsx");
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  for (const source of [admin, sidebar]) {
    assert.match(source, /hasPermission\("whatsapp\.inbox\.view"\) && hasPermission\("whatsapp\.inbox\.menu\.view"\)/);
  }
  assert.match(admin, /const canAccessWhatsAppTool = [\s\S]*?hasPermission\("whatsapp\.inbox\.menu\.view"\)/);
  const integration = admin.split('if (tab === "integrations")')[1].split(";")[0];
  assert.doesNotMatch(integration, /whatsapp\.inbox\.view/);
  assert.match(integration, /settings\.channels\.view/);
});

test("Navegação é opção visual com dependência de leitura do módulo", () => {
  assert.ok(permissionDependencies("agenda.menu.view").includes("agenda.view"));
  assert.deepEqual(permissionDependencies("whatsapp.inbox.menu.view"), ["whatsapp.inbox.view"]);
  assert.equal(permissionSectionName({ key: "agenda.menu.view" }), "Navegação");
  assert.equal(permissionSectionName({ key: "whatsapp.inbox.menu.view" }), "Navegação");
});

test("Migração mantém menu dos demais perfis e não concede por padrão ao Técnico", () => {
  const sql = read("supabase/migrations/20261028234500_technician_modal_navigation_permissions.sql");
  assert.match(sql, /'agenda\.menu\.view'/);
  assert.match(sql, /'whatsapp\.inbox\.menu\.view'/);
  assert.match(sql, /not in \('técnico', 'tecnico'\)/i);
  assert.match(sql, /on conflict \(role_id, permission_id\) do nothing/i);
});
