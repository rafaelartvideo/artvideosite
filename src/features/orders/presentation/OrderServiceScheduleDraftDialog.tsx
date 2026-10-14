import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { TechnicianAvailabilityCalendar } from "@/features/appointments/presentation/TechnicianAvailabilityCalendar";
import { dayKey } from "@/features/appointments/application/agenda-calendar";
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
  open, organizationId, orderId, title, dialogTitle = "Agendar serviço", technicians, initial, lockedTechnicianIds, onConfirm, onClose,
}: {
  open: boolean;
  organizationId: string;
  orderId: string;
  title: string;
  dialogTitle?: string;
  technicians: OrderServiceTechnician[];
  initial: ServiceScheduleDraft | null;
  lockedTechnicianIds?: string[];
  onConfirm: (selection: ServiceScheduleDraft) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const teamLocked = lockedTechnicianIds !== undefined;
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  useEffect(() => {
    if (!open) return;
    const from = initial ? saoPauloDate(initial.startAt) : { date: "", time: "" };
    const to = initial ? saoPauloDate(initial.endAt) : { date: "", time: "" };
    setDate(from.date || dayKey(new Date()));
    setStart(from.time);
    setEnd(to.time);
    setSelected(teamLocked ? lockedTechnicianIds : initial?.technicianIds || []);
    setViewMode("day");
  }, [open]); // Reiniciar somente ao abrir: seleção do calendário permanece editável.

  const selectedNames = useMemo(() => technicians
    .filter(technician => selected.includes(technician.id))
    .map(technician => technician.name), [selected, technicians]);

  const changeDate = (nextDate: string) => {
    setDate(nextDate);
    setStart("");
    setEnd("");
    setSelected([]);
  };

  const valid = Boolean(date && start && end && end > start && selected.length &&
    selected.every(id => technicians.some(person => person.id === id)) &&
    new Date(date + "T" + start + ":00-03:00").getTime() > Date.now());
  const confirm = () => {
    if (!valid) return;
    const startAt = localToIso(date, start);
    const endAt = localToIso(date, end);
    if (new Date(startAt).getTime() <= Date.now() || new Date(endAt) <= new Date(startAt)) return;
    onConfirm({ startAt, endAt, technicianIds: selected });
  };

  return <AdminDialog open={open} title={dialogTitle} description={title}
    className="w-[calc(100vw-1.5rem)] max-w-4xl" bodyClassName="p-3 sm:p-4"
    onClose={onClose} footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
      <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary disabled={!valid} onClick={confirm}>Confirmar agendamento</BtnPrimary>
    </div>}>
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-[230px]">
          <FInput label="Dia do agendamento" type="date" min={dayKey(new Date())} value={date}
            onChange={(event: ChangeEvent<HTMLInputElement>) => changeDate(event.target.value)} />
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
      <TechnicianAvailabilityCalendar
        compact
        viewMode={viewMode}
        organizationId={organizationId}
        technicians={technicians.map(person => ({ id: person.id, full_name: person.name }))}
        date={date || undefined}
        selectedStart={start}
        selectedEnd={end}
        selectedTechnicianIds={selected}
        exceptOrderId={orderId || undefined}
        onChangeDate={changeDate}
        onChooseStart={(selectedDate, time, technicianId) => {
          setDate(selectedDate);
          setStart(time);
          setEnd("");
          setSelected(teamLocked ? lockedTechnicianIds : [technicianId]);
        }}
        onChooseEnd={(_selectedDate, time) => setEnd(time)}
        onToggleTechnician={teamLocked ? undefined : technicianId => {
          setSelected(current => current.includes(technicianId)
            ? current.filter(id => id !== technicianId)
            : [...current, technicianId]);
          setEnd("");
        }}
      />
      {teamLocked && lockedTechnicianIds.length === 0 && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
        A OS não possui técnicos responsáveis. Atribua a equipe antes de agendar.
      </p>}
      {date && start && end && selected.length > 0 && <p role="status" className="rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
        {date.split("-").reverse().join("/")} · {start} às {end} · {selectedNames.join(", ")}
      </p>}
    </div>
  </AdminDialog>;
}
