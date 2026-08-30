import { Section } from "@/shared/admin/AdminPrimitives";
import {
  OrderImageThumb,
  type OrderImage,
} from "./OrderImages";

export function OrderSolutionSummary({
  detail,
  profileName,
  usedItems,
  solutionImages,
  usedItemsTotal,
  formatSolvedAt,
  formatCurrency,
  onViewImage,
}: {
  detail: any;
  profileName?: string | null;
  usedItems: any[];
  solutionImages: OrderImage[];
  usedItemsTotal: number;
  formatSolvedAt: (value: string) => string;
  formatCurrency: (value: number) => string;
  onViewImage: (image: OrderImage) => void;
}) {
  const detailUsedItems = usedItems;
  const detailSolutionImages = solutionImages;
  const detailUsedItemsTotal = usedItemsTotal;
  const profile = { full_name: profileName };
  const setViewImage = onViewImage;
  return (
    <>
{(detail.is_solved || detail.cannot_be_solved || detail.diagnosis || detail.solution || detailUsedItems.length > 0 || detailSolutionImages.length > 0) && (
                <Section title="Solução da OS">
                  <div className="space-y-4">
                    {detail.is_solved && <div className="flex items-center gap-2 flex-wrap"><span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-[10px] font-bold uppercase">✓ OS solucionada</span>{detail.solved_at && <span className="text-xs text-[#5a6a82]">Solucionada em {formatSolvedAt(detail.solved_at)} por: {profile?.full_name || "Nome não informado"}</span>}</div>}
                    {detail.cannot_be_solved && <div className="space-y-1"><span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span><p className="text-sm text-[#0d1b2e] whitespace-pre-line"><strong>Justificativa:</strong> {detail.cannot_be_solved_reason}</p></div>}
                    {detail.customer_notes && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Descrição do problema</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></div>}
                    {detail.diagnosis && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Diagnóstico</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.diagnosis}</p></div>}
                    {detail.solution && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Solução</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.solution}</p></div>}
                    {detailUsedItems.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Produtos utilizados</p><div className="space-y-2">{detailUsedItems.map((item: any) => {
                      const unitSalePrice = item.unit_sale_price == null ? null : Number(item.unit_sale_price);
                      const totalSalePrice = item.total_sale_price == null ? null : Number(item.total_sale_price);
                      const hasRegisteredPrices = unitSalePrice !== null && totalSalePrice !== null && Number.isFinite(unitSalePrice) && Number.isFinite(totalSalePrice);
                      return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2 text-sm"><span>{item.inventory_item?.name || "Produto"}</span><span className="text-right font-bold text-[#0d1b2e]">{hasRegisteredPrices ? `${Number(item.quantity || 0)} ${item.inventory_item?.unit || "un"} × ${formatCurrency(unitSalePrice)} = ${formatCurrency(totalSalePrice)}` : `${Number(item.quantity || 0)} ${item.inventory_item?.unit || "un"} · Preço não registrado`}</span></div>;
                    })}</div><div className="mt-3 flex items-center justify-between rounded-lg border border-[#0057e7]/20 bg-[#f0f6ff] px-3 py-2 text-sm"><span className="font-bold text-[#0d1b2e]">Valor total dos produtos</span><span className="font-black text-[#0057e7]">{formatCurrency(detailUsedItemsTotal)}</span></div></div>}
                    {detailSolutionImages.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Imagens da solução</p><div className="flex flex-wrap gap-3">{detailSolutionImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div></div>}
                  </div>
                </Section>
              )}
    </>
  );
}
