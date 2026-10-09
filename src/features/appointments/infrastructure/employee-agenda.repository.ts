import { supabase } from "@/lib/supabase";

export type WorkInterval = { start_time: string; end_time: string };
export type EmployeeWeekday = {
  weekday: number;
  is_available: boolean;
  start_time: string;
  end_time: string;
  work_intervals: WorkInterval[];
};
export type OccupiedInterval = { start: number; end: number; source: "os" | "appointment" };

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function defaultWorkWeek(): EmployeeWeekday[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday, is_available: false, start_time: "08:00", end_time: "18:00", work_intervals: [],
  }));
}

export function minutes(time: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(time || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function hhmm(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function normaliseIntervals(input: WorkInterval[]): WorkInterval[] {
  return [...input].map(item => ({
    start_time: String(item.start_time).slice(0, 5),
    end_time: String(item.end_time).slice(0, 5),
  })).sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
}

export function validWorkIntervals(intervals: WorkInterval[]): boolean {
  const normalized = normaliseIntervals(intervals);
  if (normalized.length > 12) return false;
  return normalized.every((interval, index) => (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(interval.start_time)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(interval.end_time)
    && minutes(interval.end_time) > minutes(interval.start_time)
    && (index === 0 || minutes(interval.start_time) >= minutes(normalized[index - 1].end_time))
  ));
}

export async function loadEmployeeWorkWeek(organizationId: string, employeeId: string): Promise<EmployeeWeekday[]> {
  const { data, error } = await supabase.from("employee_work_schedules")
    .select("weekday,is_available,start_time,end_time,work_intervals")
    .eq("organization_id", organizationId).eq("employee_id", employeeId);
  if (error) throw error;
  const overrides = new Map((data || []).map((row: any) => [Number(row.weekday), row]));
  return defaultWorkWeek().map(day => {
    const override: any = overrides.get(day.weekday);
    if (!override) return day;
    const intervals = normaliseIntervals(Array.isArray(override.work_intervals) ? override.work_intervals : []);
    return {
      weekday: day.weekday, is_available: override.is_available === true,
      start_time: String(override.start_time).slice(0, 5),
      end_time: String(override.end_time).slice(0, 5),
      work_intervals: intervals,
    };
  });
}

export async function saveEmployeeWorkWeek(organizationId: string, employeeId: string, days: EmployeeWeekday[]) {
  if (days.length !== 7 || new Set(days.map(day => day.weekday)).size !== 7) throw new Error("Informe os sete dias da semana.");
  if (days.some(day => day.weekday < 0 || day.weekday > 6
    || !validWorkIntervals(day.work_intervals)
    || (day.is_available && day.work_intervals.length === 0))) {
    throw new Error("Corrija os períodos: cada dia ativo deve ter horários válidos, sem sobreposição.");
  }
  const { error } = await supabase.from("employee_work_schedules").upsert(
    days.map(day => {
      const intervals = normaliseIntervals(day.work_intervals);
      return {
        organization_id: organizationId, employee_id: employeeId, weekday: day.weekday,
        is_available: day.is_available,
        start_time: intervals[0]?.start_time || "08:00",
        end_time: intervals.at(-1)?.end_time || "18:00",
        work_intervals: intervals,
      };
    }),
    { onConflict: "organization_id,employee_id,weekday" },
  );
  if (error) throw error;
}

export async function loadEmployeeOccupiedIntervals(
  organizationId: string, employeeId: string, date: string, exceptOrderId?: string | null,
): Promise<OccupiedInterval[]> {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) throw new Error("Data de agenda inválida.");
  const previous = new Date(start); previous.setDate(previous.getDate() - 1);
  const next = new Date(start); next.setDate(next.getDate() + 1);
  const [orders, appointments] = await Promise.all([
    supabase.from("service_orders")
      .select("id,scheduled_at,scheduled_end_at,technician_id,technician_links:service_order_technicians(employee_id)")
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
    const orderStart = new Date(order.scheduled_at!);
    const orderEnd = order.scheduled_end_at
      ? new Date(order.scheduled_end_at)
      : new Date(orderStart.getTime() + 60 * 60_000);
    if (Number.isNaN(orderStart.getTime()) || Number.isNaN(orderEnd.getTime())) continue;
    if (orderStart < next && orderEnd > start) {
      intervals.push({
        start: Math.max(0, Math.floor((orderStart.getTime() - start.getTime()) / 60000)),
        end: Math.min(24 * 60, Math.ceil((orderEnd.getTime() - start.getTime()) / 60000)),
        source: "os",
      });
    }
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

export function rangeAvailable(
  day: EmployeeWeekday, startTime: string, endTime: string,
  intervals: OccupiedInterval[], slotDate: string,
): boolean {
  const start = minutes(startTime), end = minutes(endTime);
  if (!day.is_available || end <= start) return false;
  if (!day.work_intervals.some(interval => start >= minutes(interval.start_time) && end <= minutes(interval.end_time))) return false;
  const target = new Date(`${slotDate}T${startTime}:00`);
  if (Number.isNaN(target.getTime()) || target.getTime() <= Date.now()) return false;
  return !intervals.some(block => start < block.end && end > block.start);
}

export function slotAvailable(day: EmployeeWeekday, startTime: string, intervals: OccupiedInterval[], slotDate: string): boolean {
  return rangeAvailable(day, startTime, hhmm(minutes(startTime) + 30), intervals, slotDate);
}

export async function assertEmployeeScheduleAvailable(
  organizationId: string, employeeId: string, scheduledAt: string,
  scheduledEndAt: string, exceptOrderId?: string | null,
): Promise<void> {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(scheduledAt);
  const end = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(scheduledEndAt);
  if (!match || !end || match[1] !== end[1]) {
    throw new Error("Selecione início e término no mesmo dia da agenda.");
  }
  const date = match[1], startTime = match[2], endTime = end[2];
  const day = new Date(`${date}T12:00:00`).getDay();
  const [week, occupied] = await Promise.all([
    loadEmployeeWorkWeek(organizationId, employeeId),
    loadEmployeeOccupiedIntervals(organizationId, employeeId, date, exceptOrderId),
  ]);
  if (!rangeAvailable(week[day], startTime, endTime, occupied, date)) {
    throw new Error("O técnico não está disponível durante todo esse intervalo. Escolha uma faixa livre.");
  }
}
