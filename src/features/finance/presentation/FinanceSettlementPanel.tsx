import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, WalletCards } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import type {
  FinancialAccount,
  FinancialEntryDetail,
  FinancialPaymentMethod,
  FinancialSettlementDraft,
} from "../domain/finance.types";
import { FinanceSettlementDialog } from "./FinanceSettlementDialog";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function statusLabel(status: string) {
  return ({ scheduled: "Aguardando liquidação", posted: "Liquidada", reversed: "Estornada" } as Record<string, string>)[status] || status;
}

export function FinanceSettlementPanel({
  detail,
  accounts,
  paymentMethods,
  canSettle,
  canReverse,
  settlementPending,
  confirmPending,
  reversePending,
  error,
  onRegister,
  onConfirm,
  onReverse,
}: {
  detail: FinancialEntryDetail;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  canSettle: boolean;
  canReverse: boolean;
  settlementPending: boolean;
  confirmPending: boolean;
  reversePending: boolean;
  error?: unknown;
  onRegister: (draft: FinancialSettlementDraft) => Promise<void>;
  onConfirm: (settlementId: string) => Promise<void>;
  onReverse: (settlementId: string, reason: string) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseReasonError, setReverseReasonError] = useState("");
  const openBalance = detail.installments.reduce((sum, item) => sum + Math.max(0, Number(item.original_amount) - Number(item.settled_amount)), 0);
  const canRegister = detail.approval_status === "approved" && openBalance > 0.0001 && canSettle;
  useEffect(() => {
    if (error) notifyAdmin(systemErrorMessage(error), "error");
  }, [error]);
  const actionLabel = detail.entry_type === "receivable" ? "Receber" : "Pagar";

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
      // O erro real é exibido pelo estado da mutation.
    }
  };

  return <>
    <AdminCard>
      <AdminCardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><WalletCards size={18} className="text-[#0057e7]" /><div><h3 className="text-sm font-black text-[#0d1b2e]">Baixas</h3><p className="text-xs text-[#5a6a82]">Saldo principal em aberto: {formatCurrency(openBalance)}</p></div></div>
          {canRegister && <AdminButton onClick={() => setDialogOpen(true)}>{actionLabel}</AdminButton>}
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-3">
        {detail.approval_status !== "approved" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">As baixas ficam disponíveis somente após a aprovação financeira do lançamento.</div>}
        {detail.settlements.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma baixa registrada.</p> : <div className="space-y-2">
          {detail.settlements.map(item => <div key={item.id} className="rounded-xl border border-[#0d1b2e]/8 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.settlement_status === "posted" ? "bg-emerald-100 text-emerald-700" : item.settlement_status === "scheduled" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{statusLabel(item.settlement_status)}</span><span className="text-xs font-semibold text-[#5a6a82]">{item.payment_method_name_snapshot} · {item.financial_account_name_snapshot}</span></div><p className="mt-2 text-sm font-black text-[#0d1b2e]">Principal {formatCurrency(item.principal_amount)} · Baixa {formatCurrency(item.gross_amount)}</p><p className="mt-1 text-xs text-[#5a6a82]">Juros {formatCurrency(item.interest_amount)} · Multa {formatCurrency(item.penalty_amount)} · Acréscimos {formatCurrency(item.other_additions)} · Desconto {formatCurrency(item.discount_amount)}</p>{Number(item.fee_amount) > 0 && <p className="mt-1 text-xs text-[#5a6a82]">Taxa {formatCurrency(item.fee_amount)} · Líquido {formatCurrency(item.net_amount)}</p>}<p className="mt-1 text-[11px] text-[#8a98aa]">Registrada em {formatDateTime(item.occurred_at)}{item.settlement_status === "scheduled" ? ` · previsão ${formatDateTime(item.expected_settlement_at)}` : item.posted_at ? ` · liquidada em ${formatDateTime(item.posted_at)}` : ""}</p>{item.reversal_reason && <p className="mt-1 text-xs font-semibold text-red-700">Estorno: {item.reversal_reason}</p>}</div>
              <div className="flex shrink-0 flex-wrap gap-2">{item.settlement_status === "scheduled" && canSettle && <AdminButton size="sm" onClick={() => onConfirm(item.id)} loading={confirmPending} loadingText="Confirmando..."><CheckCircle2 size={14} /> Confirmar liquidação</AdminButton>}{item.settlement_status !== "reversed" && canReverse && <AdminButton size="sm" variant="danger" onClick={() => { setReverseId(item.id); setReverseReason(""); setReverseReasonError(""); }} disabled={reversePending}><RotateCcw size={14} /> Estornar</AdminButton>}</div>
            </div>
          </div>)}
        </div>}

        {detail.settlements.some(item => item.settlement_status === "scheduled") && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Clock3 size={14} className="mt-0.5 shrink-0" />Liquidações futuras já reduzem o saldo do título, mas só entram no saldo da conta quando forem confirmadas.</div>}
      </AdminCardContent>
    </AdminCard>

    <FinanceSettlementDialog open={dialogOpen} detail={detail} accounts={accounts} paymentMethods={paymentMethods} saving={settlementPending} onClose={() => { if (!settlementPending) setDialogOpen(false); }} onSave={onRegister} />

    {reverseId && <AdminDialog open onClose={() => { if (!reversePending) { setReverseId(null); setReverseReason(""); setReverseReasonError(""); } }} title="Estornar baixa" description="O lançamento original será preservado e movimentos inversos serão criados." className="max-w-lg" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!reversePending) { setReverseId(null); setReverseReason(""); setReverseReasonError(""); } }}>Cancelar</AdminButton><AdminButton variant="danger" onClick={reverse} loading={reversePending} loadingText="Estornando...">Confirmar estorno</AdminButton></div>}><FTextarea label="Motivo do estorno" required error={reverseReasonError} value={reverseReason} onChange={(event: any) => { setReverseReasonError(""); setReverseReason(event.target.value); }} /></AdminDialog>}
  </>;
}
