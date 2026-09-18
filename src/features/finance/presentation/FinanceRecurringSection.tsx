import { useMemo, useState } from "react";
import { CalendarClock, Pause, Pencil, Play, Plus, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FCurrencyInput, FInput, FIntegerInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { validateAllocationTotal } from "../domain/finance-entry.mjs";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceRecurring } from "../application/useFinanceRecurring";
import type {
  FinancialAllocationDraft,
  FinancialEntryType,
  FinancialRecurringFrequency,
  FinancialRecurringRule,
} from "../domain/finance.types";
import { FinanceAllocationEditor } from "./FinanceAllocationEditor";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function frequencyLabel(rule: FinancialRecurringRule) {
  if (rule.frequency === "weekly") return rule.interval_value === 1 ? "Semanal" : `A cada ${rule.interval_value} semanas`;
  if (rule.frequency === "monthly") return rule.interval_value === 1 ? "Mensal" : `A cada ${rule.interval_value} meses`;
  if (rule.frequency === "yearly") return rule.interval_value === 1 ? "Anual" : `A cada ${rule.interval_value} anos`;
  return `A cada ${rule.custom_days || 1} dias`;
}

const emptyAllocations = (): FinancialAllocationDraft[] => [{
  category_id: "",
  cost_center_id: null,
  mode: "percentage",
  value: 100,
  amount: 0,
}];

const emptyForm = () => ({
  id: null as string | null,
  entry_type: "payable" as FinancialEntryType,
  description: "",
  original_amount: "",
  counterpart_name: "",
  counterpart_document: "",
  frequency: "monthly" as FinancialRecurringFrequency,
  interval_value: "1",
  custom_days: "30",
  start_date: today(),
  end_date: "",
  next_occurrence_date: today(),
  installment_count: "1",
  first_due_offset_days: "0",
  notes: "",
  allocations: emptyAllocations(),
});

