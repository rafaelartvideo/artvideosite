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
  assert.match(section, /Necessita agendamento\?/);
  assert.match(section, /setServiceScheduleOpen\(true\)/);
  assert.match(section, /<OrderServiceScheduleDraftDialog/);
  assert.match(calendar, /<TechnicianAvailabilityCalendar/);
  assert.match(calendar, /onToggleTechnician/);
  assert.match(calendar, /onChooseStart/);
  assert.match(calendar, /onChooseEnd/);
  assert.match(calendar, /Confirmar horário e técnicos/);
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
