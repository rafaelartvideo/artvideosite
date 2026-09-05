import { Eraser, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminFilterMultiSelect, type AdminFilterOption } from "@/shared/ui/admin/AdminFilterMultiSelect";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

type Props = {
  customers: any[];
  filtered: any[];
  pagedCustomers: any[];
  loading: boolean;
  isFetching: boolean;
  nameSearch: string;
  documentSearch: string;
  selectedStates: string[];
  selectedCities: string[];
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
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenDetail: (customer: any) => void;
  onDelete: (customerId: string | null) => void;
};

const fmtDate = (value?: string) => value ? new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export function CustomersList(props: Props) {
  const { hasPermission } = useAuth();
  const showName = hasPermission("customers.table.name");
  const showDocument = hasPermission("customers.table.document");
  const showWhatsapp = hasPermission("customers.table.whatsapp");
  const showEmail = hasPermission("customers.table.email");
  const showCreatedAt = hasPermission("customers.table.created_at");
  const showActions = hasPermission("customers.table.actions");
  const {
    customers, filtered, pagedCustomers, loading, isFetching,
    nameSearch, documentSearch, selectedStates, selectedCities, stateOptions, cityOptions, hasFilters,
    safePage, pageSize, totalPages, canCreate, canDelete,
    onNameSearchChange, onDocumentSearchChange, onStateToggle, onCityToggle, onClearFilters,
    onPageChange, onPageSizeChange, onCreate, onRefresh, onOpenDetail, onDelete,
  } = props;

  return <>
    <PageHeader title="Clientes" subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`} actions={<div className="flex flex-wrap gap-2">{canCreate && <AdminButton onClick={onCreate}><Plus size={13} /> Cadastrar Cliente</AdminButton>}<AdminButton variant="secondary" onClick={onRefresh} disabled={isFetching} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5"><RefreshCw size={13} className={isFetching ? "animate-spin" : ""} /> Atualizar</AdminButton></div>} />

    <AdminSearchPanel title="Buscar clientes">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SearchField label="Nome" value={nameSearch} onChange={value => { onNameSearchChange(value); onPageChange(1); }} placeholder="Digite o nome do cliente" />
        <SearchField label="CPF / CNPJ" value={documentSearch} onChange={value => { onDocumentSearchChange(value); onPageChange(1); }} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />
        <AdminFilterMultiSelect label="Estado" options={stateOptions} selectedValues={selectedStates} onToggle={value => { onStateToggle(value); onPageChange(1); }} placeholder="Selecionar Estado" />
        <AdminFilterMultiSelect label="Cidade" options={cityOptions} selectedValues={selectedCities} onToggle={value => { onCityToggle(value); onPageChange(1); }} placeholder={selectedStates.length ? "Selecionar Cidade" : "Selecionar Cidade"} disabled={stateOptions.length === 0} />
      </div>
      {hasFilters && <div className="mt-3 flex justify-end"><AdminButton variant="danger" size="sm" onClick={onClearFilters} className="bg-white text-red-600 hover:bg-red-50"><Eraser size={14} /> Limpar filtros</AdminButton></div>}
    </AdminSearchPanel>

    <AdminCard>
      {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Users} title="Nenhum cliente encontrado" message="Ajuste os filtros para localizar o cliente desejado." onAdd={canCreate && customers.length === 0 ? onCreate : undefined} addLabel="Cadastrar Cliente" /> : <div className="overflow-x-auto"><table className="min-w-[700px]"><thead><tr>{showName && <th className="text-left">Nome</th>}{showDocument && <th className="text-left">Tipo / documento</th>}{showWhatsapp && <th className="text-left">WhatsApp</th>}{showEmail && <th className="text-left">E-mail</th>}{showCreatedAt && <th className="text-left">Cadastrado em</th>}{showActions && <th className="text-right">Ação</th>}</tr></thead><tbody>{pagedCustomers.map(c => <tr key={c.id} onClick={() => onOpenDetail(c)} className="cursor-default">{showName && <td className="font-bold text-[#0d1b2e]">{c.full_name}</td>}{showDocument && <td className="font-mono text-xs text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{c.customer_type === "PJ" ? "PJ" : "PF"}</span> · {c.customer_type === "PJ" ? (c.cnpj ? formatCnpj(c.cnpj) : "—") : (c.document ? formatCpf(c.document) : "—")}</td>}{showWhatsapp && <td className="text-xs text-[#5a6a82]">{formatPhone(c.whatsapp) || "—"}</td>}{showEmail && <td className="max-w-[160px] truncate text-xs text-[#5a6a82]">{c.email || "—"}</td>}{showCreatedAt && <td className="text-xs text-[#5a6a82]">{fmtDate(c.created_at)}</td>}{showActions && <td onClick={event => event.stopPropagation()}><div className="flex items-center justify-end gap-2"><AdminButton variant="ghost" size="sm" onClick={() => onOpenDetail(c)} className="ml-auto px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton>{canDelete && <AdminIconButton ariaLabel="Excluir cliente" title="Excluir cliente" variant="danger" onClick={() => onDelete(c.id)} className="h-7 w-7"><Trash2 size={14} /></AdminIconButton>}</div></td>}</tr>)}</tbody></table></div>}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={nextPage => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={nextPageSize => { onPageSizeChange(nextPageSize); onPageChange(1); }} />
    </AdminCard>
  </>;
}

function SearchField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="min-w-0"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div></div>;
}
