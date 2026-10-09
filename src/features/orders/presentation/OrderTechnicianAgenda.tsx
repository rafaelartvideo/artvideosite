import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import {
  hhmm, loadEmployeeOccupiedIntervals, loadEmployeeWorkWeek, minutes,
  slotAvailable, type EmployeeWeekday, type OccupiedInterval,
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
  const selectedTime = String(form.scheduled_at || "").slice(11, 16);
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

  const slots = useMemo(() => {
    if (!workday) return [] as string[];
    const lower = workday.is_available ? Math.min(7 * 60, Math.max(0, minutes(workday.start_time) - 60)) : 8 * 60;
    const upper = workday.is_available ? Math.max(20 * 60, Math.min(24 * 60, minutes(workday.end_time) + 60)) : 18 * 60;
    const list: string[] = [];
    for (let value = Math.floor(lower / 30) * 30; value + 60 <= upper; value += 30) list.push(hhmm(value));
    return list;
  }, [workday]);

  const selectTechnician = (employeeId: string) => {
    onTechniciansChange(employeeId ? [employeeId, ...technicianIds.filter(id => id !== employeeId)] : []);
    onFieldChange("scheduled_at", "");
  };

  return <div className="col-span-full space-y-3 rounded-xl border border-border p-4">
    <div>
      <p className="text-sm font-bold text-foreground">Disponibilidade do técnico</p>
      <p className="mt-1 text-xs text-muted-foreground">Selecione um técnico e depois um horário verde. Cada OS ocupa 60 minutos.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <FSelect label="Técnico responsável pelo agendamento" required value={selectedTechnicianId} disabled={!canAssign}
        onChange={(e: any) => selectTechnician(e.target.value)}
        options={[{ value: "", label: "Selecione um técnico..." }, ...employees.filter(employee => employee.is_active !== false).map(employee => ({ value: employee.id, label: employee.full_name }))]} />
      <FInput label="Data do agendamento" required type="date" min={dateToday()} value={selectedDate} onChange={(e: any) => onFieldChange("scheduled_at", e.target.value ? `${e.target.value}T` : "")} />
    </div>
    {!selectedTechnicianId ? <p className="text-xs font-semibold text-amber-700">Escolha o técnico para exibir sua disponibilidade.</p>
      : !canAssign ? <p className="text-xs text-amber-700">Seu acesso não permite alterar o técnico responsável.</p>
      : loading ? <p className="text-xs text-muted-foreground">Consultando agenda...</p>
      : error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>
      : workday ? <>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-700"><span className="h-3 w-3 rounded bg-emerald-500" />Disponível</span>
          <span className="flex items-center gap-1.5 text-red-700"><span className="h-3 w-3 rounded bg-red-500" />Indisponível</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slots.map(time => {
            const free = slotAvailable(workday, time, blocks, selectedDate);
            const isSelected = selectedTime === time;
            return <button key={time} type="button" disabled={!free} onClick={() => onFieldChange("scheduled_at", `${selectedDate}T${time}`)}
              aria-pressed={isSelected}
              title={free ? "Agendar neste horário" : "Horário ocupado, passado ou fora do expediente"}
              className={`h-10 rounded-lg border px-2 text-xs font-bold transition-colors ${free ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "cursor-not-allowed border-red-200 bg-red-50 text-red-700"} ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}`}>
              {time}
            </button>;
          })}
        </div>
        {slots.length === 0 && <p className="text-xs text-red-700">O técnico não possui expediente configurado neste dia.</p>}
        {selectedTime && <p className="text-xs font-semibold text-foreground">Selecionado: {selectedDate.split("-").reverse().join("/")} às {selectedTime}</p>}
      </> : null}
  </div>;
}
