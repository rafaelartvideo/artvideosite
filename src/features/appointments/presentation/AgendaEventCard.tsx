import type { DragEvent } from "react";
import { CalendarPlus } from "lucide-react";
import { eventLabel, type AppointmentWithRelations, type CalendarEvent } from "../application/agenda-calendar";

type Props = {
  event: CalendarEvent;
  draggedEventId: string | null;
  onDraggedEventChange: (eventId: string | null) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenAppointment: (appointment: AppointmentWithRelations) => void;
};

export function AgendaEventCard({ event, draggedEventId, onDraggedEventChange, onOpenOrder, onOpenAppointment }: Props) {
  const startDrag = (dragEvent: DragEvent<HTMLButtonElement>) => {
    onDraggedEventChange(event.id);
    dragEvent.dataTransfer.setData("text/calendar-event", JSON.stringify({ kind: event.kind, id: event.id }));
  };
  const openEvent = () => {
    if (draggedEventId === event.id) {
      onDraggedEventChange(null);
      return;
    }
    if (event.kind === "service_order") onOpenOrder(event.order.id);
    else onOpenAppointment(event.appointment);
  };

  if (event.kind === "service_order") {
    const { order } = event;
    return <button type="button" draggable onDragStart={startDrag} onClick={openEvent} className="mb-1 w-full rounded-md border-l-4 bg-white px-2 py-1.5 text-left shadow-sm hover:shadow-md" style={{ borderLeftColor: order.order_status?.color || "#0057e7" }} title={`${order.os_number || "OS"} - ${order.customer?.full_name || "Cliente"}`}><p className="truncate font-mono text-[10px] font-black text-[#0057e7]">{order.os_number || `OS #${order.id.slice(0, 8)}`}</p><p className="truncate text-[11px] font-semibold text-[#0d1b2e]">{order.customer?.full_name || "Cliente"}</p><p className="truncate text-[10px] text-[#5a6a82]">{eventLabel(order)} · {new Date(order.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></button>;
  }

  const { appointment } = event;
  return <button type="button" draggable onDragStart={startDrag} onClick={openEvent} className="mb-1 w-full rounded-md border-l-4 bg-[#f8fbff] px-2 py-1.5 text-left shadow-sm hover:shadow-md" style={{ borderLeftColor: appointment.situation?.color || "#00b4ff" }} title={appointment.description || "Agendamento"}><p className="flex items-center gap-1 truncate text-[10px] font-black text-[#0057e7]"><CalendarPlus size={11} /> Agendamento</p><p className="truncate text-[11px] font-semibold text-[#0d1b2e]">{appointment.customer?.full_name || "Cliente"}</p>{appointment.description && <p className="line-clamp-2 text-[10px] text-[#5a6a82]">{appointment.description}</p>}<p className="truncate text-[10px] text-[#5a6a82]">{appointment.period === "custom" ? `${appointment.start_time || ""} - ${appointment.end_time || ""}` : appointment.period}{appointment.is_return ? " · Retorno" : ""}</p>{appointment.service_order?.os_number && <p className="truncate text-[10px] font-semibold text-[#0057e7]">OS referenciada: {appointment.service_order.os_number}</p>}</button>;
}
