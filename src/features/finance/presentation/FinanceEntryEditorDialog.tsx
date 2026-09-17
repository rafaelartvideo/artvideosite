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
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
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
  const [counterpartName, setCounterpartName] = useState("");
  const [counterpartDocument, setCounterpartDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(today());
  const [installments, setInstallments] = useState<FinancialInstallmentDraft[]>([]);
  const [allocations, setAllocations] = useState<FinancialAllocationDraft[]>([]);
  const [message, setMessage] = useState("");

  const numericAmount = Number(amount || 0);
  const title = entryType === "receivable" ? "Conta a receber" : "Conta a pagar";
  const counterpartLabel = entryType === "receivable" ? "Cliente / pagador" : "Fornecedor / favorecido";
  const selectedCounterpart = useMemo(() => counterparties.find(item => item.id === counterpartId) || null, [counterparties, counterpartId]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDescription(initial.description);
      setIssueDate(initial.issue_date);
      setCompetenceDate(initial.competence_date);
      setAmount(String(initial.original_amount));
      setCounterpartId(initial.counterpart_entity_id || "");
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
      setCounterpartName("");
      setCounterpartDocument("");
      setNotes("");
      setInstallmentCount(1);
      setFirstDueDate(date);
      setInstallments([]);
      setAllocations([{ category_id: "", cost_center_id: null, mode: "percentage", value: 100, amount: 0 }]);
    }
    setMessage("");
  }, [open, initial]);

  useEffect(() => {
    if (!counterpartId || !selectedCounterpart) return;
    setCounterpartName(selectedCounterpart.name);
    setCounterpartDocument(selectedCounterpart.document || "");
  }, [counterpartId, selectedCounterpart]);

  const generateInstallments = () => {
    if (numericAmount <= 0) { setMessage("Informe o valor antes de gerar as parcelas."); return; }
    setInstallments(buildMonthlyInstallments(numericAmount, installmentCount, firstDueDate).map((item: any) => ({ installment_number: item.installment_number, due_date: item.due_date, amount: item.amount })));
    setMessage("");
  };

  const save = async () => {
    const allocationValidation = validateAllocationTotal(numericAmount, allocations);
    const installmentTotal = Math.round(installments.reduce((sum, item) => sum + Number(item.amount || 0), 0) * 100) / 100;
    if (!description.trim()) { setMessage("Informe a descrição do lançamento."); return; }
    if (numericAmount <= 0) { setMessage("Informe um valor maior que zero."); return; }
    if (!issueDate || !competenceDate) { setMessage("Informe as datas de emissão e competência."); return; }
    if (!installments.length) { setMessage("Gere ao menos uma parcela."); return; }
    if (Math.round(installmentTotal * 100) !== Math.round(numericAmount * 100)) { setMessage("A soma das parcelas deve ser igual ao valor do lançamento."); return; }
    if (allocations.some(item => !item.category_id || item.amount <= 0)) { setMessage("Preencha todos os rateios com categoria e valor."); return; }
    if (!allocationValidation.ok) { setMessage("O rateio deve fechar exatamente o valor do lançamento."); return; }
    try {
      setMessage("");
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
      setMessage(error instanceof Error ? error.message : `Não foi possível salvar a ${title.toLocaleLowerCase("pt-BR")}.`);
    }
  };

  if (!open) return null;
  const counterpartOptions = [{ value: "", label: "Sem vínculo / informar manualmente" }, ...counterparties.map(item => ({ value: item.id, label: item.document ? `${item.name} · ${item.document}` : item.name }))];

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#07111f]/65 p-2 sm:p-4" role="dialog" aria-modal="true">
    <div className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-4 sm:px-5"><div><h2 className="text-lg font-black text-[#0d1b2e]">{initial ? `Editar ${title.toLocaleLowerCase("pt-BR")}` : `Nova ${title.toLocaleLowerCase("pt-BR")}`}</h2><p className="text-xs text-[#5a6a82]">O lançamento será enviado para aprovação financeira.</p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div>

      <div className="space-y-6 p-4 sm:p-5">
        <section className="space-y-3"><h3 className="text-sm font-black text-[#0d1b2e]">Informações</h3><div className="grid gap-4 sm:grid-cols-2"><FInput label="Descrição" required value={description} onChange={(event: any) => setDescription(event.target.value)} placeholder={entryType === "receivable" ? "Ex.: Venda avulsa" : "Ex.: Compra de material"} /><FInput label="Valor" required type="number" min="0.01" step="0.01" value={amount} onChange={(event: any) => setAmount(event.target.value)} placeholder="0,00" /><FInput label="Data de emissão" required type="date" value={issueDate} onChange={(event: any) => setIssueDate(event.target.value)} /><FInput label="Competência" required type="date" value={competenceDate} onChange={(event: any) => setCompetenceDate(event.target.value)} /></div><FTextarea label="Observações" value={notes} onChange={(event: any) => setNotes(event.target.value)} /></section>

        <section className="space-y-3"><h3 className="text-sm font-black text-[#0d1b2e]">{counterpartLabel}</h3><FSelect label="Cadastro vinculado" value={counterpartId} options={counterpartOptions} onChange={(event: any) => setCounterpartId(event.target.value)} /><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome no lançamento" value={counterpartName} disabled={Boolean(counterpartId)} onChange={(event: any) => setCounterpartName(event.target.value)} /><FInput label="CPF/CNPJ" value={counterpartDocument} disabled={Boolean(counterpartId)} onChange={(event: any) => setCounterpartDocument(event.target.value)} /></div></section>

        <section className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-black text-[#0d1b2e]">Parcelas</h3><p className="text-xs text-[#5a6a82]">Gere automaticamente e ajuste vencimentos/valores quando necessário.</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><FInput label="Quantidade" type="number" min="1" max="60" value={installmentCount} onChange={(event: any) => setInstallmentCount(Math.min(60, Math.max(1, Number(event.target.value || 1))))} /><FInput label="1º vencimento" type="date" value={firstDueDate} onChange={(event: any) => setFirstDueDate(event.target.value)} /><AdminButton variant="secondary" className="col-span-2 self-end" onClick={generateInstallments}><CalendarRange size={15} /> Gerar parcelas</AdminButton></div></div>
          {installments.length > 0 && <div className="grid gap-2">{installments.map((item, index) => <div key={index} className="grid grid-cols-[64px_1fr_1fr] items-end gap-2 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3"><div><p className="mb-1.5 text-[10px] font-bold uppercase text-[#5a6a82]">Parcela</p><p className="py-2.5 text-sm font-black">{item.installment_number}/{installments.length}</p></div><FInput label="Vencimento" type="date" value={item.due_date} onChange={(event: any) => setInstallments(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, due_date: event.target.value } : row))} /><FInput label="Valor" type="number" min="0.01" step="0.01" value={item.amount} onChange={(event: any) => setInstallments(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: Number(event.target.value || 0) } : row))} /></div>)}</div>}
          {installments.length > 0 && <p className="text-right text-xs font-bold text-[#5a6a82]">Total das parcelas: {formatCurrency(installments.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>}
        </section>

        <FinanceAllocationEditor entryType={entryType} total={numericAmount} categories={categories} costCenters={costCenters} value={allocations} onChange={setAllocations} />
        {message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message}</div>}
      </div>

      <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-5"><AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton><AdminButton onClick={save} loading={saving} loadingText="Salvando...">Salvar lançamento</AdminButton></div>
    </div>
  </div>;
}
