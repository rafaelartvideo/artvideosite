import { useState, type DragEvent } from "react";
import { CalendarDays } from "lucide-react";
import { buildAgendaDays, dayKey, type AgendaView, type AppointmentWithRelations, type CalendarEvent } from "../application/agenda-calendar";
import { cn } from "@/shared/domain/formatters";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { AgendaEventCard } from "./AgendaEventCard";

type Props = {
  loading: boolean;
  compactModal?: boolean;
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const isToday = (date: Date) => dayKey(date) === dayKey(new Date());
  const eventsFor = (date: Date) => props.events.filter(event => event.date === dayKey(date));
  const monthFirstDay = new Date(props.cursor.getFullYear(), props.cursor.getMonth(), 1);
  const monthGrid = Array.from({ length: 42 }, (_, index) =>
    new Date(props.cursor.getFullYear(), props.cursor.getMonth(), 1 - monthFirstDay.getDay() + index),
  );
  const selectedDate = monthGrid.find(date => date.getMonth() === props.cursor.getMonth() && dayKey(date) === selectedDay);
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
    return <AdminCard>
      {props.events.length === 0
        ? <EmptyState icon={CalendarDays} title="Nenhum agendamento" message="As OS e agendamentos aparecerão aqui." />
        : props.events.map(event => <div key={`${event.kind}-${event.id}`} className="border-b border-[#0d1b2e]/5 p-3 last:border-b-0">{eventCard(event)}</div>)}
    </AdminCard>;
  }

  if (props.view === "day") {
    return <AdminCard className="min-h-[320px] p-3 sm:min-h-[420px] sm:p-4" {...dropZoneProps(props.cursor)}>{eventsFor(props.cursor).map(eventCard)}</AdminCard>;
  }

  if (props.view === "week") {
    const days = buildAgendaDays("week", props.cursor, 7);
    return <>
      <div className="space-y-2 md:hidden">{days.map(date => {
        const dayEvents = eventsFor(date);
        return <AdminCard key={dayKey(date)} className={cn("p-0", isToday(date) && "ring-1 ring-[#0057e7]/40")} {...dropZoneProps(date)}>
          <div className={cn("flex items-center justify-between border-b border-[#0d1b2e]/8 px-3 py-2.5", isToday(date) && "bg-[#eef5ff]")}>
            <div className="flex items-center gap-2"><span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", isToday(date) ? "bg-[#0057e7] text-white" : "bg-[#f5f7fa] text-[#0d1b2e]")}>{date.getDate()}</span><div><p className="text-xs font-bold capitalize text-[#0d1b2e]">{date.toLocaleDateString("pt-BR", { weekday: "long" })}</p><p className="text-[10px] text-[#5a6a82]">{date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p></div></div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">{dayEvents.length}</span>
          </div>
          <div className="space-y-1.5 p-2.5">{dayEvents.length ? dayEvents.map(eventCard) : <p className="py-2 text-center text-[11px] text-[#8a96a8]">Sem agendamentos</p>}</div>
        </AdminCard>;
      })}</div>
      <AdminCard className="hidden overflow-x-auto md:block"><div className="grid min-w-[720px] grid-cols-7">
        {days.map(date => <div key={dayKey(date)} className="min-h-[420px] border-r border-[#0d1b2e]/8 last:border-r-0" {...dropZoneProps(date)}>
          <div className={cn("border-b border-[#0d1b2e]/8 p-2 text-center", isToday(date) && "bg-[#eef5ff]")}><p className="text-[10px] font-bold uppercase text-[#5a6a82]">{date.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-black", isToday(date) && "bg-[#0057e7] text-white")}>{date.getDate()}</p></div>
          <div className="p-1">{eventsFor(date).map(eventCard)}</div>
        </div>)}
      </div></AdminCard>
    </>;
  }

  return <>
    <AdminCard className="p-0 md:hidden">
      <div className="grid grid-cols-7 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">{["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <div key={`${day}-${index}`} className="py-2 text-center text-[9px] font-bold uppercase text-[#5a6a82]">{day}</div>)}</div>
      <div className="grid grid-cols-7">{monthGrid.map(date => {
        const adjacent = date.getMonth() !== props.cursor.getMonth();
        const dayEvents = adjacent ? [] : eventsFor(date);
        return <button type="button" key={dayKey(date)} onClick={() => setSelectedDay(dayKey(date))} disabled={adjacent} aria-label={`Ver agendamentos de ${date.toLocaleDateString("pt-BR")}`} aria-pressed={selectedDay === dayKey(date)} className={cn("relative min-w-0 border-r border-b border-border p-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", props.compactModal ? "min-h-[44px]" : "min-h-[54px]", adjacent && "bg-muted/35", dayKey(date) === dayKey(props.cursor) && "bg-primary/10", selectedDay === dayKey(date) && "ring-2 ring-inset ring-amber-400")}>
          <span className={cn("mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", isToday(date) ? "bg-[#0057e7] text-white" : adjacent ? "text-[#b0bac8]" : "text-[#5a6a82]")}>{date.getDate()}</span>
          {!adjacent && dayEvents.length > 0 && <div className="mt-1 flex justify-center"><span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[9px] font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">{dayEvents.length}</span></div>}
        </button>;
      })}</div>
    </AdminCard>
    <AdminCard className="hidden overflow-x-auto md:block">
      <div className="grid min-w-[720px] grid-cols-7 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <div key={day} className="py-2 text-center text-[10px] font-bold uppercase text-[#5a6a82]">{day}</div>)}</div>
      <div className="grid min-w-[720px] grid-cols-7 overflow-hidden">
        {monthGrid.map(date => {
          const adjacent = date.getMonth() !== props.cursor.getMonth();
          return <div key={dayKey(date)} className={cn("flex min-h-0 flex-col border-r border-b border-[#0d1b2e]/8 p-1", props.compactModal ? "h-[clamp(70px,10dvh,100px)]" : "h-[150px]", adjacent && "bg-[#f8fafc]", dayKey(date) === dayKey(props.cursor) && "bg-[#eef5ff] ring-1 ring-inset ring-[#0057e7]")} onDragOver={event => event.preventDefault()} onDrop={event => { if (!adjacent) props.onDropEvent(event.dataTransfer, dayKey(date)); }}>
            <div className="shrink-0"><button type="button" disabled={adjacent} onClick={() => setSelectedDay(dayKey(date))} aria-label={`Ver agendamentos de ${date.toLocaleDateString("pt-BR")}`} aria-pressed={selectedDay === dayKey(date)} className={cn("mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", isToday(date) ? "bg-primary text-white" : adjacent ? "text-muted-foreground" : "text-foreground", selectedDay === dayKey(date) && "ring-2 ring-amber-400")}>{date.getDate()}</button>{!adjacent && eventsFor(date).length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">{eventsFor(date).length}</span>}</div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">{adjacent ? null : eventsFor(date).map(eventCard)}</div>
          </div>;
        })}
      </div>
    </AdminCard>
    {selectedDate && <AdminCard className="min-w-0 space-y-2 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <h3 className="text-sm font-bold capitalize text-foreground">{selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h3>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">{eventsFor(selectedDate).length}</span>
      </div>
      {eventsFor(selectedDate).length > 0
        ? <div className="space-y-2">{eventsFor(selectedDate).map(eventCard)}</div>
        : <p className="py-4 text-center text-xs text-muted-foreground">Nenhum agendamento neste dia.</p>}
    </AdminCard>}
  </>;
}
