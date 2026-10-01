import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Package, Plus, Search, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteProduct, loadProductCatalog, saveProduct, updateProductFlags } from "../infrastructure/products.repository";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect, FTextarea, FToggle, INPUT, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { ImageUpload, ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

type ProductForm = {
  name: string;
  sku: string;
  price: string;
  is_active: boolean;
  show_in_catalog: boolean;
  short_description: string;
  description: string;
  compare_at_price: string;
  cover_media_id: string;
  is_featured: boolean;
  category_id: string;
  brand_id: string;
  external_platform: string;
  external_product_id: string;
  external_url: string;
};

function emptyForm(): ProductForm {
  return {
    name: "",
    sku: "",
    price: "",
    is_active: true,
    show_in_catalog: false,
    short_description: "",
    description: "",
    compare_at_price: "",
    cover_media_id: "",
    is_featured: false,
    category_id: "",
    brand_id: "",
    external_platform: "",
    external_product_id: "",
    external_url: "",
  };
}

export function TabProducts({
  onBack,
  routeResourceId,
  routeSubpage,
  onRouteChange,
}: {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
}) {
  const { user, activeOrganization, activeOrganizationId, hasPermission } = useAuth();
  const isArtvideoTenant = activeOrganization?.is_artvideo_tenant === true;
  const canViewTable = hasPermission("products.table.view");
  const canViewDetails = hasPermission("products.details.view");
  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.update");
  const canDelete = hasPermission("products.delete");
  const canToggleActive = hasPermission("products.toggle_active");
  const canToggleFeatured = isArtvideoTenant && hasPermission("products.toggle_featured");
  const showProduct = hasPermission("products.table.product");
  const showCategory = isArtvideoTenant && hasPermission("products.table.category");
  const showPrice = hasPermission("products.table.price");
  const showFeatured = isArtvideoTenant && hasPermission("products.table.featured");
  const showStatus = hasPermission("products.table.status");
  const showActions = hasPermission("products.table.actions");
  const canLoadCategories = isArtvideoTenant && hasPermission("categories.view");
  const canLoadBrands = isArtvideoTenant && hasPermission("brands.view");
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: [...queryKeys.catalog.products(), activeOrganizationId],
    queryFn: () => loadProductCatalog(activeOrganizationId!, {
      loadCategories: canLoadCategories,
      loadBrands: canLoadBrands,
    }),
    enabled: Boolean(activeOrganizationId && (canViewTable || canViewDetails || canCreate || canEdit)),
  });

  const products = catalogQuery.data?.products ?? [];
  const categories = catalogQuery.data?.categories ?? [];
  const brands = catalogQuery.data?.brands ?? [];
  const loading = catalogQuery.isPending;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState<ProductForm>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string; compare_at_price?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (catalogQuery.error) {
      setToast({ msg: `Erro ao carregar produtos: ${systemErrorMessage(catalogQuery.error)}`, type: "error" });
    }
  }, [catalogQuery.error]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.products() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.products() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.featuredProducts() }),
  ]);

  const catOptions = [{ value: "", label: "Sem categoria" }, ...categories.map((item: any) => ({ value: item.id, label: item.name }))];
  const brandOptions = [{ value: "", label: "Sem marca" }, ...brands.map((item: any) => ({ value: item.id, label: item.name }))];

  const openNew = () => {
    if (!canCreate) return;
    setFieldErrors({});
    setForm(emptyForm());
    setEditItem(null);
    setDrawerOpen(true);
  };

  const openEdit = (product: any) => {
    if (!(canViewDetails && canEdit)) return;
    setFieldErrors({});
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      price: product.price == null ? "" : String(product.price),
      is_active: product.is_active ?? true,
      show_in_catalog: isArtvideoTenant && product.show_in_catalog === true,
      short_description: product.short_description || "",
      description: product.description || "",
      compare_at_price: product.compare_at_price == null ? "" : String(product.compare_at_price),
      cover_media_id: product.cover_media_id || "",
      is_featured: product.is_featured ?? false,
      category_id: product.category_id || "",
      brand_id: product.brand_id || "",
      external_platform: product.external_platform || "",
      external_product_id: product.external_product_id || "",
      external_url: product.external_url || "",
    });
    setEditItem(product);
    setDrawerOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setDrawerOpen(false);
    onRouteChange?.(null, null);
  };

  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => {
    if (!routeResourceId) {
      if (drawerOpen) setDrawerOpen(false);
      return;
    }
    if (routeResourceId === "new") {
      if (canCreate && (!drawerOpen || editItem)) openNew();
      return;
    }
    if (!canViewDetails || !canEdit || routeSubpage !== "edit" || editItem?.id === routeResourceId) return;
    const item = products.find((entry: any) => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, products, drawerOpen, editItem?.id, canCreate, canViewDetails, canEdit]);

  const handleSave = async () => {
    if (!activeOrganizationId || !(editItem ? canEdit : canCreate)) return;

    const price = form.price === "" ? null : Number(form.price);
    const compareAtPrice = form.compare_at_price === "" ? null : Number(form.compare_at_price);
    const nextErrors: typeof fieldErrors = {};

    if (!form.name.trim()) nextErrors.name = "Nome do produto é obrigatório.";
    if (price !== null && (!Number.isFinite(price) || price < 0)) nextErrors.price = "Informe um preço válido e não negativo.";
    if (isArtvideoTenant && form.show_in_catalog && compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < 0)) {
      nextErrors.compare_at_price = "Informe um preço de comparação válido e não negativo.";
    }
    if (isArtvideoTenant && form.show_in_catalog && price !== null && compareAtPrice !== null && compareAtPrice < price) {
      nextErrors.compare_at_price = "O preço de comparação deve ser igual ou maior que o preço atual.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const finalSlug = await generateUniqueSlug("products", form.name, editItem?.id);
      const showInCatalog = isArtvideoTenant && form.show_in_catalog;
      const payload = {
        name: form.name.trim(),
        slug: finalSlug,
        sku: form.sku.trim() || null,
        price,
        is_active: form.is_active,
        show_in_catalog: showInCatalog,
        short_description: form.short_description.trim() || null,
        description: form.description.trim() || null,
        compare_at_price: compareAtPrice,
        cover_media_id: form.cover_media_id || null,
        is_featured: isArtvideoTenant ? form.is_featured : false,
        category_id: isArtvideoTenant ? (form.category_id || null) : null,
        brand_id: isArtvideoTenant ? (form.brand_id || null) : null,
        external_platform: form.external_platform.trim() || null,
        external_product_id: form.external_product_id.trim() || null,
        external_url: form.external_url.trim() || null,
        updated_by: user?.id || null,
      };

      await saveProduct(activeOrganizationId, payload, editItem?.id, user?.id ?? null);
      setDrawerOpen(false);
      onRouteChange?.(null, null);
      setToast({ msg: editItem ? "Produto atualizado!" : "Produto criado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar produto: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!activeOrganizationId || !canDelete) return;
    try {
      await deleteProduct(activeOrganizationId, id);
      setDelId(null);
      setToast({ msg: "Produto excluído.", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao excluir produto: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const toggleActive = async (product: any) => {
    if (!activeOrganizationId || !canToggleActive) return;
    try {
      await updateProductFlags(activeOrganizationId, product.id, { is_active: !product.is_active }, user?.id ?? null);
      setToast({ msg: "Status atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao atualizar produto: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const toggleFeatured = async (product: any) => {
    if (!activeOrganizationId || !canToggleFeatured || product.show_in_catalog !== true) return;
    try {
      await updateProductFlags(activeOrganizationId, product.id, { is_featured: !product.is_featured }, user?.id ?? null);
      setToast({ msg: "Destaque atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao atualizar destaque: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const filtered = products.filter((product: any) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return true;
    return String(product.name || "").toLocaleLowerCase("pt-BR").includes(term)
      || String(product.sku || "").toLocaleLowerCase("pt-BR").includes(term);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, activeOrganizationId]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Excluir este produto permanentemente?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

    {!routeResourceId && <>
      <PageHeader
        title="Produtos"
        subtitle={`${products.length} produto${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`}
        actions={<div className="flex items-center gap-2">
          <InternalBackButton onBack={onBack} />
          {canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Novo produto</AdminButton>}
        </div>}
      />

      {canViewTable && <AdminCard>
        <AdminCardToolbar>
          <div className="relative max-w-xs flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1); }}
              placeholder="Buscar por nome ou SKU..."
              className={cn(INPUT, "py-2 pl-9 text-xs")}
            />
          </div>
        </AdminCardToolbar>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={search ? "Nenhum resultado" : "Nenhum produto cadastrado"}
            message="Cadastre produtos para vendas, PDV e demais operações comerciais."
            onAdd={canCreate ? openNewPage : undefined}
            addLabel="Novo produto"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[700px]">
              <thead>
                <tr>
                  {showProduct && <th className="text-left">Produto</th>}
                  {showCategory && <th className="text-left">Categoria</th>}
                  {showPrice && <th className="text-left">Preço</th>}
                  {showFeatured && <th className="text-left">Destaque</th>}
                  {showStatus && <th className="text-left">Status</th>}
                  {showActions && <th className="text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map((product: any) => <tr key={product.id}>
                  {showProduct && <td>
                    <div className="flex items-center gap-3">
                      <ProductAdminThumb mediaId={isArtvideoTenant && product.show_in_catalog ? product.cover_media_id : null} name={product.name} />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#0d1b2e]">{product.name}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#7a8aa0]">{product.sku || "Sem SKU"}</p>
                      </div>
                    </div>
                  </td>}
                  {showCategory && <td className="text-xs text-[#5a6a82]">{product.product_categories?.name || "—"}</td>}
                  {showPrice && <td className="font-bold text-[#0d1b2e]">{product.price == null ? "Consultar" : formatCurrency(product.price)}</td>}
                  {showFeatured && <td>
                    {product.show_in_catalog ? (
                      canToggleFeatured
                        ? <AdminIconButton ariaLabel={product.is_featured ? "Remover produto dos destaques" : "Destacar produto"} title={product.is_featured ? "Remover destaque" : "Destacar produto"} variant="ghost" onClick={() => toggleFeatured(product)}>
                            {product.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <Star size={15} className="text-[#5a6a82]" />}
                          </AdminIconButton>
                        : product.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <span>—</span>
                    ) : <span className="text-xs text-[#8a96a8]">Fora do catálogo</span>}
                  </td>}
                  {showStatus && <td><StatusBadge status={product.is_active ? "Ativo" : "Inativo"} /></td>}
                  {showActions && <td>
                    <div className="flex items-center justify-end gap-1">
                      {canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar produto" title="Editar" onClick={() => openEditPage(product)}><Edit2 size={15} /></AdminIconButton>}
                      {canDelete && <AdminIconButton ariaLabel="Excluir produto" title="Excluir" variant="danger" onClick={() => setDelId(product.id)}><Trash2 size={15} /></AdminIconButton>}
                      {canToggleActive && <AdminActiveStateButton active={product.is_active} entityLabel="produto" onClick={() => void toggleActive(product)} />}
                    </div>
                  </td>}
                </tr>)}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={nextPage => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }}
        />
      </AdminCard>}
    </>}

    {routeResourceId && !drawerOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}

    <AdminPage
      open={drawerOpen}
      onClose={closeEditor}
      breadcrumb="Produtos"
      title={editItem ? "Editar produto" : "Novo produto"}
      subtitle="Cadastro comercial utilizado por vendas e PDV."
      maxW="max-w-5xl"
      fullPage
    >
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Dados do produto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FInput
                label="Nome do produto"
                value={form.name}
                required
                disabled={saving}
                error={fieldErrors.name}
                onChange={(event: any) => {
                  setFieldErrors(current => ({ ...current, name: undefined }));
                  setForm(current => ({ ...current, name: event.target.value }));
                }}
                placeholder="Nome do produto"
              />
            </div>
            <FInput
              label="SKU / código"
              value={form.sku}
              disabled={saving}
              onChange={(event: any) => setForm(current => ({ ...current, sku: event.target.value }))}
              placeholder="Código interno ou de barras"
            />
            <FCurrencyInput
              label="Preço de venda (R$)"
              value={form.price}
              disabled={saving}
              error={fieldErrors.price}
              onChange={(event: any) => {
                setFieldErrors(current => ({ ...current, price: undefined, compare_at_price: undefined }));
                setForm(current => ({ ...current, price: event.target.value }));
              }}
              placeholder="0,00"
            />
            <div className="sm:col-span-2">
              <FToggle
                label="Produto ativo"
                description="Disponibiliza o produto para uso nos módulos comerciais."
                checked={form.is_active}
                disabled={saving}
                onChange={value => setForm(current => ({ ...current, is_active: value }))}
              />
            </div>
          </div>
        </Section>

        {isArtvideoTenant && <Section title="Catálogo da loja">
          <div className="space-y-5">
            <FToggle
              label="Exibir no catálogo da loja"
              description="Ao ativar, este produto também poderá aparecer no site público da Artvideo."
              checked={form.show_in_catalog}
              disabled={saving}
              onChange={value => setForm(current => ({ ...current, show_in_catalog: value }))}
            />

            {form.show_in_catalog && <div className="space-y-5 border-t border-[#0d1b2e]/8 pt-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FSelect
                  label="Categoria do catálogo"
                  value={form.category_id}
                  disabled={saving || !canLoadCategories}
                  onChange={(event: any) => setForm(current => ({ ...current, category_id: event.target.value }))}
                  options={catOptions}
                />
                <FSelect
                  label="Marca"
                  value={form.brand_id}
                  disabled={saving || !canLoadBrands}
                  onChange={(event: any) => setForm(current => ({ ...current, brand_id: event.target.value }))}
                  options={brandOptions}
                />
                <div className="sm:col-span-2">
                  <FInput
                    label="Descrição curta"
                    value={form.short_description}
                    disabled={saving}
                    onChange={(event: any) => setForm(current => ({ ...current, short_description: event.target.value }))}
                    placeholder="Resumo exibido no catálogo"
                  />
                </div>
                <div className="sm:col-span-2">
                  <FTextarea
                    label="Descrição completa"
                    value={form.description}
                    disabled={saving}
                    onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))}
                    rows={4}
                    placeholder="Informações detalhadas do produto para o site"
                  />
                </div>
                <FCurrencyInput
                  label="Preço de comparação (R$)"
                  value={form.compare_at_price}
                  disabled={saving}
                  error={fieldErrors.compare_at_price}
                  onChange={(event: any) => {
                    setFieldErrors(current => ({ ...current, compare_at_price: undefined }));
                    setForm(current => ({ ...current, compare_at_price: event.target.value }));
                  }}
                  hint="Opcional. Deve ser igual ou maior que o preço de venda."
                />
                <div className="flex items-end pb-1">
                  <FToggle
                    label="Destaque"
                    description="Exibe na Home e nos destaques da loja."
                    checked={form.is_featured}
                    disabled={saving}
                    onChange={value => setForm(current => ({ ...current, is_featured: value }))}
                  />
                </div>
              </div>

              <ImageUpload
                bucket="product-images"
                organizationId={activeOrganizationId || undefined}
                currentMediaId={form.cover_media_id}
                onUpload={mediaId => setForm(current => ({ ...current, cover_media_id: mediaId }))}
                canUpload={!saving && (editItem ? canEdit : canCreate)}
                label="Imagem do catálogo"
              />
            </div>}
          </div>
        </Section>}
      </div>

      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
        <BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>
        {(editItem ? canEdit : canCreate) && <BtnPrimary onClick={handleSave} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </div>
    </AdminPage>
  </div>;
}
