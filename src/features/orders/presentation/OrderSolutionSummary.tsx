import { History, RotateCcw } from "lucide-react";
import { AdminButton, Section } from "@/shared/ui/admin/AdminLayout";
import type { ServiceOrderSolutionAttempt } from "../infrastructure/order-solution-history.repository";
import {
  OrderImageThumb,
  type OrderImage,
} from "./OrderImages";

export function OrderSolutionSummary({
  detail,
  usedItems,
  solutionImages,
  usedItemsTotal,
  solutionCount,
  activeAttempt,
  canUndo,
  formatSolvedAt,
  formatCurrency,
  onViewImage,
  onOpenRecords,
  onUndo,
}: {
  detail: any;
  usedItems: any[];
  solutionImages: OrderImage[];
  usedItemsTotal: number;
  solutionCount: number;
  activeAttempt?: ServiceOrderSolutionAttempt | null;
  canUndo: boolean;
  formatSolvedAt: (value: string) => string;
  formatCurrency: (value: number) => string;
  onViewImage: (image: OrderImage) => void;
  onOpenRecords: () => void;
  onUndo: () => void;
}) {
  const detailUsedItems = usedItems;
  const detailSolutionImages = solutionImages;
  const detailUsedItemsTotal = usedItemsTotal;
  const hasHistory = solutionCount > 0;
  const hasCurrentContent = Boolean(detail.is_solved || detail.cannot_be_solved || detail.diagnosis || detail.solution || detail.loose_parts || detailUsedItems.length > 0 || detailSolutionImages.length > 0);

  if (!hasCurrentContent && !hasHistory) return null;

  const actions = <div className="flex flex-wrap items-center gap-2">
    {hasHistory && <AdminButton variant="secondary" size="sm" onClick={onOpenRecords} aria-label="Ver registros da solução" title="Registros" className="h-10 px-2 text-[11px] sm:h-8 sm:px-2.5"><History className="h-[18px] w-[18px] sm:h-[13px] sm:w-[13px]" /><span className="hidden sm:inline">Registros</span><span className="rounded-full bg-[#eaf2ff] px-1.5 py-0.5 text-[9px] font-black text-[#0057e7]">{solutionCount}</span></AdminButton>}
    {detail.is_solved && canUndo && <AdminButton variant="secondary" size="sm" onClick={onUndo} aria-label="Desfazer solução" title="Desfazer" className="h-10 w-10 border-[#0057e7]/30 bg-white !px-0 text-[11px] text-[#0057e7] hover:border-[#0057e7]/45 hover:bg-[#f0f6ff] hover:text-[#0057e7] sm:w-auto sm:px-2.5"><RotateCcw className="h-[18px] w-[18px] sm:h-[13px] sm:w-[13px]" /><span className="hidden sm:inline">Desfazer</span></AdminButton>}
  </div>;

  return <Section title="Solução da OS" actions={actions}>
    {!detail.is_solved && hasHistory && !detail.cannot_be_solved ? <div className="flex items-start gap-3 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><History size={17} className="mt-0.5 shrink-0 text-[#0057e7]" /><div><p className="text-sm font-bold text-[#0d1b2e]">Sem solução ativa</p><p className="mt-0.5 text-xs text-[#5a6a82]">Esta OS já foi solucionada {solutionCount} {solutionCount === 1 ? "vez" : "vezes"}. Consulte os registros para ver as soluções anteriores e os desfazimentos.</p></div></div> : <div className="space-y-4">
      {detail.is_solved && <div className="flex items-center gap-2 flex-wrap"><span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-[10px] font-bold uppercase">✓ OS solucionada</span>{detail.solved_at && <span className="text-xs text-[#5a6a82]">Solucionada em {formatSolvedAt(detail.solved_at)} por: {activeAttempt?.solved_by_profile?.full_name || "Nome não informado"}</span>}{hasHistory && <span className="text-[10px] font-bold text-[#7c899c]">{solutionCount} {solutionCount === 1 ? "solução registrada" : "soluções registradas"}</span>}</div>}
      {detail.cannot_be_solved && <div className="space-y-1"><span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span><p className="text-sm text-[#0d1b2e] whitespace-pre-line"><strong>Justificativa:</strong> {detail.cannot_be_solved_reason}</p></div>}
      {detail.customer_notes && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Descrição do problema</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></div>}
      {detail.diagnosis && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Diagnóstico</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.diagnosis}</p></div>}
      {detail.solution && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Solução</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.solution}</p></div>}
      {detail.loose_parts && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Peças avulsas</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.loose_parts}</p></div>}
      {detailUsedItems.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Produtos utilizados</p><div className="space-y-2">{detailUsedItems.map((item: any) => {
        const unitSalePrice = item.unit_sale_price == null ? null : Number(item.unit_sale_price);
        const totalSalePrice = item.total_sale_price == null ? null : Number(item.total_sale_price);
        const hasRegisteredPrices = unitSalePrice !== null && totalSalePrice !== null && Number.isFinite(unitSalePrice) && Number.isFinite(totalSalePrice);
        return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2 text-sm"><span>{item.inventory_item?.name || "Produto"}</span><span className="text-right font-bold text-[#0d1b2e]">{hasRegisteredPrices ? `${Number(item.quantity || 0)} ${item.inventory_item?.unit || "un"} × ${formatCurrency(unitSalePrice)} = ${formatCurrency(totalSalePrice)}` : `${Number(item.quantity || 0)} ${item.inventory_item?.unit || "un"} · Preço não registrado`}</span></div>;
      })}</div><div className="mt-3 flex items-center justify-between rounded-lg border border-[#0057e7]/20 bg-[#f0f6ff] px-3 py-2 text-sm"><span className="font-bold text-[#0d1b2e]">Valor total dos produtos</span><span className="font-black text-[#0057e7]">{formatCurrency(detailUsedItemsTotal)}</span></div></div>}
      {detailSolutionImages.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Imagens da solução</p><div className="flex flex-wrap gap-3">{detailSolutionImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => onViewImage(image)} />)}</div></div>}
    </div>}
  </Section>;
}
