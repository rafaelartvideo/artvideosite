import type { DragEvent } from "react";
import { CalendarDays } from "lucide-react";
import { buildAgendaDays, dayKey, type AgendaView, type AppointmentWithRelations, type CalendarEvent } from "../application/agenda-calendar";
import { cn } from "@/shared/domain/formatters";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AgendaEventCard } from "./AgendaEventCard";

type Props = {
  loading: boolean;
  view: AgendaView;
  cursor: Date;
  events: CalendarEvent[];
  draggedEventId: string | null;
  onDraggedEventChange: (eventId: string | null) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenAppointment: (appointment: AppointmentWithRelations) => void;
  onDropEvent: (dataTransfer: DataTransfer, targetDay: string) => void;
};

export function AgendaCalendarView(props: Props) {
  const isToday = (date: Date) => dayKey(date) === dayKey(new Date());
  const eventsFor = (date: Date) => props.events.filter(event => event.date === dayKey(date));
  const monthFirstDay = new Date(props.cursor.getFullYear(), props.cursor.getMonth(), 1);
  const monthGrid = Array.from({ length: 42 }, (_, index) =>
    new Date(props.cursor.getFullYear(), props.cursor.getMonth(), 1 - monthFirstDay.getDay() + index),
  );
  const eventCard = (event: CalendarEvent) => <AgendaEventCard
    key={`${event.kind}-${event.id}`}
    event={event}
    draggedEventId={props.draggedEventId}
    onDraggedEventChange={props.onDraggedEventChange}
    onOpenOrder={props.onOpenOrder}
    onOpenAppointment={props.onOpenAppointment}
  />;
  const dropZoneProps = (date: Date) => ({
    onDragOver: (event: DragEvent<HTMLDivElement>) => event.preventDefault(),
    onDrop: (event: DragEvent<HTMLDivElement>) => props.onDropEvent(event.dataTransfer, dayKey(date)),
  });

  if (props.loading) return <LoadingState />;

  if (props.view === "agenda") {
    return <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8 bg-white shadow-sm">
      {props.events.length === 0
        ? <EmptyState icon={CalendarDays} title="Nenhum agendamento" message="As OS e agendamentos aparecerão aqui." />
        : props.events.map(event => <div key={`${event.kind}-${event.id}`} className="border-b border-[#0d1b2e]/5 p-3">{eventCard(event)}</div>)}
    </div>;
  }

  if (props.view === "day") {
    return <div className="min-h-[420px] rounded-xl border border-[#0d1b2e]/8 bg-white p-4" {...dropZoneProps(props.cursor)}>{eventsFor(props.cursor).map(eventCard)}</div>;
  }

  if (props.view === "week") {
    return <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white"><div className="grid min-w-[720px] grid-cols-7">
      {buildAgendaDays("week", props.cursor, 7).map(date => <div key={dayKey(date)} className="min-h-[420px] border-r border-[#0d1b2e]/8 last:border-r-0" {...dropZoneProps(date)}>
        <div className={cn("border-b border-[#0d1b2e]/8 p-2 text-center", isToday(date) && "bg-[#eef5ff]")}><p className="text-[10px] font-bold uppercase text-[#5a6a82]">{date.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-black", isToday(date) && "bg-[#0057e7] text-white")}>{date.getDate()}</p></div>
        <div className="p-1">{eventsFor(date).map(eventCard)}</div>
      </div>)}
    </div></div>;
  }

  return <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white">
    <div className="grid min-w-[720px] grid-cols-7 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <div key={day} className="py-2 text-center text-[10px] font-bold uppercase text-[#5a6a82]">{day}</div>)}</div>
    <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-b-xl">
      {monthGrid.map(date => {
        const adjacent = date.getMonth() !== props.cursor.getMonth();
        return <div key={dayKey(date)} className={cn("flex h-[150px] min-h-0 flex-col border-r border-b border-[#0d1b2e]/8 p-1", adjacent && "bg-[#f8fafc]", dayKey(date) === dayKey(props.cursor) && "bg-[#eef5ff] ring-1 ring-inset ring-[#0057e7]")} onDragOver={event => event.preventDefault()} onDrop={event => { if (!adjacent) props.onDropEvent(event.dataTransfer, dayKey(date)); }}>
          <div className="shrink-0"><p className={cn("mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold", isToday(date) ? "bg-[#0057e7] text-white" : adjacent ? "text-[#94a3b8]" : "text-[#5a6a82]")}>{date.getDate()}</p></div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">{adjacent ? null : eventsFor(date).map(eventCard)}</div>
        </div>;
      })}
    </div>
  </div>;
}
