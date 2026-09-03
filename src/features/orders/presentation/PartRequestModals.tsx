import React from "react";
import { CheckCircle, PackagePlus, Search, X } from "lucide-react";
import { AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { normalizeSearchText } from "../application/order-search";
import { fmtReviewDate } from "../application/part-request.formatters";
import type {
  CustodyAction,
  PartRequestForReview,
  PartRequestInventoryItem,
  PartRequestItemForReview,
  SelectedPartRequestItem,
  TestResultRow,
} from "../domain/part-request.types";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";

export function CenteredModal({ children, onClose, className, title = "Pedido de peças" }: { children: React.ReactNode; onClose: () => void; className?: string; title?: string }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent showClose={false} className={cn("flex max-h-[calc(100vh-2rem)] w-full flex-col gap-0 overflow-hidden rounded-xl border-[#0d1b2e]/10 bg-white p-0 shadow-2xl", className || "max-w-2xl")}>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}

export function PartRequestModal({ orderNumber, inventoryItems, inventoryLoading, inventoryError, selectedItems, search, notes, purpose, submitting, onPurposeChange, onSearchChange, onNotesChange, onSelect, onQuantityChange, onRemove, onClose, onSubmit }: {
  orderNumber?: string | null; inventoryItems: PartRequestInventoryItem[]; inventoryLoading: boolean; inventoryError: string; selectedItems: SelectedPartRequestItem[]; search: string; notes: string; purpose: "RESOLUTION" | "TEST"; submitting: boolean;
  onPurposeChange: (purpose: "RESOLUTION" | "TEST") => void; onSearchChange: (value: string) => void; onNotesChange: (value: string) => void; onSelect: (item: PartRequestInventoryItem) => void; onQuantityChange: (id: string, value: string) => void; onRemove: (id: string) => void; onClose: () => void; onSubmit: () => void;
}) {
  const visibleItems = inventoryItems.filter(item => { const query = normalizeSearchText(search); return !query || normalizeSearchText(item.name).includes(query) || normalizeSearchText(item.sku).includes(query); });
  return <CenteredModal onClose={onClose}><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">Pedir peças</h3><p className="mt-0.5 text-xs text-[#5a6a82]">OS {orderNumber || "—"}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button></div><div className="min-h-0 space-y-5 overflow-y-auto p-5"><div><p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Finalidade do pedido</p><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => onPurposeChange("RESOLUTION")} className={cn("rounded-xl border p-3 text-left transition-colors", purpose === "RESOLUTION" ? "border-[#0057e7] bg-blue-50 text-[#0057e7]" : "border-[#0d1b2e]/10 bg-white text-[#0d1b2e] hover:border-[#0057e7]/35")}><span className="flex items-center gap-2 text-sm font-bold"><CheckCircle size={16} /> Para resolução</span><span className="mt-1 block text-[11px] font-normal text-[#5a6a82]">Peças que serão utilizadas diretamente para solucionar a OS.</span></button><button type="button" onClick={() => onPurposeChange("TEST")} className={cn("rounded-xl border p-3 text-left transition-colors", purpose === "TEST" ? "border-[#0057e7] bg-blue-50 text-[#0057e7]" : "border-[#0d1b2e]/10 bg-white text-[#0d1b2e] hover:border-[#0057e7]/35")}><span className="flex items-center gap-2 text-sm font-bold"><PackagePlus size={16} /> Para teste</span><span className="mt-1 block text-[11px] font-normal text-[#5a6a82]">Peças retiradas temporariamente para diagnóstico e teste.</span></button></div></div><div><label className="mb-1.5 block text-[11px] font-bold text-[#5a6a82]">Pesquisar peça</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input autoFocus value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Pesquise por nome ou SKU" className={cn(INPUT, "h-[42px] pl-9 text-xs")} /></div></div><div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Resultados</p>{inventoryLoading ? <p className="text-xs text-[#5a6a82]">Carregando peças do estoque...</p> : inventoryError ? <p className="text-xs text-red-600">{inventoryError}</p> : visibleItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum item encontrado.</p> : <div className="max-h-56 space-y-1 overflow-y-auto">{visibleItems.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#0d1b2e]/10 px-3 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-semibold text-[#0d1b2e]">{item.name}</span><span className="text-[11px] text-[#5a6a82]">{item.sku ? `SKU: ${item.sku} · ` : ""}{Number(item.quantity)} {item.unit || "un"}</span></span><button type="button" onClick={() => onSelect(item)} className="shrink-0 rounded-lg border border-[#0057e7]/30 px-2.5 py-1.5 text-xs font-bold text-[#0057e7]">Adicionar</button></div>)}</div>}</div><div className="space-y-2"><p className="text-sm font-bold text-[#0d1b2e]">Peças selecionadas</p>{selectedItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça selecionada.</p> : selectedItems.map(item => <div key={item.inventory_item_id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="text-[11px] text-[#5a6a82]">Disponível: {item.available_quantity} {item.unit}</p></div><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => onQuantityChange(item.inventory_item_id, event.target.value)} className={cn(INPUT, "w-24 text-center text-sm")} /><button type="button" onClick={() => onRemove(item.inventory_item_id)} aria-label={`Remover ${item.name}`} className="p-2 text-red-600"><X size={14} /></button></div></div>)}</div><FTextarea label="Observações" value={notes} onChange={(event: any) => onNotesChange(event.target.value)} rows={3} placeholder="Informe detalhes importantes sobre as peças solicitadas." /></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Enviando..." : "Enviar solicitação"}</BtnPrimary></div></CenteredModal>;
}

export function PartCustodyModal({ request, action, quantities, submitting, onQuantitiesChange, onClose, onSubmit }: {
  request: PartRequestForReview;
  action: CustodyAction;
  quantities: Record<string, string>;
  submitting: boolean;
  onQuantitiesChange: (value: Record<string, string>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const config = action === "DISPATCH"
    ? { title: "Confirmar saída do estoque", message: "As peças serão retiradas do saldo e a movimentação de saída será registrada.", button: "Confirmar saída" }
    : action === "CONFIRM_DELIVERY"
      ? { title: "Confirmar entrega ao técnico", message: "Confirme que o técnico recebeu fisicamente as peças. Esta etapa não altera o estoque.", button: "Confirmar recebimento" }
      : action === "REGISTER_RETURN"
        ? { title: "Registrar devolução", message: "A devolução ficará aguardando o estoquista confirmar o recebimento. O saldo ainda não será alterado.", button: "Registrar devolução" }
        : { title: "Confirmar retorno ao estoque", message: "As quantidades pendentes serão adicionadas novamente ao saldo e a movimentação de entrada será registrada.", button: "Confirmar recebimento" };
  const returnable = (item: PartRequestItemForReview) => Math.max(0, Number(item.technician_received_quantity ?? 0) - Number(item.returned_quantity ?? 0) - Number(item.return_pending_quantity ?? 0) - Number(item.damaged_quantity ?? 0));
  return <CenteredModal onClose={onClose} title={config.title}>
    <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">{config.title}</h3><p className="mt-0.5 text-xs text-[#5a6a82]">{request.requester?.full_name || "Solicitante não informado"}</p></div><AdminIconButton ariaLabel="Fechar" onClick={onClose} variant="ghost"><X size={17} /></AdminIconButton></div>
    <div className="min-h-0 space-y-4 overflow-y-auto p-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">{config.message}</div>
      <div className="space-y-2">{request.items.map(item => {
        const unit = item.inventory_item?.unit || "un";
        const amount = action === "DISPATCH"
          ? Math.max(0, Number(item.approved_quantity ?? 0) - Number(item.delivered_quantity ?? 0))
          : action === "CONFIRM_DELIVERY"
            ? Math.max(0, Number(item.delivered_quantity ?? 0) - Number(item.technician_received_quantity ?? 0))
            : action === "RECEIVE_RETURN"
              ? Number(item.return_pending_quantity ?? 0)
              : returnable(item);
        if (amount <= 0 || action === "DISPATCH" && item.source_test_item_id) return null;
        return <div key={item.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 break-words text-sm font-semibold">{item.inventory_item?.name || "Peça"}</span>{action === "REGISTER_RETURN" ? <input type="number" min="0.01" max={amount} step="0.01" value={quantities[item.id] ?? String(amount)} onChange={event => onQuantitiesChange({ ...quantities, [item.id]: event.target.value })} className={cn(INPUT, "w-full text-center text-sm sm:w-28")} /> : <span className="text-xs font-bold">{amount} {unit}</span>}</div>{action === "REGISTER_RETURN" && <p className="mt-1 text-[11px] text-[#5a6a82]">Disponível para devolução: {amount} {unit}</p>}</div>;
      })}</div>
    </div>
    <div className="grid grid-cols-2 gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4 sm:flex sm:justify-end"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Processando..." : config.button}</BtnPrimary></div>
  </CenteredModal>;
}

export function TestResultModal({ request, rows, submitting, getPendingQuantity, onRowsChange, onClose, onSubmit }: {
  request: PartRequestForReview;
  rows: TestResultRow[];
  submitting: boolean;
  getPendingQuantity: (request: PartRequestForReview, item: PartRequestItemForReview) => number;
  onRowsChange: (rows: TestResultRow[]) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const pendingItems = request.items.filter(item => getPendingQuantity(request, item) > 0);
  return <CenteredModal onClose={onClose}>
    <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">Registrar resultado do teste</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Defina o uso ou dano das peças. Devoluções são registradas separadamente.</p></div><AdminIconButton ariaLabel="Fechar" onClick={onClose} variant="ghost"><X size={17} /></AdminIconButton></div>
    <div className="min-h-0 space-y-4 overflow-y-auto p-5">{pendingItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça aguardando resultado.</p> : pendingItems.map(item => { const pending = getPendingQuantity(request, item); const used = rows.filter(row => row.requestItemId === item.id).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0); return <div key={item.id} className="space-y-2 rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><p className="text-sm font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"} <span className="text-xs font-normal text-[#5a6a82]">· Aguardando: {Math.max(0, pending - used)} {item.inventory_item?.unit || "un"}</span></p>{rows.filter(row => row.requestItemId === item.id).map(row => <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr_auto]"><AdminSelect value={row.action} onValueChange={value => onRowsChange(rows.map(current => current.id === row.id ? { ...current, action: value as TestResultRow["action"] } : current))} options={[{ value: "USE_IN_RESOLUTION", label: "Usar na resolução" }, { value: "DAMAGED", label: "Danificada" }]} className="text-xs" ariaLabel="Destino da peça testada" /><input type="number" min="0.01" max={pending} step="0.01" value={row.quantity} onChange={event => onRowsChange(rows.map(current => current.id === row.id ? { ...current, quantity: event.target.value } : current))} className={cn(INPUT, "text-xs")} /><input value={row.notes} onChange={event => onRowsChange(rows.map(current => current.id === row.id ? { ...current, notes: event.target.value } : current))} placeholder={row.action === "DAMAGED" ? "Justificativa do dano" : "Observação (opcional)"} className={cn(INPUT, "text-xs")} /><button type="button" onClick={() => onRowsChange(rows.filter(current => current.id !== row.id))} className="p-2 text-red-600"><X size={14} /></button></div>)}<button type="button" disabled={used >= pending} onClick={() => onRowsChange([...rows, { id: crypto.randomUUID(), requestItemId: item.id, action: "USE_IN_RESOLUTION", quantity: "", notes: "" }])} className="text-xs font-bold text-[#0057e7] disabled:cursor-not-allowed disabled:opacity-50">Adicionar destino</button></div>; })}</div>
    <div className="grid grid-cols-2 gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4 sm:flex sm:justify-end"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Registrando..." : "Registrar resultado"}</BtnPrimary></div>
  </CenteredModal>;
}

export function ReviewPartRequestModal({ request, orderNumber, rejection, approvalQuantities, notes, submitting, onNotesChange, onQuantityChange, onClose, onSubmit }: { request: PartRequestForReview; orderNumber?: string | null; rejection: boolean; approvalQuantities: Record<string, string>; notes: string; submitting: boolean; onNotesChange: (value: string) => void; onQuantityChange: (id: string, value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const subtitle = rejection ? "Revise as peças solicitadas e informe o motivo da rejeição" : `OS ${orderNumber || "—"} · ${request.requester?.full_name || "Solicitante não informado"}`;
  return <CenteredModal onClose={onClose} className="max-w-2xl"><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">{rejection ? "Rejeitar pedido de peças" : "Aprovar pedido de peças"}</h3><p className="mt-0.5 text-xs text-[#5a6a82]">{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button></div><div className="min-h-0 space-y-4 overflow-y-auto p-5"><div className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 text-xs text-[#5a6a82]"><p><strong>OS:</strong> {orderNumber || "—"}</p><p><strong>Solicitante:</strong> {request.requester?.full_name || "Solicitante não informado"}</p><p><strong>Solicitado em:</strong> {fmtReviewDate(request.created_at)}</p>{request.notes && <p className="mt-1 whitespace-pre-line"><strong>Observações:</strong> {request.notes}</p>}</div><p className="text-sm font-bold text-[#0d1b2e]">Peças solicitadas</p>{request.items.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça encontrada nesta solicitação.</p> : <div className="space-y-2">{request.items.map(item => { const requested = Number(item.quantity); const available = Number(item.inventory_item?.quantity ?? 0); const isFromTest = Boolean(item.source_test_item_id); const effectiveLimit = isFromTest ? requested : Math.min(requested, available); return <div key={item.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p><p className="text-xs text-[#5a6a82]">{item.inventory_item?.sku ? `SKU: ${item.inventory_item.sku} · ` : ""}Solicitado: {requested} {item.inventory_item?.unit || "un"}{isFromTest ? "" : ` · Disponível: ${available} ${item.inventory_item?.unit || "un"}`}</p>{isFromTest && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Origem: peça testada</span>}</div>{!rejection && <div><label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade aprovada</label><input type="number" min="0" max={effectiveLimit} step="0.01" value={approvalQuantities[item.id] ?? String(item.quantity)} onChange={event => onQuantityChange(item.id, event.target.value)} className={cn(INPUT, "w-28 text-center text-sm")} /></div>}</div></div>; })}</div>}<FTextarea label={rejection ? "Motivo da rejeição" : "Observação da análise"} required={rejection} value={notes} onChange={(event: any) => onNotesChange(event.target.value)} rows={3} placeholder={rejection ? "Informe por que este pedido está sendo rejeitado." : undefined} /></div><div className="flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? rejection ? "Rejeitando..." : "Aprovando..." : rejection ? "Confirmar rejeição" : "Confirmar aprovação"}</BtnPrimary></div></CenteredModal>;
}
