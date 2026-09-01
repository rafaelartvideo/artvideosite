import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type { AppointmentSituation } from "@/lib/database.types";
import {
  loadAgendaData,
  updateAppointmentDate,
  updateServiceOrderSchedule,
} from "../infrastructure/appointments.repository";
import {
  eventDay,
  filterAgendaData,
  parseDay,
  type AgendaView,
  type AppointmentWithRelations,
  type CalendarEvent,
} from "./agenda-calendar";

type Options = {
  userId: string | null;
  canView: boolean;
  canViewOthers: boolean;
  onToast: (message: string, type: "success" | "error") => void;
};

export function useAgendaCalendar({ userId, canView, canViewOthers, onToast }: Options) {
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [view, setView] = useState<AgendaView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [situationFilter, setSituationFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: queryKeys.appointments.list({ userId, canViewOtherAgendas: canViewOthers }),
    queryFn: () => loadAgendaData({ userId, canViewOtherAgendas: canViewOthers }),
    enabled: canView,
  });
  const loading = canView && query.isPending;
  const employees = query.data?.employees ?? [];
  const services = query.data?.services ?? [];
  const generalServices = query.data?.generalServices ?? [];
  const situations = query.data?.situations ?? [];
  const appointmentSituations = (query.data?.appointmentSituations ?? []) as AppointmentSituation[];
  const technicians = employees as { id: string; full_name: string }[];
  const myEmployeeId = query.data?.myEmployeeId ?? null;

  useEffect(() => {
    if (!query.data) return;
    setOrders(query.data.orders);
    setAppointments(query.data.appointments as AppointmentWithRelations[]);
  }, [query.data]);

  useEffect(() => {
    if (!query.error) return;
    const message = query.error instanceof Error ? query.error.message : String(query.error);
    onToast(`Erro ao carregar agenda: ${message}`, "error");
  }, [query.error]);

  useEffect(() => {
    if (!canViewOthers && myEmployeeId) setTechnicianFilter(myEmployeeId);
  }, [canViewOthers, myEmployeeId]);

  const effectiveTechnicianFilter = !canViewOthers ? myEmployeeId || "" : technicianFilter;
  const { calendarEvents } = filterAgendaData({
    orders,
    appointments,
    search,
    technicianFilter: effectiveTechnicianFilter,
    statusFilter,
    situationFilter,
    serviceFilter,
  });
  const statuses = Array.from(new Map(orders.flatMap(order => {
    const statusId = order.order_status?.id;
    return statusId ? [[statusId, order.order_status] as const] : [];
  })).values());

  const moveCursor = (amount: number) => {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else if (view === "week") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
  };

  const updateEventDate = async (event: CalendarEvent | any, targetDay: string) => {
    if (!event.kind) {
      return updateEventDate({ kind: "service_order", id: event.id, date: eventDay(event), order: event }, targetDay);
    }
    if (event.kind === "appointment") {
      try {
        await updateAppointmentDate(event.id, targetDay);
        setAppointments(current => current.map(item => item.id === event.id ? { ...item, appointment_date: targetDay } : item));
        onToast("Agendamento atualizado.", "success");
        await queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      } catch (error) {
        onToast(`Não foi possível mover o agendamento: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
      return;
    }

    const oldDate = new Date(event.order.scheduled_at);
    const next = parseDay(targetDay);
    next.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    try {
      await updateServiceOrderSchedule(event.order.id, next.toISOString());
      setOrders(current => current.map(item => item.id === event.order.id ? { ...item, scheduled_at: next.toISOString() } : item));
      onToast("Agendamento atualizado.", "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]);
    } catch (error) {
      onToast(`Não foi possível mover a OS: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  const dropEvent = (dataTransfer: DataTransfer, targetDay: string) => {
    const raw = dataTransfer.getData("text/calendar-event");
    if (!raw) return;
    try {
      const dropped = JSON.parse(raw) as { kind: CalendarEvent["kind"]; id: string };
      const event = calendarEvents.find(item => item.kind === dropped.kind && item.id === dropped.id);
      if (event) void updateEventDate(event, targetDay);
    } catch {
      onToast("Não foi possível identificar o evento arrastado.", "error");
    }
  };

  return {
    loading,
    view,
    setView,
    cursor,
    setCursor,
    moveCursor,
    search,
    setSearch,
    technicianFilter,
    setTechnicianFilter,
    statusFilter,
    setStatusFilter,
    situationFilter,
    setSituationFilter,
    serviceFilter,
    setServiceFilter,
    employees,
    statuses,
    situations,
    services,
    generalServices,
    appointmentSituations,
    technicians,
    calendarEvents,
    dropEvent,
    addAppointment: (appointment: AppointmentWithRelations) =>
      setAppointments(current => [...current, appointment]),
  };
}
