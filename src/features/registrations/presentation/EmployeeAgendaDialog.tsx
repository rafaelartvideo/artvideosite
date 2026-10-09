import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  defaultWorkWeek, loadEmployeeWorkWeek, saveEmployeeWorkWeek, WEEKDAY_LABELS,
  type EmployeeWeekday,
} from "@/features/appointments/infrastructure/employee-agenda.repository";

export function EmployeeAgendaSection({ organizationId, employeeId, canManage }: {
  organizationId: string | null; employeeId?: string | null; canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<EmployeeWeekday[]>(defaultWorkWeek);
  const [loading, setLoading] = useState(false);
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

  const update = (weekday: number, values: Partial<EmployeeWeekday>) => {
    setDays(current => current.map(day => day.weekday === weekday ? { ...day, ...values } : day));
  };

  const save = async () => {
    if (!organizationId || !employeeId || saving) return;
    setSaving(true); setError("");
    try {
      await saveEmployeeWorkWeek(organizationId, employeeId, days);
      notifyAdmin("Agenda semanal do funcionário atualizada.", "success");
      setOpen(false);
    } catch (cause) { setError(systemErrorMessage(cause, "Não foi possível salvar a agenda.")); }
    finally { setSaving(false); }
  };

  if (!canManage) return null;
  return <>
    <Section title="Agenda do funcionário" actions={<BtnSecondary disabled={!employeeId} onClick={() => setOpen(true)}><CalendarDays size={16} className="mr-2 inline" />Agenda</BtnSecondary>}>
      <p className="text-xs text-muted-foreground">Defina os dias e horários disponíveis para receber agendamentos de ordens de serviço.</p>
      {!employeeId && <p className="mt-2 text-xs font-semibold text-amber-700">Salve o cadastro do funcionário para configurar a agenda.</p>}
    </Section>
    <AdminDialog open={open} onClose={() => { if (!saving) setOpen(false); }} title="Agenda semanal" description="Horários verdes são disponibilizados para agendamento; dias desmarcados ficam indisponíveis." className="max-w-xl" minimizable={!saving}
      footer={<div className="flex justify-end gap-2"><BtnSecondary disabled={saving} onClick={() => setOpen(false)}>Cancelar</BtnSecondary><BtnPrimary disabled={loading || Boolean(error && days.length === 0)} loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar agenda</BtnPrimary></div>}>
      {loading ? <p className="text-sm text-muted-foreground">Carregando horários...</p> : <div className="space-y-2">
        {days.map(day => <div key={day.weekday} className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={day.is_available} onChange={e => update(day.weekday, { is_available: e.target.checked })} />
            {WEEKDAY_LABELS[day.weekday]}
          </label>
          <input aria-label={`Início ${WEEKDAY_LABELS[day.weekday]}`} type="time" disabled={!day.is_available} value={day.start_time} onChange={e => update(day.weekday, { start_time: e.target.value })} className="h-9 min-w-0 rounded-lg border border-border bg-background px-1.5 text-xs disabled:opacity-40" />
          <input aria-label={`Fim ${WEEKDAY_LABELS[day.weekday]}`} type="time" disabled={!day.is_available} value={day.end_time} onChange={e => update(day.weekday, { end_time: e.target.value })} className="h-9 min-w-0 rounded-lg border border-border bg-background px-1.5 text-xs disabled:opacity-40" />
        </div>)}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
      </div>}
    </AdminDialog>
  </>;
}
