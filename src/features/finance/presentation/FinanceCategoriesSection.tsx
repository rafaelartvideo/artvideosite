import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { ArrowLeft, FolderTree, Pencil, Plus } from "lucide-react";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { FinanceTableRow } from "./FinanceTableRow";
import { FinanceTableSurface } from "./FinanceTableSurface";
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

export function FinanceCategoriesSection({ createSignal = 0, modalOpen = false, onModalClose }: { createSignal?: number; modalOpen?: boolean; onModalClose?: () => void } = {}) {
  const finance = useFinanceFoundation();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (createSignal > 0) { setForm(emptyForm()); setFieldErrors({}); setOpen(true); } }, [createSignal]);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; parent_category_id?: string }>({});
  const categories = finance.categoriesQuery.data || [];
  const queryError = finance.categoriesQuery.error;

  const edit = (category: FinancialCategory) => {
    setForm({ id: category.id, name: category.name, nature: category.nature, parent_category_id: category.parent_category_id || "", report_group: category.report_group || "", description: category.description || "", is_active: category.is_active });
    setFieldErrors({});
    setOpen(true);
  };
  const close = () => { if (finance.saveCategory.isPending) return; setOpen(false); setForm(emptyForm()); setFieldErrors({}); };
  const save = async () => {
    const nextErrors: typeof fieldErrors = {};
    if (!form.name.trim()) nextErrors.name = "Informe o nome da categoria.";
    if (form.id && form.parent_category_id === form.id) nextErrors.parent_category_id = "Uma categoria não pode ser pai dela mesma.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      setFieldErrors({});
      await finance.saveCategory.mutateAsync({ ...form, parent_category_id: form.parent_category_id || null, report_group: form.report_group || null, description: form.description || null });
      notifyAdmin(form.id ? "Categoria atualizada com sucesso." : "Categoria cadastrada com sucesso.", "success");
      close();
    } catch (error) { notifyAdmin(systemErrorMessage(error, "Não foi possível salvar a categoria."), "error"); }
  };
  const parentOptions = [
    { value: "", label: "Sem categoria pai" },
    ...categories.filter(item => item.nature === form.nature && item.id !== form.id).map(item => ({ value: item.id, label: item.name })),
  ];
  const parentName = (id: string | null) => categories.find(item => item.id === id)?.name || "—";

  const openNew = () => {
    setForm(emptyForm());
    setFieldErrors({});
    setOpen(true);
  };
  const closeModal = () => {
    if (finance.saveCategory.isPending) return;
    close();
    onModalClose?.();
  };
  const listing = <div className="space-y-4">
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-muted-foreground">{categories.length} {categories.length === 1 ? "categoria cadastrada" : "categorias cadastradas"}</p>

    </div>
      {queryError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{systemErrorMessage(queryError, "Não foi possível carregar as categorias.")}</div>}
      {finance.categoriesQuery.isLoading ? <AdminWorkspaceSkeleton rows={5} columns={5} /> : categories.length === 0 ? <div className="p-8"><EmptyState icon={FolderTree} title="Nenhuma categoria financeira" /></div> : <FinanceTableSurface><table className="min-w-[720px]"><thead><tr><th className="text-left">Categoria</th><th className="text-left">Natureza</th><th className="text-left">Grupo DRE</th><th className="text-left">Categoria pai</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{categories.map(category => <FinanceTableRow key={category.id} label={`Editar categoria ${category.name}`} onOpen={() => edit(category)}><td><p className="font-bold text-[#0d1b2e]">{category.name}</p>{category.description && <p className="text-xs text-[#5a6a82]">{category.description}</p>}</td><td className="text-xs font-semibold text-[#5a6a82]">{category.nature === "revenue" ? "Receita" : "Despesa"}</td><td className="text-xs text-[#5a6a82]">{category.report_group || "—"}</td><td className="text-xs text-[#5a6a82]">{parentName(category.parent_category_id)}</td><td><StatusBadge status={category.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1"><AdminIconButton ariaLabel="Editar categoria" onClick={() => edit(category)}><Pencil size={15} /></AdminIconButton><AdminActiveStateButton active={category.is_active} entityLabel="categoria" onClick={() => void finance.toggleCategory.mutateAsync({ id: category.id, isActive: !category.is_active })} /></div></td></FinanceTableRow>)}</tbody></table></FinanceTableSurface>}


  </div>;
  const editor = <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required error={fieldErrors.name} value={form.name} onChange={(event: any) => { setFieldErrors(current => ({ ...current, name: undefined })); setForm(current => ({ ...current, name: event.target.value })); }} /><FSelect label="Natureza" required value={form.nature} options={NATURES} onChange={(event: any) => setForm(current => ({ ...current, nature: event.target.value as FinancialCategoryNature, parent_category_id: "" }))} /></div><div className="grid gap-4 sm:grid-cols-2"><FSelect label="Categoria pai" error={fieldErrors.parent_category_id} value={form.parent_category_id} options={parentOptions} onChange={(event: any) => { setFieldErrors(current => ({ ...current, parent_category_id: undefined })); setForm(current => ({ ...current, parent_category_id: event.target.value })); }} /><FInput label="Grupo DRE" value={form.report_group} onChange={(event: any) => setForm(current => ({ ...current, report_group: event.target.value }))} placeholder="Ex.: Receita de serviços" /></div><FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))} /></div>;
  const editorFooter = <div className="flex flex-wrap items-center justify-between gap-2">
    <AdminButton variant="secondary" onClick={close} disabled={finance.saveCategory.isPending}><ArrowLeft size={16} /> Voltar</AdminButton>
    <AdminButton onClick={() => void save()} loading={finance.saveCategory.isPending} loadingText="Salvando...">Salvar categoria</AdminButton>
  </div>;
  const listingFooter = <div className="flex flex-wrap items-center justify-between gap-2">
    <AdminButton variant="secondary" onClick={closeModal}>Fechar</AdminButton>
    <AdminButton onClick={openNew}><Plus size={16} /> Novo</AdminButton>
  </div>;

  if (modalOpen) return <AdminDialog
    open
    onClose={closeModal}
    title={open ? form.id ? "Editar categoria" : "Nova categoria" : "Categorias"}
    className={open
      ? "h-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-2xl transition-[max-width,height] duration-300 ease-out"
      : "h-[min(760px,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] max-w-5xl transition-[max-width,height] duration-300 ease-out"}
    bodyClassName={open ? "flex-none overscroll-contain" : "overscroll-contain"}
    footer={open ? editorFooter : listingFooter}
  >{open ? editor : listing}</AdminDialog>;

  return <div className="space-y-4">
    {listing}
    {open && <AdminDialog open onClose={close} title={form.id ? "Editar categoria" : "Nova categoria"} className="max-w-2xl" footer={editorFooter}>{editor}</AdminDialog>}
  </div>;
}
