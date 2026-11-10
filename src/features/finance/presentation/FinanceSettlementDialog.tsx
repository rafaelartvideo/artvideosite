import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FCurrencyInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { getOrderReportedReceipts } from "../domain/finance-reported-receipts";
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

function localDateTimeFromIso(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

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
  forecastPending = false,
  canAdjustInstallment = false,
  onAdjustInstallment,
  onClose,
  onSave,
}: {
  open: boolean;
  detail: FinancialEntryDetail;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  saving: boolean;
  forecastPending?: boolean;
  canAdjustInstallment?: boolean;
  onAdjustInstallment?: (installmentId: string, newAmount: number, reason: string) => Promise<void>;
  onClose: () => void;
  onSave: (draft: FinancialSettlementDraft) => Promise<void>;
}) {
  const openInstallments = useMemo(
    () => detail.installments.filter(item => Number(item.original_amount) - Number(item.settled_amount) > 0.0001),
    [detail.installments],
  );
  const activeMethods = paymentMethods.filter(item => item.is_active);
  const activeAccounts = accounts.filter(item => item.is_active);
  const reportedReceipts = useMemo(() => getOrderReportedReceipts(detail.source_details), [detail.source_details]);
  const [installmentId, setInstallmentId] = useState("");
  const [settlementScope, setSettlementScope] = useState<"installment" | "all">("installment");
  const allRemaining = openInstallments.reduce((sum, item) => sum + Number(item.original_amount) - Number(item.settled_amount), 0);
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("0");
  const [penalty, setPenalty] = useState("0");
  const [additions, setAdditions] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [methodId, setMethodId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeInput());
  const [fieldErrors, setFieldErrors] = useState<{ installment?: string; principal?: string; method?: string; account?: string }>({});
  const [forecastEdit, setForecastEdit] = useState<{ amount: string } | null>(null);
  const [forecastError, setForecastError] = useState("");
  const [forecastSaving, setForecastSaving] = useState(false);
  const forecastSavingRef = useRef(false);
  const forecastBusy = forecastSaving || forecastPending;
  const selectedInstallment = openInstallments.find(item => item.id === installmentId) || null;
  const selectedReportedReceipt = reportedReceipts.find(item => item.installment_number === selectedInstallment?.installment_number) || null;
  const selectedMethod = activeMethods.find(item => item.id === methodId) || null;
  const remaining = settlementScope === "all"
    ? allRemaining
    : selectedInstallment ? Number(selectedInstallment.original_amount) - Number(selectedInstallment.settled_amount) : 0;
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
    const firstInstallment = openInstallments.find(item => reportedReceipts.some(receipt => receipt.installment_number === item.installment_number)) || openInstallments[0] || null;
    const report = reportedReceipts.find(item => item.installment_number === firstInstallment?.installment_number);
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
    const firstMethod = activeMethods.find(item => item.id === report?.payment_method_id)
      || activeMethods.find(item => item.id === nextPlanned?.payment_method_id) || activeMethods[0] || null;
    setSettlementScope("installment");
    setInstallmentId(firstInstallment?.id || "");
    setPrincipal(firstInstallment ? String(Math.round(Math.min(Number(firstInstallment.original_amount) - Number(firstInstallment.settled_amount), plannedRemainder || Number(firstInstallment.original_amount) - Number(firstInstallment.settled_amount))*100)/100) : "");
    setInterest("0");
    setPenalty("0");
    setAdditions("0");
    setDiscount("0");
    setMethodId(firstMethod?.id || "");
    setAccountId(activeAccounts.find(item => item.id === report?.financial_account_id)?.id || firstMethod?.default_financial_account_id || activeAccounts[0]?.id || "");
    setOccurredAt(localDateTimeFromIso(report?.occurred_at) || localDateTimeInput());
    setFieldErrors({});
    setForecastEdit(null);
    setForecastError("");
  }, [open]);

  useEffect(() => {
    if (!selectedMethod) return;
    const reportedAccountId = reportedReceipts.find(item => item.installment_number === selectedInstallment?.installment_number && item.payment_method_id === selectedMethod.id)?.financial_account_id;
    if (reportedAccountId && activeAccounts.some(item => item.id === reportedAccountId)) {
      setAccountId(reportedAccountId);
    } else if (selectedMethod.default_financial_account_id && activeAccounts.some(item => item.id === selectedMethod.default_financial_account_id)) {
      setAccountId(selectedMethod.default_financial_account_id);
    }
  }, [methodId]);

  const selectInstallment = (id: string) => {
    setInstallmentId(id);
    setForecastEdit(null);
    setForecastError("");
    const installment = openInstallments.find(item => item.id === id);
    if (installment) {
      setPrincipal(String(Number(installment.original_amount) - Number(installment.settled_amount)));
      const report = reportedReceipts.find(item => item.installment_number === installment.installment_number);
      if (report) {
        if (activeMethods.some(item => item.id === report.payment_method_id)) setMethodId(report.payment_method_id);
        if (activeAccounts.some(item => item.id === report.financial_account_id)) setAccountId(report.financial_account_id);
        setOccurredAt(localDateTimeFromIso(report.occurred_at) || localDateTimeInput());
      }
    }
  };

  const canAdjustSelected = detail.entry_type === "payable" && canAdjustInstallment
    && Boolean(onAdjustInstallment) && settlementScope === "installment" && Boolean(selectedInstallment);

  const saveForecast = async () => {
    if (!forecastEdit || !selectedInstallment || !onAdjustInstallment || forecastPending || forecastSavingRef.current || saving) return;
    const nextAmount = Number(forecastEdit.amount);
    const alreadyPaid = Number(selectedInstallment.settled_amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= alreadyPaid + 0.005) {
      setForecastError("Informe um valor maior que o já pago.");
      return;
    }
    forecastSavingRef.current = true;
    setForecastSaving(true);
    try {
      setForecastError("");
      // A mutation e o refetch devem terminar antes de liberar os botões e fechar o editor.
      await onAdjustInstallment(selectedInstallment.id, nextAmount, "Valor atualizado durante a baixa financeira.");
      setPrincipal(String(Math.round((nextAmount - alreadyPaid) * 100) / 100));
      setFieldErrors({});
      setForecastEdit(null);
      notifyAdmin("Valor previsto da parcela atualizado. Confira a baixa antes de confirmar.", "success");
    } catch (error) {
      setForecastError(systemErrorMessage(error, "Não foi possível atualizar a previsão da parcela."));
    } finally {
      forecastSavingRef.current = false;
      setForecastSaving(false);
    }
  };

  const save = async () => {
    const principalValidation = validatePrincipalAgainstRemaining(principalValue, remaining);
    const nextErrors: typeof fieldErrors = {};
    if (forecastEdit || forecastBusy) return;
    if (!selectedInstallment) nextErrors.installment = "Selecione uma parcela em aberto.";
    if (settlementScope === "all" && Math.abs(principalValue - allRemaining) > 0.005) {
      nextErrors.principal = "Na quitação total, o valor deve ser exatamente o saldo em aberto.";
    }
    if (!principalValidation.ok) nextErrors.principal = "O valor da baixa deve ser maior que zero e não pode exceder o saldo da parcela.";
    else if (gross <= 0) nextErrors.principal = "O valor final da baixa deve ser maior que zero.";
    else if (fee > gross) nextErrors.principal = "A taxa financeira não pode superar o valor da baixa.";
    if (!selectedMethod) nextErrors.method = "Selecione a forma de pagamento.";
    if (!accountId) nextErrors.account = "Selecione a conta financeira.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setFieldErrors({});
    const draft: FinancialSettlementDraft = {
      entry_id: detail.id,
      installment_id: selectedInstallment.id,
      settle_all: settlementScope === "all",
      principal_amount: principalValue,
      interest_amount: Number(interest || 0),
      penalty_amount: Number(penalty || 0),
      other_additions: Number(additions || 0),
      discount_amount: Number(discount || 0),
      payment_method_id: selectedMethod.id,
      financial_account_id: accountId,
      occurred_at: occurredAt,
    };
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível registrar a baixa."), "error");
    }
  };

  if (!open) return null;
  // Fluxo embutido no Extrato: o título já está no cabeçalho do modal principal.
  return <section aria-label="Baixa financeira" className="min-w-0 space-y-5">
    <div className="space-y-5">
      {selectedReportedReceipt && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
        A parcela {selectedInstallment?.installment_number} foi marcada como recebida na OS{selectedReportedReceipt.occurred_at ? ` em ${new Date(selectedReportedReceipt.occurred_at).toLocaleDateString("pt-BR")}` : ""}. Ainda não houve baixa financeira. Confira os dados e confirme somente após verificar o recebimento.
      </p>}
      {detail.entry_type === "receivable" && openInstallments.length > 1 && <FSelect
        label="Modo de recebimento"
        value={settlementScope}
        options={[{ value: "installment", label: "Receber uma parcela" }, { value: "all", label: "Quitar todo o saldo em aberto" }]}
        onChange={(event: any) => {
          const scope = event.target.value === "all" ? "all" : "installment";
          setSettlementScope(scope);
          setForecastEdit(null);
          setForecastError("");
          setPrincipal(String(Math.round((scope === "all" ? allRemaining
            : Number(selectedInstallment?.original_amount || 0) - Number(selectedInstallment?.settled_amount || 0)) * 100) / 100));
          setFieldErrors({});
        }}
      />}
      {settlementScope === "all" && <p className="text-xs text-muted-foreground">
        Quita todas as parcelas abertas e registra um único recebimento de {formatCurrency(allRemaining)} no extrato.
      </p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {settlementScope === "installment" && <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <FSelect label="Parcela" required error={fieldErrors.installment} disabled={forecastBusy} value={installmentId}
              onChange={(event: any) => selectInstallment(event.target.value)}
              options={openInstallments.map(item => ({ value: item.id, label: `${item.installment_number}/${item.total_installments} · saldo ${formatCurrency(Number(item.original_amount) - Number(item.settled_amount))}` }))} />
          </div>
          {canAdjustSelected && !forecastEdit && <AdminIconButton
            ariaLabel="Editar valor da parcela" title="Editar valor da parcela"
            className="!h-[42px] !w-[42px] shrink-0" disabled={saving || forecastBusy}
            onClick={() => { setForecastError(""); setForecastEdit({ amount: String(selectedInstallment!.original_amount) }); }}>
            <Pencil size={16} />
          </AdminIconButton>}
        </div>}
        <FCurrencyInput label={detail.entry_type === "payable" ? "Valor a pagar" : "Valor a receber"} required
          disabled={settlementScope === "all" || Boolean(forecastEdit)} error={fieldErrors.principal}
          value={principal} onChange={(event: any) => { setFieldErrors(current => ({ ...current, principal: undefined })); setPrincipal(event.target.value); }} />
      </div>
      {forecastEdit && canAdjustSelected && <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1 sm:max-w-[280px]">
            <FCurrencyInput label="Novo valor da parcela" value={forecastEdit.amount}
              className="!h-[42px]" disabled={forecastBusy}
              onChange={(event: any) => setForecastEdit(current => current && ({ ...current, amount: event.target.value }))} />
          </div>
          <AdminButton variant="secondary" className="!h-[42px]" disabled={forecastBusy}
            onClick={() => { setForecastEdit(null); setForecastError(""); }}><ArrowLeft size={15} /> Voltar</AdminButton>
          <AdminButton className="!h-[42px]" loading={forecastBusy} loadingText="Aplicando..."
            disabled={saving || forecastBusy} onClick={() => void saveForecast()}>Aplicar</AdminButton>
        </div>
        {forecastError && <p role="alert" className="text-xs font-semibold text-red-600">{forecastError}</p>}
      </div>}
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
      <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
        
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Valor da baixa</p><p className="mt-1 text-sm font-black text-[#0057e7]">{formatCurrency(gross)}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Taxa</p><p className="mt-1 text-sm font-black">{formatCurrency(fee)}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Líquido</p><p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(net)}</p></div>
      </div>
    </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <AdminButton variant="secondary" disabled={saving || forecastBusy} onClick={onClose}><ArrowLeft size={16} /> Voltar</AdminButton>
        <AdminButton loading={saving} loadingText="Registrando..." disabled={saving || forecastBusy || Boolean(forecastEdit)} onClick={() => void save()}><CheckCircle2 size={16} /> Confirmar baixa</AdminButton>
      </div>
  </section>;

}