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
  selectedTechnicianIds?: string[];
  onToggleTechnician?: (technicianId: string) => void;
  exceptOrderId?: string | null;
  technicianFilter?: string;
  onTechnicianFilterChange?: (technicianId: string) => void;
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
const displayDay = (value: string) => {
  const date = new Date(value + "T12:00:00");
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(/[.,]/g, "").trim();
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(/[.,]/g, "").trim();
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${label} ${date.getDate()} de ${month}`;
};

export function TechnicianAvailabilityCalendar({
  organizationId, technicians, date, selectedStart, selectedEnd, selectedTechnicianId,
  selectedTechnicianIds, onToggleTechnician,
  exceptOrderId, technicianFilter, onTechnicianFilterChange, onNavigateWeek, onGoToToday, onChooseStart, onChooseEnd,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [highlightEmployee, setHighlightEmployee] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const today = dayKey(new Date());
  const baseWeek = weekMonday(date || today);
  const first = shiftWeek(baseWeek, onNavigateWeek ? 0 : weekOffset);
  // In the Agenda, both technician selectors control the same filter.
  // In the OS form, preserve the local display-only selector so other technicians remain selectable.
  const selectedEmployeeFilter = onTechnicianFilterChange ? technicianFilter || "" : highlightEmployee;
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
  const selectedIds = selectedTechnicianIds ?? (selectedTechnicianId ? [selectedTechnicianId] : []);
  const currentDay = days.find(item => item.date === date);
  const technicianOptions = currentDay && selectedStart
    ? currentDay.technicians.filter(technician =>
        rangeAvailable(technician.workday, selectedStart,
          selectedEnd || hhmm(minutes(selectedStart) + 30), technician.occupied, currentDay.date),
      )
    : [];
  const selectableIds = new Set(technicianOptions.map(technician => technician.id));
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
  const endingTimes = (() => {
    if (!selectedStart || !date || !onChooseEnd || !selectedIds.length || !currentDay) return [];
    const selected = currentDay.technicians.filter(item => selectedIds.includes(item.id));
    if (selected.length !== selectedIds.length) return [];
    const max = Math.min(...selected.map(tech =>
      Math.max(0, ...tech.workday.work_intervals.map(interval => minutes(interval.end_time))),
    ));
    const result: string[] = [];
    for (let minute = minutes(selectedStart) + 30; minute <= max; minute += 30) {
      const end = hhmm(minute);
      if (selected.every(tech => rangeAvailable(tech.workday, selectedStart, end, tech.occupied, date))) result.push(end);
    }
    return result;
  })();
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
        value={selectedEmployeeFilter} onChange={event => {
          if (onTechnicianFilterChange) onTechnicianFilterChange(event.target.value);
          else setHighlightEmployee(event.target.value);
        }}>
        <option value="">Todos os técnicos</option>
        {ids.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
      </select>}
      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={hideEmpty} onChange={event => setHideEmpty(event.target.checked)} />
        Ocultar horários sem vagas
      </label>
    </div>
    {selectedStart && selectedIds.length > 0 && onChooseEnd && days.some(item => item.date === date) && <div className="space-y-2 border-b border-primary/20 bg-primary/5 px-4 py-3">
      <p className="text-xs font-bold text-primary">
        {onToggleTechnician
          ? `${selectedIds.length} técnico${selectedIds.length === 1 ? "" : "s"} na OS`
          : ids.find(item => item.id === selectedTechnicianId)?.full_name || "Técnico selecionado"} · {date?.split("-").reverse().join("/")} · Início {selectedStart}
        {selectedEnd ? " · Término " + selectedEnd : " · Escolha o término"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {endingTimes.map(end => <button key={end} type="button" onClick={() => onChooseEnd(date!, end, selectedIds[0])}
          aria-pressed={selectedEnd === end}
          className={"rounded-md border px-2.5 py-1.5 text-xs font-bold transition " + (selectedEnd === end
            ? "border-primary bg-primary text-white" : "border-primary/25 bg-card text-primary hover:bg-primary/10")}>{end}</button>)}
        {endingTimes.length === 0 && <span className="text-xs text-muted-foreground">Não há término disponível para este início.</span>}
      </div>
    </div>}
    {onToggleTechnician && selectedStart && currentDay && <div className="space-y-3 border-b border-border px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground">
            Técnicos nesta OS <span className="text-primary">({selectedIds.length})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Todos terão o mesmo dia e intervalo. Adicione quem estiver livre durante todo o período.
          </p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {technicianOptions.length} disponível{technicianOptions.length === 1 ? "" : "is"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {technicianOptions.map(technician => <label key={technician.id}
          className={"flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-3 text-xs font-semibold " +
            (selectedIds.includes(technician.id)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50")}>
          <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary"
            checked={selectedIds.includes(technician.id)}
            onChange={() => onToggleTechnician(technician.id)} />
          <span className="min-w-0 flex-1 break-words">{technician.full_name}</span>
        </label>)}
        {currentDay.technicians.filter(item => selectedIds.includes(item.id) && !selectableIds.has(item.id))
          .map(technician => <label key={technician.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked
              onChange={() => onToggleTechnician(technician.id)} />
            <span>{technician.full_name} — indisponível no intervalo</span>
          </label>)}
      </div>
      {!selectedIds.length && <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        Marque pelo menos um técnico disponível para concluir o agendamento.
      </p>}
    </div>}
    {!ids.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum técnico ativo disponível para consulta.</p>
      : showLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Consultando horários...</p>
      : query.error ? <p role="alert" className="p-5 text-sm text-red-600">{systemErrorMessage(query.error, "Não foi possível consultar a disponibilidade.")}</p>
      : !query.data?.hasSchedules ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum expediente cadastrado para estes técnicos. Configure a agenda semanal no cadastro dos funcionários.</p>
      : <div className="max-h-[620px] w-full overflow-auto" role="region" aria-label="Tabela semanal de disponibilidade" tabIndex={0}>
        <table className="w-full min-w-[1540px] table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="sticky left-0 z-20 w-[108px] border-b border-r border-border bg-muted px-3 py-4 text-center text-sm font-bold">Hora</th>
              {days.map(day => <th key={day.date} className={"border-b border-r border-border px-3 py-4 text-center " + (day.date === today ? "bg-primary/10 text-primary" : "text-foreground")}>
                <span className="block text-xs font-bold">{displayDay(day.date)}</span>{day.date === today && <span className="mt-1 block text-[10px] font-semibold">Hoje</span>}
              </th>)}
            </tr>
          </thead>
          <tbody>{hours.filter(time => !hideEmpty || days.some(day => availableAt(day, time).some(employee => !selectedEmployeeFilter || employee.id === selectedEmployeeFilter))).map(time =>
            <tr key={time}>
              <th className="sticky left-0 z-[5] border-b border-r border-border bg-card px-3 py-4 text-center text-sm font-bold tabular-nums text-foreground">{time}</th>
              {days.map(day => {
                const available = availableAt(day, time).filter(item => !selectedEmployeeFilter || item.id === selectedEmployeeFilter);
                return <td key={day.date} className={"min-h-[64px] border-b border-r border-border px-2 py-2 align-top " + (day.date === today ? "bg-primary/[0.025]" : "")}>
                  {available.length ? <div className="flex flex-col gap-1.5">{available.map(employee => {
                    const active = day.date === date && time === selectedStart && selectedIds.includes(employee.id);
                    return <button key={employee.id} type="button" disabled={!selectable}
                      title={employee.full_name + " disponível às " + time}
                      aria-pressed={active}
                      onClick={() => {
                        if (onToggleTechnician && day.date === date && time === selectedStart
                          && (!selectedEnd || selectableIds.has(employee.id))) {
                          onToggleTechnician(employee.id);
                        } else {
                          onChooseStart?.(day.date, time, employee.id);
                        }
                      }}
                      className={"flex min-h-9 w-full items-center justify-center rounded-md border px-2 py-2 text-center text-xs font-semibold leading-4 break-words " +
                        (active ? "border-primary bg-primary text-white"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300") +
                        (selectable ? " hover:border-primary hover:text-primary" : " cursor-default")}>
                      {employee.full_name}
                    </button>;
                  })}</div> : <span className="block py-2 text-center text-muted-foreground/50">—</span>}
                </td>;
              })}
            </tr>)}</tbody>
        </table>
      </div>}
    {selectable && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      {onToggleTechnician
        ? "Escolha um horário e marque um ou mais técnicos. O término só poderá ser escolhido se todos estiverem livres."
        : <>Selecione o nome de um técnico em um horário livre{onChooseEnd ? " e depois escolha o término do atendimento." : " para agendar."}</>}
    </p>}
  </AdminCard>;
}
