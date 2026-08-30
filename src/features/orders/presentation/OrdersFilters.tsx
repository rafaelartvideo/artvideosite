import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Eraser,
  Search,
} from "lucide-react";
import { cn, INPUT } from "@/shared/admin/AdminPrimitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { OrderFilterMultiSelect } from "./OrderFormControls";

type CityOption = { name: string; state: string };
type StateOption = { sigla: string; nome: string };
type OrderSort = "" | "asc" | "desc";

export function OrdersFilters({
  search,
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
  onSearchChange,
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
  search: string;
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
  onSearchChange: (value: string) => void;
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">BUSCA</label>
          <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Nome, CPF, CNPJ, OS ou OS Externa..." className={cn(INPUT, "h-[42px] pl-9 py-2 text-xs")} />
          </div>
        </div>
        <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">STATUS</label><select value={filterStatus} onChange={e => onStatusChange(e.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
          <option value="">Todos os status</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
        <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">SITUAÇÕES</label><select value={filterSituation} onChange={e => onSituationChange(e.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
          <option value="">Todas as situações</option>{situations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
        <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">TIPO</label><select value={filterOrderType} onChange={e => onOrderTypeChange(e.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
          <option value="">Todos os tipos</option>
          <option value="internal">Interna</option>
          <option value="external">Externa</option>
        </select></div>
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
            <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">Tipo de Atendimento</label><select value={selectedServiceTypeId} onChange={e => onServiceTypeChange(e.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
              <option value="">Todos os tipos</option>
              {serviceTypes.map(serviceType => <option key={serviceType.id} value={serviceType.id}>{serviceType.title}</option>)}
            </select></div>
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
          {(search || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || selectedStates.length > 0 || selectedCities.length > 0 || dateFrom || dateTo) && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"><Eraser size={14} />Limpar filtros</button>}
        </div>
      </div>
  );
}
