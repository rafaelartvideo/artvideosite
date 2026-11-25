import { Package, Wrench } from "lucide-react";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import type { FinancialEntryDetail } from "../domain/finance.types";
import { FinanceServiceOrderLink } from "./FinanceServiceOrderLink";

function Value({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p><div className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{value}</div></div>;
}

export function FinanceEntrySourceBlock({ detail, showIcon = true }: { detail: FinancialEntryDetail; showIcon?: boolean }) {
  const integrated = detail.origin_type === "service_order" || detail.origin_type === "inventory_purchase";
  if (!integrated) return null;

  const source = (detail.source_details || {}) as Record<string, any>;

  if (detail.origin_type === "service_order" && source.billing_model === "partner_warranty") {
    return <AdminCard>
      <AdminCardHeader>
        <div className="flex items-center gap-2">
          {showIcon && <Wrench size={17} className="text-primary"/>}
          <div>
            <h3 className="text-sm font-bold text-foreground">Garantia de fabricante · Contas a Receber</h3>
            <p className="text-xs text-muted-foreground">Cobrança ao parceiro, sem cobrança ao cliente</p>
          </div>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Value label="Ordem de serviço" value={source.os_number
            ? <FinanceServiceOrderLink orderId={detail.origin_reference} number={source.os_number}/>
            : "—"}/>
          <Value label="Tipo de atendimento" value={source.service_type_name||"Garantia"}/>
          <Value label="Fabricante / parceiro" value={detail.counterpart_name_snapshot||"A definir no Financeiro"}/>
          <Value label="Valor cobrado do cliente" value={formatCurrency(0)}/>
          <Value label="Valor a receber do parceiro" value={<span className="font-black text-emerald-700 dark:text-emerald-300">{source.receivable_status==="pending_details"?"A definir na baixa":formatCurrency(detail.original_amount)}</span>}/>
          {source.notes&&<Value label="Observações" value={String(source.notes)}/>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          O recebimento é registrado apenas quando a parcela for baixada no Financeiro.
        </p>
      </AdminCardContent>
    </AdminCard>;
  }

  if (detail.origin_type === "service_order") {
    const serviceNames = Array.isArray(source.service_names)
      ? source.service_names.filter((name: unknown): name is string => typeof name === "string" && Boolean(name.trim()))
      : [];
    const legacyName = typeof source.general_service_name === "string" ? source.general_service_name.trim() : "";
    const serviceLabel = serviceNames.length
      ? serviceNames.join(", ")
      : legacyName && legacyName !== "Produtos e Serviços da OS" ? legacyName : "Nenhum serviço cadastrado";
    return <AdminCard>
      <AdminCardHeader><div className="flex items-center gap-2">{showIcon && <Wrench size={17} className="text-[#0057e7]" />}<div><h3 className="text-sm font-black text-[#0d1b2e]">{showIcon ? "Origem: Ordem de Serviço" : "Origem"}</h3><p className="text-xs text-[#5a6a82]">{source.os_number ? <FinanceServiceOrderLink orderId={detail.origin_reference} number={source.os_number} /> : "Receita gerada automaticamente na conclusão da OS."}</p></div></div></AdminCardHeader>
      <AdminCardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Value label="OS" value={source.os_number ? <FinanceServiceOrderLink orderId={detail.origin_reference} number={source.os_number} /> : "—"} />
        <Value label={serviceNames.length > 1 ? "Serviços" : "Serviço"} value={serviceLabel} />
        <Value label="Valor do serviço" value={formatCurrency(Number(source.service_price || 0))} />
        <Value label="Peças" value={formatCurrency(Number(source.parts_total || 0))} />
        <Value label="Subtotal" value={formatCurrency(Number(source.subtotal || 0))} />
        <Value label="Desconto" value={<span className="text-red-600 dark:text-red-400">{formatNumber(Number(source.discount_percentage || 0), { maximumFractionDigits: 2 })}% · {formatCurrency(Number(source.discount_amount || 0))}</span>} />
        <Value label="Valor final" value={<span className="font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(source.final_total || detail.original_amount))}</span>} />
      </div></AdminCardContent>
    </AdminCard>;
  }

  return <AdminCard>
    <AdminCardHeader><div className="flex items-center gap-2">{showIcon && <Package size={17} className="text-[#0057e7]" />}<div><h3 className="text-sm font-black text-[#0d1b2e]">{showIcon ? "Origem: Compra de estoque" : "Origem"}</h3><p className="text-xs text-[#5a6a82]">Pré-lançamento criado automaticamente pela entrada da compra.</p></div></div></AdminCardHeader>
    <AdminCardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div></AdminCardContent>
  </AdminCard>;
}
