import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  defaultWorkWeek, loadEmployeeWorkWeek, normaliseIntervals, saveEmployeeWorkWeek,
  validWorkIntervals, WEEKDAY_LABELS, type EmployeeWeekday,
  type WorkInterval,
} from "@/features/appointments/infrastructure/employee-agenda.repository";

export function EmployeeAgendaSection({ organizationId, employeeId, canManage, personal = false, onSaved }: {
  organizationId: string | null;
  employeeId?: string | null;
  canManage: boolean;
  personal?: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<EmployeeWeekday[]>(defaultWorkWeek);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !employeeId || !organizationId) return;
    let cancelled = false;
    setLoading(true); setError("");
    void loadEmployeeWorkWeek(organizationId, employeeId)
      .then(value => { if (!cancelled) setDays(value); })
      .catch(cause => { if (!cancelled) setError(systemErrorMessage(cause, "Não foi possível carregar a agenda.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, organizationId, employeeId]);

  const update = (weekday: number, values: Partial<EmployeeWeekday>) =>
    setDays(current => current.map(day => day.weekday === weekday ? { ...day, ...values } : day));
  const updateInterval = (weekday: number, index: number, patch: Partial<WorkInterval>) =>
    setDays(current => current.map(day => day.weekday === weekday ? {
      ...day,
      work_intervals: day.work_intervals.map((period, i) => i === index ? { ...period, ...patch } : period),
    } : day));
  const removeInterval = (weekday: number, index: number) =>
    setDays(current => current.map(day => day.weekday === weekday ? {
      ...day,
      work_intervals: day.work_intervals.filter((_, i) => i !== index),
    } : day));
  const addInterval = (weekday: number) =>
    setDays(current => current.map(day => day.weekday === weekday ? {
      ...day,
      work_intervals: [...day.work_intervals, { start_time: "12:00", end_time: "18:00" }],
    } : day));

  const save = async () => {
    if (!organizationId || !employeeId || saving) return;
    const prepared = days.map(day => ({ ...day, work_intervals: normaliseIntervals(day.work_intervals) }));
    const badDay = prepared.find(day => (day.is_available && day.work_intervals.length === 0)
      || !validWorkIntervals(day.work_intervals));
    if (badDay) {
      setError(`Verifique os períodos de ${WEEKDAY_LABELS[badDay.weekday]}. Os horários não podem se sobrepor e o término deve ser posterior ao início.`);
      return;
    }
    setSaving(true); setError("");
    try {
      await saveEmployeeWorkWeek(organizationId, employeeId, prepared);
      notifyAdmin(personal ? "Seus horários foram atualizados." : "Agenda semanal do funcionário atualizada.", "success");
      onSaved?.();
      setOpen(false);
    } catch (cause) { setError(systemErrorMessage(cause, "Não foi possível salvar a agenda.")); }
    finally { setSaving(false); }
  };

  if (!canManage || !employeeId) return null;
  return <>
    <AdminButton variant={personal ? "tertiary" : "secondary"} size="sm" onClick={() => { setLoading(true); setError(""); setOpen(true); }}
      aria-label={personal ? "Meus horários" : "Configurar agenda do funcionário"}
      title={personal ? "Meus horários" : "Agenda"}
      className={personal ? "h-10 w-full rounded-lg px-3 text-xs md:h-9 md:w-auto" : "h-9 px-2.5 sm:px-3"}>
      {personal ? <><CalendarDays size={14} className="shrink-0" aria-hidden="true" /> Meus horários</> : <><CalendarDays size={15} /><span className="hidden sm:inline">Agenda</span></>}
    </AdminButton>
    <AdminDialog open={open} onClose={() => { if (!saving) setOpen(false); }}
      title={personal ? "Meus horários" : "Agenda semanal do técnico"}
      description={personal
        ? "Escolha os dias e períodos em que você está disponível. Fora desses horários, a Agenda não oferecerá novos agendamentos para você."
        : "Cadastre um ou mais períodos por dia, por exemplo 08:00–10:00 e 12:00–18:00. Os intervalos ficam indisponíveis para agendamentos."}
      className="max-w-2xl" minimizable={!saving}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary disabled={saving} onClick={() => setOpen(false)}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={loading} loading={saving} loadingText="Salvando..." onClick={() => void save()}>{personal ? "Salvar horários" : "Salvar agenda"}</BtnPrimary>
      </div>}>
      {loading ? <div className="flex min-h-[340px] items-center justify-center"><LoadingState text="Carregando horários..." /></div> :
        <div className="space-y-3">
          {days.map(day => <div key={day.weekday} className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input type="checkbox" checked={day.is_available} className="h-4 w-4 accent-emerald-600"
                  onChange={e => update(day.weekday, {
                    is_available: e.target.checked,
                    work_intervals: e.target.checked && day.work_intervals.length === 0
                      ? [{ start_time: "08:00", end_time: "18:00" }]
                      : day.work_intervals,
                  })} />
                {WEEKDAY_LABELS[day.weekday]}
              </label>
              {day.is_available && <BtnSecondary onClick={() => addInterval(day.weekday)} disabled={day.work_intervals.length >= 12}>
                <Plus size={14} className="mr-1 inline" />Período
              </BtnSecondary>}
            </div>
            {day.is_available ? <div className="space-y-2">
              {day.work_intervals.map((period, index) => <div key={index} className="flex flex-wrap items-end gap-2 pl-1">
                <label className="min-w-0 flex-1 text-[11px] font-semibold text-muted-foreground">
                  Início
                  <input type="time" value={period.start_time}
                    onChange={e => updateInterval(day.weekday, index, { start_time: e.target.value })}
                    className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                </label>
                <label className="min-w-0 flex-1 text-[11px] font-semibold text-muted-foreground">
                  Término
                  <input type="time" value={period.end_time}
                    onChange={e => updateInterval(day.weekday, index, { end_time: e.target.value })}
                    className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                </label>
                <button type="button" onClick={() => removeInterval(day.weekday, index)}
                  aria-label={`Excluir período ${index + 1} de ${WEEKDAY_LABELS[day.weekday]}`}
                  title="Excluir período" className="admin-semantic-error flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors hover:brightness-95">
                  <Trash2 size={16} />
                </button>
              </div>)}
              {!validWorkIntervals(day.work_intervals) && <p className="text-xs font-medium text-red-700 dark:text-red-300">Corrija os horários sobrepostos ou inválidos.</p>}
              {day.work_intervals.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Adicione ao menos um período.</p>}
            </div> : <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Indisponível para agendamentos.</p>}
          </div>)}
          {error && <p role="alert" className="admin-semantic-error rounded-lg border p-3 text-xs font-semibold">{error}</p>}
        </div>}
    </AdminDialog>
  </>;
}
