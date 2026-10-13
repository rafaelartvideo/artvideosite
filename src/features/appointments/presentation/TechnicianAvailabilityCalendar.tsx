import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { AdminButton, AdminCard, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { dayKey } from "../application/agenda-calendar";
import { hhmm, minutes, rangeAvailable } from "../infrastructure/employee-agenda.repository";
import {
  availableAt, loadTechnicianAvailabilityWeek,
  type AvailableTechnician,
} from "../infrastructure/technician-availability.repository";

type Props = {
  organizationId: string;
  technicians: AvailableTechnician[];
  date?: string;
  selectedStart?: string;
  selectedEnd?: string;
  selectedTechnicianId?: string;
  exceptOrderId?: string | null;
  technicianFilter?: string;
  onNavigateWeek?: (amount: number) => void;
  onGoToToday?: () => void;
  onChooseStart?: (date: string, time: string, technicianId: string) => void;
  onChooseEnd?: (date: string, time: string, technicianId: string) => void;
};

function weekMonday(value: string) {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return dayKey(date);
}
function shiftWeek(value: string, amount: number) {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + 7 * amount);
  return dayKey(date);
}
const displayDay = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", weekday: "short", month: "short" });

export function TechnicianAvailabilityCalendar({
  organizationId, technicians, date, selectedStart, selectedEnd, selectedTechnicianId,
  exceptOrderId, technicianFilter, onNavigateWeek, onGoToToday, onChooseStart, onChooseEnd,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [highlightEmployee, setHighlightEmployee] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const today = dayKey(new Date());
  const baseWeek = weekMonday(date || today);
  const first = shiftWeek(baseWeek, onNavigateWeek ? 0 : weekOffset);
  const ids = technicians.filter(item => item.is_active !== false)
    .filter(item => !technicianFilter || item.id === technicianFilter);
  const idsKey = ids.map(item => item.id).sort().join(",");
  const query = useQuery({
    queryKey: ["technicianAvailability", organizationId, first, idsKey, exceptOrderId || ""],
    queryFn: () => loadTechnicianAvailabilityWeek(organizationId, first, ids, exceptOrderId),
    enabled: Boolean(organizationId && ids.length),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => setWeekOffset(0), [baseWeek, organizationId]);
  const days = query.data?.days || [];
  const hours = useMemo(() => {
    const all = days.flatMap(day => day.technicians.flatMap(tech =>
      tech.workday.is_available ? tech.workday.work_intervals : [],
    ));
    const firstMinute = all.length ? Math.max(0, Math.floor(Math.min(...all.map(x => minutes(x.start_time))) / 30) * 30) : 8 * 60;
    const lastMinute = all.length ? Math.min(24 * 60, Math.ceil(Math.max(...all.map(x => minutes(x.end_time))) / 30) * 30) : 18 * 60;
    const result: string[] = [];
    for (let minute = firstMinute; minute + 30 <= lastMinute; minute += 30) result.push(hhmm(minute));
    return result;
  }, [days]);
  const endingTimes = useMemo(() => {
    if (!selectedStart || !selectedTechnicianId || !date || !onChooseEnd) return [];
    const day = days.find(item => item.date === date);
    const tech = day?.technicians.find(item => item.id === selectedTechnicianId);
    if (!day || !tech) return [];
    const max = Math.max(0, ...tech.workday.work_intervals.map(interval => minutes(interval.end_time)));
    const result: string[] = [];
    for (let minute = minutes(selectedStart) + 30; minute <= max; minute += 30) {
      const end = hhmm(minute);
      if (rangeAvailable(tech.workday, selectedStart, end, tech.occupied, date)) result.push(end);
    }
    return result;
  }, [days, date, selectedStart, selectedTechnicianId, onChooseEnd]);
  const showLoading = Boolean(ids.length && (query.isPending || query.isFetching && !query.data));
  const selectable = Boolean(onChooseStart);
  return <AdminCard className="min-w-0 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarDays size={17} className="shrink-0 text-primary" />
        <div>
          <p className="text-sm font-bold text-foreground">Disponibilidade dos técnicos</p>
          <p className="text-xs text-muted-foreground">Horários livres em intervalos de 30 minutos</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <AdminButton variant="secondary" size="sm" onClick={() => { if (onGoToToday) onGoToToday(); else setWeekOffset(0); setHighlightEmployee(""); }}>{onGoToToday ? "Hoje" : "Data escolhida"}</AdminButton>
        <AdminIconButton ariaLabel="Semana anterior" onClick={() => onNavigateWeek ? onNavigateWeek(-1) : setWeekOffset(value => value - 1)}><ChevronLeft size={16} /></AdminIconButton>
        <AdminIconButton ariaLabel="Semana seguinte" onClick={() => onNavigateWeek ? onNavigateWeek(1) : setWeekOffset(value => value + 1)}><ChevronRight size={16} /></AdminIconButton>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <Users size={14} className="text-muted-foreground" />
      <span className="mr-1 text-xs font-semibold text-muted-foreground">{ids.length} técnicos</span>
      {ids.length > 0 && <select aria-label="Filtrar por técnico"
        className="max-w-[210px] rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        value={highlightEmployee} onChange={event => setHighlightEmployee(event.target.value)}>
        <option value="">Todos os técnicos</option>
        {ids.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
      </select>}
      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={hideEmpty} onChange={event => setHideEmpty(event.target.checked)} />
        Ocultar horários sem vagas
      </label>
    </div>
    {selectedStart && selectedTechnicianId && onChooseEnd && days.some(item => item.date === date) && <div className="space-y-2 border-b border-primary/20 bg-primary/5 px-4 py-3">
      <p className="text-xs font-bold text-primary">
        {ids.find(item => item.id === selectedTechnicianId)?.full_name || "Técnico selecionado"} · {date?.split("-").reverse().join("/")} · Início {selectedStart}
        {selectedEnd ? " · Término " + selectedEnd : " · Escolha o término"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {endingTimes.map(end => <button key={end} type="button" onClick={() => onChooseEnd(date!, end, selectedTechnicianId)}
          aria-pressed={selectedEnd === end}
          className={"rounded-md border px-2.5 py-1.5 text-xs font-bold transition " + (selectedEnd === end
            ? "border-primary bg-primary text-white" : "border-primary/25 bg-card text-primary hover:bg-primary/10")}>{end}</button>)}
        {endingTimes.length === 0 && <span className="text-xs text-muted-foreground">Não há término disponível para este início.</span>}
      </div>
    </div>}
    {!ids.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum técnico ativo disponível para consulta.</p>
      : showLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Consultando horários...</p>
      : query.error ? <p role="alert" className="p-5 text-sm text-red-600">{systemErrorMessage(query.error, "Não foi possível consultar a disponibilidade.")}</p>
      : !query.data?.hasSchedules ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum expediente cadastrado para estes técnicos. Configure a agenda semanal no cadastro dos funcionários.</p>
      : <div className="max-h-[620px] w-full overflow-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="sticky left-0 z-20 w-[64px] border-b border-r border-border bg-muted px-2 py-3 text-left">Hora</th>
              {days.map(day => <th key={day.date} className={"border-b border-r border-border px-2 py-3 text-left " + (day.date === today ? "bg-primary/10 text-primary" : "text-foreground")}>
                {displayDay(day.date)} {day.date === today ? "· Hoje" : ""}
              </th>)}
            </tr>
          </thead>
          <tbody>{hours.filter(time => !hideEmpty || days.some(day => availableAt(day, time).some(employee => !highlightEmployee || employee.id === highlightEmployee))).map(time =>
            <tr key={time}>
              <th className="sticky left-0 z-[5] border-b border-r border-border bg-card px-2 py-3 text-left font-bold tabular-nums text-foreground">{time}</th>
              {days.map(day => {
                const available = availableAt(day, time).filter(item => !highlightEmployee || item.id === highlightEmployee);
                return <td key={day.date} className={"h-12 border-b border-r border-border p-1 align-top " + (day.date === today ? "bg-primary/[0.025]" : "")}>
                  {available.length ? <div className="flex flex-col gap-1">{available.map(employee => {
                    const active = day.date === date && time === selectedStart && employee.id === selectedTechnicianId;
                    return <button key={employee.id} type="button" disabled={!selectable}
                      title={employee.full_name + " disponível às " + time}
                      aria-pressed={active}
                      onClick={() => onChooseStart?.(day.date, time, employee.id)}
                      className={"w-full truncate rounded-md border px-2 py-1.5 text-left text-[11px] font-semibold " +
                        (active ? "border-primary bg-primary text-white"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300") +
                        (selectable ? " hover:border-primary hover:text-primary" : " cursor-default")}>
                      {employee.full_name}
                    </button>;
                  })}</div> : <span className="block pt-1 text-center text-muted-foreground/50">—</span>}
                </td>;
              })}
            </tr>)}</tbody>
        </table>
      </div>}
    {selectable && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      Selecione o nome de um técnico em um horário livre{onChooseEnd ? " e depois escolha o término do atendimento." : " para agendar."}
    </p>}
  </AdminCard>;
}
