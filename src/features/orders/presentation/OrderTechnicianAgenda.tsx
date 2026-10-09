import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import {
  hhmm, loadEmployeeOccupiedIntervals, loadEmployeeWorkWeek, minutes,
  rangeAvailable, slotAvailable, type EmployeeWeekday, type OccupiedInterval,
} from "@/features/appointments/infrastructure/employee-agenda.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

function dateToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function OrderTechnicianAgenda({ form, employees, technicianIds, onTechniciansChange, onFieldChange, canAssign, editingOrderId }: {
  form: any; employees: any[]; technicianIds: string[]; onTechniciansChange: (ids: string[]) => void;
  onFieldChange: (field: string, value: any) => void; canAssign: boolean; editingOrderId?: string | null;
}) {
  const { activeOrganizationId } = useAuth();
  const selectedTechnicianId = technicianIds[0] || "";
  const selectedDate = String(form.scheduled_at || "").slice(0, 10) || dateToday();
  const selectedStart = String(form.scheduled_at || "").slice(11, 16);
  const selectedEnd = String(form.scheduled_end_at || "").slice(11, 16);
  const [workday, setWorkday] = useState<EmployeeWeekday | null>(null);
  const [blocks, setBlocks] = useState<OccupiedInterval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeOrganizationId || !selectedTechnicianId || !selectedDate) {
      setWorkday(null); setBlocks([]); return;
    }
    let cancelled = false;
    setLoading(true); setError(""); setWorkday(null); setBlocks([]);
    void Promise.all([
      loadEmployeeWorkWeek(activeOrganizationId, selectedTechnicianId),
      loadEmployeeOccupiedIntervals(activeOrganizationId, selectedTechnicianId, selectedDate, editingOrderId),
    ]).then(([week, occupied]) => {
      if (cancelled) return;
      setWorkday(week[new Date(`${selectedDate}T12:00:00`).getDay()]);
      setBlocks(occupied);
    }).catch(cause => { if (!cancelled) setError(systemErrorMessage(cause, "Não foi possível carregar a disponibilidade.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrganizationId, selectedTechnicianId, selectedDate, editingOrderId]);

  // Os extremos representam limites de intervalo, inclusive o término (ex.: 18:00).
  const slots = useMemo(() => {
    const intervals = workday?.work_intervals ?? [];
    const earliest = intervals.length ? Math.min(...intervals.map(i => minutes(i.start_time))) : 8 * 60;
    const latest = intervals.length ? Math.max(...intervals.map(i => minutes(i.end_time))) : 18 * 60;
    const lower = Math.max(0, Math.min(7 * 60, earliest - 30));
    const upper = Math.min(24 * 60 - 30, Math.max(20 * 60, latest + 30));
    const list: string[] = [];
    for (let value = Math.floor(lower / 30) * 30; value <= upper; value += 30) list.push(hhmm(value));
    return list;
  }, [workday]);

  const changeDate = (date: string) => {
    onFieldChange("scheduled_at", date ? `${date}T` : "");
    onFieldChange("scheduled_end_at", "");
  };

  const selectTechnician = (employeeId: string) => {
    onTechniciansChange(employeeId ? [employeeId, ...technicianIds.filter(id => id !== employeeId)] : []);
    onFieldChange("scheduled_at", "");
    onFieldChange("scheduled_end_at", "");
  };

  const clickTime = (time: string) => {
    if (!workday) return;
    const shouldSetEnd = selectedStart && !selectedEnd
      && minutes(time) > minutes(selectedStart)
      && rangeAvailable(workday, selectedStart, time, blocks, selectedDate);
    if (shouldSetEnd) {
      onFieldChange("scheduled_end_at", `${selectedDate}T${time}`);
      return;
    }
    if (slotAvailable(workday, time, blocks, selectedDate)) {
      onFieldChange("scheduled_at", `${selectedDate}T${time}`);
      onFieldChange("scheduled_end_at", "");
    }
  };

  return <div className="col-span-full space-y-3 rounded-xl border border-border p-4">
    <div>
      <p className="text-sm font-bold text-foreground">Disponibilidade do técnico</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Clique no horário de início e depois no horário de término. Todo o intervalo será reservado. O horário final pode ser 18:00.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <FSelect label="Técnico responsável pelo agendamento" required value={selectedTechnicianId} disabled={!canAssign}
        onChange={(e: any) => selectTechnician(e.target.value)}
        options={[{ value: "", label: "Selecione um técnico..." }, ...employees.filter(employee => employee.is_active !== false).map(employee => ({ value: employee.id, label: employee.full_name }))]} />
      <FInput label="Data do agendamento" required type="date" min={dateToday()} value={selectedDate} onChange={(e: any) => changeDate(e.target.value)} />
    </div>
    {!selectedTechnicianId ? <p className="text-xs font-semibold text-amber-700">Escolha o técnico para exibir sua disponibilidade.</p>
      : loading ? <p className="text-xs text-muted-foreground">Consultando agenda...</p>
      : error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>
      : workday ? <>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-700"><span className="h-3 w-3 rounded bg-emerald-500" />Disponível</span>
          <span className="flex items-center gap-1.5 text-red-700"><span className="h-3 w-3 rounded bg-red-500" />Indisponível</span>
          <span className="flex items-center gap-1.5 text-blue-700"><span className="h-3 w-3 rounded bg-blue-500" />Selecionado</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slots.map(time => {
            const canStart = slotAvailable(workday, time, blocks, selectedDate);
            const canEnd = Boolean(selectedStart && !selectedEnd
              && minutes(time) > minutes(selectedStart)
              && rangeAvailable(workday, selectedStart, time, blocks, selectedDate));
            const selectable = canStart || canEnd;
            const endOnly = !canStart && workday.work_intervals.some(period => period.end_time === time);
            const isEndpoint = time === selectedStart || time === selectedEnd;
            const inRange = Boolean(selectedEnd && selectedStart
              && minutes(time) >= minutes(selectedStart) && minutes(time) <= minutes(selectedEnd));
            return <button key={time} type="button" disabled={!selectable && !inRange}
              onClick={() => clickTime(time)} aria-pressed={inRange || isEndpoint}
              title={selectable ? (canEnd ? "Definir término" : "Definir início")
                : endOnly ? "Limite do expediente: selecione primeiro um início para poder terminar aqui"
                : "Horário indisponível ou fora do expediente"}
              className={`h-10 rounded-lg border px-2 text-xs font-bold transition-colors
                ${inRange || isEndpoint ? "border-blue-400 bg-blue-100 text-blue-900 ring-1 ring-blue-300"
                  : selectable ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : endOnly ? "cursor-not-allowed border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "cursor-not-allowed border-red-200 bg-red-50 text-red-700"}`}>
              {time}
            </button>;
          })}
        </div>
        {!workday.is_available && <p className="text-xs text-red-700">O técnico não possui expediente neste dia.</p>}
        {selectedStart && !selectedEnd && <p className="text-xs font-semibold text-blue-700">Início: {selectedStart}. Selecione agora o término (inclusive 18:00, se disponível).</p>}
        {selectedStart && selectedEnd && <p className="text-xs font-semibold text-blue-700">
          Reservado: {selectedDate.split("-").reverse().join("/")} das {selectedStart} às {selectedEnd}.
          Clique em outro horário verde para iniciar uma nova seleção.
        </p>}
        {!canAssign && <p className="text-xs text-amber-700">Sua permissão não permite trocar o técnico responsável.</p>}
      </> : null}
  </div>;
}
