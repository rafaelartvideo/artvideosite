import { useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Eraser,
  Search,
  ScanLine,
} from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect, FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
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
type MobileFilterKey =
  | "osNumber"
  | "customerName"
  | "document"
  | "serialNumber"
  | "status"
  | "situation"
  | "serviceType"
  | "states"
  | "cities"
  | "period";

const mobileFilterOptions: Array<{ value: MobileFilterKey; label: string }> = [
  { value: "osNumber", label: "Número da OS / Externa" },
  { value: "customerName", label: "Nome do cliente" },
  { value: "document", label: "CPF ou CNPJ" },
  { value: "serialNumber", label: "Número de série" },
  { value: "status", label: "Status" },
  { value: "situation", label: "Situação" },
  { value: "serviceType", label: "Tipo de Atendimento" },
  { value: "states", label: "Estado" },
  { value: "cities", label: "Cidade" },
  { value: "period", label: "Período" },
];

export function OrdersFilters({
  osNumberSearch,
  customerNameSearch,
  documentSearch,
  serialNumberSearch,
  statusId,
  situationId,
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
  onCustomerNameSearchChange,
  onDocumentSearchChange,
  onSerialNumberSearchChange,
  onStatusChange,
  onSituationChange,
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
  customerNameSearch: string;
  documentSearch: string;
  serialNumberSearch: string;
  statusId: string;
  situationId: string;
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
  onCustomerNameSearchChange: (value: string) => void;
  onDocumentSearchChange: (value: string) => void;
  onSerialNumberSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSituationChange: (value: string) => void;
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
  const [mobileFilter, setMobileFilter] = useState<MobileFilterKey>("osNumber");
  const serialScannerInput = useRef<HTMLInputElement>(null);
  const [serialScanOpen, setSerialScanOpen] = useState(false);
  const [serialScanBusy, setSerialScanBusy] = useState(false);
  const [serialScanError, setSerialScanError] = useState("");
  const [serialScanValues, setSerialScanValues] = useState<string[]>([]);
  const [serialScanValue, setSerialScanValue] = useState("");
  const serialScanGeneration = useRef(0);

  const closeSerialScanner = () => {
    serialScanGeneration.current += 1;
    setSerialScanOpen(false);
    setSerialScanBusy(false);
  };

  const readSerialCode = async (file?: File) => {
    if (!file) return;
    const generation = ++serialScanGeneration.current;
    setSerialScanOpen(true);
    setSerialScanBusy(true);
    setSerialScanError("");
    setSerialScanValues([]);
    setSerialScanValue("");
    let bitmap: ImageBitmap | undefined;
    try {
      const Detector = (window as unknown as {
        BarcodeDetector?: new () => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> };
      }).BarcodeDetector;
      if (!Detector) throw new Error("Este navegador não oferece leitura de códigos. Use um aplicativo de scanner e digite o número no filtro.");
      bitmap = await createImageBitmap(file);
      const codes = await new Detector().detect(bitmap);
      if (generation !== serialScanGeneration.current) return;
      const values = [...new Set(codes.map(code => code.rawValue.trim()).filter(Boolean))];
      if (!values.length) throw new Error("Código não encontrado. Tire uma foto mais próxima e nítida do código de barras ou QR da série.");
      setSerialScanValues(values);
      setSerialScanValue(values[0]);
    } catch (error) {
      if (generation === serialScanGeneration.current) setSerialScanError(error instanceof Error ? error.message : "Não foi possível ler o código.");
    } finally {
      bitmap?.close();
      if (generation === serialScanGeneration.current) setSerialScanBusy(false);
    }
  };

  const filterStatus = statusId;
  const filterSituation = situationId;
  const selectedServiceTypeId = serviceTypeId;
  const ibgeStates = stateOptions;
  const cityFilterOptions = cityOptions;
  const ibgeStatesLoading = statesLoading;
  const cityFiltersLoading = citiesLoading;
  const orderLabel = orderSort === "asc" ? "OS crescente" : orderSort === "desc" ? "OS decrescente" : "Ordenação padrão";
  const OrderSortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;
  const mobileFilterLabel = mobileFilterOptions.find(option => option.value === mobileFilter)?.label || "Número da OS / Externa";
  const hasActiveFilters = Boolean(
    osNumberSearch || customerNameSearch || documentSearch || serialNumberSearch || filterStatus || filterSituation || selectedServiceTypeId ||
    selectedStates.length > 0 || selectedCities.length > 0 || dateFrom || dateTo || orderSort
  );

  const sortMenu = (iconOnly = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Ordenação atual: ${orderLabel}`} title={`Ordenação: ${orderLabel}`} className={cn(
          "inline-flex h-[42px] items-center justify-center rounded-lg border bg-white text-xs font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40",
          iconOnly ? "w-[42px] shrink-0 px-0" : "w-full min-w-0 justify-between gap-1.5 px-3",
          orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82] hover:border-[#0057e7]/40 hover:bg-[#eef5ff]",
        )}>
          <OrderSortIcon size={20} className="h-5 w-5 shrink-0 text-[#0057e7]" />
          {!iconOnly && <><span>{orderLabel}</span><ChevronDown size={14} className="text-[#5a6a82]" /></>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[190px]">
        {([["", "Ordenação padrão", ArrowUpDown], ["asc", "OS crescente", ArrowUpNarrowWide], ["desc", "OS decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value || "default"} onSelect={() => onOrderSortChange(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}>
            <Icon size={15} className={orderSort === value ? "text-[#0057e7]" : "text-[#5a6a82]"} /><span>{label}</span>{orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMobileFilter = () => {
    switch (mobileFilter) {
      case "osNumber": return <MobileSearchField value={osNumberSearch} onChange={onOsNumberSearchChange} placeholder="Digite o número da OS ou externa" ariaLabel="Buscar por número da OS ou externa" />;
      case "customerName": return <MobileSearchField value={customerNameSearch} onChange={onCustomerNameSearchChange} placeholder="Digite o nome do cliente" ariaLabel="Buscar por nome do cliente" />;
      case "document": return <MobileSearchField value={documentSearch} onChange={onDocumentSearchChange} placeholder="Digite o CPF ou CNPJ" ariaLabel="Buscar por CPF ou CNPJ" inputMode="numeric" />;
      case "serialNumber": return <>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1"><MobileSearchField value={serialNumberSearch} onChange={onSerialNumberSearchChange} placeholder="Digite o número de série" ariaLabel="Buscar por número de série" /></div>
          <AdminButton variant="secondary" onClick={() => serialScannerInput.current?.click()} aria-label="Escanear número de série" title="Escanear número de série" className="h-[42px] w-[42px] shrink-0 p-0"><ScanLine size={22} className="!h-[22px] !w-[22px] shrink-0" /></AdminButton>
        </div>
        <input ref={serialScannerInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void readSerialCode(file); }} />
        <AdminDialog open={serialScanOpen} onClose={closeSerialScanner} title="Escanear número de série" description="Confira se o código corresponde à série, e não ao modelo ou a um endereço da etiqueta.">
          {serialScanBusy && <p role="status">Lendo código da foto...</p>}
          {serialScanError && <p role="alert" className="text-sm text-red-700">{serialScanError}</p>}
          {!serialScanBusy && serialScanValues.length > 1 && <AdminSelect value={serialScanValue} onValueChange={setSerialScanValue} options={serialScanValues.map(value => ({ value, label: value }))} ariaLabel="Selecionar código encontrado" />}
          {!serialScanBusy && serialScanValues.length > 0 && <FInput label="Número de série lido" value={serialScanValue} onChange={(event: any) => setSerialScanValue(event.target.value)} />}
          <div className="mt-4 flex flex-wrap justify-end gap-2"><AdminButton variant="secondary" onClick={closeSerialScanner}>Cancelar</AdminButton><AdminButton variant="secondary" disabled={serialScanBusy} onClick={() => serialScannerInput.current?.click()}>Outra foto</AdminButton><AdminButton disabled={serialScanBusy || !serialScanValue.trim()} onClick={() => { onSerialNumberSearchChange(serialScanValue.trim()); closeSerialScanner(); }}>Usar número</AdminButton></div>
        </AdminDialog>
      </>;
      case "status": return <AdminSelect value={filterStatus} onValueChange={onStatusChange} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar por status" />;
      case "situation": return <AdminSelect value={filterSituation} onValueChange={onSituationChange} options={[{ value: "", label: "Todas as situações" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar por situação" />;
      case "serviceType": return <AdminSelect value={selectedServiceTypeId} onValueChange={onServiceTypeChange} options={[{ value: "", label: "Todos os tipos" }, ...serviceTypes.map(serviceType => ({ value: serviceType.id, label: serviceType.title }))]} className="h-[42px] text-xs" ariaLabel="Filtrar por tipo de atendimento" />;
      case "states": return <div className="min-w-0"><OrderFilterMultiSelect label="Estado" options={ibgeStates.map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` }))} selectedValues={selectedStates} onSelect={onStateSelect} onRemove={onStateRemove} placeholder="Selecionar Estado" loading={ibgeStatesLoading} />{selectedStates.length > 0 && <button type="button" onClick={onStatesClear} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-600"><Eraser size={13} />Limpar Estados</button>}</div>;
      case "cities": return <OrderFilterMultiSelect label="Cidade" options={cityFilterOptions.map(city => ({ value: `${city.state}:${city.name}`, label: `${city.name} — ${city.state}` }))} selectedValues={selectedCities.map(city => `${city.state}:${city.name}`)} onSelect={onCitySelect} onRemove={onCityRemove} placeholder={selectedStates.length === 0 ? "Selecione primeiro um Estado" : "Selecionar Cidade"} disabled={selectedStates.length === 0} loading={cityFiltersLoading} />;
      case "period": return <div className="grid grid-cols-2 gap-2"><div className="min-w-0"><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Data inicial</label><input type="date" value={dateFrom} onChange={event => onDateFromChange(event.target.value)} className={cn(INPUT, "h-[42px] min-w-0 px-2 py-2 text-xs")} /></div><div className="min-w-0"><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Data final</label><input type="date" value={dateTo} onChange={event => onDateToChange(event.target.value)} className={cn(INPUT, "h-[42px] min-w-0 px-2 py-2 text-xs")} /></div>{invalidPeriod && <p className="col-span-2 text-xs text-red-600">A data final deve ser igual ou posterior à inicial.</p>}</div>;
    }
  };

  return <AdminCard className="overflow-hidden p-0">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0057e7] px-4 py-3 text-white">
      <div className="flex items-center gap-2"><Search size={16} className="shrink-0" /><span className="text-xs font-black uppercase tracking-[0.14em]">Buscar OS</span></div>
      <div className="ml-auto flex max-w-full items-center justify-end">
        {hasActiveFilters && <button type="button" onClick={onClear} aria-label="Limpar filtros" title="Limpar filtros" className="text-xs font-semibold text-white underline decoration-white/70 underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">Limpar filtros</button>}
      </div>
    </div>
    <div className="p-4">
      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Buscar por: ${mobileFilterLabel}`} className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm transition-colors hover:border-[#0057e7]/40 focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><span className="min-w-0 truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} className="shrink-0 text-[#5a6a82]" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-[240px]">{mobileFilterOptions.map(option => <DropdownMenuItem key={option.value} onSelect={() => setMobileFilter(option.value)} className={cn("cursor-pointer", mobileFilter === option.value && "bg-[#eef5ff] font-bold text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}><Search size={14} className={mobileFilter === option.value ? "text-[#0057e7]" : "text-[#5a6a82]"} /><span>{option.label}</span>{mobileFilter === option.value && <Check size={14} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>
        <div className="flex min-w-0 items-start gap-2"><div className="min-w-0 flex-1">{renderMobileFilter()}</div>{sortMenu(true)}</div>
      </div>

      <div className="hidden space-y-3 md:block">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SearchField label="Número da OS / Externa" value={osNumberSearch} onChange={onOsNumberSearchChange} placeholder="Digite o número da OS ou externa" />
          <SearchField label="Nome do cliente" value={customerNameSearch} onChange={onCustomerNameSearchChange} placeholder="Digite o nome do cliente" />
          <SearchField label="CPF ou CNPJ" value={documentSearch} onChange={onDocumentSearchChange} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />
          <SearchField label="Número de série" value={serialNumberSearch} onChange={onSerialNumberSearchChange} placeholder="Digite o número de série" />
          <div className="min-w-0 space-y-1.5"><label className="block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Status</label><AdminSelect value={filterStatus} onValueChange={onStatusChange} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="text-xs" ariaLabel="Filtrar por status" /></div>
          <div className="min-w-0 space-y-1.5"><label className="block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Situação</label><AdminSelect value={filterSituation} onValueChange={onSituationChange} options={[{ value: "", label: "Todas as situações" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="text-xs" ariaLabel="Filtrar por situação" /></div>
          <div><OrderFilterMultiSelect label="Estados" options={ibgeStates.map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` }))} selectedValues={selectedStates} onSelect={onStateSelect} onRemove={onStateRemove} placeholder="Selecionar Estados" loading={ibgeStatesLoading} />{selectedStates.length > 0 && <AdminButton variant="ghost" size="sm" onClick={onStatesClear} className="mt-1 px-0 py-1 text-[11px] font-semibold text-red-600 hover:bg-transparent hover:text-red-700 hover:underline"><Eraser size={12} />Limpar Estados</AdminButton>}</div>
          <OrderFilterMultiSelect label="Cidades" options={cityFilterOptions.map(city => ({ value: `${city.state}:${city.name}`, label: `${city.name} — ${city.state}` }))} selectedValues={selectedCities.map(city => `${city.state}:${city.name}`)} onSelect={onCitySelect} onRemove={onCityRemove} placeholder={selectedStates.length === 0 ? "Selecione ao menos um Estado" : "Selecionar Cidades"} disabled={selectedStates.length === 0} loading={cityFiltersLoading} />
          <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Data inicial</label><input type="date" value={dateFrom} onChange={event => onDateFromChange(event.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")} /></div>
          <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Data final</label><input type="date" value={dateTo} onChange={event => onDateToChange(event.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")} />{invalidPeriod && <p className="mt-1 text-xs text-red-600">A data final deve ser igual ou posterior à inicial.</p>}</div>
          <div className="space-y-1.5"><label className="block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de Atendimento</label><AdminSelect value={selectedServiceTypeId} onValueChange={onServiceTypeChange} options={[{ value: "", label: "Todos os tipos" }, ...serviceTypes.map(serviceType => ({ value: serviceType.id, label: serviceType.title }))]} className="text-xs" ariaLabel="Filtrar por tipo de atendimento" /></div>
          <div className="min-w-0 space-y-1.5"><label className="block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Ordenação</label>{sortMenu(false)}</div>
        </div>
      </div>
    </div>
  </AdminCard>;
}

function SearchField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="min-w-0 space-y-1.5"><label className="block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label><div className="relative overflow-hidden rounded-lg"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap py-2 pl-9 text-xs")} /></div></div>;
}

function MobileSearchField({ value, onChange, placeholder, ariaLabel, inputMode }: { value: string; onChange: (value: string) => void; placeholder: string; ariaLabel: string; inputMode?: "numeric" }) {
  return <div className="relative min-w-0 overflow-hidden rounded-lg"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] min-w-0 w-full overflow-hidden text-ellipsis whitespace-nowrap py-2 pl-9 text-sm")} /></div>;
}