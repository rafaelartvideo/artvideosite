import { supabase } from "@/lib/supabase";
import {
  defaultWorkWeek, hhmm, minutes, normaliseIntervals, rangeAvailable,
  type EmployeeWeekday, type OccupiedInterval,
} from "./employee-agenda.repository";

export type AvailableTechnician = { id: string; full_name: string; is_active?: boolean };
export type AvailabilityDay = {
  date: string;
  technicians: Array<AvailableTechnician & { workday: EmployeeWeekday; occupied: OccupiedInterval[] }>;
};
export type AvailabilityWeek = { days: AvailabilityDay[]; hasSchedules: boolean };

const nextDate = (value: string, days: number) => {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  return year + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
};

export function technicianAvailable(day: AvailabilityDay, employeeId: string, start: string, end: string) {
  const employee = day.technicians.find(item => item.id === employeeId);
  return Boolean(employee && rangeAvailable(employee.workday, start, end, employee.occupied, day.date));
}

export function availableAt(day: AvailabilityDay, start: string, durationMinutes = 30) {
  const end = hhmm(minutes(start) + durationMinutes);
  return day.technicians.filter(employee =>
    rangeAvailable(employee.workday, start, end, employee.occupied, day.date),
  );
}

export async function loadTechnicianAvailabilityWeek(
  organizationId: string, weekStart: string, technicians: AvailableTechnician[],
  exceptOrderId?: string | null,
  exceptTaskId?: string | null,
): Promise<AvailabilityWeek> {
  const active = technicians.filter(item => item.is_active !== false);
  const dates = Array.from({ length: 7 }, (_, index) => nextDate(weekStart, index));
  if (!organizationId || !active.length) {
    return { days: dates.map(date => ({ date, technicians: [] })), hasSchedules: false };
  }

  const previous = new Date(nextDate(weekStart, -1) + "T00:00:00");
  const until = new Date(nextDate(weekStart, 7) + "T00:00:00");
  const ids = active.map(item => item.id);
  const [weekResult, ordersResult, appointmentsResult, taskResult] = await Promise.all([
    supabase.from("employee_work_schedules")
      .select("employee_id,weekday,is_available,start_time,end_time,work_intervals")
      .eq("organization_id", organizationId).in("employee_id", ids),
    supabase.from("service_orders")
      .select("id,scheduled_at,scheduled_end_at,technician_id,technician_links:service_order_technicians(employee_id)")
      .eq("organization_id", organizationId).not("scheduled_at", "is", null)
      .is("completed_at", null).is("cancelled_at", null)
      .gte("scheduled_at", previous.toISOString()).lt("scheduled_at", until.toISOString()),
    supabase.from("appointments")
      .select("id,appointment_date,period,start_time,end_time,appointment_technicians(employee_id)")
      .eq("organization_id", organizationId)
      .gte("appointment_date", weekStart).lt("appointment_date", nextDate(weekStart, 7)),
    supabase.from("service_order_item_tasks")
      .select("item_id,service_order_id,scheduled_start_at,scheduled_end_at,status,assigned_employee_id,assignees:service_order_item_task_assignees(employee_id)")
      .eq("organization_id", organizationId)
      .not("scheduled_start_at", "is", null)
      .in("status", ["pending", "in_progress"])
      .gt("scheduled_end_at", previous.toISOString())
      .lt("scheduled_start_at", until.toISOString()),
  ]);
  if (weekResult.error) throw weekResult.error;
  if (ordersResult.error) throw ordersResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;
  if (taskResult.error) throw taskResult.error;

  const schedules = new Map<string, EmployeeWeekday[]>(
    active.map(technician => [technician.id, defaultWorkWeek()]),
  );
  for (const row of weekResult.data || []) {
    const week = schedules.get(row.employee_id);
    if (!week) continue;
    const weekday = Number(row.weekday);
    if (weekday < 0 || weekday > 6) continue;
    const work_intervals = normaliseIntervals(Array.isArray(row.work_intervals) ? row.work_intervals : []);
    week[weekday] = {
      weekday,
      is_available: row.is_available === true,
      start_time: String(row.start_time || "08:00").slice(0, 5),
      end_time: String(row.end_time || "18:00").slice(0, 5),
      work_intervals,
    };
  }

  const individualTasks = taskResult.data || [];
  const individualOrderEmployeeKeys = new Set(individualTasks.flatMap(task =>
    [task.assigned_employee_id, ...(task.assignees || []).map(assignee => assignee.employee_id)]
      .filter(Boolean).map(employeeId => task.service_order_id + ":" + employeeId),
  ));
  const days: AvailabilityDay[] = dates.map(date => {
    const dateStart = new Date(date + "T00:00:00").getTime();
    const dateEnd = new Date(nextDate(date, 1) + "T00:00:00").getTime();
    const weekday = new Date(date + "T12:00:00").getDay();
    const blocks = new Map(active.map(employee => [employee.id, [] as OccupiedInterval[]]));
    for (const order of ordersResult.data || []) {
      if (order.id === exceptOrderId || !order.scheduled_at) continue;
      const start = new Date(order.scheduled_at).getTime();
      const end = order.scheduled_end_at ? new Date(order.scheduled_end_at).getTime() : start + 60 * 60_000;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= dateEnd || end <= dateStart) continue;
      const links = (order as any).technician_links || [];
      const assigned = new Set<string>([order.technician_id, ...links.map((link: any) => link.employee_id)].filter(Boolean));
      for (const employeeId of assigned) {
        if (individualOrderEmployeeKeys.has(order.id + ":" + employeeId)) continue;
        blocks.get(employeeId)?.push({
          start: Math.max(0, Math.floor((start - dateStart) / 60_000)),
          end: Math.min(24 * 60, Math.ceil((end - dateStart) / 60_000)),
          source: "os",
        });
      }
    }
    for (const task of individualTasks) {
      if (task.item_id === exceptTaskId) continue;
      const start = new Date(task.scheduled_start_at!).getTime();
      const end = new Date(task.scheduled_end_at!).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= dateEnd || end <= dateStart) continue;
      const assigned = new Set([task.assigned_employee_id, ...(task.assignees || []).map(link => link.employee_id)].filter(Boolean));
      for (const employeeId of assigned) {
        blocks.get(employeeId)?.push({
          start: Math.max(0, Math.floor((start - dateStart) / 60_000)),
          end: Math.min(24 * 60, Math.ceil((end - dateStart) / 60_000)),
          source: "os",
        });
      }
    }
    for (const appointment of appointmentsResult.data || []) {
      if (appointment.appointment_date !== date) continue;
      const period = String(appointment.period || "").toLowerCase();
      const interval = period === "custom"
        ? { start: minutes(appointment.start_time || ""), end: minutes(appointment.end_time || "") }
        : period === "morning" ? { start: 0, end: 12 * 60 }
        : period === "afternoon" ? { start: 12 * 60, end: 24 * 60 }
        : period === "evening" ? { start: 18 * 60, end: 24 * 60 }
        : { start: 0, end: 24 * 60 };
      if (interval.end <= interval.start) continue;
      for (const link of (appointment as any).appointment_technicians || []) {
        blocks.get(link.employee_id)?.push({ ...interval, source: "appointment" });
      }
    }
    return {
      date,
      technicians: active.map(employee => ({
        ...employee,
        workday: schedules.get(employee.id)![weekday],
        occupied: blocks.get(employee.id) || [],
      })),
    };
  });
  return { days, hasSchedules: (weekResult.data || []).some(row => row.is_available === true) };
}
