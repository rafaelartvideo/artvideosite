import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eraser, ListFilter, Plus, Search } from "lucide-react";
import type { AppointmentSituation } from "@/lib/database.types";
import { buildAgendaDays, type AgendaView } from "../application/agenda-calendar";
import { cn } from "@/shared/domain/formatters";
import { FSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminIconButton, AdminSegmentedControl } from "@/shared/ui/admin/AdminLayout";

type NamedItem = { id: string; name: string };
type Employee = { id: string; full_name: string };
type Service = { id: string; title: string };
type GeneralService = { id: string; name: string };

type Props = {
  view: AgendaView;
  cursor: Date;
  search: string;
  technicianFilter: string;
  statusFilter: string;
  situationFilter: string;
  serviceFilter: string;
  employees: Employee[];
  statuses: NamedItem[];
  situations: AppointmentSituation[];
  services: Service[];
  generalServices: GeneralService[];
  canCreate: boolean;
  onViewChange: (view: AgendaView) => void;
  onSearchChange: (value: string) => void;
  onTechnicianFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSituationFilterChange: (value: string) => void;
  onServiceFilterChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew: () => void;
};

export function AgendaToolbar(props: Props) {
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [props.technicianFilter, props.statusFilter, props.situationFilter, props.serviceFilter].filter(Boolean).length;

  useEffect(() => {
    const closeFilters = (event: MouseEvent) => {
      if (!filterPanelRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", closeFilters);
    return () => document.removeEventListener("mousedown", closeFilters);
  }, []);

  const title = props.view === "month"
    ? props.cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : props.view === "day"
      ? props.cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
      : props.view === "week"
        ? `Semana de ${buildAgendaDays("week", props.cursor, 1)[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
        : "Todos os agendamentos";

  const clearFilters = () => {
    props.onTechnicianFilterChange("");
    props.onStatusFilterChange("");
    props.onSituationFilterChange("");
    props.onServiceFilterChange("");
    setFiltersOpen(false);
  };

  return <div className="relative grid w-full min-w-0 grid-cols-1 gap-3 md:flex md:flex-wrap md:items-center md:gap-2">
    <div className="flex min-w-0 items-center justify-between gap-2 md:justify-start">
      <div className="flex shrink-0 items-center gap-1">
        <AdminIconButton ariaLabel="Período anterior" onClick={props.onPrevious} className="h-10 w-10 rounded-lg md:h-9 md:w-9"><ChevronLeft size={16} /></AdminIconButton>
        <AdminIconButton ariaLabel="Próximo período" onClick={props.onNext} className="h-10 w-10 rounded-lg md:h-9 md:w-9"><ChevronRight size={16} /></AdminIconButton>
        <AdminButton variant="secondary" onClick={props.onToday} className="h-10 rounded-lg px-3 text-xs md:h-9">Hoje</AdminButton>
      </div>
      <span className="min-w-0 truncate text-right text-sm font-bold capitalize text-[#0d1b2e] md:text-left">{title}</span>
    </div>

    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 md:flex md:flex-1 md:items-center">
      <div className="relative min-w-0 md:max-w-[260px] md:flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={props.search} onChange={event => props.onSearchChange(event.target.value)} placeholder="Buscar cliente, nº OS" className={cn(INPUT, "h-10 bg-white py-2 pl-9 text-xs md:h-9")} /></div>
      <div ref={filterPanelRef} className="relative">
        <AdminButton variant="secondary" onClick={() => setFiltersOpen(value => !value)} ariaLabel="Filtrar agendamentos" aria-expanded={filtersOpen} aria-controls="agenda-filters" className="h-10 rounded-lg px-3 text-xs md:h-9" type="button">
          <ListFilter size={15} /><span className="hidden xs:inline">Filtrar</span>{activeFilterCount > 0 && <span className="rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
        </AdminButton>
        {filtersOpen && <div id="agenda-filters" className="fixed inset-x-4 top-24 z-[120] max-h-[calc(100vh-7rem)] space-y-3 overflow-y-auto rounded-xl border border-[#0d1b2e]/10 bg-white p-4 shadow-2xl md:absolute md:inset-x-auto md:right-0 md:top-11 md:z-30 md:w-[min(18rem,calc(100vw-2rem))]">
          <FSelect label="Técnico" value={props.technicianFilter} onChange={event => props.onTechnicianFilterChange(event.target.value)} options={[{ value: "", label: "Todos os técnicos" }, ...props.employees.map(employee => ({ value: employee.id, label: employee.full_name }))]} />
          <FSelect label="Status" value={props.statusFilter} onChange={event => props.onStatusFilterChange(event.target.value)} options={[{ value: "", label: "Todos os status" }, ...props.statuses.map(status => ({ value: status.id, label: status.name }))]} />
          <FSelect label="Situação" value={props.situationFilter} onChange={event => props.onSituationFilterChange(event.target.value)} options={[{ value: "", label: "Todas as situações" }, ...props.situations.map(situation => ({ value: situation.id, label: situation.name }))]} />
          <FSelect label="Serviço" value={props.serviceFilter} onChange={event => props.onServiceFilterChange(event.target.value)} options={[{ value: "", label: "Todos os serviços" }, ...props.services.map(service => ({ value: service.id, label: service.title })), ...props.generalServices.map(service => ({ value: service.id, label: service.name }))]} />
          <AdminButton variant="ghost" size="sm" onClick={clearFilters} className="w-full justify-center py-2 text-red-600 hover:bg-red-50 hover:text-red-700 md:w-auto md:px-0 md:py-1 md:hover:bg-transparent"><Eraser size={13} /> Limpar filtros</AdminButton>
        </div>}
      </div>
    </div>

    <div className="grid min-w-0 grid-cols-1 gap-2 md:ml-auto md:flex md:flex-wrap md:items-center md:gap-1">
      <AdminSegmentedControl
        value={props.view}
        onChange={(nextView) => props.onViewChange(nextView)}
        options={([
          { value: "day", label: "Dia" },
          { value: "week", label: "Semana" },
          { value: "month", label: "Mês" },
          { value: "agenda", label: "Lista" },
        ] as const)}
        className="grid-cols-4"
      />
      {props.canCreate && <AdminButton onClick={props.onNew} className="h-10 w-full rounded-lg px-3 text-xs md:h-9 md:w-auto"><Plus size={15} /> Novo agendamento</AdminButton>}
    </div>
  </div>;
}
