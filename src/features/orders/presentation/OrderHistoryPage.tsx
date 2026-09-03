import { Plus, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminDialog, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import type { useOrderHistory } from "../application/useOrderHistory";

export function OrderHistoryPage({
  order,
  history,
  canCreate,
  formatDate,
}: {
  order: any;
  history: ReturnType<typeof useOrderHistory>;
  canCreate: boolean;
  formatDate: (value?: string | null, time?: boolean) => string;
}) {
  if (!history.pageOpen) return null;
  return <>
    <AdminPage open onClose={history.closePage} breadcrumb={`Ordens de Serviço > ${order.os_number || "OS"}`} title="Histórico da OS" subtitle="Linha do tempo de alterações e registros da equipe" maxW="max-w-2xl">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="min-w-0 text-[10px] font-bold uppercase text-[#5a6a82]">Usuário
            <select value={history.userFilter} onChange={(event) => history.setUserFilter(event.target.value)} className={cn(INPUT, "mt-1 min-w-0 text-xs font-medium normal-case")}>
              <option value="">Todos os usuários</option>
              {history.authorOptions.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
              <option value="system">Sistema</option>
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-bold uppercase text-[#5a6a82]">Data
            <input type="date" value={history.dateFilter} onChange={(event) => history.setDateFilter(event.target.value)} className={cn(INPUT, "mt-1 min-w-0 text-xs font-medium normal-case")} />
          </label>
          <label className="min-w-0 text-[10px] font-bold uppercase text-[#5a6a82]">Ordenação
            <select value={history.sort} onChange={(event) => history.setSort(event.target.value as "desc" | "asc")} className={cn(INPUT, "mt-1 min-w-0 text-xs font-medium normal-case")}>
              <option value="desc">Mais recentes primeiro</option>
              <option value="asc">Mais antigos primeiro</option>
            </select>
          </label>
          {(history.userFilter || history.dateFilter) && <button type="button" onClick={history.clearFilters} className="h-10 self-end rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50">Limpar</button>}
        </div>
        {history.loading ? <p className="py-8 text-center text-sm text-[#5a6a82]">Carregando histórico...</p> : history.entries.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 p-8 text-center text-sm text-[#5a6a82]">Nenhum registro encontrado.</div> : <div className="space-y-3">{history.entries.map((item) => <div key={item.id} className={cn("min-w-0 overflow-hidden rounded-xl border p-4", item.type === "note" ? "border-[#0057e7]/15 bg-white" : "border-[#0d1b2e]/8 bg-[#f8fafc]")}>
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2"><div className="min-w-0"><p className="truncate text-xs font-black text-[#0d1b2e]">{item.author}</p><p className="mt-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{item.title}</p></div><span className="shrink-0 text-[10px] text-[#5a6a82]">{formatDate(item.createdAt, true)}</span></div>
          <p className="mt-3 break-words whitespace-pre-line text-sm leading-relaxed text-[#0d1b2e]">{item.content}</p>
        </div>)}</div>}
      </div>
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-[#0d1b2e]/8 bg-white px-3 py-3 sm:justify-between sm:px-5 sm:py-4">
        <BtnSecondary onClick={history.closePage} className="min-w-0 flex-1 sm:flex-none">Voltar para a OS</BtnSecondary>
        {canCreate && <BtnPrimary onClick={() => { history.setText(""); history.setModalOpen(true); }} className="min-w-0 flex-1 sm:flex-none"><Plus size={14} /> Novo registro</BtnPrimary>}
      </div>
    </AdminPage>
    {history.modalOpen && canCreate && <AdminDialog open={history.modalOpen} onClose={() => { if (!history.saving) history.setModalOpen(false); }} title="Novo registro" description="Adicione uma observação permanente ao histórico" className="max-w-lg" footer={<div className="flex w-full gap-2 sm:justify-end sm:gap-3"><BtnSecondary onClick={() => history.setModalOpen(false)} className="min-w-0 flex-1 sm:flex-none">Cancelar</BtnSecondary><BtnPrimary onClick={history.submit} disabled={!history.text.trim() || history.saving} className="min-w-0 flex-1 sm:flex-none">{history.saving ? "Registrando..." : "Registrar no histórico"}</BtnPrimary></div>}>
      <textarea autoFocus value={history.text} onChange={(event) => history.setText(event.target.value)} maxLength={2000} rows={6} placeholder="Escreva o que precisa ficar registrado nesta OS..." className={cn(INPUT, "h-auto min-w-0 resize-y text-sm")} />
      <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#5a6a82]"><span>O registro não poderá ser editado ou excluído.</span><span className="shrink-0">{history.text.length}/2000</span></div>
    </AdminDialog>}
  </>;
}
