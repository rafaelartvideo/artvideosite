import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read=(path)=>readFileSync(path,"utf8");
const compile=async(path,loader="tsx")=>
  assert.ok((await transformWithEsbuild(read(path),path,{loader})).code);

test("calendário do WhatsApp permite empresa, departamentos, escalas, feriados e retroatividade auditada",async()=>{
  const settings=read("src/features/whatsapp-channels/presentation/WhatsAppBusinessCalendarSettings.tsx");
  const menu=read("src/features/whatsapp-channels/presentation/WhatsAppAttendanceSettings.tsx");
  const schema=read("supabase/migrations/20261119225000_union_whatsapp_business_calendars.sql");
  const history=read("supabase/migrations/20261119233000_union_whatsapp_calendar_confirm_history.sql");
  await compile("src/features/whatsapp-channels/presentation/WhatsAppBusinessCalendarSettings.tsx");
  await compile("src/features/whatsapp-channels/presentation/WhatsAppAttendanceSettings.tsx");
  for(const section of ["company","department","operator"])assert.ok(settings.includes(section));
  for(const phrase of ["Feriados e exceções","Expediente semanal","Fuso horário","Confirmar vigência anterior"])
    assert.ok(settings.includes(phrase));
  assert.ok(menu.includes('id:"hours"'));
  assert.ok(menu.includes("<WhatsAppBusinessCalendarSettings"));
  assert.ok(schema.includes("union_whatsapp_business_calendars ENABLE ROW LEVEL SECURITY"));
  assert.ok(schema.includes("REVOKE ALL ON public.union_whatsapp_business_calendars"));
  assert.ok(schema.includes("union_wa_calendar_validate_intervals"));
  assert.ok(history.includes("retrospective_confirmed_by"));
  assert.ok(history.includes("p_confirmed IS DISTINCT FROM true"));
  assert.ok(history.includes("v_count<>1"));
});

test("first-response uses incoming messages and later human reply, not opening time",async()=>{
  const report=read("supabase/migrations/20261119234500_dashboard_operator_schedule_coverage.sql");
  const hours=read("supabase/migrations/20261119230000_union_wa_business_minutes_and_sender.sql");
  const bridge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  assert.ok(report.includes("customer_starts AS MATERIALIZED"));
  assert.ok(report.includes("human_replies AS MATERIALIZED"));
  assert.ok(report.includes("m.direction='incoming'"));
  assert.ok(report.includes("m.direction='outgoing' AND m.origin='union'"));
  assert.ok(report.includes("m.sent_at>=a.customer_first_at"));
  assert.ok(report.includes("m.sender_user_id AS human_author_id"));
  assert.ok(report.includes("private.union_wa_business_minutes"));
  assert.ok(report.includes("first_reply_elapsed_minutes"));
  assert.ok(report.includes("unscored_without_calendar"));
  assert.ok(report.includes("received_outside_hours"));
  assert.ok(report.includes("queue_avg_useful_minutes"));
  assert.ok(report.includes("pending_reply_avg_useful_minutes"));
  assert.ok(report.includes("cal.scope_type='operator'"));
  assert.ok(report.includes("company_calendar_configured"));
  assert.ok(!report.includes("m.body_text"));
  assert.ok(!report.includes("sac_digital_messages"));
  assert.ok(hours.includes("union_wa_messages_protocol_direction_time_idx"));
  assert.ok(bridge.includes("sender_user_id:actorId"));
});

test("dashboard carrega análises de respostas sob demanda e mostra SLA pausado",async()=>{
  const ui=read("src/features/dashboard/presentation/DashboardAttendances.tsx");
  const repo=read("src/features/dashboard/infrastructure/dashboard-attendances.repository.ts");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const clock=read("supabase/migrations/20261119232500_union_wa_business_clock.sql");
  const followup=read("supabase/migrations/20261119233500_dashboard_attendance_followups.sql");
  await compile("src/features/dashboard/presentation/DashboardAttendances.tsx");
  await compile("src/features/dashboard/infrastructure/dashboard-attendances.repository.ts","ts");
  await compile("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.ok(ui.includes('view==="analytics"&&visible("operations")'));
  assert.ok(ui.includes("staleTime:300_000"));
  assert.ok(ui.includes("clockMode"));
  assert.ok(ui.includes("Tempo útil"));
  assert.ok(ui.includes("Tempo corrido"));
  assert.ok(ui.includes("Fora do expediente · SLA pausado"));
  assert.ok(ui.includes("Em escala"));
  assert.ok(repo.includes("load_dashboard_attendance_followups_v1"));
  assert.ok(inbox.includes('queryKey:["whatsapp","business-clock",activeOrganizationId]'));
  assert.ok(inbox.includes("Fora do horário · SLA pausado"));
  assert.ok(clock.includes("private.union_whatsapp_allowed(p_org,'view_queues')"));
  assert.ok(followup.includes("ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING"));
  assert.ok(followup.includes("e.position>1"));
  assert.ok(!followup.includes("m.body_text"));
});
