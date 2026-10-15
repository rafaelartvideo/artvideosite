import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const agenda = read("src/features/appointments/presentation/TabAgenda.tsx");
const toolbar = read("src/features/appointments/presentation/AgendaToolbar.tsx");
const editor = read("src/features/registrations/presentation/EmployeeAgendaDialog.tsx");
const panel = read("src/features/technician-panel/presentation/TechnicianPanel.tsx");
const migration = read("supabase/migrations/20261015084000_employee_self_schedule_and_technician_order_counts.sql");

test("Agenda oferece Meus horários reutilizando o editor semanal e atualiza disponibilidade", () => {
  assert.match(toolbar, /props\.myHoursAction/);
  assert.match(agenda, /<EmployeeAgendaSection/);
  assert.match(agenda, /employeeId=\{agenda\.myEmployeeId\}/);
  assert.match(agenda, /onSaved=\{\(\) => setScheduleRevision/);
  assert.match(agenda, /key=\{scheduleRevision\}/);
  assert.match(editor, /Meus horários/);
  assert.match(editor, /saveEmployeeWorkWeek/);
});

test("RLS de autoatendimento permite editar exclusivamente o expediente do próprio usuário", () => {
  assert.match(migration, /employee_schedule_self_insert/);
  assert.match(migration, /employee_schedule_self_update/);
  assert.match(migration, /e\.profile_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.has_effective_organization_permission\(organization_id, 'agenda\.view'\)/);
  assert.doesNotMatch(migration, /for delete to authenticated/);
});

test("painel distingue OS encerradas de atividades e usa contagem única por OS", () => {
  assert.match(panel, /assignedOrders\.filter/);
  assert.match(panel, /order_completed_at/);
  assert.match(panel, /order_cancelled_at/);
  assert.match(panel, /Serviços atribuídos/);
  assert.match(migration, /'order_completed_at',ord\.completed_at/);
  assert.match(migration, /'order_cancelled_at',ord\.cancelled_at/);
});
