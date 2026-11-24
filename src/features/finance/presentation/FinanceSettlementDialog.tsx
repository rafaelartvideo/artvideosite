import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/shared/domain/formatters";
import { FCurrencyInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { getOrderReportedReceipts, getInstallmentPaymentPreference } from "../domain/finance-reported-receipts";
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
  const [parts, setParts] = useState<Array<{key:string; installment_id:string; principal:string; methodId:string; accountId:string; occurredAt:string}>>([]);
  const submitGate = useRef(false);
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
  const moneyCents = (value: unknown) => Math.round(Number(value || 0) * 100);
  const defaultsFor = (item: typeof openInstallments[number]) => {
    const preference = getInstallmentPaymentPreference(detail.source_details, item.installment_number);
    const planned = Array.isArray(detail.source_details?.payment_plan) ? detail.source_details.payment_plan as Array<{payment_method_id:string;amount:number}> : [];
    const plannedMethod = planned.length === 1 ? planned[0].payment_method_id : "";
    const method = activeMethods.find(m => m.id === (preference.payment_method_id || plannedMethod));
    // Never carry the previous installment's method/account into an unrelated one.
    const account = activeAccounts.find(a => a.id === preference.financial_account_id)
      || activeAccounts.find(a => a.id === method?.default_financial_account_id);
    return { methodId: method?.id || "", accountId: account?.id || "", occurredAt: localDateTimeFromIso(preference.occurred_at) || localDateTimeInput() };
  };
  const makeParts = () => openInstallments.map(item => ({
    key: crypto.randomUUID(), installment_id: item.id,
    principal: String((moneyCents(item.original_amount)-moneyCents(item.settled_amount))/100),
    ...defaultsFor(item),
  }));
  const patchPart = (key:string, patch:Partial<typeof parts[number]>) => setParts(current => current.map(part=>part.key===key?{...part,...patch}:part));
  // Distribute title-level adjustments in exact cents; the last portion receives rounding remainder.
  const adjustmentAmounts = [interest, penalty, additions, discount].map(moneyCents);
  const totalPartCents = parts.reduce((sum, part) => sum + moneyCents(part.principal), 0);
  let allocated = [0,0,0,0];
  let cumulativePrincipal = 0;
  const settlementParts = parts.map((part, index) => {
    cumulativePrincipal += moneyCents(part.principal);
    const amounts = adjustmentAmounts.map((amount, i) => {
      const target = index === parts.length - 1 ? amount : totalPartCents > 0 ? Math.round(amount * cumulativePrincipal / totalPartCents) : 0;
      const portion = target - allocated[i]; allocated[i] = target; return portion/100;
    });
    const [interest_amount, penalty_amount, other_additions, discount_amount] = amounts;
    const principal_amount = Number(part.principal || 0);
    const gross = settlementCashAmount({principal:principal_amount,interest:interest_amount,penalty:penalty_amount,additions:other_additions,discount:discount_amount});
    const method = activeMethods.find(item => item.id === part.methodId);
    const fee = method ? paymentMethodFee(gross, method.percentage_fee, method.fixed_fee) : 0;
    return { installment_id:part.installment_id, principal_amount, interest_amount, penalty_amount, other_additions, discount_amount,
      payment_method_id:part.methodId, financial_account_id:part.accountId, occurred_at:part.occurredAt, gross, fee };
  });
  const gross = settlementScope === "all" ? settlementParts.reduce((sum,part)=>sum+moneyCents(part.gross),0)/100 : settlementCashAmount({
    principal: principalValue, interest: Number(interest || 0), penalty: Number(penalty || 0), additions: Number(additions || 0), discount: Number(discount || 0),
  });
  const fee = settlementScope === "all" ? settlementParts.reduce((sum,part)=>sum+moneyCents(part.fee),0)/100 : detail.entry_type === "receivable" && selectedMethod
    ? paymentMethodFee(gross, selectedMethod.percentage_fee, selectedMethod.fixed_fee) : 0;
  const net = settlementNetAmount(gross, fee);
  const selectInstallment = (id: string) => {
    setInstallmentId(id);
    setForecastEdit(null); setForecastError(""); setFieldErrors({});
    setInterest("0"); setPenalty("0"); setAdditions("0"); setDiscount("0");
    const installment = openInstallments.find(item => item.id === id);
    if (!installment) { setPrincipal(""); setMethodId(""); setAccountId(""); return; }
    const report = reportedReceipts.find(item => item.installment_number === installment.installment_number);
    const remaining = (moneyCents(installment.original_amount)-moneyCents(installment.settled_amount))/100;
    setPrincipal(String(report ? Math.min(remaining, report.principal_amount) : remaining));
    const pref = defaultsFor(installment);
    setMethodId(pref.methodId); setAccountId(pref.accountId); setOccurredAt(pref.occurredAt);
  };
  useEffect(() => {
    if (!open) return;
    const first = openInstallments.find(item => reportedReceipts.some(receipt => receipt.installment_number === item.installment_number)) || openInstallments[0];
    setSettlementScope("installment"); setParts([]); selectInstallment(first?.id || "");
  }, [open]);

  const changeMethod = (id:string) => {
    setMethodId(id);
    const method = activeMethods.find(item => item.id === id);
    const pref = selectedInstallment ? getInstallmentPaymentPreference(detail.source_details, selectedInstallment.installment_number) : null;
    setAccountId(activeAccounts.find(a => a.id === (pref?.payment_method_id === id ? pref?.financial_account_id : ""))?.id
      || activeAccounts.find(a => a.id === method?.default_financial_account_id)?.id || "");
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
    if (forecastEdit || forecastBusy || saving || submitGate.current) return;
    if (!selectedInstallment) nextErrors.installment = "Selecione uma parcela em aberto.";
    if (settlementScope === "all" && Math.abs(principalValue - allRemaining) > 0.005) {
      nextErrors.principal = "Na quitação total, o valor deve ser exatamente o saldo em aberto.";
    }
    if (!principalValidation.ok) nextErrors.principal = "O valor da baixa deve ser maior que zero e não pode exceder o saldo da parcela.";
    else if (gross <= 0) nextErrors.principal = "O valor final da baixa deve ser maior que zero.";
    else if (fee > gross) nextErrors.principal = "A taxa financeira não pode superar o valor da baixa.";
    if (settlementScope === "all") {
      if (!parts.length || parts.length > 200 || openInstallments.some(item => parts.filter(p=>p.installment_id===item.id).reduce((sum,p)=>sum+moneyCents(p.principal),0)!==moneyCents(item.original_amount)-moneyCents(item.settled_amount))) nextErrors.principal = "Distribua exatamente o saldo de cada parcela entre as formas de pagamento.";
      else if (settlementParts.some(part => part.principal_amount <= 0 || part.gross <= 0 || part.fee > part.gross || !part.occurred_at)) nextErrors.principal = "Confira os valores, taxas e datas de cada pagamento.";
      if (settlementParts.some(part=>!activeMethods.some(m=>m.id===part.payment_method_id))) nextErrors.method = "Selecione a forma de pagamento de todas as parcelas.";
      if (settlementParts.some(part=>!activeAccounts.some(a=>a.id===part.financial_account_id))) nextErrors.account = "Selecione a conta financeira de todos os pagamentos.";
    } else {
      if (!selectedMethod) nextErrors.method = "Selecione a forma de pagamento.";
      if (!activeAccounts.some(a=>a.id===accountId)) nextErrors.account = "Selecione a conta financeira.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setFieldErrors({});
    const draft: FinancialSettlementDraft = {
      entry_id: detail.id,
      installment_id: selectedInstallment!.id,
      ...(settlementScope === "all" ? {settlement_parts: settlementParts.map(({gross: _gross,fee: _fee,...part})=>part)} : {}),
      settle_all: settlementScope === "all",
      principal_amount: principalValue,
      interest_amount: Number(interest || 0),
      penalty_amount: Number(penalty || 0),
      other_additions: Number(additions || 0),
      discount_amount: Number(discount || 0),
      payment_method_id: selectedMethod?.id || "",
      financial_account_id: accountId,
      occurred_at: occurredAt,
    };
    submitGate.current = true;
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível registrar a baixa."), "error");
    } finally { submitGate.current = false; }
  };

  if (!open) return null;
  // Fluxo embutido no Extrato: o título já está no cabeçalho do modal principal.
  return <section aria-label="Baixa financeira" className="min-w-0 space-y-5">
    <div className="space-y-5">
      {selectedReportedReceipt && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
        A parcela {selectedInstallment?.installment_number} foi marcada como recebida na OS{selectedReportedReceipt.occurred_at ? ` em ${new Date(selectedReportedReceipt.occurred_at).toLocaleDateString("pt-BR")}` : ""}. Ainda não houve baixa financeira. Confira os dados e confirme somente após verificar o recebimento.
      </p>}
      <div className="grid gap-4 sm:grid-cols-2">
      {detail.entry_type === "receivable" && <FSelect
        label="Modo de recebimento" value={settlementScope}
        options={[{ value: "installment", label: "Receber uma parcela" }, { value: "all", label: "Quitar todo o saldo em aberto" }]}
        onChange={(event: any) => {
          const scope = event.target.value === "all" ? "all" : "installment";
          setSettlementScope(scope); setForecastEdit(null); setForecastError(""); setFieldErrors({});
          if(scope === "all"){setParts(makeParts()); setPrincipal(String(Math.round(allRemaining*100)/100));}
          else {setParts([]); selectInstallment(installmentId);}
        }}
      />}
        <FCurrencyInput label={detail.entry_type === "payable" ? "Valor a pagar" : "Valor a receber"} required
          disabled={settlementScope === "all" || Boolean(forecastEdit)} error={fieldErrors.principal}
          value={principal} onChange={(event: any) => { setFieldErrors(current => ({ ...current, principal: undefined })); setPrincipal(event.target.value); }} />
      </div>
        {settlementScope === "installment" && <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <FSelect label="Parcela" required error={fieldErrors.installment} disabled={forecastBusy} value={installmentId}
              onChange={(event: any) => selectInstallment(event.target.value)}
              options={openInstallments.map(item => ({ value: item.id, label: `${item.installment_number}/${item.total_installments} · ${paymentMethods.find(m=>m.id===getInstallmentPaymentPreference(detail.source_details,item.installment_number).payment_method_id)?.name || "A definir"} · saldo ${formatCurrency(Number(item.original_amount) - Number(item.settled_amount))}` }))} />
          </div>
          {canAdjustSelected && !forecastEdit && <AdminIconButton
            ariaLabel="Editar valor da parcela" title="Editar valor da parcela"
            className="!h-[42px] !w-[42px] shrink-0" disabled={saving || forecastBusy}
            onClick={() => { setForecastError(""); setForecastEdit({ amount: String(selectedInstallment!.original_amount) }); }}>
            <Pencil size={16} />
          </AdminIconButton>}
        </div>}

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
      {settlementScope === "installment" ? <div className="grid gap-4 sm:grid-cols-3">
        <FSelect label="Forma de pagamento" required error={fieldErrors.method} value={methodId} onChange={(event: any) => changeMethod(event.target.value)} options={[{value:"",label:"Selecionar..."},...activeMethods.map(item => ({ value: item.id, label: item.name }))]} />
        <FSelect label="Conta financeira" required error={fieldErrors.account} value={accountId} onChange={(event: any) => setAccountId(event.target.value)} options={[{value:"",label:"Selecionar..."},...activeAccounts.map(item => ({ value: item.id, label: item.name }))]} />
        <FInput label="Data e hora" required type="datetime-local" value={occurredAt} onChange={(event: any) => setOccurredAt(event.target.value)} />
      </div> : <section className="space-y-3 rounded-xl border border-border p-3">
        <p className="text-sm font-bold">Parcelas e formas de pagamento</p>
        <p className="text-xs text-muted-foreground">Cada parcela mantém sua forma prevista. Divida um pagamento se necessário; juros e descontos são rateados proporcionalmente. Cada parte tem sua própria taxa.</p>
        {openInstallments.map(item=><div key={item.id} className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">Parcela {item.installment_number}/{item.total_installments} · {formatCurrency(Number(item.original_amount)-Number(item.settled_amount))}</span>
            <AdminButton variant="tertiary" size="sm" disabled={saving || parts.length>=200} onClick={()=>setParts(current=>[...current,{key:crypto.randomUUID(),installment_id:item.id,principal:"0",...defaultsFor(item)}])}><Plus size={14}/> Dividir</AdminButton></div>
          {parts.map((part,index)=>part.installment_id===item.id && <div key={part.key} className="space-y-2 rounded-lg border border-border p-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <FCurrencyInput label="Valor" value={part.principal} onChange={(event:any)=>patchPart(part.key,{principal:event.target.value})}/>
              <FSelect label="Forma de pagamento" value={part.methodId} required options={[{value:"",label:"Selecionar..."},...activeMethods.map(m=>({value:m.id,label:m.name}))]} onChange={(event:any)=>{const id=event.target.value;patchPart(part.key,{methodId:id,accountId:activeAccounts.find(a=>a.id===activeMethods.find(m=>m.id===id)?.default_financial_account_id)?.id||""});}}/>
              <FSelect label="Conta financeira" value={part.accountId} required options={[{value:"",label:"Selecionar..."},...activeAccounts.map(a=>({value:a.id,label:a.name}))]} onChange={(event:any)=>patchPart(part.key,{accountId:event.target.value})}/>
              <FInput label="Data e hora" type="datetime-local" value={part.occurredAt} onChange={(event:any)=>patchPart(part.key,{occurredAt:event.target.value})}/>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Taxa: {formatCurrency(settlementParts[index].fee)} · Líquido: {formatCurrency(settlementNetAmount(settlementParts[index].gross,settlementParts[index].fee))}</span>
              {parts.filter(p=>p.installment_id===item.id).length>1 && <AdminIconButton ariaLabel="Remover divisão" onClick={()=>setParts(current=>current.filter(p=>p.key!==part.key))}><Trash2 size={14}/></AdminIconButton>}</div>
          </div>)}
        </div>)}
        {(fieldErrors.method || fieldErrors.account) && <p role="alert" className="text-xs text-destructive">{fieldErrors.method || fieldErrors.account}</p>}
      </section>}
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