import { Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { cn, formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

type Props = {
  customers: any[];
  filtered: any[];
  pagedCustomers: any[];
  loading: boolean;
  isFetching: boolean;
  search: string;
  page: number;
  safePage: number;
  pageSize: number;
  totalPages: number;
  canCreate: boolean;
  canDelete: boolean;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenDetail: (customer: any) => void;
  onDelete: (customerId: string | null) => void;
};

const fmtDate = (value?: string) => value
  ? new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
  : "—";

export function CustomersList(props: Props) {
  const {
    customers, filtered, pagedCustomers, loading, isFetching, search, safePage,
    pageSize, totalPages, canCreate, canDelete, onSearchChange, onPageChange,
    onPageSizeChange, onCreate, onRefresh, onOpenDetail, onDelete,
  } = props;
  const setSearch = onSearchChange;
  const setPage = onPageChange;
  const setPageSize = onPageSizeChange;
  return <>
    <PageHeader title="Clientes" subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`} actions={
      <div className="flex flex-wrap gap-2">
        {canCreate && <AdminButton onClick={onCreate}><Plus size={13} /> Cadastrar Cliente</AdminButton>}
        <AdminButton variant="secondary" onClick={onRefresh} disabled={isFetching} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} /> Atualizar
        </AdminButton>
      </div>
    } />
    <AdminCard>
      <AdminCardToolbar>
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome, documento, WhatsApp ou e-mail..." className={cn(INPUT, "py-2 pl-9 text-xs")} />
        </div>
      </AdminCardToolbar>
      {loading ? <LoadingState /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente cadastrado" message="Os clientes aparecem aqui ao enviar um orçamento." onAdd={canCreate ? onCreate : undefined} addLabel="Cadastrar Cliente" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[700px]">
            <thead><tr>
              <th className="text-left">Nome</th>
              <th className="text-left">Tipo / documento</th>
              <th className="text-left">WhatsApp</th>
              <th className="text-left">E-mail</th>
              <th className="text-left">Cadastrado em</th>
              <th className="text-right">Ação</th>
            </tr></thead>
            <tbody>
              {pagedCustomers.map(c => (
                <tr key={c.id} onClick={() => onOpenDetail(c)} className="cursor-default">
                  <td className="font-bold text-[#0d1b2e]">{c.full_name}</td>
                  <td className="font-mono text-xs text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{c.customer_type === "PJ" ? "PJ" : "PF"}</span> · {c.customer_type === "PJ" ? (c.cnpj ? formatCnpj(c.cnpj) : "—") : (c.document ? formatCpf(c.document) : "—")}</td>
                  <td className="text-xs text-[#5a6a82]">{formatPhone(c.whatsapp) || "—"}</td>
                  <td className="max-w-[160px] truncate text-xs text-[#5a6a82]">{c.email || "—"}</td>
                  <td className="text-xs text-[#5a6a82]">{fmtDate(c.created_at)}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <AdminButton variant="ghost" size="sm" onClick={() => onOpenDetail(c)} className="ml-auto px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton>
                      {canDelete && <AdminIconButton ariaLabel="Excluir cliente" title="Excluir cliente" variant="danger" onClick={() => onDelete(c.id)} className="h-7 w-7"><Trash2 size={14} /></AdminIconButton>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }} />
    </AdminCard>
  </>;
}
