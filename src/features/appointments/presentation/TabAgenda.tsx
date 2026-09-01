import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  loadAgendaData,
  updateAppointmentDate,
  updateServiceOrderSchedule,
} from "../infrastructure/appointments.repository";
import type {
  AppointmentSituation,
} from "@/lib/database.types";
import {
  dayKey,
  eventDay,
  filterAgendaData,
  parseDay,
  type AppointmentWithRelations,
  type CalendarEvent,
} from "@/features/appointments/application/agenda-calendar";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { AppointmentDetailsDialog } from "./AppointmentDetailsDialog";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { useNewAppointment } from "../application/useNewAppointment";
import { AgendaToolbar, type AgendaView } from "./AgendaToolbar";
import { AgendaCalendarView } from "./AgendaCalendarView";

export function TabAgenda({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { user, hasPermission } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [view, setView] = useState<AgendaView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [situationFilter, setSituationFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const canViewAgenda = hasPermission("agenda.view") || hasPermission("orders.view");
  const canViewOtherAgendas = hasPermission("agenda.view_others") || hasPermission("agenda.view-other-users") || hasPermission("employees.view");
  const queryClient = useQueryClient();
  const agendaQuery = useQuery({
    queryKey: queryKeys.appointments.list({
      userId: user?.id ?? null,
      canViewOtherAgendas,
    }),
    queryFn: () => loadAgendaData({
      userId: user?.id ?? null,
      canViewOtherAgendas,
    }),
    enabled: canViewAgenda,
  });
  const loading = canViewAgenda && agendaQuery.isPending;
  const appointmentSituationsLoading = loading;
  const employees = agendaQuery.data?.employees ?? [];
  const services = agendaQuery.data?.services ?? [];
  const generalServices = agendaQuery.data?.generalServices ?? [];
  const situations = agendaQuery.data?.situations ?? [];
  const appointmentSituations = (agendaQuery.data?.appointmentSituations ?? []) as AppointmentSituation[];
  const appointmentTechnicians = employees as { id: string; full_name: string }[];
  const myEmployeeId = agendaQuery.data?.myEmployeeId ?? null;

  const newAppointment = useNewAppointment({
    userId: user?.id ?? null,
    cursor,
    situations: appointmentSituations,
    situationsLoading: appointmentSituationsLoading,
    technicians: appointmentTechnicians,
    onCreated: appointment => setAppointments(current => [...current, appointment]),
    onToast: (msg, type) => setToast({ msg, type }),
  });
  const {
    open: appointmentModalOpen,
    setOpen: setAppointmentModalOpen,
    submodal: appointmentSubmodal,
    setSubmodal: setAppointmentSubmodal,
    openDialog: openAppointmentModal,
  } = newAppointment;

  useEffect(() => {
    const data = agendaQuery.data;
    if (data) {
      setOrders(data.orders);
      setAppointments(data.appointments as AppointmentWithRelations[]);
    }
  }, [agendaQuery.data]);

  useEffect(() => {
    if (!agendaQuery.error) return;
    const message = agendaQuery.error instanceof Error ? agendaQuery.error.message : String(agendaQuery.error);
    setToast({ msg: `Erro ao carregar agenda: ${message}`, type: "error" });
  }, [agendaQuery.error]);
  useEffect(() => {
    if (!canViewOtherAgendas && myEmployeeId) {
      setTechnicianFilter(myEmployeeId);
    }
  }, [canViewOtherAgendas, myEmployeeId]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (appointmentSubmodal) setAppointmentSubmodal(null); else if (appointmentModalOpen) setAppointmentModalOpen(false); else if (selectedAppointment) setSelectedAppointment(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [appointmentSubmodal, appointmentModalOpen, selectedAppointment]);

  const effectiveTechnicianFilter = !canViewOtherAgendas ? myEmployeeId || "" : technicianFilter;
  const { calendarEvents } = filterAgendaData({
    orders,
    appointments,
    search,
    technicianFilter: effectiveTechnicianFilter,
    statusFilter,
    situationFilter,
    serviceFilter,
  });
  const statuses = Array.from(
    new Map(
      orders.flatMap(order => {
        const statusId = (order.order_status as any)?.id;
        return statusId ? [[statusId, order.order_status] as const] : [];
      })
    ).values()
  );
  const moveCursor = (amount: number) => {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else if (view === "week") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
  };
  const today = () => setCursor(new Date());
  const days = (count: number) => buildAgendaDays(view, cursor, count);
  const eventsFor = (date: Date) => calendarEvents.filter(event => event.date === dayKey(date));
  const updateEventDate = async (event: CalendarEvent | any, targetDay: string) => {
    if (!event.kind) {
      const legacyEvent: CalendarEvent = { kind: "service_order", id: event.id, date: eventDay(event), order: event };
      return updateEventDate(legacyEvent, targetDay);
    }
    if (event.kind === "appointment") {
      try {
        await updateAppointmentDate(event.id, targetDay);
        setAppointments(current => current.map(item => item.id === event.id ? { ...item, appointment_date: targetDay } : item));
        setToast({ msg: "Agendamento atualizado.", type: "success" });
        await queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setToast({ msg: `Não foi possível mover o agendamento: ${message}`, type: "error" });
      }
      return;
    }
    const order = event.order;
    const oldDate = new Date(order.scheduled_at);
    const next = parseDay(targetDay);
    next.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    try {
      await updateServiceOrderSchedule(order.id, next.toISOString());
      setOrders(current => current.map(item => item.id === order.id ? { ...item, scheduled_at: next.toISOString() } : item));
      setToast({ msg: "Agendamento atualizado.", type: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Não foi possível mover a OS: ${message}`, type: "error" });
    }
  };
  const dropCalendarEvent = (dataTransfer: DataTransfer, targetDay: string) => {
    const raw = dataTransfer.getData("text/calendar-event");
    if (!raw) return;
    try {
      const dropped = JSON.parse(raw) as { kind: CalendarEvent["kind"]; id: string };
      const event = calendarEvents.find(item => item.kind === dropped.kind && item.id === dropped.id);
      if (event) void updateEventDate(event, targetDay);
    } catch { setToast({ msg: "Não foi possível identificar o evento arrastado.", type: "error" }); }
  };
  const agendaToolbar = <AgendaToolbar
    view={view}
    cursor={cursor}
    search={search}
    technicianFilter={technicianFilter}
    statusFilter={statusFilter}
    situationFilter={situationFilter}
    serviceFilter={serviceFilter}
    employees={employees}
    statuses={statuses as any[]}
    situations={situations}
    services={services}
    generalServices={generalServices}
    canCreate={hasPermission("agenda.view")}
    onViewChange={setView}
    onSearchChange={setSearch}
    onTechnicianFilterChange={setTechnicianFilter}
    onStatusFilterChange={setStatusFilter}
    onSituationFilterChange={setSituationFilter}
    onServiceFilterChange={setServiceFilter}
    onPrevious={() => moveCursor(-1)}
    onNext={() => moveCursor(1)}
    onToday={today}
    onNew={openAppointmentModal}
  />;
  const appointmentDialog = <NewAppointmentDialog controller={newAppointment} />;
  const newAgendaView = <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Agenda" actions={agendaToolbar} />
    <AgendaCalendarView
      loading={loading}
      view={view}
      cursor={cursor}
      events={calendarEvents}
      draggedEventId={draggedEventId}
      onDraggedEventChange={setDraggedEventId}
      onOpenOrder={onOpenOrder}
      onOpenAppointment={setSelectedAppointment}
      onDropEvent={dropCalendarEvent}
    />
  </div>;
  return <>
    {newAgendaView}
    {appointmentDialog}
    <AppointmentDetailsDialog appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} onOpenOrder={onOpenOrder} />
  </>;
}

