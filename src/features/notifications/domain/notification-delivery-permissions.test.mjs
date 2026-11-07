import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261107212000_notifications_meaningful_events_and_permissions.sql");
const taxonomy = read("src/features/employees/domain/permission-taxonomy.ts");
const matrix = read("src/features/roles/presentation/PermissionMatrix.tsx");
const hook = read("src/features/notifications/application/useAdminNotifications.ts");
const repository = read("src/features/notifications/infrastructure/notifications.repository.ts");

test("auditoria de edicoes de OS e cadastro de cliente nao vira aviso geral", () => {
  assert.match(migration, /notification_is_relevant_v1/);
  assert.match(migration, /p_recipient is not null/);
  assert.match(migration, /p_audit_id is null/);
  assert.match(migration, /service_orders','financial_settlements','pdv_sales','quote_requests','document_signatures'/);
  assert.doesNotMatch(migration, /'entities','service_orders'/);
  assert.match(migration, /before insert on public\.organization_notifications/);
  assert.match(migration, /return null;/);
  assert.match(migration, /private\.notification_is_relevant_v1\(audit_log_id,recipient_user_id,entity_type,event_type\)/);
});

test("a RLS exige a empresa, o modulo e o destinatario correto", () => {
  assert.match(migration, /private\.is_organization_member\(organization_id\)/);
  assert.match(migration, /recipient_user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /'notifications\.view'/);
  assert.match(migration, /'notifications\.personal\.view'/);
  assert.match(migration, /visibility_permissions/);
});

test("visualizar e receber sao direitos separados no banco e na UI de perfis", () => {
  assert.match(migration, /'notifications\.'\|\|scope\|\|'\.view'/);
  assert.match(migration, /'notifications\.'\|\|scope\|\|'\.receive'/);
  assert.match(migration, /delivery_allowed/);
  assert.match(migration, /where n\.delivery_allowed/);
  assert.match(taxonomy, /key\.startsWith\("notifications\."\)/);
  assert.match(taxonomy, /key\.endsWith\("\.receive"\)/);
  assert.match(matrix, /group\.name === "Notificações"/);
});

test("realtime nao promove avisos sem direito de recebimento e agrupa rajadas", () => {
  assert.match(hook, /loadAdminNotifications\(normalizedOrganizationId, 50\)/);
  assert.match(hook, /item\.delivery_allowed === true/);
  assert.match(hook, /pendingIds/);
  assert.match(hook, /refreshTimer/);
  assert.match(repository, /delivery_allowed\?: boolean/);
});

test("tarefas e servicos pessoais continuam individuais", () => {
  const workItems = read("supabase/migrations/20261016120000_work_items_module.sql");
  const technician = read("supabase/migrations/20261014234500_technician_assignment_schedule_notifications.sql");
  assert.match(workItems, /recipient_user_id/);
  assert.match(technician, /recipient_user_id/);
  assert.match(migration, /p_recipient is not null/);
  assert.match(migration, /'notifications\.personal\.receive'/);
});

test("central oferece filtros de avisos pessoais, tarefas e modulos", () => {
  const panel = read("src/features/notifications/presentation/AdminNotifications.tsx");
  assert.match(panel, /label: "Para mim"/);
  assert.match(panel, /label: "Tarefas"/);
  assert.match(panel, /label: "Módulos"/);
  assert.match(panel, /Boolean\(notification\.recipient_user_id\)/);
  assert.match(panel, /notification\.module_key === "workItems"/);
  assert.match(panel, /filteredNotifications\.map/);
});
