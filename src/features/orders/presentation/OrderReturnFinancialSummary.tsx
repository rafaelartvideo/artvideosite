import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";

type ReturnCycle = {
  id: string;
  os_number: string;
  return_sequence: number;
  return_root_id: string | null;
  return_classification: string;
  charged_total: number;
  parts_cost: number;
  labor_cost: number;
  other_cost: number;
  cost_notes: string;
  missing_cost_movements: number;
};
type ReturnFinancialSummaryData = {
  root_order_id: string;
  root_os_number: string;
  cycles: ReturnCycle[];
  totals: {
    charged_total: number;
    return_parts_cost: number;
    return_labor_cost: number;
    return_other_cost: number;
    return_cost: number;
    missing_cost_movements: number;
  };
};
const money = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
}).format(Number(value) || 0);
const kindLabel: Record<string, string> = {
  analysis: "Em análise", covered: "Garantia", courtesy: "Cortesia",
  not_covered: "Fora da garantia", unrelated: "Outro defeito",
};

/** Reutiliza a cadeia já carregada pelo seletor R1/R2 e só consulta custos quando há retorno. */
export function OrderReturnFinancialSummary({ order, hasPermission }: {
  order: any;
  hasPermission: (permission: string) => boolean;
}) {
  const organizationId = String(order?.organization_id || "");
  const rootId = String(order?.return_root_id || order?.id || "");
  const canView = hasPermission("finance.receivables.view");
  const canManage = hasPermission("finance.receivables.edit") && hasPermission("orders.edit");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [labor, setLabor] = useState("");
  const [other, setOther] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { setEditing(false); setSaveError(""); }, [order?.id]);

  const chain = useQuery({
    queryKey: ["order-return-chain", organizationId, rootId],
    enabled: canView && Boolean(organizationId && rootId && (order?.return_root_id || order?.completed_at)),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_orders")
        .select("id,os_number,return_root_id,return_sequence,completed_at,cancelled_at")
        .eq("organization_id", organizationId)
        .or("id.eq." + rootId + ",return_root_id.eq." + rootId)
        .order("return_sequence", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  const hasReturns = (chain.data?.length || 0) > 1;
  const summary = useQuery({
    queryKey: ["orders", "return-finance", organizationId, rootId],
    enabled: canView && hasReturns,
    staleTime: 30_000,
    queryFn: async (): Promise<ReturnFinancialSummaryData> => {
      const { data, error } = await (supabase as any).rpc("get_service_order_return_financial_summary_v1", {
        p_organization_id: organizationId, p_service_order_id: rootId,
      });
      if (error) throw error;
      return data as ReturnFinancialSummaryData;
    },
  });
  if (!canView || !hasReturns) return null;
  const cycles = summary.data?.cycles || [];
  const totals = summary.data?.totals;
  const current = cycles.find(item => item.id === order.id);
  const isReturn = Boolean(order.return_root_id && current);
  const beginEdit = () => {
    setLabor(String(current?.labor_cost ?? 0));
    setOther(String(current?.other_cost ?? 0));
    setNotes(current?.cost_notes || "");
    setSaveError("");
    setEditing(true);
  };
  const save = async () => {
    if (saving || !current || !isReturn || !canManage) return;
    const laborAmount = Number(labor.replace(",", "."));
    const otherAmount = Number(other.replace(",", "."));
    if (![laborAmount, otherAmount].every(value => Number.isFinite(value) && value >= 0)) {
      setSaveError("Informe valores válidos e não negativos."); return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const { error } = await (supabase as any).rpc("set_service_order_return_cost_v1", {
        p_organization_id: organizationId,
        p_service_order_id: current.id,
        p_labor_cost: laborAmount,
        p_other_cost: otherAmount,
        p_notes: notes,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["orders", "return-finance", organizationId, rootId] });
      setEditing(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Não foi possível registrar o custo.");
    } finally {
      setSaving(false);
    }
  };
  return <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Custos dos retornos">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-bold text-foreground">Financeiro dos retornos</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          OS {summary.data?.root_os_number || order.os_number} · Custos operacionais, sem lançar despesas ou baixas automaticamente.
        </p>
      </div>
      {isReturn && canManage && !editing && <AdminButton variant="secondary" size="sm" onClick={beginEdit}>
        Registrar custos do retorno
      </AdminButton>}
    </div>
    {summary.isPending && <p className="text-sm text-muted-foreground">Carregando custos...</p>}
    {summary.isError && <div className="flex flex-wrap items-center gap-2">
      <p role="alert" className="text-xs text-red-600">Não foi possível consultar os custos dos retornos.</p>
      <AdminButton variant="secondary" size="sm" onClick={() => void summary.refetch()}>Tentar novamente</AdminButton>
    </div>}
    {totals && <>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Valor cobrado nos atendimentos</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{money(totals.charged_total)}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Custo de peças dos retornos</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{money(totals.return_parts_cost)}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Custo operacional dos retornos</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{money(totals.return_cost)}</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground"><tr>
            <th className="px-3 py-2">OS</th><th className="px-3 py-2">Classificação</th>
            <th className="px-3 py-2 text-right">Cobrança</th><th className="px-3 py-2 text-right">Peças (custo)</th>
            <th className="px-3 py-2 text-right">Mão de obra / outros</th>
          </tr></thead>
          <tbody>{cycles.map(cycle => <tr key={cycle.id} className="border-t border-border">
            <td className="px-3 py-2 font-semibold text-foreground">{cycle.os_number}</td>
            <td className="px-3 py-2 text-muted-foreground">{cycle.return_sequence ? kindLabel[cycle.return_classification] || "Retorno" : "Original"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(cycle.charged_total)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(cycle.parts_cost)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(cycle.labor_cost + cycle.other_cost)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Cobrança não significa pagamento recebido. Custos de peças vêm das movimentações de estoque;
        mão de obra e outros custos são informados manualmente. Não representa lucro líquido.
        {totals.missing_cost_movements > 0 ? " Existem movimentações sem custo registrado." : ""}
      </p>
    </>}
    {isReturn && canManage && editing && <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-foreground">Mão de obra (R$)
          <input type="number" min="0" step="0.01" value={labor} disabled={saving}
            onChange={event => setLabor(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-foreground">Outros custos (R$)
          <input type="number" min="0" step="0.01" value={other} disabled={saving}
            onChange={event => setOther(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="block text-xs font-semibold text-foreground">Justificativa / observações
        <textarea rows={2} value={notes} disabled={saving} maxLength={500}
          onChange={event => setNotes(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      </label>
      {saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}
      <div className="flex justify-end gap-2">
        <AdminButton variant="secondary" size="sm" disabled={saving} onClick={() => setEditing(false)}>Cancelar</AdminButton>
        <AdminButton size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar custos"}</AdminButton>
      </div>
    </div>}
  </section>;
}
