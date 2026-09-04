import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, Plus, Tag, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  deleteBrand,
  listBrands,
  saveBrand,
  setBrandActive,
} from "../infrastructure/brands.repository";
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
import { BrandAdminLogo, ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { cn, slugify } from "@/shared/domain/formatters";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  StatusBadge,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import { FInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function TabBrands({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const brandsQuery = useQuery({ queryKey: queryKeys.catalog.brands(), queryFn: listBrands });
  const brands = brandsQuery.data ?? [];
  const loading = brandsQuery.isPending;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", logo_media_id: "", website_url: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!brandsQuery.error) return;
    const message = brandsQuery.error instanceof Error ? brandsQuery.error.message : String(brandsQuery.error);
    setToast({ msg: `Erro ao carregar marcas: ${message}`, type: "error" });
  }, [brandsQuery.error]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.brands() }),
  ]);

  const autoSlug = slugify;
  const openNew = () => { setForm({ name: "", slug: "", description: "", logo_media_id: "", website_url: "", is_active: true, sort_order: 0 }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (b: any) => { setForm({ name: b.name || "", slug: b.slug || "", description: b.description || "", logo_media_id: b.logo_media_id || "", website_url: b.website_url || "", is_active: b.is_active ?? true, sort_order: b.sort_order ?? 0 }); setEditItem(b); setDrawerOpen(true); };
  const closeEditor = () => { setDrawerOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => onRouteChange ? onRouteChange("new", null) : openNew();
  const openEditPage = (item: any) => onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item);

  useEffect(() => {
    if (!routeResourceId) { if (drawerOpen) setDrawerOpen(false); return; }
    if (routeResourceId === "new") { if (!drawerOpen || editItem) openNew(); return; }
    if (routeSubpage !== "edit" || editItem?.id === routeResourceId) return;
    const item = brands.find((entry: any) => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, brands, drawerOpen, editItem?.id]);

  const handleSave = async () => {
    if (!(editItem ? hasPermission("brands.update") : hasPermission("brands.create"))) return;
    if (!form.name.trim()) { setToast({ msg: "Nome da marca é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("brands", form.name, editItem?.id) : editItem.slug;
      const payload = { ...form, name: form.name.trim(), slug: finalSlug, logo_media_id: form.logo_media_id || null, website_url: form.website_url || null, description: form.description || null };
      await saveBrand(payload, editItem?.id);
      closeEditor();
      setToast({ msg: editItem ? "Marca atualizada!" : "Marca criada!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar marca: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission("brands.delete")) return;
    try { await deleteBrand(id); setDelId(null); setToast({ msg: "Marca excluída.", type: "success" }); await refresh(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); setToast({ msg: `Erro ao excluir marca: ${message}`, type: "error" }); }
  };

  const toggleActive = async (brand: any) => {
    if (!hasPermission("brands.update")) return;
    try { await setBrandActive(brand.id, !brand.is_active); setToast({ msg: "Status atualizado!", type: "success" }); await refresh(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); setToast({ msg: `Erro ao atualizar marca: ${message}`, type: "error" }); }
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const filteredBrands = brands;
  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBrands = filteredBrands.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [brands.length]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir esta marca?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Marcas" subtitle={`${brands.length} marca${brands.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("brands.create") && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Nova marca</AdminButton>}</div>
      } />

      <AdminCard>
        {loading ? <LoadingState /> : brands.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhuma marca cadastrada" onAdd={openNewPage} addLabel="Nova marca" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:p-5 lg:grid-cols-4">
              {pagedBrands.map(b => (
                <AdminCard key={b.id} className={cn("flex flex-col items-center gap-3 p-4 transition-all hover:shadow-md", b.is_active ? "" : "bg-[#f8fafc] opacity-60")}>
                  <BrandAdminLogo mediaId={b.logo_media_id} name={b.name} />
                  <div className="text-center"><p className="text-sm font-bold text-[#0d1b2e]">{b.name}</p><StatusBadge status={b.is_active ? "Ativo" : "Inativo"} /></div>
                  <div className="flex gap-1">
                    {hasPermission("brands.update") && <>
                      <AdminIconButton ariaLabel="Editar marca" title="Editar" onClick={() => openEditPage(b)}><Edit2 size={14} /></AdminIconButton>
                      <AdminIconButton ariaLabel={b.is_active ? "Desativar marca" : "Ativar marca"} title={b.is_active ? "Desativar" : "Ativar"} onClick={() => toggleActive(b)}>{b.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</AdminIconButton>
                    </>}
                    {hasPermission("brands.delete") && <AdminIconButton ariaLabel="Excluir marca" title="Excluir" variant="danger" onClick={() => setDelId(b.id)}><Trash2 size={14} /></AdminIconButton>}
                  </div>
                </AdminCard>
              ))}
            </div>
            <PaginationBar page={safePage} pageSize={pageSize} totalItems={filteredBrands.length} onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }} />
          </>
        )}
      </AdminCard>

      <AdminPage open={drawerOpen} onClose={closeEditor} breadcrumb="Marcas" title={editItem ? "Editar marca" : "Nova marca"} maxW="max-w-md">
        <div className="p-5 space-y-4">
          <Section title="Informações"><div className="space-y-4">
            <FInput label="Nome da marca" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) })} placeholder="Ex: Samsung" />
            <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} />
            <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={2} />
            <FInput label="Site" value={form.website_url} onChange={(e: any) => setForm({ ...form, website_url: e.target.value })} />
            <FToggle label="Marca ativa" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
            <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </div></Section>
          <Section title="Logo"><ImageUpload bucket="brand-images" currentMediaId={form.logo_media_id} onUpload={mediaId => setForm({ ...form, logo_media_id: mediaId })} canUpload={editItem ? hasPermission("brands.update") : hasPermission("brands.create")} label="Logo da marca" /></Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("brands.update") : hasPermission("brands.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar marca"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}
