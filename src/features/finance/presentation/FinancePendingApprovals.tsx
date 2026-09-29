import { useEffect, useState } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, AdminCardHeader, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { useFinancePendingApprovals } from "../application/useFinanceEntries";
import type { FinancialEntryType } from "../domain/finance.types";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function FinancePendingApprovals({ onSelectEntry }: { onSelectEntry: (type: FinancialEntryType, id: string) => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useFinancePendingApprovals(page, pageSize);
  const entries = query.data?.items || [];
  const totalItems = query.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (!query.isFetching && page > totalPages) setPage(totalPages);
  }, [page, query.isFetching, totalPages]);

  return <AdminCard>
    <AdminCardHeader>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><ShieldAlert size={18} /></div><div className="min-w-0"><h3 className="text-sm font-black text-[#0d1b2e]">Aguardando aprovação</h3><p className="text-xs text-[#5a6a82]">Contas pendentes visíveis para seu acesso.</p></div></div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700">{totalItems}</span>
      </div>
    </AdminCardHeader>

    {query.isLoading ? <div className="p-8"><LoadingState text="Carregando aprovações..." /></div> : query.error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{query.error instanceof Error ? query.error.message : "Não foi possível carregar as aprovações pendentes."}</div> : entries.length === 0 ? <div className="p-6 text-center text-sm text-[#5a6a82]">Nenhum lançamento aguardando aprovação.</div> : <>
      <div className="grid gap-2 p-3 md:hidden">{entries.map(entry => <button key={entry.id} type="button" onClick={() => onSelectEntry(entry.entry_type, entry.id)} className="rounded-xl border border-[#0d1b2e]/8 p-3 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-[#0d1b2e]">{entry.description}</p><p className="mt-1 truncate text-xs text-[#5a6a82]">{entry.counterpart_name_snapshot || "Sem contraparte"} · {entry.entry_type === "receivable" ? "Receber" : "Pagar"}</p></div><p className="shrink-0 text-sm font-black text-[#0057e7]">{formatCurrency(entry.original_amount)}</p></div><div className="mt-2 flex items-center justify-between text-xs text-[#5a6a82]"><span>Venc.: <strong>{formatDate(entry.next_due_date)}</strong></span><span className="font-black text-amber-700">{entry.approval_count || 0}/{entry.required_approvals}</span></div></button>)}</div>
      <div className="hidden overflow-x-auto md:block"><table className="min-w-[760px]"><thead><tr><th className="text-left">Lançamento</th><th className="text-left">Tipo</th><th className="text-left">Contraparte</th><th className="text-left">Vencimento</th><th className="text-center">Aprovações</th><th className="text-right">Valor</th><th className="w-12"></th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td className="font-bold text-[#0d1b2e]">{entry.description}</td><td className="text-xs font-semibold text-[#5a6a82]">{entry.entry_type === "receivable" ? "Receber" : "Pagar"}</td><td className="text-xs text-[#5a6a82]">{entry.counterpart_name_snapshot || "—"}</td><td className="text-xs">{formatDate(entry.next_due_date)}</td><td className="text-center"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">{entry.approval_count || 0}/{entry.required_approvals}</span></td><td className="text-right font-black text-[#0057e7]">{formatCurrency(entry.original_amount)}</td><td><AdminIconButton ariaLabel="Abrir lançamento" onClick={() => onSelectEntry(entry.entry_type, entry.id)}><ChevronRight size={15} /></AdminIconButton></td></tr>)}</tbody></table></div>
      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        defaultPageSize={10}
        pageSizeOptions={[10, 20, 50]}
      />
    </>}
  </AdminCard>;
}