export function FinanceRecurringSection() {
  const { hasPermission } = useAuth();
  const recurring = useFinanceRecurring();
  const foundation = useFinanceFoundation();
  const canView = hasPermission("finance.recurring.view") || hasPermission("finance.recurring.manage");
  const canManage = hasPermission("finance.recurring.manage");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const rules = recurring.rulesQuery.data || [];
  const categories = foundation.categoriesQuery.data || [];
  const costCenters = foundation.costCentersQuery.data || [];
  const amount = Number(form.original_amount || 0);
  const allocationValidation = useMemo(() => validateAllocationTotal(amount, form.allocations), [amount, form.allocations]);
  const pending = recurring.saveMutation.isPending || recurring.activeMutation.isPending || recurring.generateMutation.isPending;

  if (!canView) return <AdminCard className="p-6"><p className="text-sm text-[#5a6a82]">Você não possui permissão para visualizar recorrências.</p></AdminCard>;

  const openNew = () => {
    setForm(emptyForm());
    setMessage("");
    setSuccess("");
    setOpen(true);
  };

  const edit = (rule: FinancialRecurringRule) => {
    setForm({
      id: rule.id,
      entry_type: rule.entry_type,
      description: rule.description,
      original_amount: Number(rule.original_amount).toFixed(2),
      counterpart_name: rule.counterpart_name_snapshot || "",
      counterpart_document: rule.counterpart_document_snapshot || "",
      frequency: rule.frequency,
      interval_value: String(rule.interval_value),
      custom_days: String(rule.custom_days || 30),
      start_date: rule.start_date,
      end_date: rule.end_date || "",
      next_occurrence_date: rule.next_occurrence_date,
      installment_count: String(rule.installment_count),
      first_due_offset_days: String(rule.first_due_offset_days),
      notes: rule.notes || "",
      allocations: Array.isArray(rule.allocations) && rule.allocations.length
        ? rule.allocations.map(item => ({ ...item }))
        : emptyAllocations(),
    });
    setMessage("");
    setSuccess("");
    setOpen(true);
  };

  const close = () => {
    if (pending) return;
    setOpen(false);
    setForm(emptyForm());
    setMessage("");
  };

  const save = async () => {
    const numericAmount = Number(form.original_amount || 0);
    if (!form.description.trim()) { setMessage("Informe a descrição da recorrência."); return; }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setMessage("Informe um valor maior que zero."); return; }
    if (!allocationValidation.ok) { setMessage("O rateio deve fechar exatamente o valor da recorrência."); return; }
    try {
      setMessage("");
      const id = await recurring.saveMutation.mutateAsync({
        id: form.id,
        payload: {
          entry_type: form.entry_type,
          description: form.description.trim(),
          original_amount: numericAmount,
          counterpart_name: form.counterpart_name.trim() || null,
          counterpart_document: form.counterpart_document.trim() || null,
          frequency: form.frequency,
          interval_value: Number(form.interval_value || 1),
          custom_days: form.frequency === "custom" ? Number(form.custom_days || 0) : null,
          start_date: form.start_date,
          end_date: form.end_date || null,
          next_occurrence_date: form.next_occurrence_date,
          installment_count: Number(form.installment_count || 1),
          first_due_offset_days: Number(form.first_due_offset_days || 0),
          allocations: form.allocations,
          notes: form.notes.trim() || null,
        },
      });
      const generated = await recurring.generateMutation.mutateAsync({ id });
      setSuccess(`Recorrência salva. ${generated.generated} ocorrência(s) gerada(s) para a janela de 90 dias.`);
      setOpen(false);
      setForm(emptyForm());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a recorrência.");
    }
  };

  const generate = async (rule: FinancialRecurringRule) => {
    try {
      setSuccess("");
      setMessage("");
      const result = await recurring.generateMutation.mutateAsync({ id: rule.id });
      setSuccess(`${result.generated} nova(s) ocorrência(s) gerada(s). Próxima: ${formatDate(result.next_occurrence_date)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar as ocorrências.");
    }
  };

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-black text-[#0d1b2e]">Recorrências</h2>
        <p className="mt-1 text-xs text-[#5a6a82]">Títulos periódicos com ocorrências independentes e janela automática de 90 dias.</p>
      </div>
      {canManage && <AdminButton onClick={openNew}><Plus size={16} /> Nova recorrência</AdminButton>}
    </div>

    {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}
    {message && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}

    <AdminCard>
      <AdminCardToolbar><p className="text-xs font-semibold text-[#5a6a82]">{rules.length} {rules.length === 1 ? "regra cadastrada" : "regras cadastradas"}</p></AdminCardToolbar>
      {recurring.rulesQuery.isLoading ? <div className="p-10"><LoadingState text="Carregando recorrências..." /></div> : recurring.rulesQuery.error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{recurring.rulesQuery.error instanceof Error ? recurring.rulesQuery.error.message : "Não foi possível carregar as recorrências."}</div> : rules.length === 0 ? <div className="p-10"><EmptyState icon={CalendarClock} title="Nenhuma recorrência cadastrada" /></div> : <div className="overflow-x-auto">
        <table className="min-w-[980px]">
          <thead><tr><th className="text-left">Descrição</th><th className="text-left">Tipo</th><th className="text-left">Periodicidade</th><th className="text-left">Próxima</th><th className="text-right">Valor</th><th className="text-left">Status</th>{canManage && <th className="text-right">Ações</th>}</tr></thead>
          <tbody>{rules.map(rule => <tr key={rule.id}>
            <td><p className="font-bold text-[#0d1b2e]">{rule.description}</p>{rule.counterpart_name_snapshot && <p className="text-xs text-[#5a6a82]">{rule.counterpart_name_snapshot}</p>}</td>
            <td className="text-xs font-semibold text-[#5a6a82]">{rule.entry_type === "receivable" ? "Receber" : "Pagar"}</td>
            <td className="text-xs text-[#5a6a82]">{frequencyLabel(rule)}</td>
            <td className="text-xs font-semibold">{formatDate(rule.next_occurrence_date)}</td>
            <td className="text-right font-black text-[#0057e7]">{formatCurrency(rule.original_amount)}</td>
            <td><StatusBadge status={rule.is_active ? "Ativo" : "Inativo"} /></td>
            {canManage && <td><div className="flex justify-end gap-1">
              <AdminIconButton ariaLabel="Gerar ocorrências" title="Gerar próximos 90 dias" onClick={() => void generate(rule)}><RefreshCw size={15} /></AdminIconButton>
              <AdminIconButton ariaLabel="Editar recorrência" title="Editar" onClick={() => edit(rule)}><Pencil size={15} /></AdminIconButton>
              <AdminIconButton ariaLabel={rule.is_active ? "Pausar recorrência" : "Ativar recorrência"} title={rule.is_active ? "Pausar" : "Ativar"} onClick={() => recurring.activeMutation.mutateAsync({ id: rule.id, active: !rule.is_active })}>{rule.is_active ? <Pause size={15} /> : <Play size={15} />}</AdminIconButton>
            </div></td>}
          </tr>)}</tbody>
        </table>
      </div>}
    </AdminCard>

    {open && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><h2 className="text-lg font-black text-[#0d1b2e]">{form.id ? "Editar recorrência" : "Nova recorrência"}</h2><p className="mt-1 text-xs text-[#5a6a82]">Cada ocorrência gera um título financeiro independente.</p></div>
          <button type="button" onClick={close} disabled={pending} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FSelect label="Tipo" value={form.entry_type} options={[{ value: "payable", label: "Conta a pagar" }, { value: "receivable", label: "Conta a receber" }]} onChange={(event: any) => setForm(current => ({ ...current, entry_type: event.target.value as FinancialEntryType, allocations: emptyAllocations() }))} />
            <FCurrencyInput label="Valor" value={form.original_amount} onChange={(event: any) => setForm(current => ({ ...current, original_amount: event.target.value }))} />
            <div className="sm:col-span-2"><FInput label="Descrição" required value={form.description} onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))} /></div>
            <FInput label="Contraparte (opcional)" value={form.counterpart_name} onChange={(event: any) => setForm(current => ({ ...current, counterpart_name: event.target.value }))} />
            <FInput label="CPF/CNPJ da contraparte" value={form.counterpart_document} onChange={(event: any) => setForm(current => ({ ...current, counterpart_document: event.target.value }))} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FSelect label="Periodicidade" value={form.frequency} options={[{ value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensal" }, { value: "yearly", label: "Anual" }, { value: "custom", label: "Personalizada" }]} onChange={(event: any) => setForm(current => ({ ...current, frequency: event.target.value as FinancialRecurringFrequency }))} />
            {form.frequency === "custom"
              ? <FIntegerInput label="A cada quantos dias" value={form.custom_days} onChange={(event: any) => setForm(current => ({ ...current, custom_days: event.target.value }))} />
              : <FIntegerInput label="Intervalo" value={form.interval_value} onChange={(event: any) => setForm(current => ({ ...current, interval_value: event.target.value }))} />}
            <FInput type="date" label="Início" value={form.start_date} onChange={(event: any) => setForm(current => ({ ...current, start_date: event.target.value }))} />
            <FInput type="date" label="Fim (opcional)" value={form.end_date} onChange={(event: any) => setForm(current => ({ ...current, end_date: event.target.value }))} />
            <FInput type="date" label="Próxima ocorrência" value={form.next_occurrence_date} onChange={(event: any) => setForm(current => ({ ...current, next_occurrence_date: event.target.value }))} />
            <FIntegerInput label="Parcelas por ocorrência" value={form.installment_count} onChange={(event: any) => setForm(current => ({ ...current, installment_count: event.target.value }))} />
            <FIntegerInput label="Dias até 1º vencimento" value={form.first_due_offset_days} onChange={(event: any) => setForm(current => ({ ...current, first_due_offset_days: event.target.value }))} />
          </div>

          <FinanceAllocationEditor entryType={form.entry_type} total={amount} categories={categories} costCenters={costCenters} value={form.allocations} onChange={allocations => setForm(current => ({ ...current, allocations }))} />
          <FTextarea label="Observações" value={form.notes} onChange={(event: any) => setForm(current => ({ ...current, notes: event.target.value }))} rows={3} />
          {message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
        </div>
        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <AdminButton variant="secondary" onClick={close} disabled={pending}>Cancelar</AdminButton>
          <AdminButton onClick={() => void save()} loading={pending} loadingText="Salvando...">Salvar recorrência</AdminButton>
        </div>
      </div>
    </div>}
  </div>;
}
