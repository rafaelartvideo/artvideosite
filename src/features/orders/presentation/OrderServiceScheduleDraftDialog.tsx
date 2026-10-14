import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { TechnicianAvailabilityCalendar } from "@/features/appointments/presentation/TechnicianAvailabilityCalendar";
import type { OrderServiceTechnician } from "../infrastructure/order-service-tasks.repository";

export type ServiceScheduleDraft = {
  startAt: string;
  endAt: string;
  technicianIds: string[];
};

function saoPauloDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const read = (key: string) => values.find(part => part.type === key)?.value || "";
  return { date: read("year") + "-" + read("month") + "-" + read("day"), time: read("hour") + ":" + read("minute") };
}

function localToIso(date: string, time: string) {
  // O agendamento da Union usa horário de Brasília (sem horário de verão).
  return new Date(date + "T" + time + ":00-03:00").toISOString();
}

export function OrderServiceScheduleDraftDialog({
  open, organizationId, orderId, title, technicians, initial, onConfirm, onClose,
}: {
  open: boolean;
  organizationId: string;
  orderId: string;
  title: string;
  technicians: OrderServiceTechnician[];
  initial: ServiceScheduleDraft | null;
  onConfirm: (selection: ServiceScheduleDraft) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const from = initial ? saoPauloDate(initial.startAt) : { date: "", time: "" };
    const to = initial ? saoPauloDate(initial.endAt) : { date: "", time: "" };
    setDate(from.date);
    setStart(from.time);
    setEnd(to.time);
    setSelected(initial?.technicianIds || []);
  }, [open]); // Reiniciar somente ao abrir: seleção do calendário permanece editável.

  const selectedNames = useMemo(() => technicians
    .filter(technician => selected.includes(technician.id))
    .map(technician => technician.name), [selected, technicians]);

  const valid = Boolean(date && start && end && end > start && selected.length &&
    selected.every(id => technicians.some(person => person.id === id)));
  const confirm = () => {
    if (!valid) return;
    const startAt = localToIso(date, start);
    const endAt = localToIso(date, end);
    if (new Date(startAt).getTime() <= Date.now() || new Date(endAt) <= new Date(startAt)) return;
    onConfirm({ startAt, endAt, technicianIds: selected });
  };

  return <AdminDialog open={open} title="Agendar serviço" description={title} className="max-w-6xl"
    onClose={onClose} footer={<div className="flex w-full flex-wrap justify-end gap-2">
      <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary disabled={!valid} onClick={confirm}>Confirmar horário e técnicos</BtnPrimary>
    </div>}>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escolha um dia e horário disponível. Os técnicos marcados serão designados automaticamente ao serviço e a equipe ficará bloqueada enquanto houver agendamento.
      </p>
      <div className="max-w-60">
        <FInput label="Dia do agendamento" type="date" value={date}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setDate(event.target.value); setStart(""); setEnd(""); setSelected([]);
          }} />
      </div>
      <TechnicianAvailabilityCalendar
        organizationId={organizationId}
        technicians={technicians.map(person => ({ id: person.id, full_name: person.name }))}
        date={date || undefined}
        selectedStart={start}
        selectedEnd={end}
        selectedTechnicianIds={selected}
        exceptOrderId={orderId}
        onChooseStart={(selectedDate, time, technicianId) => {
          setDate(selectedDate);
          setStart(time);
          setEnd("");
          setSelected([technicianId]);
        }}
        onChooseEnd={(_selectedDate, time) => setEnd(time)}
        onToggleTechnician={technicianId => {
          setSelected(current => current.includes(technicianId)
            ? current.filter(id => id !== technicianId)
            : [...current, technicianId]);
          setEnd("");
        }}
      />
      {date && start && end && selected.length > 0 && <p className="text-sm font-semibold text-primary">
        {date.split("-").reverse().join("/")} · {start} às {end} · {selectedNames.join(", ")}
      </p>}
      {!technicians.length && <p className="text-sm text-muted-foreground">Nenhum técnico ativo disponível para agendamento.</p>}
    </div>
  </AdminDialog>;
}
