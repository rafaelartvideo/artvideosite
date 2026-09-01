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
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const canViewAgenda = hasPermission("agenda.view") || hasPermission("orders.view");
  const canViewOtherAgendas = hasPermission("agenda.view_others") ||
    hasPermission("agenda.view-other-users") ||
    hasPermission("employees.view");

  const agenda = useAgendaCalendar({
    userId: user?.id ?? null,
    canView: canViewAgenda,
    canViewOthers: canViewOtherAgendas,
    onToast: (msg, type) => setToast({ msg, type }),
  });
  const newAppointment = useNewAppointment({
    userId: user?.id ?? null,
    cursor: agenda.cursor,
    situations: agenda.appointmentSituations,
    situationsLoading: agenda.loading,
    technicians: agenda.technicians,
    onCreated: agenda.addAppointment,
    onToast: (msg, type) => setToast({ msg, type }),
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (newAppointment.submodal) newAppointment.setSubmodal(null);
      else if (newAppointment.open) newAppointment.setOpen(false);
      else if (selectedAppointment) setSelectedAppointment(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [newAppointment.submodal, newAppointment.open, selectedAppointment]);

  const toolbar = <AgendaToolbar
    view={agenda.view}
    cursor={agenda.cursor}
    search={agenda.search}
    technicianFilter={agenda.technicianFilter}
    statusFilter={agenda.statusFilter}
    situationFilter={agenda.situationFilter}
    serviceFilter={agenda.serviceFilter}
    employees={agenda.employees}
    statuses={agenda.statuses as any[]}
    situations={agenda.situations}
    services={agenda.services}
    generalServices={agenda.generalServices}
    canCreate={hasPermission("agenda.view")}
    onViewChange={agenda.setView}
    onSearchChange={agenda.setSearch}
    onTechnicianFilterChange={agenda.setTechnicianFilter}
    onStatusFilterChange={agenda.setStatusFilter}
    onSituationFilterChange={agenda.setSituationFilter}
    onServiceFilterChange={agenda.setServiceFilter}
    onPrevious={() => agenda.moveCursor(-1)}
    onNext={() => agenda.moveCursor(1)}
    onToday={() => agenda.setCursor(new Date())}
    onNew={newAppointment.openDialog}
  />;

  return <>
    <div className="space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Agenda" actions={toolbar} />
      <AgendaCalendarView
        loading={agenda.loading}
        view={agenda.view}
        cursor={agenda.cursor}
        events={agenda.calendarEvents}
        draggedEventId={draggedEventId}
        onDraggedEventChange={setDraggedEventId}
        onOpenOrder={onOpenOrder}
        onOpenAppointment={setSelectedAppointment}
        onDropEvent={agenda.dropEvent}
      />
    </div>
    <NewAppointmentDialog controller={newAppointment} />
    <AppointmentDetailsDialog
      appointment={selectedAppointment}
      onClose={() => setSelectedAppointment(null)}
      onOpenOrder={onOpenOrder}
    />
  </>;
}
