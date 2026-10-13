import type { Appointment, AppointmentSituation } from "@/lib/database.types";

export type AppointmentWithRelations = Appointment & {
  customer?: any;
  service_order?: any;
  situation?: AppointmentSituation | null;
  appointment_technicians?: { employee_id: string; employee?: { id: string; full_name: string } | null }[];
  created_by_profile?: { id: string; full_name: string } | null;
};

export type CalendarEvent =
  | { kind: "service_order"; id: string; date: string; order: any }
  | { kind: "appointment"; id: string; date: string; appointment: AppointmentWithRelations };

export type AgendaView = "availability" | "month" | "week" | "day" | "agenda";
type AgendaFilters = {
  orders: any[];
  appointments: AppointmentWithRelations[];
  search: string;
  technicianFilter: string;
  statusFilter: string;
  situationFilter: string;
  serviceFilter: string;
};

export function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const parseDay = (key: string) => new Date(`${key}T00:00:00`);
export const eventDay = (order: any) => dayKey(new Date(order.scheduled_at));
export const eventLabel = (order: any) => (order.general_service as any)?.name || (order.service as any)?.title || "Serviço";

export function filterAgendaData({ orders, appointments, search, technicianFilter, statusFilter, situationFilter, serviceFilter }: AgendaFilters) {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredOrders = orders.filter(order => {
    const serviceIds = [(order.service as any)?.id, (order.general_service as any)?.id].filter(Boolean);
    const searchText = [order.customer?.full_name, order.os_number, order.service?.title,
      order.general_service?.name, order.technician?.full_name,
      ...((order.technician_links || []).map((link: any) => link.employee?.full_name || ""))].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const technicianIds = [(order.technician as any)?.id, ...((order.technician_links || []).map((link: any) => link.employee_id))].filter(Boolean);
    return (!search || searchText.includes(normalizedSearch))
      && (!technicianFilter || technicianIds.includes(technicianFilter))
      && (!statusFilter || (order.order_status as any)?.id === statusFilter)
      && (!situationFilter || (order.situation as any)?.id === situationFilter)
      && (!serviceFilter || serviceIds.includes(serviceFilter));
  });
  const filteredAppointments = appointments.filter(appointment => {
    const linkedOrder = appointment.service_order;
    const technicianIds = [
      ...(appointment.appointment_technicians || []).map(item => item.employee_id),
      linkedOrder?.technician?.id,
      ...((linkedOrder?.technician_links || []).map((link: any) => link.employee_id)),
    ].filter(Boolean);
    const searchText = [appointment.customer?.full_name, appointment.description, appointment.sector_location,
      appointment.service_order?.os_number, ...((appointment.appointment_technicians || [])
        .map(item => item.employee?.full_name || ""))].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const appointmentServiceIds = [linkedOrder?.service?.id, linkedOrder?.general_service?.id].filter(Boolean);
    return (!normalizedSearch || searchText.includes(normalizedSearch))
      && (!technicianFilter || technicianIds.includes(technicianFilter))
      && (!situationFilter || appointment.situation_id === situationFilter || linkedOrder?.situation?.id === situationFilter)
      && (!statusFilter || linkedOrder?.order_status?.id === statusFilter)
      && (!serviceFilter || appointmentServiceIds.includes(serviceFilter));
  });
  // A OS só é ocultada quando o agendamento vinculado também passou pelos filtros.
  const referencedOrderIds = new Set(filteredAppointments.map(item => item.service_order_id)
    .filter((id): id is string => Boolean(id)));
  const serviceOrderEvents: CalendarEvent[] = filteredOrders
    .filter(order => !referencedOrderIds.has(order.id))
    .map(order => ({ kind: "service_order", id: order.id, date: eventDay(order), order }));
  const appointmentEvents: CalendarEvent[] = filteredAppointments.map(appointment =>
    ({ kind: "appointment" as const, id: appointment.id, date: appointment.appointment_date, appointment }));
  return { filteredOrders, calendarEvents: [...serviceOrderEvents, ...appointmentEvents] as CalendarEvent[] };
}

export function buildAgendaDays(view: AgendaView, cursor: Date, count: number) {
  const rangeStart = (() => {
    if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    if (view === "week" || view === "availability") {
      const start = new Date(cursor);
      start.setDate(start.getDate() - (start.getDay() + 6) % 7);
      return start;
    }
    return new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  })();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(rangeStart);
    date.setDate(date.getDate() + index);
    return date;
  });
}
