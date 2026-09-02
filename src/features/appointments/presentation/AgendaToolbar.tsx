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

  return <div className="relative flex w-full flex-wrap items-center gap-2">
    <div className="flex shrink-0 items-center gap-1">
      <AdminIconButton ariaLabel="Período anterior" onClick={props.onPrevious} className="h-9 w-9 rounded-lg"><ChevronLeft size={16} /></AdminIconButton>
      <AdminIconButton ariaLabel="Próximo período" onClick={props.onNext} className="h-9 w-9 rounded-lg"><ChevronRight size={16} /></AdminIconButton>
      <AdminButton variant="secondary" onClick={props.onToday} className="h-9 rounded-lg px-3 text-xs">Hoje</AdminButton>
    </div>
    <span className="whitespace-nowrap text-sm font-bold capitalize text-[#0d1b2e]">{title}</span>
    <div className="relative min-w-[190px] flex-1 sm:max-w-[260px]"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={props.search} onChange={event => props.onSearchChange(event.target.value)} placeholder="Buscar cliente, nº OS" className={cn(INPUT, "h-9 bg-white pl-9 py-2 text-xs")} /></div>
    <div ref={filterPanelRef} className="relative">
      <AdminButton variant="secondary" onClick={() => setFiltersOpen(value => !value)} ariaLabel="Filtrar agendamentos" className="h-9 rounded-lg px-3 text-xs" type="button">
        <ListFilter size={15} /> Filtrar{activeFilterCount > 0 && <span className="rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
      </AdminButton>
      {filtersOpen && <div id="agenda-filters" className="absolute right-0 top-11 z-30 w-[min(18rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-[#0d1b2e]/10 bg-white p-4 shadow-xl">
        <FSelect label="Técnico" value={props.technicianFilter} onChange={event => props.onTechnicianFilterChange(event.target.value)} options={[{ value: "", label: "Todos os técnicos" }, ...props.employees.map(employee => ({ value: employee.id, label: employee.full_name }))]} />
        <FSelect label="Status" value={props.statusFilter} onChange={event => props.onStatusFilterChange(event.target.value)} options={[{ value: "", label: "Todos os status" }, ...props.statuses.map(status => ({ value: status.id, label: status.name }))]} />
        <FSelect label="Situação" value={props.situationFilter} onChange={event => props.onSituationFilterChange(event.target.value)} options={[{ value: "", label: "Todas as situações" }, ...props.situations.map(situation => ({ value: situation.id, label: situation.name }))]} />
        <FSelect label="Serviço" value={props.serviceFilter} onChange={event => props.onServiceFilterChange(event.target.value)} options={[{ value: "", label: "Todos os serviços" }, ...props.services.map(service => ({ value: service.id, label: service.title })), ...props.generalServices.map(service => ({ value: service.id, label: service.name }))]} />
        <AdminButton variant="ghost" size="sm" onClick={clearFilters} className="px-0 py-1 text-red-600 hover:bg-transparent hover:text-red-700"><Eraser size={13} /> Limpar filtros</AdminButton>
      </div>}
    </div>
    <div className="ml-auto flex flex-wrap items-center gap-1">
      {props.canCreate && (
        <AdminButton onClick={props.onNew} className="h-9 rounded-lg px-3 text-xs">
          <Plus size={15} /> Novo
        </AdminButton>
      )}
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
    </div>
  </div>;
}
