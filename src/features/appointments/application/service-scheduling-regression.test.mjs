import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

function calendarNavigation(date, view) {
  const source = readFileSync("src/features/appointments/application/useAgendaCalendar.ts", "utf8");
  const start = source.indexOf("  const moveCursor =");
  const end = source.indexOf("  const updateEventDate =", start);
  assert.ok(start >= 0 && end > start);
  let current = new Date(date);
  const original = current;
  const {code} = transformSync(source.slice(start, end), {loader:"ts"});
  const move = new Function("cursor", "view", "setCursor", `${code}; return moveCursor;`)(
    current, view, update => {current = typeof update === "function" ? update(current) : update;});
  return {move, original, get date() {return current;}};
}

test("a Agenda muda exatamente um mês nos dias 29–31, inclusive em anos bissextos", () => {
  for (const [year,month,day,delta,expected] of [
    [2026,0,31,1,[2026,1,28]], [2024,0,31,1,[2024,1,29]],
    [2026,2,31,-1,[2026,1,28]], [2024,2,31,-1,[2024,1,29]],
    [2026,0,30,1,[2026,1,28]], [2026,0,29,1,[2026,1,28]],
    [2026,11,31,1,[2027,0,31]], [2026,0,31,-1,[2025,11,31]],
  ]) {
    const initial = new Date(year,month,day,12);
    const calendar = calendarNavigation(initial,"month"); calendar.move(delta);
    assert.deepEqual([calendar.date.getFullYear(),calendar.date.getMonth(),calendar.date.getDate()],expected);
    assert.equal(calendar.date.getHours(),12);
    assert.equal(calendar.original.getTime(),initial.getTime());
  }
});

test("navegação rápida da Agenda acumula movimentos e preserva modos dia/semana", () => {
  const calendar = calendarNavigation(new Date(2026,0,15,12),"month");
  calendar.move(1); calendar.move(1);
  assert.deepEqual([calendar.date.getMonth(),calendar.date.getDate()],[2,15]);
  for (const view of ["week","availability","day"]) {
    const navigation = calendarNavigation(new Date(2026,0,15,12),view);
    navigation.move(1); navigation.move(1);
    assert.equal(navigation.date.getDate(),view==="day"?17:29);
  }
});
const read = (path) => readFileSync(path, "utf8");

const migration = read("supabase/migrations/20261014195500_individual_service_schedule.sql");
const guard = read("supabase/migrations/20261014200500_guard_scheduled_service_team.sql");
const availability = read("src/features/appointments/infrastructure/technician-availability.repository.ts");
const employee = read("src/features/appointments/infrastructure/employee-agenda.repository.ts");
const calendar = read("src/features/appointments/presentation/TechnicianAvailabilityCalendar.tsx");
const modal = read("src/features/orders/presentation/OrderServiceScheduleDialog.tsx");
const commercial = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
const repository = read("src/features/orders/infrastructure/order-service-tasks.repository.ts");
const agenda = read("src/features/appointments/application/agenda-calendar.ts");
const card = read("src/features/appointments/presentation/AgendaEventCard.tsx");

test("horários de serviço são independentes, opcionais e não apagam agendamentos legados", () => {
  assert.match(migration, /scheduled_start_at timestamptz/);
  assert.match(migration, /scheduled_end_at timestamptz/);
  assert.match(migration, /service_task_valid_schedule_v1/);
  assert.doesNotMatch(migration, /update public\.service_orders\s+set scheduled_at/);
});

test("reserva do serviço valida o técnico no servidor e não expõe RPC para visitantes", () => {
  assert.match(migration, /private\.can_access_service_order_child/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /employee_work_schedules/);
  assert.match(migration, /service_order_item_task_assignees/);
  assert.match(migration, /appointments a/);
  assert.match(migration, /scheduled_start_at<p_end_at/);
  assert.match(migration, /revoke all on function public\.set_order_service_task_schedule_v1/);
  assert.match(migration, /to authenticated/);
  assert.match(guard, /Remova o agendamento deste serviço antes de mudar seus técnicos/);
});

test("consulta de agenda preserva ocupação por serviço sem duplicar a OS", () => {
  assert.match(availability, /individualOrderEmployeeKeys/);
  assert.match(availability, /item_id === exceptTaskId/);
  assert.match(employee, /scheduledTasks/);
  assert.match(employee, /withIndividualSchedule/);
  assert.match(calendar, /exceptTaskId/);
});

test("Produtos e Serviços oferece agendamento separado para cada serviço", () => {
  assert.match(commercial, /<OrderServiceScheduleDialog/);
  assert.match(commercial, /setOrderServiceTaskSchedule/);
  assert.match(commercial, /Agendamento do serviço/);
  assert.match(modal, /<TechnicianAvailabilityCalendar/);
  assert.match(modal, /selectedTechnicianIds=\{technicianIds\}/);
  assert.match(repository, /set_order_service_task_schedule_v1/);
});

test("a agenda exibe os serviços como eventos individuais", () => {
  assert.match(agenda, /kind: "service_task"/);
  assert.match(agenda, /ordersWithIndividualSchedules/);
  assert.match(card, /event\.kind === "service_task"/);
  assert.match(card, /task\.item\?\.title_snapshot/);
});

const technicianNotifications = read("supabase/migrations/20261014234500_technician_assignment_schedule_notifications.sql");
const notificationRepository = read("src/features/notifications/infrastructure/notifications.repository.ts");

test("serviços atribuídos e agendamentos são auditados e notificados individualmente", () => {
  assert.match(technicianNotifications, /after insert or delete on public\.service_order_item_task_assignees/);
  assert.match(technicianNotifications, /audit_service_task_schedule_change/);
  assert.match(technicianNotifications, /appointment_technicians/);
  assert.match(technicianNotifications, /new\.changed_fields \? 'appointment_date'/);
  assert.match(technicianNotifications, /recipient_user_id=\(select auth\.uid\(\)\)/);
  assert.match(technicianNotifications, /recipient_user_id is null or/);
  assert.match(technicianNotifications, /\/admin\/technician-panel\/os\//);
  assert.match(technicianNotifications, /'technician_panel\.view'/);
  assert.match(notificationRepository, /row\.recipient_user_id !== userId/);
});

test("reagendamento mostra somente horários da equipe fixa, sem calendário semanal no modal", () => {
  assert.match(modal, /<TechnicianAvailabilityCalendar\s+compact/);
  assert.match(modal, /onChangeDate=\{changeDate\}/);
  assert.match(modal, /Confirmar agendamento/);
  assert.match(calendar, /fixedTeam/);
  assert.match(calendar, /selectedIds\.every\(id => available\.some/);
  assert.match(calendar, /Equipe disponível/);
  assert.match(calendar, /min-w-\[1540px\]/); // Vista semanal da Agenda permanece disponível.
});

test("Agenda compartilha referências por empresa e usuário e evita repetição após timeout", () => {
  const source = read("src/features/appointments/infrastructure/appointments.repository.ts");
  const hook = read("src/features/appointments/application/useAgendaCalendar.ts");
  assert.match(source, /const agendaReferencesCache = new Map/);
  assert.match(source, /cachedAgendaReferences\(org, userId\)/);
  assert.match(source, /expiresAt: Date\.now\(\) \+ 90_000/);
  assert.match(source, /agendaReferencesCache\.delete\(key\)/);
  assert.match(hook, /retry: false/);
});
