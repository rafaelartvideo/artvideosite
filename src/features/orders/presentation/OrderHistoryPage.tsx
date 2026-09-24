import { FilterX, Plus } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminDialog, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import type { useOrderHistory } from "../application/useOrderHistory";

export function OrderHistoryPage({
  open,
  order,
  history,
  canCreate,
  formatDate,
  onClose,
}: {
  open: boolean;
  order: any;
  history: ReturnType<typeof useOrderHistory>;
  canCreate: boolean;
  formatDate: (value?: string | null, time?: boolean) => string;
  onClose: () => void;
}) {
  if (!open) return null;
  return <>
    <AdminPage open onClose={onClose} breadcrumb={`Ordens de Serviço > ${order.os_number || "OS"} > Histórico`} title="Histórico da OS" subtitle="Linha do tempo de alterações e registros da equipe" maxW="max-w-2xl">
      <div className="space-y-4 p-4 sm:p-5">
        <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Usuário</label>
              <AdminSelect
                value={history.userFilter}
                onValueChange={history.setUserFilter}
                ariaLabel="Usuário"
                className="min-w-0 text-xs font-medium normal-case"
                options={[
                  { value: "", label: "Todos os usuários" },
                  ...history.authorOptions.map(author => ({ value: author.id, label: author.name })),
                  { value: "system", label: "Sistema" },
                ]}
              />
            </div>
            <label className="min-w-0 text-[10px] font-bold uppercase text-[#5a6a82]">Data
              <input type="date" value={history.dateFilter} onChange={(event) => history.setDateFilter(event.target.value)} className={cn(INPUT, "mt-1 min-w-0 text-xs font-medium normal-case")} />
            </label>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Ordenação</label>
              <AdminSelect
                value={history.sort}
                onValueChange={value => history.setSort(value as "desc" | "asc")}
                ariaLabel="Ordenação"
                className="min-w-0 text-xs font-medium normal-case"
                options={[
                  { value: "desc", label: "Mais recentes primeiro" },
                  { value: "asc", label: "Mais antigos primeiro" },
                ]}
              />
            </div>
            {(history.userFilter || history.dateFilter) && <button type="button" onClick={history.clearFilters} aria-label="Limpar filtros" title="Limpar filtros" className="inline-flex h-10 w-10 self-end items-center justify-center gap-1.5 rounded-lg border border-red-200 px-0 text-xs font-bold text-red-600 hover:bg-red-50 sm:w-auto sm:px-3"><FilterX size={15} /><span className="hidden sm:inline">Limpar</span></button>}
          </div>
        </AdminCard>
        {history.loading ? <LoadingState text="Carregando histórico..." /> : history.entries.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 p-8 text-center text-sm text-[#5a6a82]">Nenhum registro encontrado.</div> : <div className="space-y-3">{history.entries.map((item) => <AdminCard key={item.id} className={cn("min-w-0 p-4 shadow-none", item.type === "note" ? "border-[#0057e7]/15" : "bg-[#f8fafc]")}>
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2"><div className="min-w-0"><p className="truncate text-xs font-black text-[#0d1b2e]">{item.author}</p><p className="mt-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{item.title}</p></div><span className="shrink-0 text-[10px] text-[#5a6a82]">{formatDate(item.createdAt, true)}</span></div>
          <p className="mt-3 break-words whitespace-pre-line text-sm leading-relaxed text-[#0d1b2e]">{item.content}</p>
        </AdminCard>)}</div>}
      </div>
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-[#0d1b2e]/8 bg-white px-3 py-3 sm:justify-between sm:px-5 sm:py-4">
        <BtnSecondary onClick={onClose} className="min-w-0 flex-1 sm:flex-none">Voltar para a OS</BtnSecondary>
        {canCreate && <BtnPrimary onClick={() => { history.setText(""); history.setModalOpen(true); }} className="h-10 w-10 min-w-0 flex-none px-0 sm:h-auto sm:w-auto sm:px-4" ><Plus size={14} /><span className="sr-only sm:not-sr-only">Novo registro</span></BtnPrimary>}
      </div>
    </AdminPage>
    {history.modalOpen && canCreate && <AdminDialog open={history.modalOpen} onClose={() => { if (!history.saving) history.setModalOpen(false); }} title="Novo registro" description="Adicione uma observação permanente ao histórico" className="max-w-lg" footer={<div className="flex w-full gap-2 sm:justify-end sm:gap-3"><BtnSecondary onClick={() => history.setModalOpen(false)} className="min-w-0 flex-1 sm:flex-none">Cancelar</BtnSecondary><BtnPrimary onClick={history.submit} disabled={!history.text.trim() || history.saving} className="min-w-0 flex-1 sm:flex-none">{history.saving ? "Registrando..." : "Registrar no histórico"}</BtnPrimary></div>}>
      <textarea autoFocus value={history.text} onChange={(event) => history.setText(event.target.value)} maxLength={2000} rows={6} placeholder="Escreva o que precisa ficar registrado nesta OS..." className={cn(INPUT, "h-auto min-w-0 resize-y text-sm")} />
      <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#5a6a82]"><span>O registro não poderá ser editado ou excluído.</span><span className="shrink-0">{history.text.length}/2000</span></div>
    </AdminDialog>}
  </>;
}
