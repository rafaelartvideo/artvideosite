import { Plus, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
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
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
          <label className="min-w-44 flex-1 text-[10px] font-bold uppercase text-[#5a6a82]">Usuário
            <select value={history.userFilter} onChange={(event) => history.setUserFilter(event.target.value)} className={cn(INPUT, "mt-1 text-xs font-medium normal-case")}>
              <option value="">Todos os usuários</option>
              {history.authorOptions.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
              <option value="system">Sistema</option>
            </select>
          </label>
          <label className="min-w-40 flex-1 text-[10px] font-bold uppercase text-[#5a6a82]">Data
            <input type="date" value={history.dateFilter} onChange={(event) => history.setDateFilter(event.target.value)} className={cn(INPUT, "mt-1 text-xs font-medium normal-case")} />
          </label>
          <label className="min-w-44 flex-1 text-[10px] font-bold uppercase text-[#5a6a82]">Ordenação
            <select value={history.sort} onChange={(event) => history.setSort(event.target.value as "desc" | "asc")} className={cn(INPUT, "mt-1 text-xs font-medium normal-case")}>
              <option value="desc">Mais recentes primeiro</option>
              <option value="asc">Mais antigos primeiro</option>
            </select>
          </label>
          {(history.userFilter || history.dateFilter) && <button type="button" onClick={history.clearFilters} className="h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50">Limpar</button>}
        </div>
        {history.loading ? <p className="py-8 text-center text-sm text-[#5a6a82]">Carregando histórico...</p> : history.entries.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 p-8 text-center text-sm text-[#5a6a82]">Nenhum registro encontrado.</div> : <div className="space-y-3">{history.entries.map((item) => <div key={item.id} className={cn("rounded-xl border p-4", item.type === "note" ? "border-[#0057e7]/15 bg-white" : "border-[#0d1b2e]/8 bg-[#f8fafc]")}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-[#0d1b2e]">{item.author}</p><p className="mt-0.5 text-[10px] font-bold uppercase text-[#5a6a82]">{item.title}</p></div><span className="text-[10px] text-[#5a6a82]">{formatDate(item.createdAt, true)}</span></div>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#0d1b2e]">{item.content}</p>
        </div>)}</div>}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
        <BtnSecondary onClick={history.closePage}>Voltar para a OS</BtnSecondary>
        {canCreate && <BtnPrimary onClick={() => { history.setText(""); history.setModalOpen(true); }}><Plus size={14} /> Novo registro</BtnPrimary>}
      </div>
    </AdminPage>
    {history.modalOpen && canCreate && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget && !history.saving) history.setModalOpen(false); }}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#0d1b2e]/8 px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">Novo registro</h2><p className="mt-0.5 text-sm text-[#5a6a82]">Adicione uma observação permanente ao histórico</p></div><button type="button" onClick={() => history.setModalOpen(false)} disabled={history.saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
        <div className="p-5"><textarea autoFocus value={history.text} onChange={(event) => history.setText(event.target.value)} maxLength={2000} rows={6} placeholder="Escreva o que precisa ficar registrado nesta OS..." className={cn(INPUT, "h-auto resize-y text-sm")} /><div className="mt-2 flex justify-between gap-3 text-[10px] text-[#5a6a82]"><span>O registro não poderá ser editado ou excluído.</span><span>{history.text.length}/2000</span></div></div>
        <div className="flex justify-end gap-3 border-t border-[#0d1b2e]/8 px-5 py-4"><BtnSecondary onClick={() => history.setModalOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={history.submit} disabled={!history.text.trim() || history.saving}>{history.saving ? "Registrando..." : "Registrar no histórico"}</BtnPrimary></div>
      </div>
    </div>}
  </>;
}
