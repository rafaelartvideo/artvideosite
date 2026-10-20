import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FCurrencyInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import {
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
  onStepChange,
}: {
  open: boolean;
  detail: FinancialEntryDetail;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: FinancialSettlementDraft) => Promise<void>;
  onStepChange?: (step: "question" | "form" | "review") => void;
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
  const [fieldErrors, setFieldErrors] = useState<{ installment?: string; principal?: string; method?: string; account?: string }>({});
  const [confirmation, setConfirmation] = useState<FinancialSettlementDraft | null>(null);
  const [step, setStep] = useState<"question" | "form" | "review">("question");
  const goToStep = (next: "question" | "form" | "review") => {
    setStep(next);
    onStepChange?.(next);
  };

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

  useEffect(() => {
    if (!open) return;
    const firstInstallment = openInstallments[0] || null;
    const planned = Array.isArray(detail.source_details?.payment_plan)
      ? detail.source_details.payment_plan as Array<{payment_method_id:string;amount:number}> : [];
    const nextPlanned = planned.find(part => {
      const used = detail.settlements.filter(item => item.settlement_status !== "reversed" && item.payment_method_id === part.payment_method_id)
        .reduce((sum,item)=>sum+Number(item.principal_amount||0),0);
      return Number(part.amount) - used > 0.005;
    });
    const alreadyUsed = nextPlanned ? detail.settlements.filter(item => item.settlement_status !== "reversed" && item.payment_method_id === nextPlanned.payment_method_id)
      .reduce((sum,item)=>sum+Number(item.principal_amount||0),0) : 0;
    const plannedRemainder = nextPlanned ? Math.max(0,Number(nextPlanned.amount)-alreadyUsed) : 0;
    const firstMethod = activeMethods.find(item => item.id === nextPlanned?.payment_method_id) || activeMethods[0] || null;
    setInstallmentId(firstInstallment?.id || "");
    setPrincipal(firstInstallment ? String(Math.round(Math.min(Number(firstInstallment.original_amount) - Number(firstInstallment.settled_amount), plannedRemainder || Number(firstInstallment.original_amount) - Number(firstInstallment.settled_amount))*100)/100) : "");
    setInterest("0");
    setPenalty("0");
    setAdditions("0");
    setDiscount("0");
    setMethodId(firstMethod?.id || "");
    setAccountId(firstMethod?.default_financial_account_id || activeAccounts[0]?.id || "");
    setOccurredAt(localDateTimeInput());
    setFieldErrors({});
    setConfirmation(null);
    setStep("question");
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
    const nextErrors: typeof fieldErrors = {};
    if (!selectedInstallment) nextErrors.installment = "Selecione uma parcela em aberto.";
    if (!principalValidation.ok) nextErrors.principal = "O valor principal deve ser maior que zero e não pode exceder o saldo da parcela.";
    else if (gross <= 0) nextErrors.principal = "O valor final da baixa deve ser maior que zero.";
    else if (fee > gross) nextErrors.principal = "A taxa financeira não pode superar o valor da baixa.";
    if (!selectedMethod) nextErrors.method = "Selecione a forma de pagamento.";
    if (!accountId) nextErrors.account = "Selecione a conta financeira.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setFieldErrors({});
    setConfirmation({
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
    goToStep("review");
  };
  const confirmSave = async () => {
    if (!confirmation) return;
    try {
      await onSave(confirmation);
      setConfirmation(null);
      onClose();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível registrar a baixa."), "error");
    }
  };


  if (!open) return null;
  const actionLabel = detail.entry_type === "receivable" ? "Receber" : "Pagar";
  const confirmationTotal = confirmation ? settlementCashAmount({
    principal: confirmation.principal_amount,
    interest: confirmation.interest_amount,
    penalty: confirmation.penalty_amount,
    additions: confirmation.other_additions,
    discount: confirmation.discount_amount,
  }) : 0;

  // Fluxo embutido no Extrato: nenhum segundo AdminDialog é montado.
  return <section aria-label="Baixa financeira" className="min-w-0 space-y-5 animate-in fade-in-0 slide-in-from-right-2 duration-300">
    {step === "question" ? <>
      <div className="flex flex-col items-center gap-4 py-3 text-center sm:py-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck size={32} /></div>
        <div className="max-w-md space-y-2">
          <h3 className="text-xl font-bold text-foreground">Deseja dar baixa neste lançamento?</h3>
          <p className="text-sm text-muted-foreground">Você poderá informar o valor, a forma de pagamento e a conta financeira antes de registrar.</p>
        </div>
        <div className="grid w-full max-w-md gap-3 rounded-xl border border-border bg-muted/30 p-4 text-left sm:grid-cols-2">
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Lançamento</p><p className="font-semibold text-foreground">{detail.description}</p></div>
          <div><p className="text-xs text-muted-foreground">Cliente / favorecido</p><p className="text-sm font-semibold">{detail.counterpart_name_snapshot || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Saldo em aberto</p><p className="text-sm font-bold text-primary">{formatCurrency(openInstallments.reduce((sum, item) => sum + Number(item.original_amount) - Number(item.settled_amount), 0))}</p></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <AdminButton variant="secondary" onClick={onClose}>Não, voltar</AdminButton>
        <AdminButton onClick={() => goToStep("form")}>Sim, continuar</AdminButton>
      </div>
    </> : step === "review" && confirmation ? <>
      <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-3 duration-300">
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <CheckCircle2 className="h-7 w-7 shrink-0 text-primary" />
          <div><h3 className="text-base font-bold text-foreground">Confirmar baixa financeira</h3><p className="text-xs text-muted-foreground">Confira os dados antes de movimentar a conta.</p></div>
        </div>
        <div className="grid gap-4 rounded-xl border border-border p-5 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Lançamento</p><p className="font-semibold">{detail.description}</p></div>
          <div><p className="text-xs text-muted-foreground">Valor da baixa</p><p className="text-lg font-bold tabular-nums text-primary">{formatCurrency(confirmationTotal)}</p></div>
          <div><p className="text-xs text-muted-foreground">Forma de pagamento</p><p className="font-semibold">{paymentMethods.find(item => item.id === confirmation.payment_method_id)?.name || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">{detail.entry_type === "receivable" ? "Conta de destino" : "Conta de origem"}</p><p className="font-semibold">{accounts.find(item => item.id === confirmation.financial_account_id)?.name || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Data da baixa</p><p className="font-semibold">{confirmation.occurred_at ? new Date(confirmation.occurred_at).toLocaleString("pt-BR") : "—"}</p></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <AdminButton variant="secondary" disabled={saving} onClick={() => { goToStep("form"); setConfirmation(null); }}><ArrowLeft size={15} /> Voltar</AdminButton>
        <AdminButton loading={saving} loadingText="Registrando..." onClick={() => void confirmSave()}><CheckCircle2 size={16} /> Confirmar baixa</AdminButton>
      </div>
    </> : <>
      <div className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
          <div><h3 className="text-base font-bold text-foreground">{actionLabel} lançamento</h3>
            <p className="mt-1 text-xs text-muted-foreground">Informe os dados da baixa total ou parcial.</p></div>
          <span className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary">{formatCurrency(gross > 0 ? gross : 0)}</span>
        </div>
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FSelect label="Parcela" required error={fieldErrors.installment} value={installmentId} onChange={(event: any) => selectInstallment(event.target.value)} options={openInstallments.map(item => ({ value: item.id, label: `${item.installment_number}/${item.total_installments} · saldo ${formatCurrency(Number(item.original_amount) - Number(item.settled_amount))}` }))} />
        <FCurrencyInput label="Valor principal" required error={fieldErrors.principal} value={principal} onChange={(event: any) => { setFieldErrors(current => ({ ...current, principal: undefined })); setPrincipal(event.target.value); }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FCurrencyInput label="Juros" value={interest} onChange={(event: any) => setInterest(event.target.value)} />
        <FCurrencyInput label="Multa" value={penalty} onChange={(event: any) => setPenalty(event.target.value)} />
        <FCurrencyInput label="Outros acréscimos" value={additions} onChange={(event: any) => setAdditions(event.target.value)} />
        <FCurrencyInput label="Desconto" value={discount} onChange={(event: any) => setDiscount(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FSelect label="Forma de pagamento" required error={fieldErrors.method} value={methodId} onChange={(event: any) => setMethodId(event.target.value)} options={activeMethods.map(item => ({ value: item.id, label: item.name }))} />
        <FSelect label="Conta financeira" required error={fieldErrors.account} value={accountId} onChange={(event: any) => setAccountId(event.target.value)} options={activeAccounts.map(item => ({ value: item.id, label: item.name }))} />
        <FInput label="Data e hora" required type="datetime-local" value={occurredAt} onChange={(event: any) => setOccurredAt(event.target.value)} />
      </div>
      <div className="grid gap-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Principal</p><p className="mt-1 text-sm font-black">{formatCurrency(principalValue)}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Valor da baixa</p><p className="mt-1 text-sm font-black text-[#0057e7]">{formatCurrency(gross)}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Taxa</p><p className="mt-1 text-sm font-black">{formatCurrency(fee)}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Líquido</p><p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(net)}</p></div>
      </div>
    </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <AdminButton variant="secondary" disabled={saving} onClick={onClose}>Cancelar</AdminButton>
        <AdminButton loading={saving} loadingText="Validando..." onClick={() => void save()}>Revisar baixa</AdminButton>
      </div>
    </>}
  </section>;

}