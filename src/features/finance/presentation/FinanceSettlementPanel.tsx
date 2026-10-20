import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FinanceTableSurface } from "./FinanceTableSurface";
import type { FinancialEntryDetail } from "../domain/finance.types";

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function statusLabel(status: string) {
  return ({ scheduled: "Aguardando liquidação", posted: "Liquidada", reversed: "Estornada" } as Record<string, string>)[status] || status;
}

export function FinanceSettlementPanel({
  detail, canSettle, canReverse, confirmPending, reversePending, error, onConfirm, onReverse,
}: {
  detail: FinancialEntryDetail;
  canSettle: boolean;
  canReverse: boolean;
  confirmPending: boolean;
  reversePending: boolean;
  error?: unknown;
  onConfirm: (settlementId: string) => Promise<void>;
  onReverse: (settlementId: string, reason: string) => Promise<void>;
}) {
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseReasonError, setReverseReasonError] = useState("");
  useEffect(() => {
    if (error) notifyAdmin(systemErrorMessage(error), "error");
  }, [error]);

  const reverse = async () => {
    const reason = reverseReason.trim();
    if (!reverseId) return;
    if (!reason) { setReverseReasonError("Informe o motivo do estorno."); return; }
    try {
      setReverseReasonError("");
      await onReverse(reverseId, reason);
      setReverseId(null);
      setReverseReason("");
    } catch {
      // A mensagem de erro vem da mutation.
    }
  };

  return <>
    <FinanceTableSurface>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">Data / histórico</th>
              <th scope="col" className="px-4 py-3 text-left">Forma / conta</th>
              <th scope="col" className="px-4 py-3 text-right">Principal</th>
              <th scope="col" className="px-4 py-3 text-right">Valor da baixa</th>
              <th scope="col" className="px-4 py-3 text-left">Situação</th>
              <th scope="col" className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.settlements.length === 0
              ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma baixa registrada para esta conta.</td></tr>
              : detail.settlements.map(item => <tr key={item.id} className="align-top transition-colors hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-semibold tabular-nums text-foreground">{formatDateTime(item.occurred_at)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.settlement_status === "scheduled" ? "Previsão: " + formatDateTime(item.expected_settlement_at) : item.posted_at ? "Liquidada: " + formatDateTime(item.posted_at) : "Movimentação financeira"}
                  </p>
                  {item.reversal_reason && <p className="mt-1 max-w-[220px] text-xs text-destructive">Estorno: {item.reversal_reason}</p>}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{item.payment_method_name_snapshot || "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.financial_account_name_snapshot || "—"}</p>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{formatCurrency(item.principal_amount)}</td>
                <td className="px-4 py-3 text-right">
                  <p className="font-bold tabular-nums text-foreground">{formatCurrency(item.gross_amount)}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">Juros {formatCurrency(item.interest_amount)} · Multa {formatCurrency(item.penalty_amount)}</p>
                  {(Number(item.other_additions) > 0 || Number(item.discount_amount) > 0) && <p className="mt-1 text-xs tabular-nums text-muted-foreground">Acréscimos {formatCurrency(item.other_additions)} · Desconto {formatCurrency(item.discount_amount)}</p>}
                  {Number(item.fee_amount) > 0 && <p className="mt-1 text-xs tabular-nums text-muted-foreground">Taxa {formatCurrency(item.fee_amount)} · Líquido {formatCurrency(item.net_amount)}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={"inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase " + STATUS_TONE_CLASSES[item.settlement_status === "posted" ? "success" : item.settlement_status === "scheduled" ? "waiting" : "danger"].badge}>{statusLabel(item.settlement_status)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {item.settlement_status === "scheduled" && canSettle && <AdminButton size="sm" onClick={() => onConfirm(item.id)} loading={confirmPending} loadingText="Confirmando..."><CheckCircle2 size={14} /> Confirmar crédito</AdminButton>}
                    {item.settlement_status !== "reversed" && canReverse && <AdminButton size="sm" variant="danger" disabled={reversePending} onClick={() => { setReverseId(item.id); setReverseReason(""); setReverseReasonError(""); }}><RotateCcw size={14} /> Estornar</AdminButton>}
                  </div>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </FinanceTableSurface>

    {detail.settlements.some(item => item.settlement_status === "scheduled") && <p className="flex items-start gap-2 text-xs text-muted-foreground"><Clock3 size={14} className="mt-0.5 shrink-0" />Baixas futuras reduzem o valor em aberto, mas só entram no saldo da conta quando a liquidação é confirmada.</p>}

    {reverseId && <AdminDialog open onClose={() => { if (!reversePending) { setReverseId(null); setReverseReason(""); setReverseReasonError(""); } }} title="Estornar baixa" description="O lançamento original será preservado e movimentos inversos serão criados." className="max-w-lg" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!reversePending) { setReverseId(null); setReverseReason(""); setReverseReasonError(""); } }}>Cancelar</AdminButton><AdminButton variant="danger" onClick={reverse} loading={reversePending} loadingText="Estornando...">Confirmar estorno</AdminButton></div>}><FTextarea label="Motivo do estorno" required error={reverseReasonError} value={reverseReason} onChange={(event: any) => { setReverseReasonError(""); setReverseReason(event.target.value); }} /></AdminDialog>}
  </>;
}
