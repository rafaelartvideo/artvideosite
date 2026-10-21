import { useEffect, useState } from "react";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { formatCurrency } from "@/shared/domain/formatters";
import { listInternalQuoteItems, type QuoteLineDraft } from "../infrastructure/internal-quotes.repository";

export function InternalQuoteSummary({ quote, organizationId }: { quote: any; organizationId: string }) {
  const [items, setItems] = useState<QuoteLineDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    void listInternalQuoteItems(organizationId, quote.id)
      .then(result => { if (active) setItems(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, quote.id]);

  return <>
    <Section title="Avaliação técnica">
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["equipment_name","Equipamento"],["equipment_brand","Marca"],
          ["equipment_model","Modelo"],["serial_number","Número de série"],
          ["accessories","Acessórios"],["equipment_condition","Estado de entrada"],
          ["issue_reported","Problema relatado"],["diagnosis","Diagnóstico"],
          ["proposed_solution","Solução proposta"],["internal_notes","Observações internas"],
        ] as const).map(([key,label]) => <div key={key} className="min-w-0">
          <p className="text-xs font-bold text-muted-foreground">{label}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{quote[key] || "—"}</p>
        </div>)}
      </div>
    </Section>
    <Section title="Produtos e serviços">
      {loading ? <p className="text-sm text-muted-foreground">Carregando itens...</p>
        : error ? <p className="text-sm text-red-600">{error}</p>
          : items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item incluído nesta proposta.</p>
            : <div className="space-y-2">
              {items.map((item,index) => <div key={index} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
                <div>
                  <p className="text-sm font-semibold">{item.title_snapshot}</p>
                  <p className="text-xs text-muted-foreground">{item.item_type === "product" ? "Produto" : "Serviço"} · {item.quantity} × {formatCurrency(item.unit_price)}</p>
                  {item.description_snapshot && <p className="text-xs text-muted-foreground">{item.description_snapshot}</p>}
                </div>
                <strong className="text-sm">{formatCurrency(item.quantity * item.unit_price + item.additional_cost)}</strong>
              </div>)}
            </div>}
      <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{formatCurrency(Number(quote.estimated_price || 0))}</strong></div>
        <div className="flex justify-between text-sm"><span>Desconto</span><strong>{quote.discount_type === "percentage" ? Number(quote.discount_value || 0) + "%" : formatCurrency(Number(quote.discount_value || 0))}</strong></div>
        <div className="flex justify-between border-t border-border pt-2"><strong>Total do orçamento</strong><strong>{formatCurrency(Number(quote.final_price || 0))}</strong></div>
      </div>
    </Section>
  </>;
}
