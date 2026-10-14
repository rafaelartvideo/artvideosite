import { useEffect, useState } from "react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { TechnicianAvailabilityCalendar } from "@/features/appointments/presentation/TechnicianAvailabilityCalendar";
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
  useEffect(() => {
    if (!open) return;
    const from = localParts(scheduledStart);
    const to = localParts(scheduledEnd);
    setDate(from.date);
    setStart(from.start);
    setEnd(to.start);
  }, [open, itemId, scheduledStart, scheduledEnd]);

  const technicianIds = technicians.map(person => person.id);
  const canSave = Boolean(technicianIds.length && date && start && end && end > start && !saving);
  const submit = () => {
    if (!canSave) return;
    // Mesma regra de horário local usada no calendário existente do CRM.
    const from = new Date(date + "T" + start + ":00");
    const to = new Date(date + "T" + end + ":00");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return;
    onSave(from.toISOString(), to.toISOString());
  };

  return <AdminDialog open={open} onClose={() => { if (!saving) onClose(); }}
    title="Agendar serviço" description={title} className="max-w-6xl"
    footer={<div className="flex w-full flex-wrap justify-end gap-2">
      {Boolean(scheduledStart) && <BtnSecondary disabled={saving} onClick={() => onSave(null, null)}>
        Remover agendamento
      </BtnSecondary>}
      <BtnSecondary disabled={saving} onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary disabled={!canSave} loading={saving} onClick={submit}>Confirmar horário</BtnPrimary>
    </div>}>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Este horário pertence somente a este serviço. A OS pode ter outros serviços em dias e horários diferentes.
      </p>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Técnicos responsáveis</p>
        {technicians.length
          ? <p className="text-sm font-semibold text-foreground">{technicians.map(person => person.name).join(", ")}</p>
          : <p className="text-sm text-amber-700 dark:text-amber-300">
              Vincule um técnico ao serviço em Produtos e Serviços antes de agendar.
            </p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Para mudar a equipe, utilize Editar em Técnicos responsáveis.
        </p>
      </div>
      <div className="max-w-[240px]">
        <FInput label="Data" type="date" value={date} onChange={event => {
          setDate(event.target.value); setStart(""); setEnd("");
        }} />
      </div>
      {technicians.length > 0 && <TechnicianAvailabilityCalendar
        organizationId={organizationId}
        technicians={technicians.map(person => ({ id: person.id, full_name: person.name }))}
        date={date || undefined}
        selectedStart={start}
        selectedEnd={end}
        selectedTechnicianIds={technicianIds}
        exceptOrderId={orderId}
        exceptTaskId={itemId}
        onChooseStart={(selectedDate, time) => {
          setDate(selectedDate); setStart(time); setEnd("");
        }}
        onChooseEnd={(_selectedDate, time) => setEnd(time)}
      />}
      {start && end && <p className="text-xs font-semibold text-primary">
        {date.split("-").reverse().join("/")} · {start} às {end} · {technicians.length} técnico(s)
      </p>}
    </div>
  </AdminDialog>;
}
