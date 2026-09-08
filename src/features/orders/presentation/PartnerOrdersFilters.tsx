import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, Eraser, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";

type OrderSort = "" | "asc" | "desc";

export function PartnerOrdersFilters({
  numberSearch,
  documentSearch,
  orderSort,
  onNumberSearchChange,
  onDocumentSearchChange,
  onOrderSortChange,
  onClear,
}: {
  numberSearch: string;
  documentSearch: string;
  orderSort: OrderSort;
  onNumberSearchChange: (value: string) => void;
  onDocumentSearchChange: (value: string) => void;
  onOrderSortChange: (value: OrderSort) => void;
  onClear: () => void;
}) {
  const hasFilters = Boolean(numberSearch || documentSearch);
  const sortLabel = orderSort === "asc" ? "OS crescente" : orderSort === "desc" ? "OS decrescente" : "Ordenação padrão";
  const SortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ordenação atual: ${sortLabel}`}
          title={sortLabel}
          className={cn(
            "inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40",
            orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82]",
          )}
        >
          <SortIcon size={17} className="text-[#0057e7]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {([["", "Ordenação padrão", ArrowUpDown], ["asc", "OS crescente", ArrowUpNarrowWide], ["desc", "OS decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value || "default"} onSelect={() => onOrderSortChange(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}>
            <Icon size={15} />
            <span>{label}</span>
            {orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return <AdminCard className="overflow-hidden p-0">
    <div className="flex items-center gap-2 bg-[#0057e7] px-4 py-3 text-white">
      <Search size={16} className="shrink-0" />
      <span className="text-xs font-black uppercase tracking-[0.14em]">Buscar OS</span>
    </div>
    <div className="p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_42px] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_42px]">
        <SearchField
          label="Número da OS / OS externa"
          value={numberSearch}
          onChange={onNumberSearchChange}
          placeholder="Digite o número da OS ou OS externa"
        />
        <div className="hidden md:block">
          <SearchField
            label="CPF / CNPJ"
            value={documentSearch}
            onChange={onDocumentSearchChange}
            placeholder="Digite o CPF ou CNPJ"
            inputMode="numeric"
          />
        </div>
        <div className="flex items-end">{sortMenu}</div>
      </div>
      <div className="mt-3 md:hidden">
        <SearchField
          label="CPF / CNPJ"
          value={documentSearch}
          onChange={onDocumentSearchChange}
          placeholder="Digite o CPF ou CNPJ"
          inputMode="numeric"
        />
      </div>
      {hasFilters && <div className="mt-3 flex justify-end">
        <AdminButton variant="danger" size="sm" onClick={onClear} className="bg-white text-red-600 hover:bg-red-50">
          <Eraser size={14} /> Limpar filtros
        </AdminButton>
      </div>}
    </div>
  </AdminCard>;
}

function SearchField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric";
}) {
  return <div className="min-w-0">
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label>
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
      <input
        inputMode={inputMode}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")}
      />
    </div>
  </div>;
}
