import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useState } from "react";
import { buildMonthlyInstallments } from "../domain/finance-entry.mjs";
import type {
  FinancialAllocationDraft,
  FinancialCategory,
  FinancialEntryDetail,
  FinancialEntryDraft,
  FinancialEntryType,
  FinancialInstallmentDraft,
  FinancialPaymentMethod,
} from "../domain/finance.types";
import type { FinancialCounterparty } from "../infrastructure/finance-entries.repository";
import { FCurrencyInput, FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { formatCurrency } from "@/shared/domain/formatters";
import { formatFinancialDocument, maskFinancialDocumentInput } from "./financeDisplay";

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
  const [description, setDescription] = useState("");
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
  const title = entryType === "receivable" ? "Conta a receber" : "Conta a pagar";
  const counterpartLabel = entryType === "receivable" ? "Cliente / pagador" : "Fornecedor / favorecido";
  const selectedCounterpart = useMemo(
    () => counterparties.find(item => item.id === counterpartId) || selectedCounterpartSnapshot,
    [counterparties, counterpartId, selectedCounterpartSnapshot],
  );

  useEffect(() => {
    if (!open) return;
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
    if (!firstDueDate || !installments.length) nextErrors.installments = "Informe o vencimento.";
    else if (Math.round(numericAmount * 100) < installmentCount) nextErrors.installments = "Reduza a quantidade de parcelas para evitar parcelas de valor zero.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      await onSave({
        id: initial?.id || null, entry_type: entryType, description: description.trim(),
        issue_date: issueDate, competence_date: competenceDate, original_amount: numericAmount,
        counterpart_entity_id: counterpartId || null,
        counterpart_name: counterpartName.trim() || null, counterpart_document: counterpartDocument.trim() || null,
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
  const counterpartOptions = [
    { value: "", label: "Sem vínculo / informar manualmente" },
    ...visibleCounterparties.map(item => ({
      value: item.id,
      label: item.document ? `${item.name} · ${formatFinancialDocument(item.document)}` : item.name,
    })),
  ];

  const categoryOptions = [
    { value: "", label: "Selecione uma categoria" },
    ...categories.filter(item => item.nature === (entryType === "receivable" ? "revenue" : "expense") && (item.is_active || item.id === categoryId))
      .map(item => ({ value: item.id, label: item.name })),
  ];

  return <AdminDialog
    open
    onClose={onClose}
    title={initial ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Nova ${title.toLocaleLowerCase("pt-BR")}`}
    description="Preencha os dados principais da conta."
    minimizedDescription={[description.trim(), counterpartName || selectedCounterpart?.name, numericAmount > 0 ? formatCurrency(numericAmount) : null].filter(Boolean).join(" · ") || "Lançamento em preenchimento"}
    minimizable={!saving}
    className="max-w-3xl"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton>
      <AdminButton onClick={save} loading={saving} loadingText="Salvando...">Salvar</AdminButton>
    </div>}
  >
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FInput label="Descrição" required error={fieldErrors.description} value={description} onChange={(event: any) => { setFieldErrors(current => ({ ...current, description: undefined })); setDescription(event.target.value); }} placeholder={entryType === "receivable" ? "Ex.: Serviço de manutenção" : "Ex.: Compra de material"} /></div>
        <FCurrencyInput label="Valor" required error={fieldErrors.amount} value={amount} onChange={(event: any) => { setFieldErrors(current => ({ ...current, amount: undefined })); setAmount(event.target.value); }} />
        <FSelect label="Categoria" required value={categoryId} options={categoryOptions} error={fieldErrors.allocations} onChange={(event: any) => { setCategoryId(event.target.value); setFieldErrors(current => ({ ...current, allocations: undefined })); }} />
        <FInput label="Vencimento" required error={fieldErrors.installments} type="date" value={firstDueDate} onChange={(event: any) => setFirstDueDate(event.target.value)} />
        <FInput label="Número de parcelas" type="number" min="1" max="60" value={installmentCount} onChange={(event: any) => setInstallmentCount(Math.min(60, Math.max(1, Number(event.target.value || 1))))} />
      </div>
      {installmentCount > 1 && <p className="text-xs text-muted-foreground">As {installmentCount} parcelas serão distribuídas em vencimentos mensais automaticamente.</p>}
      {entryType === "receivable" && <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-foreground">Formas de pagamento previstas</h3><p className="text-xs text-muted-foreground">Você pode dividir o valor entre PIX, cartão, dinheiro e outras formas. A baixa será registrada depois.</p></div>
          <AdminButton size="sm" variant="secondary" onClick={() => setPaymentPlan(current => [...current,{payment_method_id:"",amount:""}])} disabled={paymentPlan.length >= 10}>Adicionar forma</AdminButton>
        </div>
        {paymentPlan.map((item,index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <FSelect label={`Forma ${index+1}`} options={[{value:"",label:"Selecione"},...paymentMethods.filter(method => method.is_active || method.id === item.payment_method_id).map(method=>({value:method.id,label:method.name}))]} value={item.payment_method_id} onChange={(event:any)=>setPaymentPlan(current=>current.map((p,i)=>i===index?{...p,payment_method_id:event.target.value}:p))} />
          <FCurrencyInput label="Valor previsto" value={item.amount} onChange={(event:any)=>setPaymentPlan(current=>current.map((p,i)=>i===index?{...p,amount:event.target.value}:p))} />
          <AdminButton variant="secondary" size="sm" onClick={()=>setPaymentPlan(current=>current.filter((_,i)=>i!==index))}>Remover</AdminButton>
        </div>)}
        {fieldErrors.paymentPlan && <p className="text-xs font-semibold text-red-600">{fieldErrors.paymentPlan}</p>}
      </div>}
      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{counterpartLabel} <span className="font-normal text-muted-foreground">(opcional)</span></h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FInput label="Buscar cliente ou fornecedor" value={counterpartySearch} onChange={(event: any) => onCounterpartySearchChange(event.target.value)} placeholder="Nome ou CPF/CNPJ" />
          <FSelect label={counterpartyLoading ? "Buscando cadastros..." : "Cadastro"} value={counterpartId} options={counterpartOptions} onChange={(event: any) => selectCounterpart(event.target.value)} />
          {!counterpartId && <div className="sm:col-span-2"><FInput label="Nome (sem cadastro)" value={counterpartName} onChange={(event: any) => setCounterpartName(event.target.value)} /></div>}
        </div>
      </div>
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
  </AdminDialog>;
}
