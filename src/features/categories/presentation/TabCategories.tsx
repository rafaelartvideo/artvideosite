import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, FolderTree, Package, Plus, Trash2, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getArtVideoOrganizationId } from "@/lib/organization-identity";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import { deleteCategory, listCategories, saveCategory, setCategoryActive, type SiteCategory, type SiteCategoryKind } from "../infrastructure/categories.repository";
import { publicIcon, PUBLIC_ICON_OPTIONS } from "@/features/public-shell/domain/site-appearance";
import { MaterialSymbol, parseMaterialIcon } from "@/features/public-shell/presentation/MaterialSymbol";
import { MaterialSymbolsPicker } from "./MaterialSymbolsPicker";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FIntegerInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

type CategoryForm = {
  name: string;
  sort_order: string;
  icon: string;
  image_media_id: string;
  visual: "icon" | "image";
  is_active: boolean;
};

function CategoryVisual({ category, kind }: { category: SiteCategory; kind: SiteCategoryKind }) {
  const { url } = useMediaUrl(category.image_media_id);
  const Icon = category.icon ? publicIcon(category.icon) : kind === "products" ? Package : Wrench;
  return <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#edf3ff] text-[var(--art-primary)]">
    {url ? <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" />
      : parseMaterialIcon(category.icon) ? <MaterialSymbol icon={category.icon!} size={22}/>
      : <Icon size={19} strokeWidth={1.8}/> }
  </span>;
}

const newForm = (kind: SiteCategoryKind, sortOrder: number): CategoryForm => ({
  name: "", sort_order: String(sortOrder),
  icon: kind === "products" ? "package" : "wrench",
  image_media_id: "", visual: "icon", is_active: true,
});

const formFor = (category: SiteCategory, kind: SiteCategoryKind): CategoryForm => ({
  name: category.name,
  sort_order: String(category.sort_order ?? 0),
  icon: category.icon || (kind === "products" ? "package" : "wrench"),
  image_media_id: category.image_media_id || "",
  visual: category.image_media_id ? "image" : "icon",
  is_active: category.is_active,
});

