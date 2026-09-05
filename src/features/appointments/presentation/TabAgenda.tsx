import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { AppointmentWithRelations } from "../application/agenda-calendar";
import { useAgendaCalendar } from "../application/useAgendaCalendar";
import { useNewAppointment } from "../application/useNewAppointment";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { AgendaToolbar } from "./AgendaToolbar";
import { AgendaCalendarView } from "./AgendaCalendarView";
import { AppointmentDetailsDialog } from "./AppointmentDetailsDialog";
import { NewAppointmentDialog } from "./NewAppointmentDialog";

export function TabAgenda({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { user, hasPermission } = useAuth();
  const canViewAgenda = hasPermission("agenda.view");
  const canViewList = hasPermission("agenda.table.view");
  const canViewCalendar = hasPermission("agenda.calendar.view");
  const canViewDetails = hasPermission("agenda.details.view");
  const canCreate = hasPermission("agenda.create");
  const canReschedule = hasPermission("agenda.reschedule");
  const canOpenOrder = hasPermission("orders.details.view");
  const canViewOtherAgendas = hasPermission("agenda.view_others");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const agenda = useAgendaCalendar({ userId: user?.id ?? null, canView: canViewAgenda && (canViewList || canViewCalendar), canViewOthers: canViewOtherAgendas, onToast: (msg, type) => setToast({ msg, type }) });
  const newAppointment = useNewAppointment({ userId: user?.id ?? null, cursor: agenda.cursor, situations: agenda.appointmentSituations, situationsLoading: agenda.loading, technicians: agenda.technicians, onCreated: agenda.addAppointment, onToast: (msg, type) => setToast({ msg, type }) });

  useEffect(() => {
    if (!canViewCalendar && canViewList && agenda.view !== "list") agenda.setView("list");
    if (!canViewList && canViewCalendar && agenda.view === "list") agenda.setView("month");
  }, [canViewCalendar, canViewList, agenda.view]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (newAppointment.submodal) newAppointment.setSubmodal(null); else if (newAppointment.open) newAppointment.setOpen(false); else if (selectedAppointment) setSelectedAppointment(null); };
    document.addEventListener("keydown", closeOnEscape); return () => document.removeEventListener("keydown", closeOnEscape);
  }, [newAppointment.submodal, newAppointment.open, selectedAppointment]);

  if (!canViewAgenda) return null;
  const canViewCurrent = agenda.view === "list" ? canViewList : canViewCalendar;
  const safeOpenOrder = (id: string) => { if (canOpenOrder) onOpenOrder(id); };
  const toolbar = <AgendaToolbar view={agenda.view} cursor={agenda.cursor} search={agenda.search} technicianFilter={agenda.technicianFilter} statusFilter={agenda.statusFilter} situationFilter={agenda.situationFilter} serviceFilter={agenda.serviceFilter} employees={agenda.employees} statuses={agenda.statuses as any[]} situations={agenda.situations} services={agenda.services} generalServices={agenda.generalServices} canCreate={canCreate} onViewChange={view => { if ((view === "list" && canViewList) || (view !== "list" && canViewCalendar)) agenda.setView(view); }} onSearchChange={agenda.setSearch} onTechnicianFilterChange={agenda.setTechnicianFilter} onStatusFilterChange={agenda.setStatusFilter} onSituationFilterChange={agenda.setSituationFilter} onServiceFilterChange={agenda.setServiceFilter} onPrevious={() => agenda.moveCursor(-1)} onNext={() => agenda.moveCursor(1)} onToday={() => agenda.setCursor(new Date())} onNew={() => canCreate && newAppointment.openDialog()} />;

  return <>
    <div className="space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Agenda" actions={toolbar} />
      {canViewCurrent && <AgendaCalendarView loading={agenda.loading} view={agenda.view} cursor={agenda.cursor} events={agenda.calendarEvents} draggedEventId={canReschedule ? draggedEventId : null} onDraggedEventChange={canReschedule ? setDraggedEventId : () => undefined} onOpenOrder={safeOpenOrder} onOpenAppointment={appointment => { if (canViewDetails) setSelectedAppointment(appointment); }} onDropEvent={canReschedule ? agenda.dropEvent : () => undefined} />}
    </div>
    {canCreate && <NewAppointmentDialog controller={newAppointment} />}
    {canViewDetails && <AppointmentDetailsDialog appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} onOpenOrder={safeOpenOrder} />}
  </>;
}
