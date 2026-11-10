import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Copy, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, BtnPrimary, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  ACCESS_WEEKDAYS, emptyEmployeeAccessHours, nextFreeAccessInterval,
  normalizeEmployeeAccessHours, validateEmployeeAccessHours,
  withAccessDayIntervals, type EmployeeAccessHours, type WeekdayNumber,
} from "../domain/employee-access-hours";
import { getEmployeeAccessHours, listEmployeeAccessHoursSources } from "../infrastructure/employee-access-hours.repository";

export function EmployeeAccessHoursDialog({ organizationId, employeeId, employeeName, stagedHours, canEdit, onClose, onSave }: {
  organizationId: string;
  employeeId: string | null;
  employeeName: string;
  stagedHours: EmployeeAccessHours | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (hours: EmployeeAccessHours) => Promise<void>;
}) {
  const [hours, setHours] = useState<EmployeeAccessHours>(() => stagedHours
    ? normalizeEmployeeAccessHours(stagedHours) : emptyEmployeeAccessHours());
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const detail = useQuery({
    queryKey: ["registrations", "crm-access-hours", organizationId, employeeId],
    queryFn: () => getEmployeeAccessHours(organizationId, employeeId!),
    enabled: Boolean(employeeId && !stagedHours),
  });
  const sources = useQuery({
    queryKey: ["registrations", "crm-access-hours-sources", organizationId],
    queryFn: () => listEmployeeAccessHoursSources(organizationId),
    enabled: Boolean(organizationId && canEdit),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (detail.data && !stagedHours) setHours(detail.data);
  }, [detail.data, stagedHours]);

  const invalid = validateEmployeeAccessHours(hours);
  const disabled = busy || copying || !canEdit;
  const intervalsFor = (weekday: WeekdayNumber) => hours.days.find(day => day.weekday === weekday)?.intervals || [];
  const replaceDay = (weekday: WeekdayNumber, intervals: {start:string;end:string}[]) => {
    setHours(current => withAccessDayIntervals(current, weekday, intervals));
    setError("");
    setInfo("");
  };
  const setEnabled = (weekday: WeekdayNumber, enabled: boolean) =>
    replaceDay(weekday, enabled ? [{ start: "08:00", end: "18:00" }] : []);
  const add = (weekday: WeekdayNumber) => {
    const next = nextFreeAccessInterval(intervalsFor(weekday));
    if (!next) { setError("Não foi possível encontrar outro horário livre neste dia."); return; }
    replaceDay(weekday, [...intervalsFor(weekday), next]);
  };
  const copySchedule = async () => {
    if (!sourceId || disabled) return;
    setCopying(true); setError("");
    try {
      setHours(await getEmployeeAccessHours(organizationId, sourceId));
      setInfo("Horários copiados para esta agenda. Salve para confirmar.");
    } catch (cause) {
      setError("Não foi possível copiar: " + systemErrorMessage(cause));
    } finally { setCopying(false); }
  };
  const save = async () => {
    if (disabled) return;
    const issue = validateEmployeeAccessHours(hours);
    if (issue) { setError(issue); return; }
    setBusy(true); setError("");
    try {
      await onSave(hours);
      onClose();
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar os horários."));
    } finally { setBusy(false); }
  };
  return <AdminDialog open title="Horários de acesso" description={employeeName || "Funcionário"}
    onClose={() => { if (!busy) onClose(); }}
    className="w-[min(97vw,1160px)] !max-w-[1160px]"
    bodyClassName="space-y-4 !p-3 sm:!p-5"
    footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" disabled={busy} onClick={onClose}>Voltar</AdminButton>
      {canEdit && <BtnPrimary loading={busy} loadingText="Salvando..." disabled={copying || Boolean(invalid) || Boolean(employeeId && !stagedHours && detail.isPending)}
        onClick={() => void save()}>Salvar horários</BtnPrimary>}
    </div>}>
    {employeeId && !stagedHours && detail.isPending ? <LoadingState text="Preparando agenda..." />
      : employeeId && !stagedHours && detail.isError
        ? <p role="alert" className="py-6 text-sm font-semibold text-destructive">{systemErrorMessage(detail.error)}</p>
        : <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <CalendarClock size={19} className="text-primary"/>
              <div>
                <p className="text-sm font-bold text-foreground">Restringir acesso por horários</p>
                <p className="text-xs text-muted-foreground">Desativado: acesso livre. Ativado: somente nos dias e horários selecionados.</p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
              <input type="checkbox" className="size-4 accent-primary" checked={hours.enabled} disabled={disabled}
                onChange={event => setHours(current => ({ ...current, enabled: event.target.checked }))}/>
              {hours.enabled ? "Ativado" : "Desativado"}
            </label>
          </div>
          {canEdit && <Section title="Copiar horários de outro funcionário" contentClassName="!p-3 sm:!p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Funcionário</p>
                <AdminSelect ariaLabel="Funcionário para copiar horários"
                  value={sourceId} onValueChange={setSourceId}
                  disabled={disabled || sources.isPending}
                  options={[{ value: "", label: sources.isPending ? "Carregando..." : "Selecione um funcionário" },
                    ...(sources.data || []).filter(item => item.employee_id !== employeeId)
                      .map(item => ({ value: item.employee_id, label: item.full_name + (!item.enabled ? " · sem restrição" : "") }))]}/>
              </div>
              <AdminButton variant="secondary" className="h-[42px] shrink-0"
                disabled={disabled || !sourceId} onClick={() => void copySchedule()}>
                {copying ? <LoaderCircle size={15} className="animate-spin"/> : <Copy size={15}/>} Copiar
              </AdminButton>
            </div>
            {sources.error && <p role="alert" className="mt-2 text-xs text-destructive">{systemErrorMessage(sources.error)}</p>}
          </Section>}
          <Section title="Agenda semanal" contentClassName="!p-3 sm:!p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {ACCESS_WEEKDAYS.map(({ weekday, short, name }) => {
                const intervals = intervalsFor(weekday);
                const active = intervals.length > 0;
                return <div key={weekday} className={"flex min-w-0 flex-col overflow-hidden rounded-xl border "
                  + (active ? "border-primary/40 bg-card" : "border-border bg-muted/15")}>
                  <label className={"flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 "
                    + (active ? "border-primary/20 bg-primary/5" : "border-border")}>
                    <input type="checkbox" checked={active} disabled={disabled}
                      aria-label={"Habilitar " + name} className="size-4 accent-primary"
                      onChange={event => setEnabled(weekday,event.target.checked)}/>
                    <span className={"text-xs font-bold " + (active ? "text-primary" : "text-muted-foreground")}>{short}</span>
                  </label>
                  <div className="flex min-h-40 flex-1 flex-col gap-2 p-2">
                    {!active && <p className="my-auto py-6 text-center text-xs text-muted-foreground">Sem acesso</p>}
                    {intervals.map((interval,i) => <div key={i} className="rounded-lg border border-border bg-background p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground">Período {i+1}</span>
                        {canEdit && <button type="button" disabled={disabled} title="Remover intervalo"
                          aria-label={"Remover período "+(i+1)+" de "+name}
                          className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                          onClick={() => replaceDay(weekday,intervals.filter((_,index)=>index!==i))}><Trash2 size={14}/></button>}
                      </div>
                      <div className="space-y-1.5">
                        {(["start","end"] as const).map(field => <label key={field} className="flex items-center gap-2">
                          <span className="w-6 shrink-0 text-[10px] text-muted-foreground">{field==="start"?"De":"Até"}</span>
                          <input type="time" step="60" value={interval[field]} disabled={disabled}
                            aria-label={(field==="start"?"Início":"Fim")+" de "+name+", período "+(i+1)}
                            onChange={event => replaceDay(weekday,intervals.map((item,index)=>
                              index===i?{...item,[field]:event.target.value}:item))}
                            className="h-9 w-full min-w-0 rounded-md border border-border bg-card px-1 text-xs font-semibold tabular-nums text-foreground outline-none focus:border-primary"/>
                        </label>)}
                      </div>
                    </div>)}
                    {active && canEdit && <button type="button"
                      disabled={disabled || intervals.length>=12}
                      onClick={() => add(weekday)}
                      className="mt-auto flex min-h-9 items-center justify-center gap-1 rounded-lg border border-primary/25 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-40">
                      <Plus size={14}/> Intervalo
                    </button>}
                  </div>
                </div>;
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Horário de Brasília. Você pode criar vários períodos sem sobreposição no mesmo dia.
              Para períodos que ultrapassem a meia-noite, use dois dias consecutivos.
            </p>
            {hours.enabled && hours.days.every(day=>day.intervals.length===0) && <p className="mt-2 text-xs font-bold text-amber-700">
              Nenhum dia habilitado: o funcionário ficará sem acesso ao CRM.
            </p>}
          </Section>
          {(error || invalid) && <p role="alert" className="text-sm font-semibold text-destructive">{error || invalid}</p>}
          {info && <p role="status" className="text-xs font-semibold text-emerald-600">{info}</p>}
          {!employeeId && <p className="text-xs text-muted-foreground">
            Em um funcionário novo, a agenda é gravada quando o cadastro do funcionário é criado.
          </p>}
        </>}
  </AdminDialog>;
}
