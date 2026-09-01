import { X } from "lucide-react";
import { Section, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import type { useOrderCompletion } from "../application/useOrderCompletion";

export function OrderCompletionModal({
  detail,
  usedItems,
  completion,
  saving,
  formatCurrency,
}: {
  detail: any;
  usedItems: any[];
  completion: ReturnType<typeof useOrderCompletion>;
  saving: boolean;
  formatCurrency: (value: number) => string;
}) {
  if (!completion.open || !detail) return null;
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" onMouseDown={event => { if (event.target === event.currentTarget && !saving) completion.setOpen(false); }}>
    <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-[#0d1b2e]/8 px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">Concluir OS</h2><p className="mt-0.5 text-sm text-[#5a6a82]">Confirme os valores finais do atendimento</p></div><button type="button" onClick={() => completion.setOpen(false)} disabled={saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <Section title="Resumo financeiro"><div className="space-y-3">
          <div className="flex justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Serviço: {detail.general_service?.name || "—"}</span><strong>{formatCurrency(completion.servicePrice)}</strong></div>
          <div><div className="flex justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Peças utilizadas</span><strong>{formatCurrency(completion.partsTotal)}</strong></div>
            {usedItems.length === 0 ? <p className="mt-2 rounded-lg border border-dashed border-[#0d1b2e]/10 px-3 py-2 text-xs text-[#5a6a82]">Nenhuma peça utilizada.</p> : <div className="mt-2 divide-y divide-[#0d1b2e]/8 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc]">{usedItems.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><div className="min-w-0"><p className="truncate font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça sem nome"}</p>{item.inventory_item?.sku && <p className="text-[10px] text-[#5a6a82]">SKU: {item.inventory_item.sku}</p>}</div><strong className="shrink-0">{Number(item.quantity || 0).toLocaleString("pt-BR")} {item.inventory_item?.unit || "un"}</strong></div>)}</div>}
          </div>
          <div className="flex justify-between border-t border-[#0d1b2e]/10 pt-3"><strong>Subtotal</strong><strong className="text-[#0057e7]">{formatCurrency(completion.subtotal)}</strong></div>
        </div></Section>
        <Section title="Desconto"><label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase text-[#5a6a82]">Desconto (%)</span><input className={INPUT} type="number" min="0" max={completion.maxDiscount} step="0.01" value={completion.discount} onChange={event => completion.setDiscount(event.target.value)} /><span className="mt-1 block text-xs text-[#5a6a82]">Máximo permitido: {completion.maxDiscount.toLocaleString("pt-BR")}%</span></label>{completion.discountPercentage > completion.maxDiscount && <p className="mt-2 text-xs font-semibold text-red-600">O desconto ultrapassa o máximo permitido.</p>}</Section>
        <div className="space-y-2 rounded-xl border border-[#0057e7]/20 bg-[#f0f6ff] p-4"><div className="flex justify-between text-sm text-[#5a6a82]"><span>Desconto</span><span>- {formatCurrency(completion.discountAmount)}</span></div><div className="flex justify-between border-t border-[#0057e7]/15 pt-3"><strong>Valor final</strong><strong className="text-xl text-[#0057e7]">{formatCurrency(completion.finalTotal)}</strong></div></div>
      </div>
      <div className="flex justify-end gap-3 border-t border-[#0d1b2e]/8 px-5 py-4"><BtnSecondary onClick={() => completion.setOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void completion.submit()} disabled={saving || completion.discountPercentage > completion.maxDiscount}>{saving ? "Concluindo..." : "Confirmar conclusão"}</BtnPrimary></div>
    </div>
  </div>;
}
