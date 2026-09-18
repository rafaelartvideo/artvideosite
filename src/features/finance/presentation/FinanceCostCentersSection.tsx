import { useState } from "react";
import { Pencil, Plus, Target, X } from "lucide-react";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialCostCenter } from "../domain/finance.types";

const emptyForm = () => ({ id: undefined as string | undefined, name: "", description: "", is_active: true });

export function FinanceCostCentersSection() {
  const finance = useFinanceFoundation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const costCenters = finance.costCentersQuery.data || [];
  const queryError = finance.costCentersQuery.error;

  const edit = (item: FinancialCostCenter) => { setForm({ id: item.id, name: item.name, description: item.description || "", is_active: item.is_active }); setMessage(""); setOpen(true); };
  const close = () => { if (finance.saveCostCenter.isPending) return; setOpen(false); setForm(emptyForm()); setMessage(""); };
  const save = async () => {
    if (!form.name.trim()) { setMessage("Informe o nome do centro de custo."); return; }
    try { setMessage(""); await finance.saveCostCenter.mutateAsync({ ...form, description: form.description || null }); close(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o centro de custo."); }
  };

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">Centros de custo</h2><p className="mt-1 text-xs text-[#5a6a82]">Separe receitas e despesas por área da empresa.</p></div><BtnPrimary onClick={() => { setForm(emptyForm()); setMessage(""); setOpen(true); }}><Plus size={16} /> Novo centro</BtnPrimary></div>
    <AdminCard>
      <AdminCardToolbar><p className="text-xs font-semibold text-[#5a6a82]">{costCenters.length} {costCenters.length === 1 ? "centro de custo" : "centros de custo"}</p></AdminCardToolbar>
      {queryError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{queryError instanceof Error ? queryError.message : "Não foi possível carregar os centros de custo."}</div>}
      {finance.costCentersQuery.isLoading ? <div className="p-8"><LoadingState /></div> : costCenters.length === 0 ? <div className="p-8"><EmptyState icon={Target} title="Nenhum centro de custo" /></div> : <div className="overflow-x-auto"><table className="min-w-[560px]"><thead><tr><th className="text-left">Centro de custo</th><th className="text-left">Descrição</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{costCenters.map(item => <tr key={item.id}><td className="font-bold text-[#0d1b2e]">{item.name}</td><td className="text-xs text-[#5a6a82]">{item.description || "—"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1"><AdminIconButton ariaLabel="Editar centro de custo" onClick={() => edit(item)}><Pencil size={15} /></AdminIconButton><AdminActiveStateButton active={item.is_active} entityLabel="centro de custo" onClick={() => void finance.toggleCostCenter.mutateAsync({ id: item.id, isActive: !item.is_active })} /></div></td></tr>)}</tbody></table></div>}
    </AdminCard>
    {open && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-black">{form.id ? "Editar centro de custo" : "Novo centro de custo"}</h2><button type="button" onClick={close} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-4 p-5"><FInput label="Nome" required value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} /><FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))} />{message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}</div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={close}>Cancelar</AdminButton><AdminButton onClick={save} loading={finance.saveCostCenter.isPending} loadingText="Salvando...">Salvar centro</AdminButton></div></div></div>}
  </div>;
}
