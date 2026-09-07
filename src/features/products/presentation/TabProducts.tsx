import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Edit2, Package, Plus, Search, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteProduct, loadProductCatalog, saveProduct, updateProductFlags } from "../infrastructure/products.repository";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect, FTextarea, FToggle, INPUT, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { ImageUpload, ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function TabProducts({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { user, hasPermission } = useAuth();
  const canViewTable = hasPermission("products.table.view");
  const canViewDetails = hasPermission("products.details.view");
  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.update");
  const canDelete = hasPermission("products.delete");
  const canToggleActive = hasPermission("products.toggle_active");
  const canToggleFeatured = hasPermission("products.toggle_featured");
  const showProduct = hasPermission("products.table.product");
  const showCategory = hasPermission("products.table.category");
  const showPrice = hasPermission("products.table.price");
  const showFeatured = hasPermission("products.table.featured");
  const showStatus = hasPermission("products.table.status");
  const showActions = hasPermission("products.table.actions");
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: queryKeys.catalog.products(), queryFn: loadProductCatalog, enabled: canViewTable || canViewDetails || canCreate || canEdit });
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
  const [form, setForm] = useState({ name: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (catalogQuery.error) setToast({ msg: `Erro ao carregar produtos: ${catalogQuery.error instanceof Error ? catalogQuery.error.message : String(catalogQuery.error)}`, type: "error" }); }, [catalogQuery.error]);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }), queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.products() }), queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.featuredProducts() })]);
  const catOptions = [{ value: "", label: "Sem categoria" }, ...categories.map(c => ({ value: c.id, label: c.name }))];
  const resetForm = () => ({ name: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" });
  const openNew = () => { if (!canCreate) return; setForm(resetForm()); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (p: any) => { if (!(canViewDetails && canEdit)) return; setForm({ name: p.name || "", sku: p.sku || "", short_description: p.short_description || "", description: p.description || "", price: p.price == null ? "" : String(p.price), compare_at_price: p.compare_at_price == null ? "" : String(p.compare_at_price), cover_media_id: p.cover_media_id || "", is_active: p.is_active ?? true, is_featured: p.is_featured ?? false, category_id: p.category_id || "", brand_id: p.brand_id || "", external_platform: p.external_platform || "", external_product_id: p.external_product_id || "", external_url: p.external_url || "" }); setEditItem(p); setDrawerOpen(true); };
  const closeEditor = () => { if (saving) return; setDrawerOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => { if (!routeResourceId) { if (drawerOpen) setDrawerOpen(false); return; } if (routeResourceId === "new") { if (canCreate && (!drawerOpen || editItem)) openNew(); return; } if (!canViewDetails || !canEdit || routeSubpage !== "edit" || editItem?.id === routeResourceId) return; const item = products.find((entry: any) => entry.id === routeResourceId); if (item) openEdit(item); }, [routeResourceId, routeSubpage, products, drawerOpen, editItem?.id, canCreate, canViewDetails, canEdit]);

  const handleSave = async () => {
    if (!(editItem ? canEdit : canCreate)) return;
    if (!form.name.trim()) { setToast({ msg: "Nome do produto é obrigatório.", type: "error" }); return; }
    const price = form.price === "" ? null : Number(form.price);
    const compareAtPrice = form.compare_at_price === "" ? null : Number(form.compare_at_price);
    if (price !== null && (!Number.isFinite(price) || price < 0)) { setToast({ msg: "Informe um preço válido e não negativo.", type: "error" }); return; }
    if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < 0)) { setToast({ msg: "Informe um preço de comparação válido e não negativo.", type: "error" }); return; }
    if (price !== null && compareAtPrice !== null && compareAtPrice < price) { setToast({ msg: "O preço de comparação deve ser igual ou maior que o preço atual.", type: "error" }); return; }
    setSaving(true);
    try {
      const finalSlug = await generateUniqueSlug("products", form.name, editItem?.id);
      const payload = { name: form.name.trim(), slug: finalSlug, sku: form.sku.trim() || null, short_description: form.short_description.trim() || null, description: form.description.trim() || null, price, compare_at_price: compareAtPrice, cover_media_id: form.cover_media_id || null, is_active: form.is_active, is_featured: form.is_featured, category_id: form.category_id || null, brand_id: form.brand_id || null, external_platform: form.external_platform.trim() || null, external_product_id: form.external_product_id.trim() || null, external_url: form.external_url.trim() || null, updated_by: user?.id || null };
      await saveProduct(payload, editItem?.id, user?.id ?? null);
      setDrawerOpen(false); onRouteChange?.(null, null); setToast({ msg: editItem ? "Produto atualizado!" : "Produto criado!", type: "success" }); await refresh();
    } catch (error) { setToast({ msg: `Erro ao salvar produto: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id: string) => { if (!canDelete) return; try { await deleteProduct(id); setDelId(null); setToast({ msg: "Produto excluído.", type: "success" }); await refresh(); } catch (error) { setToast({ msg: `Erro ao excluir produto: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const toggleActive = async (product: any) => { if (!canToggleActive) return; try { await updateProductFlags(product.id, { is_active: !product.is_active }, user?.id ?? null); setToast({ msg: "Status atualizado!", type: "success" }); await refresh(); } catch (error) { setToast({ msg: `Erro ao atualizar produto: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const toggleFeatured = async (product: any) => { if (!canToggleFeatured) return; try { await updateProductFlags(product.id, { is_featured: !product.is_featured }, user?.id ?? null); setToast({ msg: "Destaque atualizado!", type: "success" }); await refresh(); } catch (error) { setToast({ msg: `Erro ao atualizar destaque: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const safePage = Math.min(page, totalPages); const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search]); useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Excluir este produto permanentemente?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}
    {!routeResourceId && <>
      <PageHeader title="Produtos" subtitle={`${products.length} produto${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`} actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Novo produto</AdminButton>}</div>} />
      {canViewTable && <AdminCard><AdminCardToolbar><div className="relative max-w-xs flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar produtos..." className={cn(INPUT, "py-2 pl-9 text-xs")} /></div></AdminCardToolbar>{loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Package} title={search ? "Nenhum resultado" : "Nenhum produto cadastrado"} message="Adicione produtos para exibi-los na loja." onAdd={canCreate ? openNewPage : undefined} addLabel="Novo produto" /> : <div className="overflow-x-auto"><table className="min-w-[700px]"><thead><tr>{showProduct && <th className="text-left">Produto</th>}{showCategory && <th className="text-left">Categoria</th>}{showPrice && <th className="text-left">Preço</th>}{showFeatured && <th className="text-left">Destaque</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedProducts.map(p => <tr key={p.id}>{showProduct && <td><div className="flex items-center gap-3"><ProductAdminThumb mediaId={p.cover_media_id} name={p.name} /><span className="font-bold text-[#0d1b2e]">{p.name}</span></div></td>}{showCategory && <td className="text-xs text-[#5a6a82]">{p.categories?.name || "—"}</td>}{showPrice && <td className="font-bold text-[#0d1b2e]">{p.price == null ? "Consultar" : formatCurrency(p.price)}</td>}{showFeatured && <td>{canToggleFeatured ? <AdminIconButton ariaLabel={p.is_featured ? "Remover produto dos destaques" : "Destacar produto"} title={p.is_featured ? "Remover destaque" : "Destacar produto"} variant="ghost" onClick={() => toggleFeatured(p)}>{p.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <Star size={15} className="text-[#5a6a82]" />}</AdminIconButton> : p.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <span>—</span>}</td>}{showStatus && <td><StatusBadge status={p.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar produto" title="Editar" onClick={() => openEditPage(p)}><Edit2 size={15} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={p.is_active ? "Desativar produto" : "Ativar produto"} title={p.is_active ? "Desativar" : "Ativar"} onClick={() => toggleActive(p)}><CheckCircle size={15} /></AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir produto" title="Excluir" variant="danger" onClick={() => setDelId(p.id)}><Trash2 size={15} /></AdminIconButton>}</div></td>}</tr>)}</tbody></table></div>}<PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={nextPage => setPage(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }} /></AdminCard>}
    </>}
    {routeResourceId && !drawerOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    <AdminPage open={drawerOpen} onClose={closeEditor} breadcrumb="Produtos" title={editItem ? "Editar produto" : "Novo produto"} maxW="max-w-xl"><div className="space-y-4 p-5"><Section title="Informações Principais"><div className="space-y-4"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><FInput label="Nome do produto" value={form.name} required disabled={saving} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Nome do produto" /></div><FSelect label="Categoria" value={form.category_id} disabled={saving} onChange={(e: any) => setForm({ ...form, category_id: e.target.value })} options={catOptions} /></div><FTextarea label="Descrição" value={form.description} disabled={saving} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descreva o produto..." /></div></Section><Section title="Preço e Imagem"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FCurrencyInput label="Preço (R$)" value={form.price} disabled={saving} onChange={(e: any) => setForm({ ...form, price: e.target.value })} placeholder="Deixe em branco para consultar" hint="Vazio = 'Consultar preço'" /><FCurrencyInput label="Preço de comparação (R$)" value={form.compare_at_price} disabled={saving} onChange={(e: any) => setForm({ ...form, compare_at_price: e.target.value })} hint="Deve ser igual ou maior que o preço atual." /></div><ImageUpload bucket="product-images" currentMediaId={form.cover_media_id} onUpload={mediaId => setForm({ ...form, cover_media_id: mediaId })} canUpload={!saving && (editItem ? canEdit : canCreate)} label="Imagem do produto" /></Section><Section title="Publicação"><div className="space-y-4"><FToggle label="Produto ativo" checked={form.is_active} disabled={saving} onChange={v => setForm({ ...form, is_active: v })} /><FToggle label="Destaque" description="Exibe na Home e em destaques da loja." checked={form.is_featured} disabled={saving} onChange={v => setForm({ ...form, is_featured: v })} /></div></Section></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={handleSave} loading={saving} loadingText="Salvando...">Salvar produto</BtnPrimary>}</div></AdminPage>
  </div>;
}
