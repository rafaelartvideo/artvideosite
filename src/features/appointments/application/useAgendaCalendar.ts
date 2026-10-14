import { systemErrorMessage } from "@/shared/domain/error-message";
import { supabase } from "@/lib/supabase";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type { AppointmentSituation } from "@/lib/database.types";
import {
  loadAgendaData,
  updateAppointmentDate,
  updateServiceOrderSchedule,
} from "../infrastructure/appointments.repository";
import { setOrderServiceTaskSchedule } from "@/features/orders/infrastructure/order-service-tasks.repository";
import {
  eventDay,
  filterAgendaData,
  parseDay,
  type AgendaView,
  type AppointmentWithRelations,
  type CalendarEvent,
  type ServiceTaskSchedule,
} from "./agenda-calendar";

type Options = {
  organizationId: string;
  userId: string | null;
  canView: boolean;
  canViewOthers: boolean;
  onToast: (message: string, type: "success" | "error") => void;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function agendaDataWindow(cursor: Date) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1);
  return {
    dateFrom: localDateKey(start),
    dateToExclusive: localDateKey(end),
    timestampFrom: start.toISOString(),
    timestampToExclusive: end.toISOString(),
  };
}

export function useAgendaCalendar({ organizationId, userId, canView, canViewOthers, onToast }: Options) {
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [taskSchedules, setTaskSchedules] = useState<ServiceTaskSchedule[]>([]);
  const [view, setView] = useState<AgendaView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [situationFilter, setSituationFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [search, setSearch] = useState("");
  const dataWindow = useMemo(() => agendaDataWindow(cursor), [cursor]);

  const query = useQuery({
    queryKey: queryKeys.appointments.list({
      organizationId,
      userId,
      canViewOtherAgendas: canViewOthers,
      windowStart: dataWindow.dateFrom,
      windowEnd: dataWindow.dateToExclusive,
    }),
    queryFn: () => loadAgendaData({
      organizationId,
      userId,
      canViewOtherAgendas: canViewOthers,
      ...dataWindow,
    }),
    enabled: canView,
  });
  useEffect(() => {
    if (!organizationId || !canView) return;
    const channel = supabase.channel("agenda-service-schedule:" + organizationId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "service_order_item_tasks",
        filter: "organization_id=eq." + organizationId,
      }, () => { void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, canView, queryClient]);

  const loading = canView && query.isPending;
  const employees = query.data?.employees ?? [];
  const services = query.data?.services ?? [];
  const generalServices = query.data?.generalServices ?? [];
  const situations = [...(query.data?.situations ?? []), ...(query.data?.appointmentSituations ?? [])]
    .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
  const appointmentSituations = (query.data?.appointmentSituations ?? []) as AppointmentSituation[];
  const technicians = employees as { id: string; full_name: string }[];
  const myEmployeeId = query.data?.myEmployeeId ?? null;

  // Sincroniza o snapshot antes do paint para não exibir um calendário vazio
  // durante um frame quando a consulta retorna do cache ou da rede.
  useLayoutEffect(() => {
    if (!query.data) return;
    setOrders(query.data.orders);
    setAppointments(query.data.appointments as AppointmentWithRelations[]);
    setTaskSchedules(query.data.taskSchedules as ServiceTaskSchedule[]);
  }, [query.data]);

  useEffect(() => {
    if (!query.error) return;
    const message = systemErrorMessage(query.error);
    onToast(`Erro ao carregar agenda: ${message}`, "error");
  }, [query.error]);

  useEffect(() => {
    if (!canViewOthers && myEmployeeId) setTechnicianFilter(myEmployeeId);
  }, [canViewOthers, myEmployeeId]);

  const effectiveTechnicianFilter = !canViewOthers ? myEmployeeId || "" : technicianFilter;
  const { calendarEvents: filteredCalendarEvents } = filterAgendaData({
    orders,
    appointments,
    taskSchedules,
    search,
    technicianFilter: effectiveTechnicianFilter,
    statusFilter,
    situationFilter,
    serviceFilter,
  });
  const calendarEvents = !canViewOthers && !myEmployeeId ? [] : filteredCalendarEvents;
  const statuses = query.data?.statuses ?? [];

  const moveCursor = (amount: number) => {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else if (view === "week" || view === "availability") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
  };

  const updateEventDate = async (event: CalendarEvent | any, targetDay: string) => {
    if (!event.kind) {
      return updateEventDate({ kind: "service_order", id: event.id, date: eventDay(event), order: event }, targetDay);
    }
    if (event.kind === "service_task") {
      const oldStart = new Date(event.task.scheduled_start_at);
      const oldEnd = new Date(event.task.scheduled_end_at);
      const target = parseDay(targetDay);
      target.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      const end = new Date(target.getTime() + oldEnd.getTime() - oldStart.getTime());
      try {
        await setOrderServiceTaskSchedule({ itemId: event.id,
          startAt: target.toISOString(), endAt: end.toISOString() });
        setTaskSchedules(current => current.map(task => task.item_id === event.id ? {
          ...task, scheduled_start_at: target.toISOString(), scheduled_end_at: end.toISOString(),
        } : task));
        onToast("Serviço reagendado.", "success");
        void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      } catch (error) {
        onToast(`Não foi possível reagendar o serviço: ${systemErrorMessage(error)}`, "error");
      }
      return;
    }
    if (event.kind === "appointment") {
      try {
        await updateAppointmentDate(organizationId, event.id, targetDay);
        setAppointments(current => current.map(item => item.id === event.id ? { ...item, appointment_date: targetDay } : item));
        onToast("Agendamento atualizado.", "success");
        void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      } catch (error) {
        onToast(`Não foi possível mover o agendamento: ${systemErrorMessage(error)}`, "error");
      }
      return;
    }

    const oldDate = new Date(event.order.scheduled_at);
    const next = parseDay(targetDay);
    next.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    try {
      await updateServiceOrderSchedule(organizationId, event.order.id, next.toISOString());
      const originalEnd = event.order.scheduled_end_at
        ? new Date(event.order.scheduled_end_at).getTime()
        : oldDate.getTime() + 60 * 60_000;
      const newEnd = new Date(next.getTime() + Math.max(30 * 60_000, originalEnd - oldDate.getTime())).toISOString();
      setOrders(current => current.map(item => item.id === event.order.id ? {
        ...item, scheduled_at: next.toISOString(), scheduled_end_at: newEnd,
      } : item));
      onToast("Agendamento atualizado.", "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    } catch (error) {
      onToast(`Não foi possível mover a OS: ${systemErrorMessage(error)}`, "error");
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
    myEmployeeId,
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
