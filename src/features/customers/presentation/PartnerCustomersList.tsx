import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, Eraser, Search, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, formatCnpj, formatCpf, formatDateOnly, formatPhone, normalizeDigits } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import type { CustomerSort } from "../application/useCustomersList";

type Props = {
  customers: any[];
  filtered: any[];
  pagedCustomers: any[];
  loading: boolean;
  nameSearch: string;
  documentSearch: string;
  orderSort: CustomerSort;
  safePage: number;
  pageSize: number;
  totalPages: number;
  onNameSearchChange: (value: string) => void;
  onDocumentSearchChange: (value: string) => void;
  onOrderSortChange: (value: CustomerSort) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenDetail: (customer: any) => void;
};

const customerDocument = (customer: any) => customer.customer_type === "PJ"
  ? (customer.cnpj ? formatCnpj(customer.cnpj) : "—")
  : (customer.document ? formatCpf(customer.document) : "—");

const formatDocumentSearch = (value: string) => {
  const digits = normalizeDigits(value).slice(0, 14);
  return digits.length > 11 ? formatCnpj(digits) : formatCpf(digits);
};

export function PartnerCustomersList({
  customers,
  filtered,
  pagedCustomers,
  loading,
  nameSearch,
  documentSearch,
  orderSort,
  safePage,
  pageSize,
  totalPages,
  onNameSearchChange,
  onDocumentSearchChange,
  onOrderSortChange,
  onClearFilters,
  onPageChange,
  onPageSizeChange,
  onOpenDetail,
}: Props) {
  const { hasPermission } = useAuth();
  const showName = hasPermission("customers.table.name");
  const showDocument = hasPermission("customers.table.document");
  const showWhatsapp = hasPermission("customers.table.whatsapp");
  const showEmail = hasPermission("customers.table.email");
  const showCreatedAt = hasPermission("customers.table.created_at");
  const showActions = hasPermission("customers.table.actions");
  const hasFilters = Boolean(nameSearch || documentSearch);
  const sortLabel = orderSort === "asc" ? "Nome crescente" : orderSort === "desc" ? "Nome decrescente" : "Ordenação padrão";
  const SortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  const sortMenu = <DropdownMenu>
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
      {([["", "Ordenação padrão", ArrowUpDown], ["asc", "Nome crescente", ArrowUpNarrowWide], ["desc", "Nome decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => (
        <DropdownMenuItem key={value || "default"} onSelect={() => onOrderSortChange(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}>
          <Icon size={15} />
          <span>{label}</span>
          {orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>;

  return <>
    <PageHeader
      title="Clientes"
      subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`}
    />

    <AdminSearchPanel title="Buscar clientes">
      <div className="grid grid-cols-[minmax(0,1fr)_42px] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_42px]">
        <SearchField
          label="Nome"
          value={nameSearch}
          onChange={value => { onNameSearchChange(value); onPageChange(1); }}
          placeholder="Digite o nome do cliente"
        />
        <div className="hidden md:block">
          <SearchField
            label="CPF / CNPJ"
            value={documentSearch}
            onChange={value => { onDocumentSearchChange(formatDocumentSearch(value)); onPageChange(1); }}
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
          onChange={value => { onDocumentSearchChange(formatDocumentSearch(value)); onPageChange(1); }}
          placeholder="Digite o CPF ou CNPJ"
          inputMode="numeric"
        />
      </div>
      {hasFilters && <div className="mt-3 flex justify-end">
        <AdminButton variant="danger" size="sm" onClick={onClearFilters} className="bg-white text-red-600 hover:bg-red-50">
          <Eraser size={14} /> Limpar filtros
        </AdminButton>
      </div>}
    </AdminSearchPanel>

    <AdminCard>
      {loading ? <LoadingState /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente encontrado" message="Ajuste os filtros para localizar o cliente desejado." />
      ) : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">
          {pagedCustomers.map(customer => <article
            key={customer.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenDetail(customer)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenDetail(customer);
              }
            }}
            className="min-w-0 p-4 transition-colors active:bg-[#f5f7fa]"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {showName && <p className="truncate text-sm font-bold text-[#0d1b2e]">{customer.full_name || "—"}</p>}
                {showDocument && <p className="mt-1 font-mono text-[11px] text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{customer.customer_type === "PJ" ? "PJ" : "PF"}</span> · {customerDocument(customer)}</p>}
              </div>
              {showCreatedAt && <span className="shrink-0 text-[10px] font-medium text-[#8a96a8]">{formatDateOnly(customer.created_at, "—")}</span>}
            </div>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs xs:grid-cols-2">
              {showWhatsapp && <Info label="WhatsApp" value={formatPhone(customer.whatsapp) || "—"} />}
              {showEmail && <Info label="E-mail" value={customer.email || "—"} />}
            </div>
            {showActions && <div className="mt-3 flex justify-end border-t border-[#0d1b2e]/8 pt-3">
              <AdminButton variant="ghost" size="sm" onClick={() => onOpenDetail(customer)} className="px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton>
            </div>}
          </article>)}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[700px]">
            <thead><tr>
              {showName && <th className="text-left">Nome</th>}
              {showDocument && <th className="text-left">Tipo / documento</th>}
              {showWhatsapp && <th className="text-left">WhatsApp</th>}
              {showEmail && <th className="text-left">E-mail</th>}
              {showCreatedAt && <th className="text-left">Cadastrado em</th>}
              {showActions && <th className="text-right">Ação</th>}
            </tr></thead>
            <tbody>{pagedCustomers.map(customer => <tr key={customer.id} onClick={() => onOpenDetail(customer)} className="cursor-default">
              {showName && <td className="font-bold text-[#0d1b2e]">{customer.full_name}</td>}
              {showDocument && <td className="font-mono text-xs text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{customer.customer_type === "PJ" ? "PJ" : "PF"}</span> · {customerDocument(customer)}</td>}
              {showWhatsapp && <td className="text-xs text-[#5a6a82]">{formatPhone(customer.whatsapp) || "—"}</td>}
              {showEmail && <td className="max-w-[160px] truncate text-xs text-[#5a6a82]">{customer.email || "—"}</td>}
              {showCreatedAt && <td className="text-xs text-[#5a6a82]">{formatDateOnly(customer.created_at, "—")}</td>}
              {showActions && <td onClick={event => event.stopPropagation()}><div className="flex justify-end"><AdminButton variant="ghost" size="sm" onClick={() => onOpenDetail(customer)} className="px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton></div></td>}
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      <PaginationBar
        page={safePage}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={nextPage => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))}
        onPageSizeChange={nextPageSize => { onPageSizeChange(nextPageSize); onPageChange(1); }}
      />
    </AdminCard>
  </>;
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

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">{label}</p><p className="truncate font-medium text-[#5a6a82]">{value}</p></div>;
}
