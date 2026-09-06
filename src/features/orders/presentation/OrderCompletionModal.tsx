import { X } from "lucide-react";
import { AdminIconButton, Section, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FDecimalInput } from "@/shared/ui/admin/AdminFormControls";
import { formatNumber } from "@/shared/domain/formatters";
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
      <div className="flex items-start justify-between gap-4 border-b border-[#0d1b2e]/8 px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">Concluir OS</h2><p className="mt-0.5 text-sm text-[#5a6a82]">Confirme os valores finais do atendimento</p></div><AdminIconButton ariaLabel="Fechar" onClick={() => completion.setOpen(false)} disabled={saving} variant="ghost"><X size={18} /></AdminIconButton></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <Section title="Resumo financeiro"><div className="space-y-3">
          <div className="flex justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Serviço: {detail.general_service?.name || "—"}</span><strong>{formatCurrency(completion.servicePrice)}</strong></div>
          <div><div className="flex justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Peças utilizadas</span><strong>{formatCurrency(completion.partsTotal)}</strong></div>
            {usedItems.length === 0 ? <p className="mt-2 rounded-lg border border-dashed border-[#0d1b2e]/10 px-3 py-2 text-xs text-[#5a6a82]">Nenhuma peça utilizada.</p> : <div className="mt-2 divide-y divide-[#0d1b2e]/8 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc]">{usedItems.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><div className="min-w-0"><p className="truncate font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça sem nome"}</p>{item.inventory_item?.sku && <p className="text-[10px] text-[#5a6a82]">SKU: {item.inventory_item.sku}</p>}</div><strong className="shrink-0">{formatNumber(Number(item.quantity || 0))} {item.inventory_item?.unit || "un"}</strong></div>)}</div>}
          </div>
          <div className="flex justify-between border-t border-[#0d1b2e]/10 pt-3"><strong>Subtotal</strong><strong className="text-[#0057e7]">{formatCurrency(completion.subtotal)}</strong></div>
        </div></Section>
        <Section title="Desconto"><FDecimalInput label="Desconto (%)" value={completion.discount} decimalPlaces={2} onChange={(event: any) => completion.setDiscount(event.target.value)} hint={`Máximo permitido: ${formatNumber(completion.maxDiscount, { maximumFractionDigits: 2 })}%`} error={completion.discountPercentage > completion.maxDiscount ? "O desconto ultrapassa o máximo permitido." : undefined} /></Section>
        <div className="space-y-2 rounded-xl border border-[#0057e7]/20 bg-[#f0f6ff] p-4"><div className="flex justify-between text-sm text-[#5a6a82]"><span>Desconto</span><span>- {formatCurrency(completion.discountAmount)}</span></div><div className="flex justify-between border-t border-[#0057e7]/15 pt-3"><strong>Valor final</strong><strong className="text-xl text-[#0057e7]">{formatCurrency(completion.finalTotal)}</strong></div></div>
      </div>
      <div className="flex justify-end gap-3 border-t border-[#0d1b2e]/8 px-5 py-4"><BtnSecondary onClick={() => completion.setOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void completion.submit()} disabled={saving || completion.discountPercentage > completion.maxDiscount}>{saving ? "Concluindo..." : "Confirmar conclusão"}</BtnPrimary></div>
    </div>
  </div>;
}
