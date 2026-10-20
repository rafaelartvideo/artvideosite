import { Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminSearchPanel, AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";

type OrderSort = "" | "asc" | "desc";

export function PartnerOrdersFilters({
  numberSearch, documentSearch, orderSort,
  onNumberSearchChange, onDocumentSearchChange, onOrderSortChange, onClear,
}: {
  numberSearch: string;
  documentSearch: string;
  orderSort: OrderSort;
  onNumberSearchChange: (value: string) => void;
  onDocumentSearchChange: (value: string) => void;
  onOrderSortChange: (value: OrderSort) => void;
  onClear: () => void;
}) {
  const hasFilters = Boolean(numberSearch || documentSearch || orderSort);
  return <AdminSearchPanel title="Buscar OS" headerActions={<>
    {hasFilters && <AdminSearchClearButton onClick={onClear} />}
    <AdminSearchSortMenu value={orderSort} onChange={onOrderSortChange}
      options={[{ value: "", label: "Ordenação padrão" }, { value: "asc", label: "OS crescente" }, { value: "desc", label: "OS decrescente" }]} />
  </>}>
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <SearchField label="Número da OS / OS externa" value={numberSearch}
        onChange={onNumberSearchChange} placeholder="Digite o número da OS ou OS externa" />
      <SearchField label="CPF / CNPJ" value={documentSearch} onChange={onDocumentSearchChange}
        placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />
    </div>
  </AdminSearchPanel>;
}

function SearchField({
  label, value, onChange, placeholder, inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric";
}) {
  return <div className="min-w-0">
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:mb-1">{label}</label>
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)}
        placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs md:h-9 md:py-1.5")} />
    </div>
  </div>;
}
