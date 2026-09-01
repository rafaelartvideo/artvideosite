import { Section } from "@/shared/ui/admin/AdminLayout";
import { InfoRow } from "./OrderDetailsContent";

export function OrderFinancialSummary({ detail, formatCurrency }: { detail: any; formatCurrency: (value: number) => string }) {
  if (!detail.completed_at) return null;
  return <Section title="Valores da OS"><div className="grid gap-3 sm:grid-cols-2">
    <InfoRow label="Valor do serviço" value={formatCurrency(Number(detail.service_price || 0))} />
    <InfoRow label="Valor das peças" value={formatCurrency(Number(detail.parts_total || 0))} />
    <InfoRow label="Subtotal" value={formatCurrency(Number(detail.subtotal ?? Number(detail.service_price || 0) + Number(detail.parts_total || 0)))} />
    <InfoRow label="Desconto aplicado" value={`${Number(detail.discount_percentage || 0).toLocaleString("pt-BR")}% (- ${formatCurrency(Number(detail.discount_amount || 0))})`} />
    <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"><p className="text-[10px] font-bold uppercase text-emerald-700">Valor final</p><p className="mt-1 text-xl font-black text-emerald-700">{formatCurrency(Number(detail.final_total || 0))}</p></div>
  </div></Section>;
}
