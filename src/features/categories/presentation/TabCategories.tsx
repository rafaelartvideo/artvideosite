import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, FolderTree, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  deleteCategory,
  listCategories,
  saveCategory,
  setCategoryActive,
} from "../infrastructure/categories.repository";
import {
  AdminButton,
  AdminCard,
  AdminIconButton,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  StatusBadge,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import { FInput, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { slugify } from "@/shared/domain/formatters";

export function TabCategories({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: listCategories,
  });
  const cats = categoriesQuery.data ?? [];
  const loading = categoriesQuery.isPending;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!categoriesQuery.error) return;
    const message = categoriesQuery.error instanceof Error ? categoriesQuery.error.message : String(categoriesQuery.error);
    setToast({ msg: `Erro ao carregar categorias: ${message}`, type: "error" });
  }, [categoriesQuery.error]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.categories() }),
  ]);

  const autoSlug = slugify;

  const openNew = () => { setForm({ name: "", slug: "", is_active: true, sort_order: 0 }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (c: any) => { setForm({ name: c.name || "", slug: c.slug || "", is_active: c.is_active ?? true, sort_order: c.sort_order ?? 0 }); setEditItem(c); setDrawerOpen(true); };
  const closeEditor = () => { setDrawerOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => onRouteChange ? onRouteChange("new", null) : openNew();
  const openEditPage = (item: any) => onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item);

  useEffect(() => {
    if (!routeResourceId) {
      if (drawerOpen) setDrawerOpen(false);
      return;
    }
    if (routeResourceId === "new") {
      if (!drawerOpen || editItem) openNew();
      return;
    }
    if (routeSubpage !== "edit" || editItem?.id === routeResourceId) return;
    const item = cats.find((entry: any) => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, cats, drawerOpen, editItem?.id]);

  const handleSave = async () => {
    if (!(editItem ? hasPermission("categories.update") : hasPermission("categories.create"))) return;
    if (!form.name.trim()) { setToast({ msg: "Nome obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("service_categories", form.name, editItem?.id) : editItem.slug;
      const payload = { ...form, name: form.name.trim(), slug: finalSlug };
      await saveCategory(payload, editItem?.id);
      closeEditor();
      setToast({ msg: editItem ? "Categoria atualizada!" : "Categoria criada!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar categoria: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission("categories.delete")) return;
    try {
      await deleteCategory(id);
      setDelId(null);
      setToast({ msg: "Categoria excluída.", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao excluir categoria: ${message}`, type: "error" });
    }
  };

  const toggleActive = async (category: any) => {
    if (!hasPermission("categories.update")) return;
    try {
      await setCategoryActive(category.id, !category.is_active);
      setToast({ msg: "Status atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao atualizar categoria: ${message}`, type: "error" });
    }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir esta categoria? Serviços vinculados perderão a referência." onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Categorias" subtitle={`${cats.length} categoria${cats.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("categories.create") && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Nova categoria</AdminButton>}</div>
      } />

      <AdminCard>
        {loading ? <LoadingState /> : cats.length === 0 ? (
          <EmptyState icon={FolderTree} title="Nenhuma categoria cadastrada" message="Crie categorias para organizar seus serviços." onAdd={openNewPage} addLabel="Nova categoria" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Ordem</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {cats.map(c => (
                  <tr key={c.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{c.name}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82] font-mono">{c.slug}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{c.sort_order}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={c.is_active ? "Ativo" : "Inativo"} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission("categories.update") && <>
                          <AdminIconButton ariaLabel="Editar categoria" title="Editar" onClick={() => openEditPage(c)}><Edit2 size={15} /></AdminIconButton>
                          <AdminIconButton ariaLabel={c.is_active ? "Desativar categoria" : "Ativar categoria"} title={c.is_active ? "Desativar" : "Ativar"} onClick={() => toggleActive(c)}>{c.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</AdminIconButton>
                        </>}
                        {hasPermission("categories.delete") && <AdminIconButton ariaLabel="Excluir categoria" title="Excluir" variant="danger" onClick={() => setDelId(c.id)}><Trash2 size={15} /></AdminIconButton>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminPage open={drawerOpen} onClose={closeEditor} breadcrumb="Categorias" title={editItem ? "Editar categoria" : "Nova categoria"} maxW="max-w-lg">
        <div className="p-5 space-y-4">
          <Section title="Informações">
            <div className="space-y-4">
              <FInput label="Nome" value={form.name} required onChange={(e: any) => { setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) }); }} placeholder="Ex: Ar-condicionado" />
              <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="ar-condicionado" hint="Gerado automaticamente ao digitar o nome. Pode ser editado manualmente." />
            </div>
          </Section>
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Categoria ativa" description="Categorias inativas ficam ocultas nos filtros do site." checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("categories.update") : hasPermission("categories.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar categoria"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}
