import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, ChevronDown, Eraser, Plus, Search, Trash2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, formatCnpj, formatCpf, formatDateOnly, formatPhone, normalizeDigits } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminFilterMultiSelect, type AdminFilterOption } from "@/shared/ui/admin/AdminFilterMultiSelect";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import type { CustomerSort } from "../application/useCustomersList";

type MobileFilterKey = "name" | "document" | "states" | "cities";

const mobileFilterOptions: Array<{ value: MobileFilterKey; label: string }> = [
  { value: "name", label: "Nome" },
  { value: "document", label: "CPF / CNPJ" },
  { value: "states", label: "Estado" },
  { value: "cities", label: "Cidade" },
];

type Props = {
  customers: any[];
  filtered: any[];
  pagedCustomers: any[];
  loading: boolean;
  nameSearch: string;
  documentSearch: string;
  selectedStates: string[];
  selectedCities: string[];
  orderSort: CustomerSort;
  stateOptions: AdminFilterOption[];
  cityOptions: AdminFilterOption[];
  hasFilters: boolean;
  page: number;
  safePage: number;
  pageSize: number;
  totalPages: number;
  canCreate: boolean;
  canDelete: boolean;
  onNameSearchChange: (value: string) => void;
  onDocumentSearchChange: (value: string) => void;
  onStateToggle: (value: string) => void;
  onCityToggle: (value: string) => void;
  onOrderSortChange: (value: CustomerSort) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onCreate: () => void;
  onOpenDetail: (customer: any) => void;
  onDelete: (customerId: string | null) => void;
};

const customerDocument = (customer: any) => customer.customer_type === "PJ" ? (customer.cnpj ? formatCnpj(customer.cnpj) : "—") : (customer.document ? formatCpf(customer.document) : "—");
const formatDocumentSearch = (value: string) => {
  const digits = normalizeDigits(value).slice(0, 14);
  return digits.length > 11 ? formatCnpj(digits) : formatCpf(digits);
};

