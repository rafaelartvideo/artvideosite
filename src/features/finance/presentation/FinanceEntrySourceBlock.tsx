import { useQuery } from "@tanstack/react-query";
import { Package, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import type { FinancialEntryDetail } from "../domain/finance.types";

function Value({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p><div className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{value}</div></div>;
}

export function FinanceEntrySourceBlock({ detail }: { detail: FinancialEntryDetail }) {
  const { activeOrganizationId } = useAuth();
  const integrated = detail.origin_type === "service_order" || detail.origin_type === "inventory_purchase";
  const query = useQuery({
    queryKey: ["finance", activeOrganizationId || "none", "source-details", detail.id],
    enabled: Boolean(integrated && activeOrganizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("source_details")
        .eq("organization_id", activeOrganizationId || "")
        .eq("id", detail.id)
        .single();
      if (error) throw error;
      return ((data as any)?.source_details || {}) as Record<string, any>;
    },
  });

  if (!integrated) return null;
  const source = query.data || {};

  if (detail.origin_type === "service_order") {
    return <AdminCard>
      <AdminCardHeader><div className="flex items-center gap-2"><Wrench size={17} className="text-[#0057e7]" /><div><h3 className="text-sm font-black text-[#0d1b2e]">Origem: Ordem de Serviço</h3><p className="text-xs text-[#5a6a82]">{source.os_number ? `OS #${source.os_number}` : "Receita gerada automaticamente na conclusão da OS."}</p></div></div></AdminCardHeader>
      <AdminCardContent>
        {query.isLoading ? <p className="text-sm text-[#5a6a82]">Carregando origem...</p> : query.error ? <p className="text-sm text-red-700">Não foi possível carregar os detalhes da origem.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Value label="OS" value={source.os_number ? `#${source.os_number}` : "—"} />
          <Value label="Serviço" value={source.general_service_name || "—"} />
          <Value label="Valor do serviço" value={formatCurrency(Number(source.service_price || 0))} />
          <Value label="Peças" value={formatCurrency(Number(source.parts_total || 0))} />
          <Value label="Subtotal" value={formatCurrency(Number(source.subtotal || 0))} />
          <Value label="Desconto" value={`${formatNumber(Number(source.discount_percentage || 0), { maximumFractionDigits: 2 })}% · ${formatCurrency(Number(source.discount_amount || 0))}`} />
          <Value label="Valor final" value={<span className="font-black text-[#0057e7]">{formatCurrency(Number(source.final_total || detail.original_amount))}</span>} />
        </div>}
      </AdminCardContent>
    </AdminCard>;
  }

  return <AdminCard>
    <AdminCardHeader><div className="flex items-center gap-2"><Package size={17} className="text-[#0057e7]" /><div><h3 className="text-sm font-black text-[#0d1b2e]">Origem: Compra de estoque</h3><p className="text-xs text-[#5a6a82]">Pré-lançamento criado automaticamente pela entrada da compra.</p></div></div></AdminCardHeader>
    <AdminCardContent>
      {query.isLoading ? <p className="text-sm text-[#5a6a82]">Carregando origem...</p> : query.error ? <p className="text-sm text-red-700">Não foi possível carregar os detalhes da origem.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Value label="Item" value={source.inventory_item_name || "—"} />
        <Value label="SKU" value={source.inventory_item_sku || "—"} />
        <Value label="Quantidade" value={`${formatNumber(Number(source.input_quantity || 0))} ${source.input_unit || "un"}`} />
        <Value label="Custo unitário" value={formatCurrency(Number(source.input_unit_cost || 0))} />
        <Value label="Subtotal" value={formatCurrency(Number(source.subtotal || 0))} />
        <Value label="Desconto" value={formatCurrency(Number(source.discount || 0))} />
        <Value label="Frete" value={formatCurrency(Number(source.freight || 0))} />
        <Value label="Outros custos" value={formatCurrency(Number(source.other_costs || 0))} />
        <Value label="Documento / referência" value={source.document_reference || source.purchase_reference || "—"} />
        <Value label="Total financeiro" value={<span className="font-black text-[#0057e7]">{formatCurrency(Number(source.financial_total || detail.original_amount))}</span>} />
      </div>}
    </AdminCardContent>
  </AdminCard>;
}
