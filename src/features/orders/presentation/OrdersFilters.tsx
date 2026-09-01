import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Eraser,
  Search,
} from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import { OrderFilterMultiSelect } from "./OrderFormControls";

type CityOption = { name: string; state: string };
type StateOption = { sigla: string; nome: string };
type OrderSort = "" | "asc" | "desc";

export function OrdersFilters({
  osNumberSearch,
  externalOsSearch,
  documentSearch,
  statusId,
  situationId,
  orderType,
  serviceTypeId,
  selectedStates,
  selectedCities,
  dateFrom,
  dateTo,
  orderSort,
  statuses,
  situations,
  serviceTypes,
  stateOptions,
  cityOptions,
  statesLoading,
  citiesLoading,
  invalidPeriod,
  onOsNumberSearchChange,
  onExternalOsSearchChange,
  onDocumentSearchChange,
  onStatusChange,
  onSituationChange,
  onOrderTypeChange,
  onServiceTypeChange,
  onStateSelect,
  onStateRemove,
  onStatesClear,
  onCitySelect,
  onCityRemove,
  onDateFromChange,
  onDateToChange,
  onOrderSortChange,
  onClear,
}: {
  osNumberSearch: string;
  externalOsSearch: string;
  documentSearch: string;
  statusId: string;
  situationId: string;
  orderType: string;
  serviceTypeId: string;
  selectedStates: string[];
  selectedCities: CityOption[];
  dateFrom: string;
  dateTo: string;
  orderSort: OrderSort;
  statuses: any[];
  situations: any[];
  serviceTypes: any[];
  stateOptions: StateOption[];
  cityOptions: CityOption[];
  statesLoading: boolean;
  citiesLoading: boolean;
  invalidPeriod: boolean;
  onOsNumberSearchChange: (value: string) => void;
  onExternalOsSearchChange: (value: string) => void;
  onDocumentSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSituationChange: (value: string) => void;
  onOrderTypeChange: (value: string) => void;
  onServiceTypeChange: (value: string) => void;
  onStateSelect: (value: string) => void;
  onStateRemove: (value: string) => void;
  onStatesClear: () => void;
  onCitySelect: (value: string) => void;
  onCityRemove: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onOrderSortChange: (value: OrderSort) => void;
  onClear: () => void;
}) {
  const filterStatus = statusId;
  const filterSituation = situationId;
  const filterOrderType = orderType;
  const selectedServiceTypeId = serviceTypeId;
  const ibgeStates = stateOptions;
  const cityFilterOptions = cityOptions;
  const ibgeStatesLoading = statesLoading;
  const cityFiltersLoading = citiesLoading;
  const clearFilters = onClear;
  const orderLabel = orderSort === "asc" ? "OS crescente" : orderSort === "desc" ? "OS decrescente" : "Ordenar";
  const OrderSortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;
  return (
<div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <SearchField label="Número da OS" value={osNumberSearch} onChange={onOsNumberSearchChange} placeholder="Digite o número da OS" />
          <SearchField label="OS externa" value={externalOsSearch} onChange={onExternalOsSearchChange} placeholder="Digite a OS externa" />
          <SearchField label="CPF ou CNPJ" value={documentSearch} onChange={onDocumentSearchChange} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />
          <div className="min-w-48 flex-1 space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">Status</label><AdminSelect value={filterStatus} onValueChange={onStatusChange} options={[{ value: "", label: "Todos os status" }, ...statuses.map(s => ({ value: s.id, label: s.name }))]} className="text-xs" ariaLabel="Filtrar por status" /></div>
          <div className="min-w-48 flex-1 space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">Situação</label><AdminSelect value={filterSituation} onValueChange={onSituationChange} options={[{ value: "", label: "Todas as situações" }, ...situations.map(s => ({ value: s.id, label: s.name }))]} className="text-xs" ariaLabel="Filtrar por situação" /></div>
          <div className="min-w-48 flex-1 space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">Tipo</label><AdminSelect value={filterOrderType} onValueChange={onOrderTypeChange} options={[{ value: "", label: "Todos os tipos" }, { value: "internal", label: "Interna" }, { value: "external", label: "Externa" }]} className="text-xs" ariaLabel="Filtrar por tipo da OS" /></div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          <div>
            <OrderFilterMultiSelect label="Estados" options={ibgeStates.map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` }))} selectedValues={selectedStates} onSelect={onStateSelect} onRemove={onStateRemove} placeholder="Selecionar Estados" loading={ibgeStatesLoading} />
            {selectedStates.length > 0 && <button type="button" onClick={onStatesClear} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline"><Eraser size={12} />Limpar Estados</button>}
          </div>
          <OrderFilterMultiSelect label="Cidades" options={cityFilterOptions.map(city => ({ value: `${city.state}:${city.name}`, label: `${city.name} — ${city.state}` }))} selectedValues={selectedCities.map(city => `${city.state}:${city.name}`)} onSelect={onCitySelect} onRemove={onCityRemove} placeholder={selectedStates.length === 0 ? "Selecione ao menos um Estado" : "Selecionar Cidades"} disabled={selectedStates.length === 0} loading={cityFiltersLoading} />
          <div>
            <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Data inicial</label>
            <input type="date" value={dateFrom} onChange={event => onDateFromChange(event.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Data final</label>
            <input type="date" value={dateTo} onChange={event => onDateToChange(event.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")} />
            {invalidPeriod && <p className="mt-1 text-xs text-red-600">A data final deve ser igual ou posterior à inicial.</p>}
          </div>
          <div className="lg:col-span-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">Tipo de Atendimento</label><AdminSelect value={selectedServiceTypeId} onValueChange={onServiceTypeChange} options={[{ value: "", label: "Todos os tipos" }, ...serviceTypes.map(serviceType => ({ value: serviceType.id, label: serviceType.title }))]} className="text-xs" ariaLabel="Filtrar por tipo de atendimento" /></div>
            <div className="flex items-end justify-start">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Ordenação atual: ${orderLabel}`} title={`Ordenação atual: ${orderLabel}`} className={cn("inline-flex h-[42px] w-fit items-center gap-2 whitespace-nowrap rounded-lg border bg-white px-3 text-xs font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40", orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82] hover:border-[#0057e7]/40 hover:bg-[#eef5ff]")}>
                  <OrderSortIcon size={15} className="text-[#0057e7]" />
                  <span className="hidden sm:inline">{orderLabel}</span>
                  <span className="sm:hidden">Ordenar</span>
                  <ChevronDown size={14} className="text-[#5a6a82]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[190px]">
                {([["", "Ordenação padrão", ArrowUpDown], ["asc", "OS crescente", ArrowUpNarrowWide], ["desc", "OS decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => onOrderSortChange(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}>
                  <Icon size={15} className={orderSort === value ? "text-[#0057e7]" : "text-[#5a6a82]"} />
                  <span>{label}</span>
                  {orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}
                </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          {(osNumberSearch || externalOsSearch || documentSearch || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || selectedStates.length > 0 || selectedCities.length > 0 || dateFrom || dateTo) && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"><Eraser size={14} />Limpar filtros</button>}
        </div>
      </div>
  );
}

function SearchField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="min-w-52 flex-1 space-y-1.5"><label className="block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label><div className="relative overflow-hidden rounded-lg"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pl-9 py-2 text-xs")} /></div></div>;
}
