import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3, CheckCircle2 } from "lucide-react";
import { cn, formatNumber } from "@/shared/domain/formatters";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  listInventorySaleBatches,
  type InventorySaleBatch,
  type InventorySaleSummary,
} from "../infrastructure/inventory-sale-batches.repository";

function saleWindowStatus(deadline: string | null) {
  if (!deadline) return "untracked" as const;
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "overdue" as const;
  if (diff <= 7 * 24 * 60 * 60 * 1000) return "warning" as const;
  return "ok" as const;
}
const tones = {
  overdue: "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300",
  warning: "border-amber-400/50 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  untracked: "border-border bg-muted text-muted-foreground",
};
const formatQty = (value: number, factor: number) =>
  formatNumber(value / Math.max(1, factor));

export function InventorySaleWindowBadge({
  summary, unit = "un", factor = 1,
}: {
  summary: InventorySaleSummary | undefined;
  unit?: string;
  factor?: number;
}) {
  if (!summary || summary.tracked_quantity <= 0) return null;
  const status = summary.overdue_quantity > 0 ? "overdue"
    : summary.warning_quantity > 0 ? "warning" : "ok";
  const Icon = status === "overdue" ? AlertTriangle : status === "warning" ? Clock3 : CheckCircle2;
  const quantity = status === "overdue" ? summary.overdue_quantity
    : status === "warning" ? summary.warning_quantity : summary.tracked_quantity;
  const title = status === "overdue" ? "Prazo de venda ultrapassado"
    : status === "warning" ? "Prazo de venda próximo (até 7 dias)" : "Dentro do prazo de venda";
  return <span title={title}
    className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", tones[status])}>
    <Icon aria-hidden="true" size={12}/>
    {status === "overdue" ? "Prazo vencido" : status === "warning" ? "Prazo próximo" : "No prazo"}
    {" · "}{formatQty(quantity, factor)} {unit}
  </span>;
}

function BatchStatus({ batch }: { batch: InventorySaleBatch }) {
  const status = saleWindowStatus(batch.sell_by_at);
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", tones[status])}>
    {status === "overdue" ? "Prazo ultrapassado"
      : status === "warning" ? "Até 7 dias"
      : status === "ok" ? "No prazo" : "Sem prazo anterior"}
  </span>;
}

/** Informativo: não bloqueia o PDV nem representa validade sanitária. */
export function InventorySaleBatchesPanel({
  organizationId, itemId, unit = "un", factor = 1, configuredDays,
}: {
  organizationId: string;
  itemId: string;
  unit?: string;
  factor?: number;
  configuredDays?: number | null;
}) {
  const query = useQuery({
    queryKey: [...queryKeys.inventory.all, "sale-batches", organizationId, itemId],
    queryFn: () => listInventorySaleBatches(organizationId, itemId),
    enabled: Boolean(organizationId && itemId),
    staleTime: 30_000,
  });
  return <div className="space-y-3 border-t border-border pt-4">
    <div>
      <h3 className="text-sm font-bold text-foreground">Prazos das entradas no estoque</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Cada entrada inicia seu próprio prazo de venda. As saídas descontam as entradas mais antigas primeiro.
        O prazo é comercial e não impede a venda automaticamente.
      </p>
    </div>
    {query.isPending ? <p className="text-xs text-muted-foreground">Carregando entradas...</p>
      : query.error ? <p role="alert" className="text-xs text-destructive">Não foi possível consultar os prazos.</p>
      : query.data?.length ? <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[630px] w-full text-left text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Entrada</th><th className="px-3 py-2">Quantidade recebida</th><th className="px-3 py-2">Saldo restante</th>
              <th className="px-3 py-2">Prazo final</th><th className="px-3 py-2">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {query.data.map(batch => <tr key={batch.id}>
              <td className="px-3 py-2">{new Date(batch.received_at).toLocaleDateString("pt-BR")}</td>
              <td className="px-3 py-2 tabular-nums">{formatQty(batch.initial_quantity, factor)} {unit}</td>
              <td className="px-3 py-2 font-semibold tabular-nums">{formatQty(batch.remaining_quantity, factor)} {unit}</td>
              <td className="px-3 py-2">{batch.sell_by_at ? new Date(batch.sell_by_at).toLocaleDateString("pt-BR") : "Sem prazo"}</td>
              <td className="px-3 py-2"><BatchStatus batch={batch}/></td>
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="text-xs text-muted-foreground">
        {configuredDays ? "As próximas entradas serão acompanhadas individualmente." : "Nenhuma entrada com saldo registrada."}
      </p>}
    <p className="text-[11px] text-muted-foreground">
      Saldos anteriores à configuração permanecem sem prazo retroativo. A alteração dos dias não muda os prazos já iniciados.
    </p>
  </div>;
}
