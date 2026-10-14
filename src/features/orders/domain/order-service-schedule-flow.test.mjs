import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const section = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
const calendar = read("src/features/orders/presentation/OrderServiceScheduleDraftDialog.tsx");
const repository = read("src/features/orders/infrastructure/order-commercial-items.repository.ts");
const migration = read("supabase/migrations/20261014172500_service_item_scheduled_creation_v1.sql");
const teamGuard = read("supabase/migrations/20261014174500_lock_scheduled_service_technician.sql");

test("a seção de incluir serviço pergunta agendamento e abre calendário de disponibilidade", () => {
  assert.match(section, /Necessita agendamento/);
  assert.match(section, /<AdminSegmentedControl/);
  assert.match(section, /value=\{serviceNeedsSchedule \? "yes" : "no"\}/);
  assert.match(section, /className="w-fit grid-cols-2"/);
  assert.doesNotMatch(section, /name="include-service-scheduling"/);
  assert.match(section, /<EmployeeMultiSelect/);
  assert.match(section, /className=\{cn\(INPUT,/);
  assert.match(section, /Selecionar técnicos e horário/);
  assert.match(section, /setServiceScheduleOpen\(true\)/);
  assert.match(section, /<OrderServiceScheduleDraftDialog/);
  assert.match(calendar, /<TechnicianAvailabilityCalendar/);
  assert.match(calendar, /onToggleTechnician/);
  assert.match(calendar, /onChooseStart/);
  assert.match(calendar, /onChooseEnd/);
  assert.match(calendar, /Confirmar agendamento/);
});

test("dropdown de técnicos respeita o card e permite rolar até o último nome", () => {
  const picker = read("src/features/orders/presentation/OrderFormControls.tsx");
  const segmented = read("src/shared/ui/admin/AdminLayout.tsx");
  assert.match(section, /<EmployeeMultiSelect/);
  assert.match(section, /inlineDropdown/);
  assert.match(picker, /inlineDropdown = false/);
  assert.match(picker, /inlineDropdown \? "relative mb-3 mt-2 w-full" : "absolute/);
  assert.match(picker, /max-h-48 overflow-y-auto overscroll-contain pb-3 pr-1/);
  assert.match(segmented, /cursor-default rounded-md border border-transparent/);
  assert.match(segmented, /bg-primary-soft text-primary ring-1 ring-inset ring-primary/);
  assert.doesNotMatch(segmented, /value === option.value \? "border-primary bg-primary-soft/);
});

test("a inclusão agendada grava equipe e horário juntos em uma transação", () => {
  assert.match(section, /serviceNeedsSchedule \? serviceScheduleDraft!\.technicianIds : serviceTechnicianIds/);
  assert.match(repository, /add_service_order_catalog_item_scheduled_v1/);
  assert.match(repository, /p_start_at: input.scheduledStartAt/);
  assert.match(migration, /add_service_order_catalog_item_with_technicians_v1/);
  assert.match(migration, /set_order_service_task_schedule_v1/);
  assert.match(migration, /Já está nesta OS|já está nesta OS/i);
});

test("Agendar acompanha o preço total; Reagendar acompanha a data, sem seção separada", () => {
  assert.match(section, /setSchedulingItem\(item\)}>Agendar<\/BtnSecondary>/);
  assert.match(section, /setSchedulingItem\(item\)}>Reagendar<\/BtnSecondary>/);
  assert.doesNotMatch(section, /Agendamento do serviço<\/p>/);
  assert.match(section, /teamLocked = Boolean\(task\?\.scheduled_start_at\)/);
  assert.match(section, /disabled=\{teamLocked\}/);
  assert.match(teamGuard, /v_previous\.scheduled_start_at is not null/);
});

test("compilador JSX reconhece os componentes alterados antes do build de site e CRM", async () => {
  for (const file of [
    "src/features/orders/presentation/OrderProductsServicesSection.tsx",
    "src/features/orders/presentation/OrderServiceScheduleDraftDialog.tsx",
    "src/features/orders/presentation/OrderServiceScheduleDialog.tsx",
    "src/features/appointments/presentation/TechnicianAvailabilityCalendar.tsx",
  ]) {
    await assert.doesNotReject(
      transformWithEsbuild(read(file), file, { loader: "tsx", jsx: "automatic" }),
      "JSX inválido em " + file,
    );
  }
});

test("erros e sucessos dos itens da OS usam balões globais do CRM, sem caixa fixa", () => {
  assert.match(section, /import \{ notifyAdmin \} from "@\/shared\/ui\/admin\/AdminFeedback"/);
  assert.match(section, /notifyAdmin\(feedback\.text, feedback\.type\)/);
  assert.match(section, /showFeedback\(\{ type: "success", text: "Serviço adicionado à OS\." \}\)/);
  assert.match(section, /showFeedback\(\{ type: "error", text: systemErrorMessage\(error, "Não foi possível adicionar o serviço\."\) \}\)/);
  assert.match(section, /showFeedback\(\{ type: "success", text: start \? "Agendamento do serviço confirmado\."/);
  assert.doesNotMatch(section, /\{message && <div/);
  assert.doesNotMatch(section, /setMessage\(/);
});

test("o modal de criação é compacto, abre no dia atual e preserva seleção múltipla", () => {
  const availabilityCalendar = read("src/features/appointments/presentation/TechnicianAvailabilityCalendar.tsx");
  assert.match(calendar, /className="w-\[calc\(100vw-1\.5rem\)\] max-w-4xl"/);
  assert.match(calendar, /<TechnicianAvailabilityCalendar\s+compact/);
  assert.match(calendar, /onChangeDate=\{changeDate\}/);
  assert.match(calendar, /setSelected\(\[technicianId\]\)/);
  assert.match(calendar, /onToggleTechnician=\{technicianId/);
  assert.match(availabilityCalendar, /const \[hideEmpty, setHideEmpty\] = useState\(true\)/);
  assert.match(availabilityCalendar, /if \(compact\) return <AdminCard/);
  assert.match(availabilityCalendar, /Horários disponíveis/);
  assert.match(availabilityCalendar, /max-h-\[min\(40dvh,340px\)\]/);
  assert.match(availabilityCalendar, /minutes\(time\) > minutesNow/);
  assert.doesNotMatch(availabilityCalendar, /<CalendarDays/);
});

test("os dois modais alternam entre Dia e Semana sem alterar os dados selecionados", () => {
  const schedule = read("src/features/orders/presentation/OrderServiceScheduleDialog.tsx");
  const available = read("src/features/appointments/presentation/TechnicianAvailabilityCalendar.tsx");
  for (const dialog of [calendar, schedule]) {
    assert.match(dialog, /useState<"day" \| "week">\("day"\)/);
    assert.match(dialog, /aria-pressed=\{viewMode === "day"\}/);
    assert.match(dialog, /aria-pressed=\{viewMode === "week"\}/);
    assert.match(dialog, /viewMode=\{viewMode\}/);
    assert.match(dialog, /onChangeDate=\{changeDate\}/);
  }
  assert.match(available, /viewMode\?: "day" \| "week"/);
  assert.match(available, /viewMode === "week"/);
  assert.match(available, /weeklyHours\.map\(time/);
  assert.match(available, /days\.map\(day/);
  assert.match(available, /max-h-\[min\(40dvh,340px\)\]/);
  assert.match(available, /onChooseStart\?\.\(day\.date, time, employee\.id\)/);
  assert.match(available, /onToggleTechnician && active/);
  assert.match(available, /fixedTeam/);
});
