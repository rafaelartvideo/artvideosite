import { useState } from "react";
import { FolderTree, Pencil, Plus, X } from "lucide-react";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialCategory, FinancialCategoryNature } from "../domain/finance.types";

const NATURES = [
  { value: "revenue", label: "Receita" },
  { value: "expense", label: "Despesa" },
];

const emptyForm = () => ({
  id: undefined as string | undefined,
  name: "",
  nature: "expense" as FinancialCategoryNature,
  parent_category_id: "",
  report_group: "",
  description: "",
  is_active: true,
});

export function FinanceCategoriesSection() {
  const finance = useFinanceFoundation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const categories = finance.categoriesQuery.data || [];
  const queryError = finance.categoriesQuery.error;

  const edit = (category: FinancialCategory) => {
    setForm({ id: category.id, name: category.name, nature: category.nature, parent_category_id: category.parent_category_id || "", report_group: category.report_group || "", description: category.description || "", is_active: category.is_active });
    setMessage("");
    setOpen(true);
  };
  const close = () => { if (finance.saveCategory.isPending) return; setOpen(false); setForm(emptyForm()); setMessage(""); };
  const save = async () => {
    if (!form.name.trim()) { setMessage("Informe o nome da categoria."); return; }
    if (form.id && form.parent_category_id === form.id) { setMessage("Uma categoria não pode ser pai dela mesma."); return; }
    try {
      setMessage("");
      await finance.saveCategory.mutateAsync({ ...form, parent_category_id: form.parent_category_id || null, report_group: form.report_group || null, description: form.description || null });
      close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar a categoria."); }
  };
  const parentOptions = [
    { value: "", label: "Sem categoria pai" },
    ...categories.filter(item => item.nature === form.nature && item.id !== form.id).map(item => ({ value: item.id, label: item.name })),
  ];
  const parentName = (id: string | null) => categories.find(item => item.id === id)?.name || "—";

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">Categorias financeiras</h2><p className="mt-1 text-xs text-[#5a6a82]">Organize receitas e despesas para DRE e rateios.</p></div><BtnPrimary onClick={() => { setForm(emptyForm()); setMessage(""); setOpen(true); }}><Plus size={16} /> Nova categoria</BtnPrimary></div>
    <AdminCard>
      <AdminCardToolbar><p className="text-xs font-semibold text-[#5a6a82]">{categories.length} {categories.length === 1 ? "categoria" : "categorias"}</p></AdminCardToolbar>
      {queryError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{queryError instanceof Error ? queryError.message : "Não foi possível carregar as categorias."}</div>}
      {finance.categoriesQuery.isLoading ? <div className="p-8"><LoadingState /></div> : categories.length === 0 ? <div className="p-8"><EmptyState icon={FolderTree} title="Nenhuma categoria financeira" /></div> : <div className="overflow-x-auto"><table className="min-w-[720px]"><thead><tr><th className="text-left">Categoria</th><th className="text-left">Natureza</th><th className="text-left">Grupo DRE</th><th className="text-left">Categoria pai</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{categories.map(category => <tr key={category.id}><td><p className="font-bold text-[#0d1b2e]">{category.name}</p>{category.description && <p className="text-xs text-[#5a6a82]">{category.description}</p>}</td><td className="text-xs font-semibold text-[#5a6a82]">{category.nature === "revenue" ? "Receita" : "Despesa"}</td><td className="text-xs text-[#5a6a82]">{category.report_group || "—"}</td><td className="text-xs text-[#5a6a82]">{parentName(category.parent_category_id)}</td><td><StatusBadge status={category.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1"><AdminIconButton ariaLabel="Editar categoria" onClick={() => edit(category)}><Pencil size={15} /></AdminIconButton><AdminActiveStateButton active={category.is_active} entityLabel="categoria" onClick={() => void finance.toggleCategory.mutateAsync({ id: category.id, isActive: !category.is_active })} /></div></td></tr>)}</tbody></table></div>}
    </AdminCard>

    {open && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-black">{form.id ? "Editar categoria" : "Nova categoria"}</h2><button type="button" onClick={close} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} /><FSelect label="Natureza" required value={form.nature} options={NATURES} onChange={(event: any) => setForm(current => ({ ...current, nature: event.target.value as FinancialCategoryNature, parent_category_id: "" }))} /></div><div className="grid gap-4 sm:grid-cols-2"><FSelect label="Categoria pai" value={form.parent_category_id} options={parentOptions} onChange={(event: any) => setForm(current => ({ ...current, parent_category_id: event.target.value }))} /><FInput label="Grupo DRE" value={form.report_group} onChange={(event: any) => setForm(current => ({ ...current, report_group: event.target.value }))} placeholder="Ex.: Receita de serviços" /></div><FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))} />{message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}</div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={close}>Cancelar</AdminButton><AdminButton onClick={save} loading={finance.saveCategory.isPending} loadingText="Salvando...">Salvar categoria</AdminButton></div></div></div>}
  </div>;
}
