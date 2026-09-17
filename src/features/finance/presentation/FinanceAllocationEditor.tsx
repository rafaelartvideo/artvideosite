import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { allocationAmount, validateAllocationTotal } from "../domain/finance-entry.mjs";
import type {
  FinancialAllocationDraft,
  FinancialCategory,
  FinancialCostCenter,
  FinancialEntryType,
} from "../domain/finance.types";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { formatCurrency } from "@/shared/domain/formatters";

export function FinanceAllocationEditor({
  entryType,
  total,
  categories,
  costCenters,
  value,
  onChange,
}: {
  entryType: FinancialEntryType;
  total: number;
  categories: FinancialCategory[];
  costCenters: FinancialCostCenter[];
  value: FinancialAllocationDraft[];
  onChange: (value: FinancialAllocationDraft[]) => void;
}) {
  const nature = entryType === "receivable" ? "revenue" : "expense";
  const categoryOptions = [
    { value: "", label: "Selecione" },
    ...categories.filter(item => item.is_active && item.nature === nature).map(item => ({ value: item.id, label: item.name })),
  ];
  const costCenterOptions = [
    { value: "", label: "Sem centro de custo" },
    ...costCenters.filter(item => item.is_active).map(item => ({ value: item.id, label: item.name })),
  ];

  useEffect(() => {
    let changed = false;
    const next = value.map(row => {
      const amount = allocationAmount(total, row.mode, row.value);
      if (Math.round(amount * 100) !== Math.round(Number(row.amount || 0) * 100)) changed = true;
      return changed || amount !== row.amount ? { ...row, amount } : row;
    });
    if (changed) onChange(next);
  }, [total, value, onChange]);

  const validation = validateAllocationTotal(total, value);

  const updateRow = (index: number, patch: Partial<FinancialAllocationDraft>) => {
    onChange(value.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      const amount = allocationAmount(total, next.mode, next.value);
      return { ...next, amount };
    }));
  };

  const addRow = () => onChange([...value, {
    category_id: "",
    cost_center_id: null,
    mode: "percentage",
    value: 0,
    amount: 0,
  }]);

  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="text-sm font-black text-[#0d1b2e]">Rateio</h3><p className="text-xs text-[#5a6a82]">Distribua o lançamento entre categorias e centros de custo.</p></div>
      <AdminButton variant="secondary" size="sm" onClick={addRow}><Plus size={14} /> Adicionar rateio</AdminButton>
    </div>

    {value.map((row, index) => <div key={index} className="grid gap-3 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 sm:grid-cols-[1.4fr_1.2fr_.7fr_.8fr_auto] sm:items-end">
      <FSelect label="Categoria" value={row.category_id} options={categoryOptions} onChange={(event: any) => updateRow(index, { category_id: event.target.value })} />
      <FSelect label="Centro de custo" value={row.cost_center_id || ""} options={costCenterOptions} onChange={(event: any) => updateRow(index, { cost_center_id: event.target.value || null })} />
      <FSelect label="Modo" value={row.mode} options={[{ value: "percentage", label: "%" }, { value: "amount", label: "R$" }]} onChange={(event: any) => updateRow(index, { mode: event.target.value, value: 0 })} />
      <FInput label={row.mode === "percentage" ? "Percentual" : "Valor"} type="number" min="0" step="0.01" value={row.value || ""} onChange={(event: any) => updateRow(index, { value: Number(event.target.value || 0) })} />
      <div className="flex items-center justify-between gap-2 sm:block"><span className="text-xs font-bold text-[#0057e7] sm:hidden">{formatCurrency(row.amount)}</span><AdminIconButton ariaLabel="Remover rateio" variant="danger" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={15} /></AdminIconButton></div>
      <div className="hidden text-right text-xs font-bold text-[#0057e7] sm:col-span-5 sm:block">Valor deste rateio: {formatCurrency(row.amount)}</div>
    </div>)}

    <div className={`rounded-lg border px-3 py-2 text-xs font-bold ${validation.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
      Rateado: {formatCurrency(validation.allocated)} de {formatCurrency(validation.expected)}{!validation.ok ? ` · Diferença: ${formatCurrency(validation.difference)}` : " · Fechado"}
    </div>
  </div>;
}