export function TabCategories({
  onBack, routeResourceId, routeSubpage, onRouteChange,
}: {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
}) {
  const { hasPermission } = useAuth();
  const canViewTable = hasPermission("categories.table.view");
  const canViewDetails = hasPermission("categories.details.view");
  const canCreate = hasPermission("categories.create");
  const canEdit = hasPermission("categories.update");
  const canDelete = hasPermission("categories.delete");
  const canToggleActive = hasPermission("categories.toggle_active");
  const showName = hasPermission("categories.table.name");
  const showSortOrder = hasPermission("categories.table.sort_order");
  const showStatus = hasPermission("categories.table.status");
  const showActions = hasPermission("categories.table.actions");
  const canLoad = canViewTable || canViewDetails || canCreate || canEdit;
  const queryClient = useQueryClient();

  const productQuery = useQuery({
    queryKey: ["catalog", "site-product-categories"],
    queryFn: () => listCategories("products"), enabled: canLoad,
    staleTime: REFERENCE_DATA_CACHE_TIME, gcTime: REFERENCE_DATA_CACHE_TIME,
  });
  const serviceQuery = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: () => listCategories("services"), enabled: canLoad,
    staleTime: REFERENCE_DATA_CACHE_TIME, gcTime: REFERENCE_DATA_CACHE_TIME,
  });
  const organizationQuery = useQuery({
    queryKey: ["organization", "artvideo-id"], queryFn: getArtVideoOrganizationId,
    enabled: canLoad, staleTime: Infinity,
  });

  const [kind, setKind] = useState<SiteCategoryKind>("products");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<SiteCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(() => newForm("products", 0));
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; sort_order?: string; image?: string }>({});
  const [delItem, setDelItem] = useState<SiteCategory | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const products = productQuery.data ?? [];
  const services = serviceQuery.data ?? [];
  const cats = kind === "products" ? products : services;
  const loading = kind === "products" ? productQuery.isPending : serviceQuery.isPending;
  const totalPages = Math.max(1, Math.ceil(cats.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCats = cats.slice((safePage - 1) * pageSize, safePage * pageSize);
  const label = kind === "products" ? "produtos" : "serviços";
  const iconLibrary = parseMaterialIcon(form.icon) ? "google" : "lucide";

  useEffect(() => {
    const error = productQuery.error || serviceQuery.error;
    if (error) setToast({ msg: "Erro ao carregar categorias: " + systemErrorMessage(error), type: "error" });
  }, [productQuery.error, serviceQuery.error]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.categories() }),
      queryClient.invalidateQueries({ queryKey: ["public-site", "product-categories"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]);
  };

  const openNew = (target: SiteCategoryKind = kind) => {
    if (!canCreate) return;
    const existing = target === "products" ? products : services;
    setKind(target);
    setFieldErrors({});
    setForm(newForm(target, existing.length ? Math.max(...existing.map(c => c.sort_order || 0)) + 10 : 0));
    setEditItem(null);
    setDrawerOpen(true);
  };
  const openEdit = (category: SiteCategory, target: SiteCategoryKind = kind) => {
    if (!(canViewDetails && canEdit)) return;
    setKind(target);
    setFieldErrors({});
    setForm(formFor(category, target));
    setEditItem(category);
    setDrawerOpen(true);
  };
  const closeEditor = () => {
    if (saving) return;
    setDrawerOpen(false);
    setEditItem(null);
    onRouteChange?.(null, null);
  };
  const openNewPage = () => {
    openNew();
    onRouteChange?.("new", null);
  };
  const openEditPage = (category: SiteCategory) => {
    openEdit(category);
    onRouteChange?.(category.id, "edit");
  };

  useEffect(() => {
    if (!routeResourceId) return;
    if (routeResourceId === "new") {
      if (!drawerOpen && canCreate) openNew();
      return;
    }
    if (!canViewDetails || !canEdit || routeSubpage !== "edit") return;
    const product = products.find(item => item.id === routeResourceId);
    const service = services.find(item => item.id === routeResourceId);
    const target = product ? "products" : "services";
    const item = product || service;
    if (item && (!drawerOpen || editItem?.id !== item.id)) openEdit(item, target);
  }, [routeResourceId, routeSubpage, products, services, drawerOpen, editItem?.id, canCreate, canViewDetails, canEdit]);

  const handleSave = async () => {
    if (!(editItem ? canEdit : canCreate) || saving) return;
    const sortOrder = Number(form.sort_order);
    const errors: typeof fieldErrors = {};
    if (!form.name.trim()) errors.name = "Informe o nome da categoria.";
    if (!Number.isInteger(sortOrder) || sortOrder < 0) errors.sort_order = "Informe uma ordem inteira igual ou maior que zero.";
    if (form.visual === "image" && !form.image_media_id) errors.image = "Escolha uma imagem ou selecione a opção Ícone.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const finalName = form.name.trim();
      const table = kind === "products" ? "product_categories" : "service_categories";
      const slug = editItem?.name === finalName && editItem.slug
        ? editItem.slug
        : await generateUniqueSlug(table, finalName, editItem?.id);
      const payload = {
        name: finalName, slug, sort_order: sortOrder, is_active: form.is_active,
        icon: form.icon, image_media_id: form.visual === "image" ? form.image_media_id : null,
      };
      if (editItem && Object.entries(payload).every(([key, value]) =>
        JSON.stringify(value ?? null) === JSON.stringify(editItem[key as keyof SiteCategory] ?? null))) {
        setDrawerOpen(false);
        setEditItem(null);
        onRouteChange?.(null, null);
        setToast({ msg: "Nenhuma alteração necessária.", type: "success" });
        return;
      }
      await saveCategory(payload, editItem?.id, kind);
      setDrawerOpen(false);
      setEditItem(null);
      onRouteChange?.(null, null);
      setToast({ msg: editItem ? "Categoria atualizada!" : "Categoria criada!", type: "success" });
      void refresh();
    } catch (error) {
      setToast({ msg: "Erro ao salvar categoria: " + systemErrorMessage(error), type: "error" });
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async () => {
    if (!delItem || !canDelete) return;
    try {
      await deleteCategory(delItem.id, kind);
      setDelItem(null);
      setToast({ msg: "Categoria excluída.", type: "success" });
      void refresh();
    } catch (error) {
      setToast({ msg: "Erro ao excluir categoria: " + systemErrorMessage(error), type: "error" });
    }
  };
  const toggleActive = async (category: SiteCategory) => {
    if (!canToggleActive) return;
    try {
      await setCategoryActive(category.id, !category.is_active, kind);
      setToast({ msg: "Status atualizado!", type: "success" });
      void refresh();
    } catch (error) {
      setToast({ msg: "Erro ao atualizar categoria: " + systemErrorMessage(error), type: "error" });
    }
  };

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delItem && <ConfirmDialog message={`Excluir a categoria "${delItem.name}"? Itens vinculados poderão perder a referência.`}
      onConfirm={handleDelete} onCancel={() => setDelItem(null)} />}
    {!routeResourceId && <>
      <PageHeader title="Categorias" subtitle="Personalize nome, ordem e ícone ou imagem das categorias exibidas no site."
        actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />
          {canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16}/> Nova categoria</AdminButton>}
        </div>} />
      <div role="tablist" aria-label="Tipo de categoria" className="flex items-center gap-5 border-b border-[#e4eaf2]">
        {([{ id: "products", title: "Produtos", Icon: Package }, { id: "services", title: "Serviços", Icon: Wrench }] as const).map(tab =>
          <button key={tab.id} type="button" role="tab" aria-selected={kind === tab.id}
            onClick={() => { setKind(tab.id); setPage(1); }}
            className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition-colors ${kind === tab.id
              ? "border-[var(--art-primary)] text-[var(--art-primary)]"
              : "border-transparent text-[#64748b] hover:text-[#21344d]"}`}>
            <tab.Icon size={17}/>{tab.title}
          </button>)}
      </div>
      {canViewTable && <AdminCard>
        {loading ? <LoadingState/> : cats.length === 0
          ? <EmptyState icon={FolderTree} title="Nenhuma categoria cadastrada"
              message={`Crie categorias para organizar os ${label} do site.`}
              onAdd={canCreate ? openNewPage : undefined} addLabel="Nova categoria" />
          : <><div className="overflow-x-auto">
              <table className="min-w-[570px]">
                <thead><tr>
                  {showName && <th className="text-left">Categoria</th>}
                  {showSortOrder && <th className="text-left">Ordem</th>}
                  {showStatus && <th className="text-left">Status</th>}
                  {showActions && <th className="text-right">Ações</th>}
                </tr></thead>
                <tbody>{pagedCats.map(c => <tr key={c.id}>
                  {showName && <td><div className="flex items-center gap-3"><CategoryVisual category={c} kind={kind}/>
                    <span className="font-semibold text-[#0d1b2e]">{c.name}</span></div></td>}
                  {showSortOrder && <td className="text-xs text-[#5a6a82]">{c.sort_order}</td>}
                  {showStatus && <td><StatusBadge status={c.is_active ? "Ativo" : "Inativo"}/></td>}
                  {showActions && <td><div className="flex items-center justify-end gap-1">
                    {canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar categoria" title="Editar" onClick={() => openEditPage(c)}><Edit2 size={15}/></AdminIconButton>}
                    {canDelete && <AdminIconButton ariaLabel="Excluir categoria" title="Excluir" variant="danger" onClick={() => setDelItem(c)}><Trash2 size={15}/></AdminIconButton>}
                    {canToggleActive && <AdminActiveStateButton active={c.is_active} entityLabel="categoria" onClick={() => toggleActive(c)}/>}
                  </div></td>}
                </tr>)}</tbody>
              </table>
            </div>
            <PaginationBar page={safePage} pageSize={pageSize} totalItems={cats.length}
              onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }}/>
          </>}
      </AdminCard>}
    </>}
    {routeResourceId && !drawerOpen && <AdminCard className="p-8"><LoadingState/></AdminCard>}
    <AdminPage open={drawerOpen} onClose={closeEditor}
      breadcrumb={`Categorias / ${kind === "products" ? "Produtos" : "Serviços"}`}
      title={editItem ? "Editar categoria" : "Nova categoria"} maxW="max-w-xl">
      <div className="space-y-4 p-4 sm:p-5">
        <Section title="Informações da categoria">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px]">
            <FInput label="Nome" value={form.name} required error={fieldErrors.name}
              onChange={(event: any) => { setForm(prev => ({ ...prev, name: event.target.value })); setFieldErrors(prev => ({ ...prev, name: undefined })); }}
              placeholder="Ex: Ar-condicionado"/>
            <FIntegerInput label="Ordem" value={form.sort_order} error={fieldErrors.sort_order}
              onChange={(event: any) => { setForm(prev => ({ ...prev, sort_order: event.target.value })); setFieldErrors(prev => ({ ...prev, sort_order: undefined })); }}/>
          </div>
        </Section>
        <Section title="Identidade visual" description="Use um ícone da biblioteca ou uma imagem personalizada. A escolha aparece nas categorias do site.">
          <div className="space-y-4">
            <FSelect label="Exibição" value={form.visual} options={[{value:"icon",label:"Ícone"},{value:"image",label:"Imagem"}]}
              onChange={(event: any) => setForm(prev => ({ ...prev, visual: event.target.value as "icon" | "image" }))}/>
            {form.visual === "icon" ? <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#475569]">Biblioteca de ícones</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving} aria-pressed={iconLibrary === "google"}
                    onClick={() => setForm(prev => ({ ...prev,
                      icon: parseMaterialIcon(prev.icon) ? prev.icon : "material-outlined:home_repair_service",
                    }))}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${iconLibrary === "google"
                      ? "border-[var(--art-primary)] bg-[#edf3ff] text-[var(--art-primary)]"
                      : "border-[#d9e2ed] text-[#526276] hover:bg-[#f7f9fc]"}`}>Google Material 3</button>
                  <button type="button" disabled={saving} aria-pressed={iconLibrary === "lucide"}
                    onClick={() => setForm(prev => ({ ...prev,
                      icon: parseMaterialIcon(prev.icon) ? (kind === "products" ? "package" : "wrench") : prev.icon,
                    }))}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${iconLibrary === "lucide"
                      ? "border-[var(--art-primary)] bg-[#edf3ff] text-[var(--art-primary)]"
                      : "border-[#d9e2ed] text-[#526276] hover:bg-[#f7f9fc]"}`}>Lucide (atual)</button>
                </div>
              </div>
              {iconLibrary === "google"
                ? <MaterialSymbolsPicker value={form.icon} disabled={saving}
                    onChange={icon => setForm(prev => ({ ...prev, icon }))}/>
                : <div className="flex items-end gap-3">
                    <div className="flex-1"><FSelect label="Ícone" value={form.icon}
                      options={PUBLIC_ICON_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
                      onChange={(event: any) => setForm(prev => ({ ...prev, icon: event.target.value }))}/></div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#edf3ff] text-[var(--art-primary)]">
                      {(() => { const Icon = publicIcon(form.icon); return <Icon size={22}/>; })()}
                    </span>
                  </div>}
            </div> : <div className="space-y-2">
              <ImageUpload bucket="public-assets" organizationId={organizationQuery.data}
                currentMediaId={form.image_media_id || null} label="Imagem da categoria"
                onUpload={mediaId => { setForm(prev => ({ ...prev, image_media_id: mediaId })); setFieldErrors(prev => ({ ...prev, image: undefined })); }}
                canUpload={Boolean(organizationQuery.data) && !saving && (editItem ? canEdit : canCreate)}/>
              {form.image_media_id && <button type="button" className="text-xs font-semibold text-red-600 hover:underline"
                onClick={() => setForm(prev => ({ ...prev, image_media_id: "" }))}>Remover imagem</button>}
              {fieldErrors.image && <p className="text-xs text-red-600">{fieldErrors.image}</p>}
            </div>}
          </div>
        </Section>
        <Section title="Publicação">
          <FToggle label="Categoria ativa" description="Categorias inativas ficam ocultas nas vitrines públicas."
            checked={form.is_active} onChange={value => setForm(prev => ({ ...prev, is_active: value }))}/>
        </Section>
      </div>
      <AdminStickyToolbar className="justify-end">
        <BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>
        {(editItem ? canEdit : canCreate) && <BtnPrimary onClick={handleSave} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </AdminStickyToolbar>
    </AdminPage>
  </div>;
}
