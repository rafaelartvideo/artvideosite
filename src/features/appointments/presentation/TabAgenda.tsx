import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { buildAgendaDays, dayKey, type AppointmentWithRelations } from "../application/agenda-calendar";
import { useAgendaCalendar } from "../application/useAgendaCalendar";
import { useNewAppointment } from "../application/useNewAppointment";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { AgendaToolbar } from "./AgendaToolbar";
import { AgendaCalendarView } from "./AgendaCalendarView";
import { AgendaEventCard } from "./AgendaEventCard";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { TechnicianAvailabilityCalendar } from "./TechnicianAvailabilityCalendar";
import { AppointmentDetailsDialog } from "./AppointmentDetailsDialog";
import { NewAppointmentDialog } from "./NewAppointmentDialog";

export function TabAgenda({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { user, hasPermission, activeOrganizationId } = useAuth();
  const navigate = useNavigate();
  const canViewAgenda = hasPermission("agenda.view");
  const canViewList = hasPermission("agenda.table.view");
  const canViewCalendar = hasPermission("agenda.calendar.view");
  const canViewDetails = hasPermission("agenda.details.view");
  const canCreate = hasPermission("agenda.create");
  const canReschedule = hasPermission("agenda.reschedule");
  const canOpenRegularOrder = hasPermission("orders.view") && hasPermission("orders.details.view");
  const canOpenTechnicianOrder = hasPermission("technician_panel.view");
  const canViewOtherAgendas = hasPermission("agenda.view_others");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const organizationId = activeOrganizationId || "";
  const agenda = useAgendaCalendar({ organizationId, userId: user?.id ?? null, canView: Boolean(organizationId) && canViewAgenda && (canViewList || canViewCalendar), canViewOthers: canViewOtherAgendas, onToast: (msg, type) => setToast({ msg, type }) });
  const newAppointment = useNewAppointment({ organizationId, userId: user?.id ?? null, cursor: agenda.cursor, situations: agenda.appointmentSituations, situationsLoading: agenda.loading, technicians: agenda.technicians, onCreated: agenda.addAppointment, onToast: (msg, type) => setToast({ msg, type }) });

  useEffect(() => {
    if (!canViewCalendar && canViewList && agenda.view !== "agenda") agenda.setView("agenda");
    if (!canViewList && canViewCalendar && agenda.view === "agenda") agenda.setView("month");
  }, [canViewCalendar, canViewList, agenda.view]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (newAppointment.submodal) newAppointment.setSubmodal(null); else if (newAppointment.open) newAppointment.setOpen(false); else if (selectedAppointment) setSelectedAppointment(null); };
    document.addEventListener("keydown", closeOnEscape); return () => document.removeEventListener("keydown", closeOnEscape);
  }, [newAppointment.submodal, newAppointment.open, selectedAppointment]);

  if (!canViewAgenda) return null;
  const canViewCurrent = agenda.view === "agenda" ? canViewList : canViewCalendar;
  const safeOpenOrder = (id: string) => {
    if (canOpenRegularOrder) onOpenOrder(id);
    else if (canOpenTechnicianOrder) navigate(`/admin/technician-panel/os/${encodeURIComponent(id)}`);
  };
  const openAppointment = (appointment: AppointmentWithRelations) => {
    // Técnicos sem acesso à OS administrativa entram pela tela restrita do próprio painel.
    // A consulta do painel valida a atribuição do técnico no banco de dados.
    if (!canOpenRegularOrder && canOpenTechnicianOrder && appointment.service_order_id) {
      safeOpenOrder(appointment.service_order_id);
    } else if (canViewDetails) {
      setSelectedAppointment(appointment);
    }
  };
  const weekDates = new Set(buildAgendaDays("week", agenda.cursor, 7).map(dayKey));
  const matchingWeekEvents = agenda.calendarEvents
    .filter(event => weekDates.has(event.date))
    .sort((first, second) => first.date.localeCompare(second.date));
  const searchText = agenda.search.trim().toLocaleLowerCase("pt-BR");
  const relatedTechnicians = new Set(matchingWeekEvents.flatMap(event => {
    if (event.kind === "service_order") {
      return [event.order.technician?.id, ...(event.order.technician_links || []).map((link: any) => link.employee_id)].filter(Boolean);
    }
    if (event.kind === "service_task") {
      return [event.task.assigned_employee_id, ...(event.task.assignees || []).map(link => link.employee_id)].filter(Boolean);
    }
    return [
      ...(event.appointment.appointment_technicians || []).map(link => link.employee_id),
      event.appointment.service_order?.technician?.id,
      ...(event.appointment.service_order?.technician_links || []).map((link: any) => link.employee_id),
    ].filter(Boolean);
  }));
  const visibleTechnicians = (canViewOtherAgendas ? agenda.technicians : agenda.technicians.filter(item => item.id === agenda.myEmployeeId))
    .filter(item => !searchText || item.full_name.toLocaleLowerCase("pt-BR").includes(searchText) || relatedTechnicians.has(item.id));
  const hasActiveFilters = Boolean(agenda.search.trim() || (canViewOtherAgendas && agenda.technicianFilter)
    || agenda.statusFilter || agenda.situationFilter || agenda.serviceFilter);
  const toolbar = <AgendaToolbar canViewOthers={canViewOtherAgendas} view={agenda.view} cursor={agenda.cursor} search={agenda.search} technicianFilter={agenda.technicianFilter} statusFilter={agenda.statusFilter} situationFilter={agenda.situationFilter} serviceFilter={agenda.serviceFilter} employees={agenda.employees} statuses={agenda.statuses as any[]} situations={agenda.situations} services={agenda.services} generalServices={agenda.generalServices} canCreate={canCreate} onViewChange={view => { if ((view === "agenda" && canViewList) || (view !== "agenda" && canViewCalendar)) agenda.setView(view); }} onSearchChange={agenda.setSearch} onTechnicianFilterChange={agenda.setTechnicianFilter} onStatusFilterChange={agenda.setStatusFilter} onSituationFilterChange={agenda.setSituationFilter} onServiceFilterChange={agenda.setServiceFilter} onPrevious={() => agenda.moveCursor(-1)} onNext={() => agenda.moveCursor(1)} onToday={() => agenda.setCursor(new Date())} onNew={() => canCreate && newAppointment.openDialog()} />;

  return <>
    <div className="space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <header className="min-w-0 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="shrink-0">
            <h1 className="text-2xl font-black leading-tight text-foreground">Agenda</h1>
          </div>
          <div className="min-w-0 flex-1 2xl:flex-initial">
            {toolbar}
          </div>
        </div>
      </header>
      {canViewCurrent && agenda.view === "availability" && <TechnicianAvailabilityCalendar
        organizationId={organizationId}
        technicians={visibleTechnicians}
        loadingTechnicians={agenda.loading}
        onNavigateWeek={agenda.moveCursor}
        onGoToToday={() => agenda.setCursor(new Date())}
        date={agenda.cursor.getFullYear() + "-" + String(agenda.cursor.getMonth() + 1).padStart(2, "0") + "-" + String(agenda.cursor.getDate()).padStart(2, "0")}
        technicianFilter={canViewOtherAgendas ? agenda.technicianFilter : agenda.myEmployeeId || "none"}
        onTechnicianFilterChange={canViewOtherAgendas ? agenda.setTechnicianFilter : undefined}
        onChooseStart={canCreate ? (date, start, employeeId) => newAppointment.openDialog(date, start, employeeId) : undefined}
      />}
      {canViewCurrent && agenda.view === "availability" && hasActiveFilters && <AdminCard className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-bold text-foreground">Agendamentos encontrados nesta semana ({matchingWeekEvents.length})</p>
          <p className="mt-1 text-xs text-muted-foreground">Busca, técnico, status, situação e serviço seguem os filtros da Agenda. Horários ocupados permanecem bloqueados mesmo quando um agendamento está oculto pelos filtros.</p>
        </div>
        {matchingWeekEvents.length
          ? matchingWeekEvents.map(event => <div key={event.kind + "-" + event.id} className="border-b border-border p-3 last:border-b-0">
              <AgendaEventCard event={event} draggedEventId={canReschedule ? draggedEventId : null}
                onDraggedEventChange={canReschedule ? setDraggedEventId : () => undefined}
                onOpenOrder={safeOpenOrder}
                onOpenAppointment={openAppointment} />
            </div>)
          : <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum agendamento corresponde aos filtros nesta semana.</p>}
      </AdminCard>}
      {canViewCurrent && agenda.view !== "availability" && <AgendaCalendarView loading={agenda.loading} view={agenda.view} cursor={agenda.cursor} events={agenda.calendarEvents} draggedEventId={canReschedule ? draggedEventId : null} onDraggedEventChange={canReschedule ? setDraggedEventId : () => undefined} onOpenOrder={safeOpenOrder} onOpenAppointment={openAppointment} onDropEvent={canReschedule ? agenda.dropEvent : () => undefined} />}
    </div>
    {canCreate && <NewAppointmentDialog controller={newAppointment} allowedTechnicianId={agenda.myEmployeeId} />}
    {canViewDetails && <AppointmentDetailsDialog appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} onOpenOrder={safeOpenOrder} />}
  </>;
}
