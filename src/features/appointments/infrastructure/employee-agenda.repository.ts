import { supabase } from "@/lib/supabase";

export type EmployeeWeekday = { weekday: number; is_available: boolean; start_time: string; end_time: string };
export type OccupiedInterval = { start: number; end: number; source: "os" | "appointment" };

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function defaultWorkWeek(): EmployeeWeekday[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday, is_available: false, start_time: "08:00", end_time: "18:00",
  }));
}

export function minutes(time: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(time || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
export function hhmm(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function dateInBrowser(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function loadEmployeeWorkWeek(organizationId: string, employeeId: string): Promise<EmployeeWeekday[]> {
  const { data, error } = await supabase.from("employee_work_schedules")
    .select("weekday,is_available,start_time,end_time")
    .eq("organization_id", organizationId).eq("employee_id", employeeId);
  if (error) throw error;
  const overrides = new Map((data || []).map((row: any) => [Number(row.weekday), row]));
  return defaultWorkWeek().map(day => {
    const override: any = overrides.get(day.weekday);
    return override ? {
      weekday: day.weekday,
      is_available: override.is_available === true,
      start_time: String(override.start_time).slice(0, 5),
      end_time: String(override.end_time).slice(0, 5),
    } : day;
  });
}

export async function saveEmployeeWorkWeek(organizationId: string, employeeId: string, days: EmployeeWeekday[]) {
  if (days.length !== 7 || new Set(days.map(day => day.weekday)).size !== 7) throw new Error("Informe os sete dias da semana.");
  if (days.some(day => day.weekday < 0 || day.weekday > 6 || (day.is_available && minutes(day.end_time) <= minutes(day.start_time)))) {
    throw new Error("Confira os horários da agenda. O término deve ser posterior ao início.");
  }
  const { error } = await supabase.from("employee_work_schedules").upsert(
    days.map(day => ({
      organization_id: organizationId, employee_id: employeeId, weekday: day.weekday,
      is_available: day.is_available, start_time: day.start_time, end_time: day.end_time,
    })),
    { onConflict: "organization_id,employee_id,weekday" },
  );
  if (error) throw error;
}

export async function loadEmployeeOccupiedIntervals(
  organizationId: string, employeeId: string, date: string, exceptOrderId?: string | null,
): Promise<OccupiedInterval[]> {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) throw new Error("Data de agenda inválida.");
  const previous = new Date(start);
  previous.setHours(previous.getHours() - 1);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  const [orders, appointments] = await Promise.all([
    supabase.from("service_orders")
      .select("id,scheduled_at,technician_id,technician_links:service_order_technicians(employee_id)")
      .eq("organization_id", organizationId).not("scheduled_at", "is", null)
      .is("completed_at", null)
      .gte("scheduled_at", previous.toISOString()).lt("scheduled_at", next.toISOString()),
    supabase.from("appointments")
      .select("id,period,start_time,end_time,appointment_technicians(employee_id)")
      .eq("organization_id", organizationId).eq("appointment_date", date),
  ]);
  if (orders.error) throw orders.error;
  if (appointments.error) throw appointments.error;
  const intervals: OccupiedInterval[] = [];
  for (const order of orders.data || []) {
    if (order.id === exceptOrderId) continue;
    const links = (order as any).technician_links || [];
    if (order.technician_id !== employeeId && !links.some((link: any) => link.employee_id === employeeId)) continue;
    const dateTime = new Date(order.scheduled_at!);
    if (Number.isNaN(dateTime.getTime())) continue;
    // OS agendas ocupam um bloco de 60 minutos.
    const value = dateTime.getHours() * 60 + dateTime.getMinutes();
    if (dateInBrowser(dateTime) === date) intervals.push({ start: value, end: value + 60, source: "os" });
    else if (dateTime.getTime() + 60 * 60_000 > start.getTime()) intervals.push({ start: 0, end: 60 - Math.floor((start.getTime() - dateTime.getTime()) / 60_000), source: "os" });
  }
  for (const appointment of appointments.data || []) {
    const links = (appointment as any).appointment_technicians || [];
    if (!links.some((link: any) => link.employee_id === employeeId)) continue;
    const period = String(appointment.period || "").toLowerCase();
    const interval = period === "custom"
      ? { start: minutes(appointment.start_time || ""), end: minutes(appointment.end_time || "") }
      : period === "morning" || period === "manha"
        ? { start: 0, end: 12 * 60 }
        : period === "afternoon" || period === "tarde"
          ? { start: 12 * 60, end: 24 * 60 }
          : { start: 0, end: 24 * 60 };
    intervals.push({ ...interval, source: "appointment" });
  }
  return intervals;
}

export function slotAvailable(day: EmployeeWeekday, startTime: string, intervals: OccupiedInterval[], slotDate: string): boolean {
  const start = minutes(startTime);
  const end = start + 60;
  if (!day.is_available || start < minutes(day.start_time) || end > minutes(day.end_time)) return false;
  const targetDate = new Date(`${slotDate}T${startTime}:00`);
  if (Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) return false;
  return !intervals.some(block => start < block.end && end > block.start);
}

export async function assertEmployeeScheduleAvailable(
  organizationId: string, employeeId: string, scheduledAt: string, exceptOrderId?: string | null,
): Promise<void> {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(scheduledAt);
  if (!match) throw new Error("Selecione uma data e um horário disponíveis na agenda do técnico.");
  const date = match[1], time = match[2];
  const day = new Date(`${date}T12:00:00`).getDay();
  const [week, occupied] = await Promise.all([
    loadEmployeeWorkWeek(organizationId, employeeId),
    loadEmployeeOccupiedIntervals(organizationId, employeeId, date, exceptOrderId),
  ]);
  if (!slotAvailable(week[day], time, occupied, date)) {
    throw new Error("O técnico não está disponível nesse horário. Selecione um horário verde na agenda.");
  }
}
