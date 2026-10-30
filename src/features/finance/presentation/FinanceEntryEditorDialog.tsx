import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { buildMonthlyInstallments } from "../domain/finance-entry.mjs";
import type {
  FinancialAllocationDraft,
  FinancialCategory,
  FinancialEntryDetail,
  FinancialEntryDraft,
  FinancialEntryType,
  FinancialRecurringFrequency,
  FinancialInstallmentDraft,
  FinancialPaymentMethod,
} from "../domain/finance.types";
import type { FinancialCounterparty } from "../infrastructure/finance-entries.repository";
import { AdminFieldLabel, FCurrencyInput, FInput, FSelect, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { formatCurrency } from "@/shared/domain/formatters";
import { formatFinancialDocument, maskFinancialDocumentInput } from "./financeDisplay";
import { FinanceQuickSupplierDialog } from "./FinanceQuickSupplierDialog";
import { FinanceModalDropdown } from "./FinanceModalDropdown";
import { useFinanceRecurring } from "../application/useFinanceRecurring";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function FinanceEntryEditorDialog({
  open,
  entryType,
  initial,
  counterparties,
  counterpartySearch,
  counterpartyLoading,
  onCounterpartySearchChange,
  categories,
  paymentMethods,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  entryType: FinancialEntryType;
  initial?: FinancialEntryDetail | null;
  counterparties: FinancialCounterparty[];
  counterpartySearch: string;
  counterpartyLoading: boolean;
  onCounterpartySearchChange: (value: string) => void;
  categories: FinancialCategory[];
  paymentMethods: FinancialPaymentMethod[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: FinancialEntryDraft) => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const recurring = useFinanceRecurring(false);
  const [accountType, setAccountType] = useState<"single" | "recurring">("single");
  const [frequency, setFrequency] = useState<FinancialRecurringFrequency>("monthly");
  const [interval, setIntervalValue] = useState(1);
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [counterpartDropdownOpen, setCounterpartDropdownOpen] = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const counterpartyContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!counterpartDropdownOpen) return;
    const onOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!counterpartyContainerRef.current?.contains(target) && !target.closest('[data-finance-combobox-popup="true"]')) setCounterpartDropdownOpen(false);
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [counterpartDropdownOpen]);
  const [issueDate, setIssueDate] = useState(today());
  const [competenceDate, setCompetenceDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [selectedCounterpartSnapshot, setSelectedCounterpartSnapshot] = useState<FinancialCounterparty | null>(null);
  const [counterpartName, setCounterpartName] = useState("");
  const [counterpartDocument, setCounterpartDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<Array<{payment_method_id:string;amount:string}>>([]);
  const [fieldErrors, setFieldErrors] = useState<{ description?: string; amount?: string; issueDate?: string; competenceDate?: string; installments?: string; allocations?: string; paymentPlan?: string }>({});

  const numericAmount = Number(amount || 0);
  const isRecurring = entryType === "payable" && !initial && accountType === "recurring";
  const busy = saving || recurring.saveMutation.isPending || recurring.generateMutation.isPending;
  const title = entryType === "receivable" ? "Conta a receber" : "Conta a pagar";
  const counterpartLabel = entryType === "receivable" ? "Cliente / pagador" : "Fornecedor / favorecido";
  const selectedCounterpart = useMemo(
    () => counterparties.find(item => item.id === counterpartId) || selectedCounterpartSnapshot,
    [counterparties, counterpartId, selectedCounterpartSnapshot],
  );

  useEffect(() => {
    if (!open) return;
    setAccountType("single");
    setFrequency("monthly");
    setIntervalValue(1);
    setRecurringEndDate("");
    if (initial) {
      setDescription(initial.description);
      setIssueDate(initial.issue_date);
      setCompetenceDate(initial.competence_date);
      setAmount(String(initial.original_amount));
      setCounterpartId(initial.counterpart_entity_id || "");
      setSelectedCounterpartSnapshot(initial.counterpart_entity_id ? {
        id: initial.counterpart_entity_id,
        name: initial.counterpart_name_snapshot || "Cadastro",
        document: initial.counterpart_document_snapshot || null,
        roles: [],
      } : null);
      setCounterpartName(initial.counterpart_name_snapshot || "");
      onCounterpartySearchChange(initial.counterpart_name_snapshot || "");
      setCounterpartDocument(initial.counterpart_document_snapshot || "");
      setNotes(initial.notes || "");
      setInstallmentCount(initial.installments.length || 1);
      setFirstDueDate(initial.installments[0]?.due_date || today());
      setCategoryId(initial.allocations[0]?.category_id || "");
      const storedPlan = Array.isArray(initial.source_details?.payment_plan) ? initial.source_details.payment_plan as Array<{payment_method_id:string;amount:number}> : [];
      setPaymentPlan(storedPlan.map(item => ({payment_method_id:item.payment_method_id,amount:String(item.amount)})));
    } else {
      const date = today();
      setDescription("");
      setIssueDate(date);
      setCompetenceDate(date);
      setAmount("");
      setCounterpartId("");
      setSelectedCounterpartSnapshot(null);
      setCounterpartName("");
      onCounterpartySearchChange("");
      setCounterpartDocument("");
      setNotes("");
      setInstallmentCount(1);
      setFirstDueDate(date);
      setCategoryId("");
      setPaymentPlan([]);
    }
    setFieldErrors({});
  }, [open, initial]);

  useEffect(() => {
    if (!counterpartId || !selectedCounterpart) return;
    setSelectedCounterpartSnapshot(selectedCounterpart);
    setCounterpartName(selectedCounterpart.name);
    setCounterpartDocument(selectedCounterpart.document || "");
  }, [counterpartId, selectedCounterpart]);

  const selectCounterpart = (id: string) => {
    setCounterpartId(id);
    if (!id) {
      setSelectedCounterpartSnapshot(null);
      setCounterpartName("");
      setCounterpartDocument("");
      return;
    }
    const match = counterparties.find(item => item.id === id);
    if (match) setSelectedCounterpartSnapshot(match);
  };

  const save = async () => {
    const sameAmount = Boolean(initial && Math.round(Number(initial.original_amount) * 100) === Math.round(numericAmount * 100));
    const preserveInstallments = Boolean(sameAmount && initial && installmentCount === initial.installments.length && firstDueDate === initial.installments[0]?.due_date);
    const installments: FinancialInstallmentDraft[] = preserveInstallments
      ? initial!.installments.map(item => ({ installment_number: item.installment_number, due_date: item.due_date, amount: Number(item.original_amount) }))
      : firstDueDate && numericAmount > 0
        ? buildMonthlyInstallments(numericAmount, installmentCount, firstDueDate).map(item => ({ installment_number: item.installment_number, due_date: item.due_date, amount: item.amount }))
        : [];
    // Histórico antigo continua intacto quando os dados que definem a categoria não mudam.
    const preserveHistoric = Boolean(sameAmount && initial?.allocations.length && categoryId === initial?.allocations[0]?.category_id);
    const allocations: FinancialAllocationDraft[] = preserveHistoric
      ? initial!.allocations.map(item => ({
          category_id: item.category_id, cost_center_id: item.cost_center_id,
          mode: item.allocation_mode, value: item.allocation_mode === "percentage" ? Number(item.percentage || 0) : Number(item.amount),
          amount: Number(item.amount),
        }))
      : [{ category_id: categoryId, cost_center_id: null, mode: "percentage", value: 100, amount: numericAmount }];
    const nextErrors: typeof fieldErrors = {};
    if (!description.trim()) nextErrors.description = "Informe a descrição.";
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) nextErrors.amount = "Informe um valor maior que zero.";
    if (!issueDate) nextErrors.issueDate = "Informe a data.";
    if (!competenceDate) nextErrors.competenceDate = "Informe a competência.";
    if (!categoryId) nextErrors.allocations = "Selecione uma categoria.";
    if (paymentPlan.length && (paymentPlan.some(item => !item.payment_method_id || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) || Math.round(paymentPlan.reduce((sum,item)=>sum+Number(item.amount),0)*100) !== Math.round(numericAmount*100))) nextErrors.paymentPlan = "Selecione as formas e distribua exatamente o valor total.";
    if (!firstDueDate || (!isRecurring && !installments.length)) nextErrors.installments = "Informe o vencimento.";
    if (isRecurring && recurringEndDate && recurringEndDate < firstDueDate) nextErrors.installments = "O término deve ser igual ou posterior ao primeiro vencimento.";
    if (isRecurring && (!Number.isInteger(interval) || interval < 1)) nextErrors.installments = "Informe um intervalo válido.";
    else if (!isRecurring && Math.round(numericAmount * 100) < installmentCount) nextErrors.installments = "Reduza a quantidade de parcelas para evitar parcelas de valor zero.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      if (isRecurring) {
        const id = await recurring.saveMutation.mutateAsync({
          payload: {
            entry_type: "payable",
            description: description.trim(),
            original_amount: numericAmount,
            counterpart_entity_id: counterpartId || null,
            counterpart_name: (counterpartId ? counterpartName : counterpartySearch).trim() || null,
            counterpart_document: counterpartDocument.replace(/\D/g, "") || null,
            frequency,
            interval_value: frequency === "custom" ? 1 : interval,
            custom_days: frequency === "custom" ? interval : null,
            start_date: firstDueDate,
            next_occurrence_date: firstDueDate,
            end_date: recurringEndDate || null,
            installment_count: 1,
            first_due_offset_days: 0,
            allocations: [{ category_id: categoryId, cost_center_id: null, mode: "percentage", value: 100, amount: numericAmount }],
            notes: notes.trim() || null,
          },
        });
        // Registre a primeira competência mesmo quando ela começa após os 90 dias padrão.
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 90);
        const horizonDate = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
        await recurring.generateMutation.mutateAsync({ id, untilDate: firstDueDate > horizonDate ? firstDueDate : undefined });
        notifyAdmin("Conta recorrente cadastrada com sucesso.", "success");
        onClose();
        return;
      }
      await onSave({
        id: initial?.id || null, entry_type: entryType, description: description.trim(),
        issue_date: issueDate, competence_date: competenceDate, original_amount: numericAmount,
        counterpart_entity_id: counterpartId || null,
        counterpart_name: (counterpartId ? counterpartName : counterpartySearch).trim() || null, counterpart_document: counterpartDocument.trim() || null,
        notes: notes.trim() || null, installments, allocations,
        payment_plan: paymentPlan.map(item => ({payment_method_id:item.payment_method_id,amount:Number(item.amount)})),
      });
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, `Não foi possível salvar a ${title.toLocaleLowerCase("pt-BR")}.`), "error");
    }
  };

  if (!open) return null;
  const visibleCounterparties = [...counterparties];
  if (
    selectedCounterpartSnapshot
    && !visibleCounterparties.some(item => item.id === selectedCounterpartSnapshot.id)
  ) {
    visibleCounterparties.unshift(selectedCounterpartSnapshot);
  }

  const categoryOptions = [
    { value: "", label: "Selecione uma categoria" },
    ...categories.filter(item => item.nature === (entryType === "receivable" ? "revenue" : "expense") && (item.is_active || item.id === categoryId))
      .map(item => ({ value: item.id, label: item.name })),
  ];

  return <><AdminDialog
    open
    onClose={onClose}
    title={initial ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Nova ${title.toLocaleLowerCase("pt-BR")}`}
    description="Preencha os dados principais da conta."
    minimizedDescription={[description.trim(), counterpartName || selectedCounterpart?.name, numericAmount > 0 ? formatCurrency(numericAmount) : null].filter(Boolean).join(" · ") || "Lançamento em preenchimento"}
    minimizable={!busy}
    className="max-w-3xl"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AdminButton variant="secondary" onClick={onClose} disabled={busy}>Cancelar</AdminButton>
      <AdminButton onClick={save} loading={busy} loadingText="Salvando...">Salvar</AdminButton>
    </div>}
  >
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {entryType === "payable" && !initial && hasPermission("finance.recurring.manage") && <div className="sm:col-span-2"><FSelect label="Tipo de conta a pagar" value={accountType} options={[{ value: "single", label: "Conta avulsa" }, { value: "recurring", label: "Recorrente (assinatura, mensalidade ou contrato)" }]} onChange={(event: any) => setAccountType(event.target.value)} /></div>}
        <div className="sm:col-span-2"><FInput label={entryType === "payable" ? "Origem" : "Descrição"} required error={fieldErrors.description} value={description} onChange={(event: any) => { setFieldErrors(current => ({ ...current, description: undefined })); setDescription(event.target.value); }} placeholder={entryType === "receivable" ? "Ex.: Serviço de manutenção" : "Ex.: Aluguel, compra de material ou assinatura"} /></div>
        <FCurrencyInput label="Valor" required error={fieldErrors.amount} value={amount} onChange={(event: any) => { setFieldErrors(current => ({ ...current, amount: undefined })); setAmount(event.target.value); }} />
        <FSelect label="Categoria" required value={categoryId} options={categoryOptions} error={fieldErrors.allocations} onChange={(event: any) => { setCategoryId(event.target.value); setFieldErrors(current => ({ ...current, allocations: undefined })); }} />
        <FInput label={isRecurring ? "Primeiro vencimento" : "Vencimento"} required error={fieldErrors.installments} type="date" value={firstDueDate} onChange={(event: any) => setFirstDueDate(event.target.value)} />
        {!isRecurring && <FInput label="Número de parcelas" type="number" min="1" max="60" value={installmentCount} onChange={(event: any) => setInstallmentCount(Math.min(60, Math.max(1, Number(event.target.value || 1))))} />}
      </div>
      {isRecurring && <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <FSelect label="Periodicidade" value={frequency} options={[
          { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensal" },
          { value: "yearly", label: "Anual" }, { value: "custom", label: "Personalizada" },
        ]} onChange={(event: any) => setFrequency(event.target.value as FinancialRecurringFrequency)} />
        <FInput label={frequency === "custom" ? "A cada quantos dias" : "Intervalo entre ocorrências"} type="number" min="1"
          value={interval} onChange={(event: any) => setIntervalValue(Math.min(frequency === "custom" ? 3650 : 120, Math.max(1, Math.floor(Number(event.target.value) || 1))))} />
        <FInput label="Término (opcional)" type="date" value={recurringEndDate} onChange={(event: any) => setRecurringEndDate(event.target.value)} />
        <p className="self-center text-xs text-muted-foreground">Sem data de término, a recorrência continua ativa até ser desativada.</p>
      </div>}
      {!isRecurring && installmentCount > 1 && <p className="text-xs text-muted-foreground">As {installmentCount} parcelas serão distribuídas em vencimentos mensais automaticamente.</p>}

      <div className="border-t border-border pt-4">
        <div className="flex items-end gap-2">
          <div ref={counterpartyContainerRef} className="relative min-w-0 flex-1">
            <AdminFieldLabel label={counterpartLabel + " (opcional)"} />
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className={INPUT + " w-full pl-9 pr-9"} role="combobox" aria-autocomplete="list"
                aria-expanded={counterpartDropdownOpen} aria-controls="finance-counterparty-options"
                placeholder="Busque pelo nome ou CPF/CNPJ"
                value={counterpartId ? selectedCounterpart?.name || counterpartName : counterpartySearch}
                onFocus={() => setCounterpartDropdownOpen(true)}
                onChange={event => { if (counterpartId) selectCounterpart(""); onCounterpartySearchChange(event.target.value); setCounterpartDropdownOpen(true); }}
                onKeyDown={event => { if (event.key === "Escape") setCounterpartDropdownOpen(false); }} />
              <button type="button" aria-label="Mostrar cadastros" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => setCounterpartDropdownOpen(current => !current)}><ChevronDown size={16} /></button>
            </div>
            <FinanceModalDropdown open={counterpartDropdownOpen} anchorRef={counterpartyContainerRef} id="finance-counterparty-options">
              <button type="button" role="option" aria-selected={!counterpartId}
                className="flex h-[48px] w-full items-center rounded-md px-3 text-left text-xs hover:bg-muted"
                onClick={() => { selectCounterpart(""); onCounterpartySearchChange(""); setCounterpartDropdownOpen(false); }}>
                Sem vínculo
              </button>
              {visibleCounterparties.map(item => <button type="button" role="option" aria-selected={counterpartId === item.id} key={item.id}
                className="flex h-[48px] w-full flex-col justify-center overflow-hidden rounded-md px-3 text-left text-sm hover:bg-muted"
                onClick={() => { selectCounterpart(item.id); onCounterpartySearchChange(item.name); setCounterpartDropdownOpen(false); }}>
                <span className="w-full truncate font-semibold">{item.name}</span>
                {item.document && <span className="block text-xs text-muted-foreground">{formatFinancialDocument(item.document)}</span>}
              </button>)}
              {counterpartyLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando cadastros...</p>}
              {!counterpartyLoading && visibleCounterparties.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum cadastro encontrado. Você pode informar um nome sem vínculo.</p>}
            </FinanceModalDropdown>
          </div>
          {entryType === "payable" && hasPermission("customers.create") && <AdminButton variant="secondary" onClick={() => { setCounterpartDropdownOpen(false); setQuickSupplierOpen(true); }}>
            <Plus size={16} /> Cadastrar
          </AdminButton>}
        </div>
      </div>
      {entryType === "receivable" && <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Formas de Pagamentos</h3>
          <AdminButton variant="tertiary" className="h-[42px] shrink-0" onClick={() => setPaymentPlan(current => [...current,{payment_method_id:"",amount:""}])} disabled={paymentPlan.length >= 10}><Plus size={16} /> Adicionar forma</AdminButton>
        </div>
        {paymentPlan.map((item,index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_180px_42px]">
          <FSelect label={`Forma ${index+1}`} options={[{value:"",label:"Selecione"},...paymentMethods.filter(method => method.is_active || method.id === item.payment_method_id).map(method=>({value:method.id,label:method.name}))]} value={item.payment_method_id} onChange={(event:any)=>setPaymentPlan(current=>current.map((p,i)=>i===index?{...p,payment_method_id:event.target.value}:p))} />
          <FCurrencyInput label="Valor" value={item.amount} onChange={(event:any)=>setPaymentPlan(current=>current.map((p,i)=>i===index?{...p,amount:event.target.value}:p))} />
          <button type="button" aria-label={`Remover forma de pagamento ${index + 1}`} title="Remover forma" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-red-500/25 text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400" onClick={() => setPaymentPlan(current => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
        </div>)}
        {fieldErrors.paymentPlan && <p className="text-xs font-semibold text-red-600">{fieldErrors.paymentPlan}</p>}
      </div>}
      <details className="rounded-lg border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Outras informações (opcional)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FInput label="Data de emissão" required error={fieldErrors.issueDate} type="date" value={issueDate} onChange={(event: any) => { setIssueDate(event.target.value); if (!initial) setCompetenceDate(event.target.value); }} />
          <FInput label="Competência" required error={fieldErrors.competenceDate} type="date" value={competenceDate} onChange={(event: any) => setCompetenceDate(event.target.value)} />
          <div className="sm:col-span-2"><FInput label="CPF/CNPJ" inputMode="numeric" value={maskFinancialDocumentInput(counterpartDocument)} disabled={Boolean(counterpartId)} onChange={(event: any) => setCounterpartDocument(maskFinancialDocumentInput(event.target.value))} placeholder="000.000.000-00" /></div>
          <div className="sm:col-span-2"><FTextarea label="Observações" value={notes} onChange={(event: any) => setNotes(event.target.value)} /></div>
        </div>
      </details>
    </div>
  </AdminDialog>
  {quickSupplierOpen && <FinanceQuickSupplierDialog
    onClose={() => setQuickSupplierOpen(false)}
    onSaved={supplier => {
      setSelectedCounterpartSnapshot(supplier);
      setCounterpartId(supplier.id);
      setCounterpartName(supplier.name);
      setCounterpartDocument(supplier.document || "");
      onCounterpartySearchChange(supplier.name);
      setQuickSupplierOpen(false);
      setCounterpartDropdownOpen(false);
    }}
  />}
  </>;
}