export function CustomersList(props: Props) {
  const { hasPermission } = useAuth();
  const [mobileFilter, setMobileFilter] = useState<MobileFilterKey>("name");
  const showName = hasPermission("customers.table.name");
  const showDocument = hasPermission("customers.table.document");
  const showWhatsapp = hasPermission("customers.table.whatsapp");
  const showEmail = hasPermission("customers.table.email");
  const showCreatedAt = hasPermission("customers.table.created_at");
  const showActions = hasPermission("customers.table.actions");
  const {
    customers, filtered, pagedCustomers, loading,
    nameSearch, documentSearch, selectedStates, selectedCities, orderSort, stateOptions, cityOptions, hasFilters,
    safePage, pageSize, totalPages, canCreate, canDelete,
    onNameSearchChange, onDocumentSearchChange, onStateToggle, onCityToggle, onOrderSortChange, onClearFilters,
    onPageChange, onPageSizeChange, onCreate, onOpenDetail, onDelete,
  } = props;
  const mobileFilterLabel = mobileFilterOptions.find(option => option.value === mobileFilter)?.label || "Nome";
  const sortLabel = orderSort === "asc" ? "Nome crescente" : orderSort === "desc" ? "Nome decrescente" : "Ordenação padrão";
  const SortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Ordenação atual: ${sortLabel}`} title={sortLabel} className={cn("inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40", orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82]")}><SortIcon size={17} className="text-[#0057e7]" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {([["", "Ordenação padrão", ArrowUpDown], ["asc", "Nome crescente", ArrowUpNarrowWide], ["desc", "Nome decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => onOrderSortChange(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Icon size={15} /><span>{label}</span>{orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMobileFilter = () => {
    if (mobileFilter === "name") return <MobileSearchField value={nameSearch} onChange={value => { onNameSearchChange(value); onPageChange(1); }} placeholder="Digite o nome do cliente" />;
    if (mobileFilter === "document") return <MobileSearchField value={documentSearch} onChange={value => { onDocumentSearchChange(formatDocumentSearch(value)); onPageChange(1); }} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />;
    if (mobileFilter === "states") return <AdminFilterMultiSelect label="Estado" options={stateOptions} selectedValues={selectedStates} onToggle={value => { onStateToggle(value); onPageChange(1); }} placeholder="Selecionar Estado" />;
    return <AdminFilterMultiSelect label="Cidade" options={cityOptions} selectedValues={selectedCities} onToggle={value => { onCityToggle(value); onPageChange(1); }} placeholder={selectedStates.length ? "Selecionar Cidade" : "Selecione primeiro um Estado"} disabled={!selectedStates.length} />;
  };

  return <>
    <PageHeader
      title="Clientes"
      subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`}
      actions={canCreate ? <AdminButton onClick={onCreate}><Plus size={13} /> Cadastrar</AdminButton> : undefined}
    />

    <AdminSearchPanel title="Buscar clientes">
      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Buscar por: ${mobileFilterLabel}`} className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><span className="min-w-0 truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} className="shrink-0 text-[#5a6a82]" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              {mobileFilterOptions.map(option => <DropdownMenuItem key={option.value} onSelect={() => setMobileFilter(option.value)} className={cn("cursor-pointer", mobileFilter === option.value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Search size={14} /><span>{option.label}</span>{mobileFilter === option.value && <Check size={14} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          {sortMenu}
        </div>
        <div className="min-w-0">{renderMobileFilter()}</div>
        {hasFilters && <div className="flex justify-end"><button type="button" onClick={onClearFilters} aria-label="Limpar filtros" title="Limpar filtros" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"><Eraser size={15} /></button></div>}
      </div>

      <div className="hidden grid-cols-1 gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
        <SearchField label="Nome" value={nameSearch} onChange={value => { onNameSearchChange(value); onPageChange(1); }} placeholder="Digite o nome do cliente" />
        <SearchField label="CPF / CNPJ" value={documentSearch} onChange={value => { onDocumentSearchChange(formatDocumentSearch(value)); onPageChange(1); }} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />
        <AdminFilterMultiSelect label="Estado" options={stateOptions} selectedValues={selectedStates} onToggle={value => { onStateToggle(value); onPageChange(1); }} placeholder="Selecionar Estado" />
        <AdminFilterMultiSelect label="Cidade" options={cityOptions} selectedValues={selectedCities} onToggle={value => { onCityToggle(value); onPageChange(1); }} placeholder="Selecionar Cidade" disabled={stateOptions.length === 0} />
      </div>
      <div className="mt-3 hidden items-center justify-between md:flex"><div className="w-[220px]"><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={cn("flex h-[42px] w-full items-center justify-between rounded-lg border bg-white px-3 text-xs", orderSort ? "border-[#0057e7] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82]")}><span className="flex items-center gap-2"><SortIcon size={15} />{sortLabel}</span><ChevronDown size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-[220px]">{([["", "Ordenação padrão", ArrowUpDown], ["asc", "Nome crescente", ArrowUpNarrowWide], ["desc", "Nome decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => onOrderSortChange(value)}><Icon size={15} />{label}{orderSort === value && <Check size={14} className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>{hasFilters && <AdminButton variant="danger" size="sm" onClick={onClearFilters} className="bg-white text-red-600 hover:bg-red-50"><Eraser size={14} /> Limpar filtros</AdminButton>}</div>
    </AdminSearchPanel>

    <AdminCard>
      {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Users} title="Nenhum cliente encontrado" message="Ajuste os filtros para localizar o cliente desejado." onAdd={canCreate && customers.length === 0 ? onCreate : undefined} addLabel="Cadastrar Cliente" /> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{pagedCustomers.map(customer => <article key={customer.id} role="button" tabIndex={0} onClick={() => onOpenDetail(customer)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenDetail(customer); } }} className="min-w-0 p-4 transition-colors active:bg-[#f5f7fa]">
          <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1">{showName && <p className="truncate text-sm font-bold text-[#0d1b2e]">{customer.full_name || "—"}</p>}{showDocument && <p className="mt-1 font-mono text-[11px] text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{customer.customer_type === "PJ" ? "PJ" : "PF"}</span> · {customerDocument(customer)}</p>}</div>{showCreatedAt && <span className="shrink-0 text-[10px] font-medium text-[#8a96a8]">{formatDateOnly(customer.created_at, "—")}</span>}</div>
          <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs xs:grid-cols-2">{showWhatsapp && <Info label="WhatsApp" value={formatPhone(customer.whatsapp) || "—"} />}{showEmail && <Info label="E-mail" value={customer.email || "—"} />}</div>
          {showActions && <div onClick={event => event.stopPropagation()} className="mt-3 flex items-center justify-end gap-2 border-t border-[#0d1b2e]/8 pt-3"><AdminButton variant="ghost" size="sm" onClick={() => onOpenDetail(customer)} className="px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton>{canDelete && <AdminIconButton ariaLabel="Excluir cliente" title="Excluir cliente" variant="danger" onClick={() => onDelete(customer.id)} className="h-8 w-8"><Trash2 size={14} /></AdminIconButton>}</div>}
        </article>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[700px]"><thead><tr>{showName && <th className="text-left">Nome</th>}{showDocument && <th className="text-left">Tipo / documento</th>}{showWhatsapp && <th className="text-left">WhatsApp</th>}{showEmail && <th className="text-left">E-mail</th>}{showCreatedAt && <th className="text-left">Cadastrado em</th>}{showActions && <th className="text-right">Ação</th>}</tr></thead><tbody>{pagedCustomers.map(c => <tr key={c.id} onClick={() => onOpenDetail(c)} className="cursor-default">{showName && <td className="font-bold text-[#0d1b2e]">{c.full_name}</td>}{showDocument && <td className="font-mono text-xs text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{c.customer_type === "PJ" ? "PJ" : "PF"}</span> · {customerDocument(c)}</td>}{showWhatsapp && <td className="text-xs text-[#5a6a82]">{formatPhone(c.whatsapp) || "—"}</td>}{showEmail && <td className="max-w-[160px] truncate text-xs text-[#5a6a82]">{c.email || "—"}</td>}{showCreatedAt && <td className="text-xs text-[#5a6a82]">{formatDateOnly(c.created_at, "—")}</td>}{showActions && <td onClick={event => event.stopPropagation()}><div className="flex items-center justify-end gap-2"><AdminButton variant="ghost" size="sm" onClick={() => onOpenDetail(c)} className="ml-auto px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton>{canDelete && <AdminIconButton ariaLabel="Excluir cliente" title="Excluir cliente" variant="danger" onClick={() => onDelete(c.id)} className="h-7 w-7"><Trash2 size={14} /></AdminIconButton>}</div></td>}</tr>)}</tbody></table></div>
      </>}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={nextPage => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={nextPageSize => { onPageSizeChange(nextPageSize); onPageChange(1); }} />
    </AdminCard>
  </>;
}

function SearchField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="min-w-0"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div></div>;
}

function MobileSearchField({ value, onChange, placeholder, inputMode }: { value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="relative min-w-0"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">{label}</p><p className="truncate font-medium text-[#5a6a82]">{value}</p></div>;
}