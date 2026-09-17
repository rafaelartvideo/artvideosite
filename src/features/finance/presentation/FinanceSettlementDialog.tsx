import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import {
  expectedSettlementDate,
  paymentMethodFee,
  settlementCashAmount,
  settlementNetAmount,
  validatePrincipalAgainstRemaining,
} from "../domain/finance-settlement.mjs";
import type {
  FinancialAccount,
  FinancialEntryDetail,
  FinancialPaymentMethod,
  FinancialSettlementDraft,
} from "../domain/finance.types";

function localDateTimeInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function FinanceSettlementDialog({
  open,
  detail,
  accounts,
  paymentMethods,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  detail: FinancialEntryDetail;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: FinancialSettlementDraft) => Promise<void>;
}) {
  const openInstallments = useMemo(
    () => detail.installments.filter(item => Number(item.original_amount) - Number(item.settled_amount) > 0.0001),
    [detail.installments],
  );
  const activeMethods = paymentMethods.filter(item => item.is_active);
  const activeAccounts = accounts.filter(item => item.is_active);
  const [installmentId, setInstallmentId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("0");
  const [penalty, setPenalty] = useState("0");
  const [additions, setAdditions] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [methodId, setMethodId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeInput());
  const [message, setMessage] = useState("");

  const selectedInstallment = openInstallments.find(item => item.id === installmentId) || null;
  const selectedMethod = activeMethods.find(item => item.id === methodId) || null;
  const remaining = selectedInstallment ? Number(selectedInstallment.original_amount) - Number(selectedInstallment.settled_amount) : 0;
  const principalValue = Number(principal || 0);
  const gross = settlementCashAmount({
    principal: principalValue,
    interest: Number(interest || 0),
    penalty: Number(penalty || 0),
    additions: Number(additions || 0),
    discount: Number(discount || 0),
  });
  const fee = detail.entry_type === "receivable" && selectedMethod
    ? paymentMethodFee(gross, selectedMethod.percentage_fee, selectedMethod.fixed_fee)
    : 0;
  const net = settlementNetAmount(gross, fee);
  const scheduled = detail.entry_type === "receivable" && Boolean(selectedMethod?.creates_future_settlement);
  const expectedDate = selectedMethod && occurredAt
    ? expectedSettlementDate(occurredAt.slice(0, 10), selectedMethod.settlement_days)
    : null;

  useEffect(() => {
    if (!open) return;
    const firstInstallment = openInstallments[0] || null;
    const firstMethod = activeMethods[0] || null;
    setInstallmentId(firstInstallment?.id || "");
    setPrincipal(firstInstallment ? String(Number(firstInstallment.original_amount) - Number(firstInstallment.settled_amount)) : "");
    setInterest("0");
    setPenalty("0");
    setAdditions("0");
    setDiscount("0");
    setMethodId(firstMethod?.id || "");
    setAccountId(firstMethod?.default_financial_account_id || activeAccounts[0]?.id || "");
    setOccurredAt(localDateTimeInput());
    setMessage("");
  }, [open]);

  useEffect(() => {
    if (!selectedMethod) return;
    if (selectedMethod.default_financial_account_id && activeAccounts.some(item => item.id === selectedMethod.default_financial_account_id)) {
      setAccountId(selectedMethod.default_financial_account_id);
    }
  }, [methodId]);

  const selectInstallment = (id: string) => {
    setInstallmentId(id);
    const installment = openInstallments.find(item => item.id === id);
    if (installment) setPrincipal(String(Number(installment.original_amount) - Number(installment.settled_amount)));
  };

  const save = async () => {
    const principalValidation = validatePrincipalAgainstRemaining(principalValue, remaining);
    if (!selectedInstallment) { setMessage("Selecione uma parcela em aberto."); return; }
    if (!principalValidation.ok) { setMessage("O valor principal deve ser maior que zero e não pode exceder o saldo da parcela."); return; }
    if (!selectedMethod) { setMessage("Selecione a forma de pagamento."); return; }
    if (!accountId) { setMessage("Selecione a conta financeira."); return; }
    if (gross <= 0) { setMessage("O valor final da baixa deve ser maior que zero."); return; }
    if (fee > gross) { setMessage("A taxa financeira não pode superar o valor da baixa."); return; }
    try {
      setMessage("");
      await onSave({
        entry_id: detail.id,
        installment_id: selectedInstallment.id,
        principal_amount: principalValue,
        interest_amount: Number(interest || 0),
        penalty_amount: Number(penalty || 0),
        other_additions: Number(additions || 0),
        discount_amount: Number(discount || 0),
        payment_method_id: selectedMethod.id,
        financial_account_id: accountId,
        occurred_at: occurredAt,
      });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registrar a baixa.");
    }
  };

  if (!open) return null;
  const actionLabel = detail.entry_type === "receivable" ? "Receber" : "Pagar";
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
    <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">{actionLabel} lançamento</h2><p className="mt-1 text-xs text-[#5a6a82]">Registre baixa total ou parcial sem alterar o valor original do título.</p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div>
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FSelect label="Parcela" required value={installmentId} onChange={(event: any) => selectInstallment(event.target.value)} options={openInstallments.map(item => ({ value: item.id, label: `${item.installment_number}/${item.total_installments} · saldo ${formatCurrency(Number(item.original_amount) - Number(item.settled_amount))}` }))} />
          <FInput label="Valor principal" required type="number" min="0.01" step="0.01" value={principal} onChange={(event: any) => setPrincipal(event.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FInput label="Juros" type="number" min="0" step="0.01" value={interest} onChange={(event: any) => setInterest(event.target.value)} />
          <FInput label="Multa" type="number" min="0" step="0.01" value={penalty} onChange={(event: any) => setPenalty(event.target.value)} />
          <FInput label="Outros acréscimos" type="number" min="0" step="0.01" value={additions} onChange={(event: any) => setAdditions(event.target.value)} />
          <FInput label="Desconto" type="number" min="0" step="0.01" value={discount} onChange={(event: any) => setDiscount(event.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FSelect label="Forma de pagamento" required value={methodId} onChange={(event: any) => setMethodId(event.target.value)} options={activeMethods.map(item => ({ value: item.id, label: item.name }))} />
          <FSelect label="Conta financeira" required value={accountId} onChange={(event: any) => setAccountId(event.target.value)} options={activeAccounts.map(item => ({ value: item.id, label: item.name }))} />
          <FInput label="Data e hora" required type="datetime-local" value={occurredAt} onChange={(event: any) => setOccurredAt(event.target.value)} />
        </div>

        <div className="grid gap-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Principal</p><p className="mt-1 text-sm font-black">{formatCurrency(principalValue)}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Valor da baixa</p><p className="mt-1 text-sm font-black text-[#0057e7]">{formatCurrency(gross)}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Taxa</p><p className="mt-1 text-sm font-black">{formatCurrency(fee)}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Líquido</p><p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(net)}</p></div>
        </div>
        {selectedMethod && <div className={`rounded-lg border px-4 py-3 text-xs font-semibold ${scheduled ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{scheduled ? `Liquidação futura: o título será baixado agora e o saldo da conta será movimentado quando a liquidação for confirmada. Previsão: ${expectedDate || "—"}.` : `Liquidação imediata. Previsão da forma de pagamento: ${expectedDate || "—"}.`}</div>}
        {message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton><AdminButton onClick={save} loading={saving} loadingText="Registrando...">{actionLabel}</AdminButton></div>
    </div>
  </div>;
}
