import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Edit2, Package, Plus, Search, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  deleteProduct,
  loadProductCatalog,
  saveProduct,
  updateProductFlags,
} from "../infrastructure/products.repository";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { cn, slugify } from "@/shared/domain/formatters";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  StatusBadge,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import {
  FInput,
  FSelect,
  FTextarea,
  FToggle,
  INPUT,
  FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { ImageUpload, ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function TabProducts({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({
    queryKey: queryKeys.catalog.products(),
    queryFn: loadProductCatalog,
  });
  const products = catalogQuery.data?.products ?? [];
  const categories = catalogQuery.data?.categories ?? [];
  const loading = catalogQuery.isPending;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!catalogQuery.error) return;
    const message = catalogQuery.error instanceof Error ? catalogQuery.error.message : String(catalogQuery.error);
    setToast({ msg: `Erro ao carregar produtos: ${message}`, type: "error" });
  }, [catalogQuery.error]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.products() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.featuredProducts() }),
  ]);

  const autoSlug = slugify;
  const catOptions = [{ value: "", label: "Sem categoria" }, ...categories.map(c => ({ value: c.id, label: c.name }))];

  const openNew = () => { setForm({ name: "", slug: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (p: any) => { setForm({ name: p.name || "", slug: p.slug || "", sku: p.sku || "", short_description: p.short_description || "", description: p.description || "", price: p.price == null ? "" : String(p.price), compare_at_price: p.compare_at_price == null ? "" : String(p.compare_at_price), cover_media_id: p.cover_media_id || "", is_active: p.is_active ?? true, is_featured: p.is_featured ?? false, category_id: p.category_id || "", brand_id: p.brand_id || "", external_platform: p.external_platform || "", external_product_id: p.external_product_id || "", external_url: p.external_url || "" }); setEditItem(p); setDrawerOpen(true); };
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
    const item = products.find((entry: any) => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, products, drawerOpen, editItem?.id]);


  const handleSave = async () => {
    if (!(editItem ? hasPermission("products.update") : hasPermission("products.create"))) return;
    if (!form.name.trim()) { setToast({ msg: "Nome do produto é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("products", form.name, editItem?.id) : editItem.slug;
      const payload = { name: form.name.trim(), slug: finalSlug, sku: form.sku || null, short_description: form.short_description || null, description: form.description || null, price: form.price ? Number(form.price) : null, compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null, cover_media_id: form.cover_media_id || null, is_active: form.is_active, is_featured: form.is_featured, category_id: form.category_id || null, brand_id: form.brand_id || null, external_platform: form.external_platform || null, external_product_id: form.external_product_id || null, external_url: form.external_url || null, updated_by: user?.id || null };
      await saveProduct(payload, editItem?.id, user?.id ?? null);
      closeEditor();
      setToast({ msg: editItem ? "Produto atualizado!" : "Produto criado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar produto: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission("products.delete")) return;
    try {
      await deleteProduct(id);
      setDelId(null);
      setToast({ msg: "Produto excluído.", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao excluir produto: ${message}`, type: "error" });
    }
  };

  const toggleActive = async (product: any) => {
    if (!hasPermission("products.update")) return;
    try {
      await updateProductFlags(product.id, { is_active: !product.is_active }, user?.id ?? null);
      setToast({ msg: "Status atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao atualizar produto: ${message}`, type: "error" });
    }
  };

  const toggleFeatured = async (product: any) => {
    if (!hasPermission("products.update")) return;
    try {
      await updateProductFlags(product.id, { is_featured: !product.is_featured }, user?.id ?? null);
      setToast({ msg: "Destaque atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao atualizar destaque: ${message}`, type: "error" });
    }
  };

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este produto permanentemente?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Produtos" subtitle={`${products.length} produto${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("products.create") && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Novo produto</AdminButton>}</div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar produtos..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Package} title={search ? "Nenhum resultado" : "Nenhum produto cadastrado"} message="Adicione produtos para exibi-los na loja." onAdd={openNewPage} addLabel="Novo produto" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Preço</th>
                  <th className="px-4 py-3 text-left">Destaque</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedProducts.map(p => (
                  <tr key={p.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProductAdminThumb mediaId={p.cover_media_id} name={p.name} />
                        <span className="font-bold text-[#0d1b2e]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{p.categories?.name || "—"}</td>
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{p.price ? `R$ ${Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consultar"}</td>
                    <td className="px-4 py-3.5">{hasPermission("products.update") && <button onClick={() => toggleFeatured(p)} title={p.is_featured ? "Remover destaque" : "Destacar produto"}>{p.is_featured ? <Star size={15} className="text-amber-400 fill-amber-400" /> : <Star size={15} className="text-[#5a6a82]" />}</button>}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={p.is_active ? "Ativo" : "Inativo"} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission("products.update") && <>
                          <AdminIconButton ariaLabel="Editar produto" title="Editar" onClick={() => openEditPage(p)}><Edit2 size={15} /></AdminIconButton>
                          <AdminIconButton ariaLabel={p.is_active ? "Desativar produto" : "Ativar produto"} title={p.is_active ? "Desativar" : "Ativar"} onClick={() => toggleActive(p)}><CheckCircle size={15} /></AdminIconButton>
                        </>}
                        {hasPermission("products.delete") && <AdminIconButton ariaLabel="Excluir produto" title="Excluir" variant="danger" onClick={() => setDelId(p.id)}><Trash2 size={15} /></AdminIconButton>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      <AdminPage open={drawerOpen} onClose={closeEditor} breadcrumb="Produtos" title={editItem ? "Editar produto" : "Novo produto"} maxW="max-w-xl">
        <div className="p-5 space-y-4">
          <Section title="Informações Principais">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><FInput label="Nome do produto" value={form.name} required onChange={(e: any) => { setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) }); }} placeholder="Nome do produto" /></div>
                <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="slug-do-produto" />
                <FSelect label="Categoria" value={form.category_id} onChange={(e: any) => setForm({ ...form, category_id: e.target.value })} options={catOptions} />
              </div>
              <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descreva o produto..." />
            </div>
          </Section>
          <Section title="Preço e Imagem">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FCurrencyInput label="Preço (R$)" value={form.price} onChange={(e: any) => setForm({ ...form, price: e.target.value })} placeholder="Deixe em branco para consultar" hint="Vazio = 'Consultar preço'" />
              <FCurrencyInput label="Preço de comparação (R$)" value={form.compare_at_price} onChange={(e: any) => setForm({ ...form, compare_at_price: e.target.value })} />
            </div>
            <ImageUpload bucket="product-images" currentMediaId={form.cover_media_id} onUpload={mediaId => setForm({ ...form, cover_media_id: mediaId })} canUpload={editItem ? hasPermission("products.update") : hasPermission("products.create")} label="Imagem do produto" />
          </Section>
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Produto ativo" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FToggle label="Destaque" description="Exibe na Home e em destaques da loja." checked={form.is_featured} onChange={v => setForm({ ...form, is_featured: v })} />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("products.update") : hasPermission("products.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar produto"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}
