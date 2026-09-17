import { useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, WalletCards } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
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
  const [localError, setLocalError] = useState("");
  const openBalance = detail.installments.reduce((sum, item) => sum + Math.max(0, Number(item.original_amount) - Number(item.settled_amount)), 0);
  const canRegister = detail.approval_status === "approved" && openBalance > 0.0001 && canSettle;
  const mutationError = error instanceof Error ? error.message : "";
  const visibleError = localError || mutationError;
  const actionLabel = detail.entry_type === "receivable" ? "Receber" : "Pagar";

  const reverse = async () => {
    const reason = reverseReason.trim();
    if (!reverseId) return;
    if (!reason) { setLocalError("Informe o motivo do estorno."); return; }
    try {
      setLocalError("");
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
        {visibleError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{visibleError}</div>}
        {detail.approval_status !== "approved" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">As baixas ficam disponíveis somente após a aprovação financeira do lançamento.</div>}
        {detail.settlements.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma baixa registrada.</p> : <div className="space-y-2">
          {detail.settlements.map(item => <div key={item.id} className="rounded-xl border border-[#0d1b2e]/8 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.settlement_status === "posted" ? "bg-emerald-100 text-emerald-700" : item.settlement_status === "scheduled" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{statusLabel(item.settlement_status)}</span><span className="text-xs font-semibold text-[#5a6a82]">{item.payment_method_name_snapshot} · {item.financial_account_name_snapshot}</span></div><p className="mt-2 text-sm font-black text-[#0d1b2e]">Principal {formatCurrency(item.principal_amount)} · Baixa {formatCurrency(item.gross_amount)}</p><p className="mt-1 text-xs text-[#5a6a82]">Juros {formatCurrency(item.interest_amount)} · Multa {formatCurrency(item.penalty_amount)} · Acréscimos {formatCurrency(item.other_additions)} · Desconto {formatCurrency(item.discount_amount)}</p>{Number(item.fee_amount) > 0 && <p className="mt-1 text-xs text-[#5a6a82]">Taxa {formatCurrency(item.fee_amount)} · Líquido {formatCurrency(item.net_amount)}</p>}<p className="mt-1 text-[11px] text-[#8a98aa]">Registrada em {formatDateTime(item.occurred_at)}{item.settlement_status === "scheduled" ? ` · previsão ${formatDateTime(item.expected_settlement_at)}` : item.posted_at ? ` · liquidada em ${formatDateTime(item.posted_at)}` : ""}</p>{item.reversal_reason && <p className="mt-1 text-xs font-semibold text-red-700">Estorno: {item.reversal_reason}</p>}</div>
              <div className="flex shrink-0 flex-wrap gap-2">{item.settlement_status === "scheduled" && canSettle && <AdminButton size="sm" onClick={() => onConfirm(item.id)} loading={confirmPending} loadingText="Confirmando..."><CheckCircle2 size={14} /> Confirmar liquidação</AdminButton>}{item.settlement_status !== "reversed" && canReverse && <AdminButton size="sm" variant="danger" onClick={() => { setReverseId(item.id); setReverseReason(""); setLocalError(""); }} disabled={reversePending}><RotateCcw size={14} /> Estornar</AdminButton>}</div>
            </div>
          </div>)}
        </div>}

        {detail.settlements.some(item => item.settlement_status === "scheduled") && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Clock3 size={14} className="mt-0.5 shrink-0" />Liquidações futuras já reduzem o saldo do título, mas só entram no saldo da conta quando forem confirmadas.</div>}
      </AdminCardContent>
    </AdminCard>

    <FinanceSettlementDialog open={dialogOpen} detail={detail} accounts={accounts} paymentMethods={paymentMethods} saving={settlementPending} onClose={() => { if (!settlementPending) setDialogOpen(false); }} onSave={onRegister} />

    {reverseId && <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="border-b px-5 py-4"><h2 className="text-lg font-black text-[#0d1b2e]">Estornar baixa</h2><p className="mt-1 text-xs text-[#5a6a82]">O lançamento original será preservado e movimentos inversos serão criados.</p></div><div className="p-5"><FTextarea label="Motivo do estorno" required value={reverseReason} onChange={(event: any) => setReverseReason(event.target.value)} />{localError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{localError}</div>}</div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!reversePending) { setReverseId(null); setReverseReason(""); setLocalError(""); } }}>Cancelar</AdminButton><AdminButton variant="danger" onClick={reverse} loading={reversePending} loadingText="Estornando...">Confirmar estorno</AdminButton></div></div></div>}
  </>;
}
