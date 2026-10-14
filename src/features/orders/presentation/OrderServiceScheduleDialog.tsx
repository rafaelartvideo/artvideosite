import { useEffect, useState } from "react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { TechnicianAvailabilityCalendar } from "@/features/appointments/presentation/TechnicianAvailabilityCalendar";
import { dayKey } from "@/features/appointments/application/agenda-calendar";
import type { OrderServiceTechnician } from "../infrastructure/order-service-tasks.repository";

const localParts = (value: string | null | undefined) => {
  if (!value) return { date: "", start: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", start: "" };
  const fields = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => fields.find(field => field.type === type)?.value || "";
  return { date: [part("year"), part("month"), part("day")].join("-"),
    start: [part("hour"), part("minute")].join(":") };
};

export function OrderServiceScheduleDialog({
  open, title, organizationId, orderId, itemId, technicians,
  scheduledStart, scheduledEnd, saving, onSave, onClose,
}: {
  open: boolean;
  title: string;
  organizationId: string;
  orderId: string;
  itemId: string;
  technicians: OrderServiceTechnician[];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  saving: boolean;
  onSave: (start: string | null, end: string | null) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  useEffect(() => {
    if (!open) return;
    const from = localParts(scheduledStart);
    const to = localParts(scheduledEnd);
    setDate(from.date || dayKey(new Date()));
    setStart(from.start);
    setEnd(to.start);
    setViewMode("day");
  }, [open, itemId, scheduledStart, scheduledEnd]);

  const changeDate = (nextDate: string) => { setDate(nextDate); setStart(""); setEnd(""); };
  const technicianIds = technicians.map(person => person.id);
  const canSave = Boolean(technicianIds.length && date && start && end && end > start && !saving &&
    new Date(date + "T" + start + ":00-03:00").getTime() > Date.now());
  const submit = () => {
    if (!canSave) return;
    // Mesma regra de horário local usada no calendário existente do CRM.
    const from = new Date(date + "T" + start + ":00-03:00");
    const to = new Date(date + "T" + end + ":00-03:00");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return;
    onSave(from.toISOString(), to.toISOString());
  };

  return <AdminDialog open={open} onClose={() => { if (!saving) onClose(); }}
    title={scheduledStart ? "Reagendar serviço" : "Agendar serviço"} description={title}
    className="w-[calc(100vw-1.5rem)] max-w-4xl" bodyClassName="p-3 sm:p-4"
    footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
      {Boolean(scheduledStart) && <BtnSecondary disabled={saving} onClick={() => onSave(null, null)}>
        Remover agendamento
      </BtnSecondary>}
      <BtnSecondary disabled={saving} onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary disabled={!canSave} loading={saving} onClick={submit}>Confirmar agendamento</BtnPrimary>
    </div>}>
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-[230px]">
          <FInput label="Dia do agendamento" type="date" min={dayKey(new Date())}
            value={date} onChange={event => changeDate(event.target.value)} />
        </div>
        <div role="group" aria-label="Visualização do calendário"
          className="inline-flex w-fit shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 sm:mb-0.5">
          <button type="button" aria-pressed={viewMode === "day"}
            onClick={() => setViewMode("day")}
            className={"rounded-md px-3.5 py-2 text-xs font-bold transition-colors " +
              (viewMode === "day" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Dia
          </button>
          <button type="button" aria-pressed={viewMode === "week"}
            onClick={() => setViewMode("week")}
            className={"rounded-md px-3.5 py-2 text-xs font-bold transition-colors " +
              (viewMode === "week" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Semana
          </button>
        </div>
      </div>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-bold text-foreground">Equipe responsável: </span>
        {technicians.length ? <span className="text-muted-foreground">{technicians.map(person => person.name).join(", ")}</span>
          : <span className="text-amber-700 dark:text-amber-300">
              Vincule um técnico ao serviço antes de agendar.
            </span>}
      </div>
      {technicians.length > 0 && <TechnicianAvailabilityCalendar
        compact
        viewMode={viewMode}
        organizationId={organizationId}
        technicians={technicians.map(person => ({ id: person.id, full_name: person.name }))}
        date={date || undefined}
        selectedStart={start}
        selectedEnd={end}
        selectedTechnicianIds={technicianIds}
        exceptOrderId={orderId}
        exceptTaskId={itemId}
        onChangeDate={changeDate}
        onChooseStart={(selectedDate, time) => {
          setDate(selectedDate); setStart(time); setEnd("");
        }}
        onChooseEnd={(_selectedDate, time) => setEnd(time)}
      />}
      {date && start && end && <p role="status" className="rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
        {date.split("-").reverse().join("/")} · {start} às {end} · {technicians.length} técnico{technicians.length === 1 ? "" : "s"}
      </p>}
    </div>
  </AdminDialog>;
}
