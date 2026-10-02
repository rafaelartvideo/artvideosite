import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { buildMonthlyInstallments, validateAllocationTotal } from "../domain/finance-entry.mjs";
import type {
  FinancialAllocationDraft,
  FinancialCategory,
  FinancialCostCenter,
  FinancialEntryDetail,
  FinancialEntryDraft,
  FinancialEntryType,
  FinancialInstallmentDraft,
} from "../domain/finance.types";
import type { FinancialCounterparty } from "../infrastructure/finance-entries.repository";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminStickyToolbar } from "@/shared/ui/admin/AdminLayout";
import { formatCurrency } from "@/shared/domain/formatters";
import { FinanceAllocationEditor } from "./FinanceAllocationEditor";

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
  costCenters,
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
  costCenters: FinancialCostCenter[];
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
  const [installments, setInstallments] = useState<FinancialInstallmentDraft[]>([]);
  const [allocations, setAllocations] = useState<FinancialAllocationDraft[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{ description?: string; amount?: string; issueDate?: string; competenceDate?: string; installments?: string; allocations?: string }>({});

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
      setInstallments(initial.installments.map(item => ({ installment_number: item.installment_number, due_date: item.due_date, amount: Number(item.original_amount) })));
      setAllocations(initial.allocations.map(item => ({
        category_id: item.category_id,
        cost_center_id: item.cost_center_id,
        mode: item.allocation_mode,
        value: item.allocation_mode === "percentage" ? Number(item.percentage || 0) : Number(item.amount),
        amount: Number(item.amount),
      })));
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
      setInstallments([]);
      setAllocations([{ category_id: "", cost_center_id: null, mode: "percentage", value: 100, amount: 0 }]);
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

  const generateInstallments = () => {
    if (numericAmount <= 0) { setFieldErrors(current => ({ ...current, amount: "Informe o valor antes de gerar as parcelas." })); return; }
    setInstallments(buildMonthlyInstallments(numericAmount, installmentCount, firstDueDate).map((item: any) => ({ installment_number: item.installment_number, due_date: item.due_date, amount: item.amount })));
    setFieldErrors({});
  };

  const save = async () => {
    const allocationValidation = validateAllocationTotal(numericAmount, allocations);
    const installmentTotal = Math.round(installments.reduce((sum, item) => sum + Number(item.amount || 0), 0) * 100) / 100;
    const nextErrors: typeof fieldErrors = {};
    if (!description.trim()) nextErrors.description = "Informe a descrição do lançamento.";
    if (numericAmount <= 0) nextErrors.amount = "Informe um valor maior que zero.";
    if (!issueDate) nextErrors.issueDate = "Informe a data de emissão.";
    if (!competenceDate) nextErrors.competenceDate = "Informe a competência.";
    if (!installments.length) nextErrors.installments = "Gere ao menos uma parcela.";
    else if (Math.round(installmentTotal * 100) !== Math.round(numericAmount * 100)) nextErrors.installments = "A soma das parcelas deve ser igual ao valor do lançamento.";
    if (allocations.some(item => !item.category_id || item.amount <= 0)) nextErrors.allocations = "Preencha todos os rateios com categoria e valor.";
    else if (!allocationValidation.ok) nextErrors.allocations = "O rateio deve fechar exatamente o valor do lançamento.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      setFieldErrors({});
      await onSave({
        id: initial?.id || null,
        entry_type: entryType,
        description: description.trim(),
        issue_date: issueDate,
        competence_date: competenceDate,
        original_amount: numericAmount,
        counterpart_entity_id: counterpartId || null,
        counterpart_name: counterpartName || null,
        counterpart_document: counterpartDocument || null,
        notes: notes || null,
        installments,
        allocations,
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
      label: item.document ? `${item.name} · ${item.document}` : item.name,
    })),
  ];

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#07111f]/65 p-2 sm:p-4" role="dialog" aria-modal="true">
    <div className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-4 sm:px-5"><div><h2 className="text-lg font-black text-[#0d1b2e]">{initial ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Nova ${title.toLocaleLowerCase("pt-BR")}`}</h2><p className="text-xs text-[#5a6a82]">O lançamento será enviado para aprovação financeira.</p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div>

      <div className="space-y-6 p-4 sm:p-5">
        <section className="space-y-3"><h3 className="text-sm font-black text-[#0d1b2e]">Informações</h3><div className="grid gap-4 sm:grid-cols-2"><FInput label="Descrição" required error={fieldErrors.description} value={description} onChange={(event: any) => { setFieldErrors(current => ({ ...current, description: undefined })); setDescription(event.target.value); }} placeholder={entryType === "receivable" ? "Ex.: Venda avulsa" : "Ex.: Compra de material"} /><FInput label="Valor" required error={fieldErrors.amount} type="number" min="0.01" step="0.01" value={amount} onChange={(event: any) => { setFieldErrors(current => ({ ...current, amount: undefined })); setAmount(event.target.value); }} placeholder="0,00" /><FInput label="Data de emissão" required error={fieldErrors.issueDate} type="date" value={issueDate} onChange={(event: any) => { setFieldErrors(current => ({ ...current, issueDate: undefined })); setIssueDate(event.target.value); }} /><FInput label="Competência" required error={fieldErrors.competenceDate} type="date" value={competenceDate} onChange={(event: any) => { setFieldErrors(current => ({ ...current, competenceDate: undefined })); setCompetenceDate(event.target.value); }} /></div><FTextarea label="Observações" value={notes} onChange={(event: any) => setNotes(event.target.value)} /></section>

        <section className="space-y-3"><h3 className="text-sm font-black text-[#0d1b2e]">{counterpartLabel}</h3><div className="grid gap-3 sm:grid-cols-2"><FInput label="Buscar cadastro" value={counterpartySearch} onChange={(event: any) => onCounterpartySearchChange(event.target.value)} placeholder="Nome, razão social, CPF ou CNPJ" /><FSelect label={counterpartyLoading ? "Cadastro vinculado · buscando..." : "Cadastro vinculado"} value={counterpartId} options={counterpartOptions} onChange={(event: any) => selectCounterpart(event.target.value)} /></div><p className="text-[10px] text-[#8a98aa]">Exibindo até 25 resultados. Digite para localizar outros cadastros sem carregar a base inteira.</p><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome no lançamento" value={counterpartName} disabled={Boolean(counterpartId)} onChange={(event: any) => setCounterpartName(event.target.value)} /><FInput label="CPF/CNPJ" value={counterpartDocument} disabled={Boolean(counterpartId)} onChange={(event: any) => setCounterpartDocument(event.target.value)} /></div></section>

        <section className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-black text-[#0d1b2e]">Parcelas</h3><p className="text-xs text-[#5a6a82]">Gere automaticamente e ajuste vencimentos/valores quando necessário.</p></div>{fieldErrors.installments && <p className="text-[10px] font-semibold text-red-600">{fieldErrors.installments}</p>}<div className="grid grid-cols-2 gap-2 sm:flex"><FInput label="Quantidade" type="number" min="1" max="60" value={installmentCount} onChange={(event: any) => setInstallmentCount(Math.min(60, Math.max(1, Number(event.target.value || 1))))} /><FInput label="1º vencimento" type="date" value={firstDueDate} onChange={(event: any) => setFirstDueDate(event.target.value)} /><AdminButton variant="secondary" className="col-span-2 self-end" onClick={generateInstallments}><CalendarRange size={15} /> Gerar parcelas</AdminButton></div></div>
          {installments.length > 0 && <div className="grid gap-2">{installments.map((item, index) => <div key={index} className="grid grid-cols-[64px_1fr_1fr] items-end gap-2 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3"><div><p className="mb-1.5 text-[10px] font-bold uppercase text-[#5a6a82]">Parcela</p><p className="py-2.5 text-sm font-black">{item.installment_number}/{installments.length}</p></div><FInput label="Vencimento" type="date" value={item.due_date} onChange={(event: any) => setInstallments(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, due_date: event.target.value } : row))} /><FInput label="Valor" type="number" min="0.01" step="0.01" value={item.amount} onChange={(event: any) => setInstallments(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: Number(event.target.value || 0) } : row))} /></div>)}</div>}
          {installments.length > 0 && <p className="text-right text-xs font-bold text-[#5a6a82]">Total das parcelas: {formatCurrency(installments.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>}
        </section>

        <FinanceAllocationEditor entryType={entryType} total={numericAmount} categories={categories} costCenters={costCenters} value={allocations} onChange={setAllocations} />{fieldErrors.allocations && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.allocations}</p>}
        
      </div>

      <AdminStickyToolbar className="flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton><AdminButton onClick={save} loading={saving} loadingText="Salvando...">Salvar lançamento</AdminButton></AdminStickyToolbar>
    </div>
  </div>;
}
