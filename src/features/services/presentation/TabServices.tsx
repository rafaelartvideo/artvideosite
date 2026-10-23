import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Activity, DollarSign, Edit2, FileText, HelpCircle, List, Plus, Star, Trash2, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import { deleteService, loadServicesCatalog, saveServiceAggregate, setServiceActive } from "../infrastructure/services.repository";
import { AdminCard, AdminIconButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { cn } from "@/shared/domain/formatters";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FIntegerInput, FSelect, FTextarea, FToggle, INPUT, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { RichTextContent, RichTextEditor } from "@/shared/ui/admin/RichTextEditor";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { ServiceBookingSettings } from "./ServiceBookingSettings";
import { bookingConfig, validateBookingConfig } from "@/features/public-services/domain/service-booking.mjs";
import { SiteImportWizard } from "./SiteImportWizard";

export function TabServices({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("services.view");
  const canViewTable = hasPermission("services.table.view");
  const canViewDetails = hasPermission("services.details.view");
  const canCreate = hasPermission("services.create");
  const canUpdate = hasPermission("services.update");
  const canDelete = hasPermission("services.delete");
  const canToggleActive = hasPermission("services.toggle_active");
  const showService = hasPermission("services.table.service");
  const showCategory = hasPermission("services.table.category");
  const showVariants = hasPermission("services.table.variants");
  const showFeatured = hasPermission("services.table.featured");
  const showStatus = hasPermission("services.table.status");
  const showActions = hasPermission("services.table.actions");
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: queryKeys.catalog.services(), queryFn: loadServicesCatalog, enabled: canView, staleTime: REFERENCE_DATA_CACHE_TIME, gcTime: REFERENCE_DATA_CACHE_TIME });
  const services = catalogQuery.data?.services ?? [];
  const categories = catalogQuery.data?.categories ?? [];
  const brands = catalogQuery.data?.brands ?? [];
  const products = catalogQuery.data?.products ?? [];
  const loading = catalogQuery.isPending;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => { if (catalogQuery.error) setToast({ msg: `Erro ao carregar serviços: ${systemErrorMessage(catalogQuery.error)}`, type: "error" }); }, [catalogQuery.error]);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.services() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.services() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboards() }),
  ]);
  // Atualiza o cache após salvar. Evita baixar novamente o catálogo inteiro para reabrir o editor.
  const handleSaved = (serviceId: string, changes: Record<string, unknown>) => {
    queryClient.setQueryData(queryKeys.catalog.services(), (current: any) => {
      if (!current) return current;
      const previous = (current.services ?? []) as any[];
      const index = previous.findIndex((service: any) => service.id === serviceId);
      const service = { ...(index >= 0 ? previous[index] : {}), id: serviceId, ...changes };
      return { ...current, services: index >= 0
        ? previous.map((entry: any, i: number) => i === index ? service : entry)
        : [...previous, service] };
    });
    // Marcar como desatualizado sem forçar uma consulta pesada enquanto o formulário fecha.
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.services(), refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.services() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboards() });
  };
  const openNew = () => { if (!canCreate) return; setEditItem(null); setDrawerOpen(true); };
  const openEdit = (service: any) => { if (!(canViewDetails && canUpdate)) return; setEditItem(service); setDrawerOpen(true); };
  const closeEditor = () => { setDrawerOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => { openNew(); onRouteChange?.("new", null); };
  const openEditPage = (item: any) => { if (!(canViewDetails && canUpdate)) return; openEdit(item); onRouteChange?.(item.id, "edit"); };

  useEffect(() => { if (!routeResourceId) { if (drawerOpen) setDrawerOpen(false); return; } if (routeResourceId === "new") { if (canCreate && (!drawerOpen || editItem)) openNew(); return; } if (!(canViewDetails && canUpdate) || routeSubpage !== "edit" || editItem?.id === routeResourceId) return; const item = services.find((entry: any) => entry.id === routeResourceId); if (item) openEdit(item); }, [routeResourceId, routeSubpage, services, drawerOpen, editItem?.id, canCreate, canViewDetails, canUpdate]);
  const handleDelete = async (id: string) => { if (!canDelete) return; try { await deleteService(id); setDelId(null); setToast({ msg: "Serviço excluído com sucesso.", type: "success" }); void refresh(); } catch (error) { setToast({ msg: `Erro ao excluir: ${systemErrorMessage(error)}`, type: "error" }); } };
  const toggleActive = async (service: any) => {
    if (!canToggleActive) return;
    const nextActive = !service.is_active;
    try {
      await setServiceActive(service.id, nextActive);
      queryClient.setQueryData(queryKeys.catalog.services(), (current: any) => current
        ? { ...current, services: (current.services ?? []).map((item: any) => item.id === service.id
          ? { ...item, is_active: nextActive, show_in_catalog: nextActive } : item) }
        : current);
      setToast({ msg: nextActive ? "Serviço ativado." : "Serviço desativado.", type: "success" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.services() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.services(), refetchType: "none" });
    } catch (error) { setToast({ msg: `Erro ao atualizar: ${systemErrorMessage(error)}`, type: "error" }); }
  };

  const sortedServices = [...services].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "pt-BR", { sensitivity: "base" }));
  const totalPages = Math.max(1, Math.ceil(sortedServices.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedServices = sortedServices.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  if (!canView) return null;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Excluir este serviço e todos os dados associados?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}
    {!routeResourceId && <>
      <PageHeader title="Serviços do Site" subtitle={`${services.length} serviço${services.length !== 1 ? "s" : ""} cadastrado${services.length !== 1 ? "s" : ""}`} />
      {canViewTable && <AdminCard>
        {loading ? <LoadingState /> : sortedServices.length === 0 ? <EmptyState icon={Wrench} title="Nenhum serviço cadastrado" message="Clique em Novo para começar." /> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr>{showService && <th className="text-left">Serviço</th>}{showCategory && <th className="text-left">Categoria</th>}{showVariants && <th className="text-left">Variações</th>}{showFeatured && <th className="text-left">Destaque</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedServices.map(service => { const category = categories.find(item => item.id === service.category_id); return <tr key={service.id}>{showService && <td><p className="font-bold text-[#0d1b2e]">{service.title}</p>{service.short_description && <p className="max-w-xs truncate text-xs text-[#5a6a82]">{service.short_description}</p>}</td>}{showCategory && <td className="text-xs text-[#5a6a82]">{category?.name || "—"}</td>}{showVariants && <td className="text-xs text-[#5a6a82]">{service.service_variants?.length || 0}</td>}{showFeatured && <td>{service.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <span className="text-xs text-[#5a6a82]">—</span>}</td>}{showStatus && <td><StatusBadge status={service.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canViewDetails && canUpdate && <AdminIconButton ariaLabel="Editar serviço" title="Editar" onClick={() => openEditPage(service)}><Edit2 size={15} /></AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir serviço" title="Excluir" variant="danger" onClick={() => setDelId(service.id)}><Trash2 size={15} /></AdminIconButton>}{canToggleActive && <AdminActiveStateButton active={service.is_active} entityLabel="serviço" onClick={() => toggleActive(service)} />}</div></td>}</tr>; })}</tbody></table></div>}
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={sortedServices.length} onPageChange={next => setPage(Math.max(1, Math.min(next, totalPages)))} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </AdminCard>}
      <AdminStickyToolbar className="justify-between">
        <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
        {canCreate && <div className="flex flex-wrap items-center gap-2"><BtnSecondary onClick={() => setImportOpen(true)}>Importar de site</BtnSecondary><BtnPrimary onClick={openNewPage}>Novo</BtnPrimary></div>}
      </AdminStickyToolbar>
    </>}
    {routeResourceId && !drawerOpen && (
      <AdminCard className="p-8">{catalogQuery.isPending
        ? <LoadingState />
        : <p className="text-sm text-muted-foreground">{catalogQuery.error ? "Não foi possível carregar os serviços." : "Serviço não encontrado."}</p>}
      </AdminCard>
    )}
    {importOpen && <SiteImportWizard onClose={() => setImportOpen(false)} onImported={() => void refresh()} services={services} products={products} categories={categories} />}
    <ServiceDrawer open={drawerOpen} onClose={closeEditor} onSaved={handleSaved} editItem={editItem} categories={categories} brands={brands} products={products} userId={user?.id || null} onToast={setToast} />
  </div>;
}

function ServiceDrawer({ open, onClose, onSaved, editItem, categories, brands, products, userId, onToast }: { open: boolean; onClose: () => void; onSaved: (serviceId: string, changes: Record<string, unknown>) => void; editItem: any | null; categories: any[]; brands: any[]; products: any[]; userId: string | null; onToast: (toast: { msg: string; type: "success" | "error" }) => void }) {
  const { hasPermission } = useAuth();
  const creating = !editItem;
  const canCreate = hasPermission("services.create");
  const canEditAll = !creating && hasPermission("services.update");
  const canInfo = creating ? canCreate : canEditAll || hasPermission("services.info.manage");
  const canPrice = creating ? canCreate : canEditAll || hasPermission("services.price.manage");
  const canMedia = creating ? canCreate : canEditAll || hasPermission("services.media.manage");
  const canVariants = creating ? canCreate : canEditAll || hasPermission("services.variants.manage");
  const canFeatures = creating ? canCreate : canEditAll || hasPermission("services.features.manage");
  const canExclusions = creating ? canCreate : canEditAll || hasPermission("services.exclusions.manage");
  const canFactors = creating ? canCreate : canEditAll || hasPermission("services.factors.manage");
  const canFaq = creating ? canCreate : canEditAll || hasPermission("services.faq.manage");
  const canSections = creating ? canCreate : canEditAll || hasPermission("services.sections.manage");
  const canPublication = creating ? canCreate : canEditAll || hasPermission("services.publication.manage");
  const canToggleActive = creating ? canCreate : canEditAll || hasPermission("services.toggle_active");
  const canSave = creating ? canCreate : [canInfo, canPrice, canMedia, canVariants, canFeatures, canExclusions, canFactors, canFaq, canSections, canPublication, canToggleActive].some(Boolean);

  const [booking, setBooking] = useState<any>(bookingConfig(null));
  const [tab, setTab] = useState("info");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [categoryId, setCategoryId] = useState(""); const [brandId, setBrandId] = useState(""); const [productId, setProductId] = useState(""); const [coverMediaId, setCoverMediaId] = useState(""); const [shortDesc, setShortDesc] = useState(""); const [description, setDescription] = useState(""); const [basePrice, setBasePrice] = useState("");
  const [priceMode, setPriceMode] = useState<"FIXED" | "STARTING_FROM" | "QUOTE" | "HIDDEN">("QUOTE"); const [active, setActive] = useState(true); const [featured, setFeatured] = useState(false); const [sortOrder, setSortOrder] = useState(0);
  const [variants, setVariants] = useState<{ title: string; description: string; price: string }[]>([]); const [features, setFeatures] = useState<string[]>([]); const [exclusions, setExclusions] = useState<string[]>([]); const [priceFactors, setPriceFactors] = useState<{ name: string; description: string; impact: "increase" | "decrease"; amount: string; unit: string }[]>([]); const [sections, setSections] = useState<{ title: string; content: string }[]>([]); const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    basePrice?: string;
    sortOrder?: string;
    variants?: Record<number, { title?: string; price?: string }>;
    factors?: Record<number, { name?: string; amount?: string }>;
  }>({});

  const availableTabs = useMemo(() => [
    { id: "info", label: "Informações", icon: List, visible: canInfo || canMedia || canToggleActive || canPublication },
    { id: "price", label: "Preço", icon: DollarSign, visible: canPrice || canVariants },
    { id: "features", label: "Incluso", icon: CheckCircle, visible: canFeatures },
    { id: "exclusions", label: "Não incluso", icon: X, visible: canExclusions },
    { id: "factors", label: "Fatores", icon: Activity, visible: canFactors },
    { id: "faq", label: "FAQ", icon: HelpCircle, visible: canFaq },
    { id: "sections", label: "Seções", icon: FileText, visible: canSections },
    { id: "booking", label: "Atendimento e orientações", icon: FileText, visible: canInfo },
  ].filter(item => item.visible), [canInfo, canMedia, canPrice, canVariants, canFeatures, canExclusions, canFactors, canFaq, canSections, canPublication, canToggleActive]);

  useEffect(() => {
    if (!open) return;
    const firstTab = availableTabs[0]?.id || "info";
    setTab(firstTab);
    setFieldErrors({});
    setBooking(bookingConfig(editItem?.public_booking));
    if (editItem) {
      setName(editItem.title || ""); setCategoryId(editItem.category_id || ""); setBrandId(editItem.brand_id || ""); setProductId(editItem.product_id || ""); setCoverMediaId(editItem.cover_media_id || ""); setShortDesc(editItem.short_description || ""); setDescription(editItem.description || ""); setBasePrice(editItem.base_price == null ? "" : String(editItem.base_price)); setPriceMode(["FIXED", "STARTING_FROM", "QUOTE", "HIDDEN"].includes(editItem.price_mode) ? editItem.price_mode : "QUOTE"); setActive(editItem.is_active ?? true); setFeatured(editItem.is_featured ?? false); setSortOrder(editItem.sort_order ?? 0);
      setVariants((editItem.service_variants || []).map((item: any) => ({ title: item.title || "", description: item.description || "", price: item.price == null ? "" : String(item.price) }))); setFeatures((editItem.service_inclusions || []).map((item: any) => item.description || "")); setExclusions((editItem.service_exclusions || []).map((item: any) => item.description || "")); setPriceFactors((editItem.service_price_factors || []).map((item: any) => ({ name: item.name || "", description: item.description || "", impact: item.impact || "increase", amount: item.amount == null ? "" : String(item.amount), unit: item.unit || "" }))); setSections((editItem.service_sections || []).map((item: any) => ({ title: item.title || "", content: item.content || "" }))); setFaqs((editItem.service_faqs || []).map((item: any) => ({ question: item.question || "", answer: item.answer || "" })));
    } else {
      setName(""); setCategoryId(""); setBrandId(""); setProductId(""); setCoverMediaId(""); setShortDesc(""); setDescription(""); setBasePrice(""); setPriceMode("QUOTE"); setActive(true); setFeatured(false); setSortOrder(0); setVariants([]); setFeatures([]); setExclusions([]); setPriceFactors([]); setSections([]); setFaqs([]);
    }
  }, [open, editItem, availableTabs]);

  const handleSave = async () => {
    if (!canSave) return;
    const bookingError = canInfo ? validateBookingConfig(booking) : null;
    if (bookingError) { setTab("booking"); onToast({msg:bookingError,type:"error"}); return; }
    const parsedBasePrice = basePrice === "" ? null : Number(basePrice);
    const nextErrors: typeof fieldErrors = {};
    if (canInfo && !name.trim()) nextErrors.name = "Nome do serviço é obrigatório.";
    if (canPrice && parsedBasePrice !== null && (!Number.isFinite(parsedBasePrice) || parsedBasePrice < 0)) nextErrors.basePrice = "Informe um preço base válido e não negativo.";
    if (canPrice && (priceMode === "FIXED" || priceMode === "STARTING_FROM") && parsedBasePrice === null) nextErrors.basePrice = "Informe o preço base para o modo de preço selecionado.";

    const variantErrors: Record<number, { title?: string; price?: string }> = {};
    if (canVariants) variants.forEach((variant, index) => {
      const row: { title?: string; price?: string } = {};
      if (!variant.title.trim()) row.title = "Informe o título da variação.";
      if (variant.price !== "") {
        const price = Number(variant.price);
        if (!Number.isFinite(price) || price < 0) row.price = "Informe um preço válido e não negativo.";
      }
      if (Object.keys(row).length) variantErrors[index] = row;
    });
    if (Object.keys(variantErrors).length) nextErrors.variants = variantErrors;

    const factorErrors: Record<number, { name?: string; amount?: string }> = {};
    if (canFactors) priceFactors.forEach((factor, index) => {
      const row: { name?: string; amount?: string } = {};
      if (!factor.name.trim()) row.name = "Informe o título do fator.";
      if (factor.amount !== "") {
        const amount = Number(factor.amount);
        if (!Number.isFinite(amount) || amount < 0) row.amount = "Informe um valor válido e não negativo.";
      }
      if (Object.keys(row).length) factorErrors[index] = row;
    });
    if (Object.keys(factorErrors).length) nextErrors.factors = factorErrors;

    if (canPublication && (!Number.isInteger(Number(sortOrder)) || Number(sortOrder) < 0)) nextErrors.sortOrder = "A ordem de exibição deve ser um número inteiro não negativo.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.name) setTab("info");
      else if (nextErrors.basePrice || nextErrors.variants) setTab("price");
      else if (nextErrors.factors) setTab("factors");
      else if (nextErrors.sortOrder) setTab("info");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (canInfo) payload.public_booking = {...booking, blocked_dates:booking.blocked_dates.filter(Boolean), orientations:booking.orientations.filter((v:any)=>v.title.trim() && v.content.trim()), testimonials:(Array.isArray(booking.testimonials)?booking.testimonials:[]).filter((v:any)=>v.name?.trim() && v.text?.trim())};
      if (canInfo) {
        const shouldRename = !editItem || (name.trim() !== editItem.title && !editItem.general_service_id);
        const finalSlug = shouldRename ? await generateUniqueSlug("services", name, editItem?.id) : editItem?.slug;
        Object.assign(payload, { ...(!editItem?.general_service_id ? { title: name.trim(), slug: finalSlug } : {}), category_id: categoryId || null, brand_id: brandId || null, product_id: productId || null, short_description: shortDesc.trim() || null, description: description.trim() || null });
      }
      if (canMedia) payload.cover_media_id = coverMediaId || null;
      if (canPrice && !editItem?.general_service_id) Object.assign(payload, { base_price: parsedBasePrice, price_mode: priceMode });
      if (canPublication) Object.assign(payload, { is_featured: featured, sort_order: Number(sortOrder) });
      if (creating || canToggleActive) Object.assign(payload, { is_active: active, show_in_catalog: active });
      // Não regrave relações que não foram alteradas. Antes isso disparava até 12
      // chamadas extras ao banco em toda edição, inclusive para mudar uma palavra.
      const differs = (before: unknown[], after: unknown[]) => JSON.stringify(before) !== JSON.stringify(after);
      const oldVariants = (editItem?.service_variants ?? []).map((v: any) => [v.title || "", v.description || "", v.price == null ? "" : String(Number(v.price))]);
      const nextVariants = variants.map(v => [v.title, v.description, v.price === "" ? "" : String(Number(v.price))]);
      const oldInclusions = (editItem?.service_inclusions ?? []).map((v: any) => v.description || "").filter(Boolean);
      const oldExclusions = (editItem?.service_exclusions ?? []).map((v: any) => v.description || "").filter(Boolean);
      const oldFactors = (editItem?.service_price_factors ?? []).map((v: any) => [v.name || "", v.description || "", v.impact || "increase", String(Number(v.amount || 0)), v.unit || ""]);
      const nextFactors = priceFactors.filter(v => v.name.trim()).map(v => [v.name.trim(), v.description || "", v.impact, String(Number(v.amount || 0)), v.unit || ""]);
      const oldSections = (editItem?.service_sections ?? []).map((v: any) => [v.title?.trim() || "", v.content?.trim() || ""]).filter((v: string[]) => v[0] && v[1]);
      const nextSections = sections.map(v => [v.title.trim(), v.content.trim()]).filter(v => v[0] && v[1]);
      const oldFaqs = (editItem?.service_faqs ?? []).map((v: any) => [v.question || "", v.answer || ""]).filter((v: string[]) => v[0]);
      const nextFaqs = faqs.map(v => [v.question, v.answer]).filter(v => v[0]);
      const scope = creating ? undefined : {
        variants: canVariants && differs(oldVariants, nextVariants),
        inclusions: canFeatures && differs(oldInclusions, features.filter(Boolean)),
        exclusions: canExclusions && differs(oldExclusions, exclusions.filter(Boolean)),
        priceFactors: canFactors && differs(oldFactors, nextFactors),
        sections: canSections && differs(oldSections, nextSections),
        faqs: canFaq && differs(oldFaqs, nextFaqs),
      };
      if (!creating && canInfo && JSON.stringify(bookingConfig(editItem?.public_booking)) === JSON.stringify(booking)) {
        delete payload.public_booking;
      }
      if (!creating) {
        for (const key of Object.keys(payload)) {
          if (key === "public_booking") continue;
          if (JSON.stringify(payload[key] ?? null) === JSON.stringify(editItem?.[key] ?? null)) delete payload[key];
        }
        if (Object.keys(payload).length) payload.updated_by = userId;
      }
      const savedId = await saveServiceAggregate({
        serviceId: editItem?.id, payload, userId, variants, inclusions: features,
        exclusions, priceFactors, sections, faqs, scope,
      });
      const savedData: Record<string, unknown> = { ...payload };
      if (creating || scope?.variants) savedData.service_variants = variants.map((v,i) => ({ ...v, price: v.price === "" ? null : Number(v.price), sort_order:i, is_active:true }));
      if (creating || scope?.inclusions) savedData.service_inclusions = features.filter(Boolean).map((description,i) => ({ description, sort_order:i }));
      if (creating || scope?.exclusions) savedData.service_exclusions = exclusions.filter(Boolean).map((description,i) => ({ description, sort_order:i }));
      if (creating || scope?.priceFactors) savedData.service_price_factors = priceFactors.filter(v => v.name.trim()).map((v,i) => ({ ...v, amount:Number(v.amount)||0, sort_order:i }));
      if (creating || scope?.sections) savedData.service_sections = sections.filter(v => v.title.trim() && v.content.trim()).map((v,i) => ({ ...v, sort_order:i }));
      if (creating || scope?.faqs) savedData.service_faqs = faqs.filter(v => v.question).map((v,i) => ({ ...v, sort_order:i, is_active:true }));
      if (creating) {
        savedData.title = name.trim();
        savedData.public_booking = payload.public_booking ?? booking;
        savedData.is_active = active;
        savedData.show_in_catalog = active;
      }
      onSaved(savedId, savedData);
      onToast({ msg: editItem ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!", type: "success" });
      onClose();
    } catch (error) { onToast({ msg: `Erro ao salvar: ${systemErrorMessage(error, "Erro desconhecido")}`, type: "error" }); }
    finally { setSaving(false); }
  };

  const tabGuidance: Record<string, string> = {
    info: "Defina como o serviço aparece na busca e na página do site. Comece pelo nome, descrição e imagem.",
    price: "Configure a forma de cobrança e, se precisar, cadastre diferentes opções ou variações.",
    features: "Liste os itens incluídos no atendimento para que o cliente saiba o que receberá.",
    exclusions: "Esclareça o que não está incluído para evitar dúvidas antes do orçamento.",
    factors: "Explique situações que podem alterar o preço do serviço.",
    faq: "Cadastre perguntas e respostas que aparecerão na página pública do serviço.",
    sections: "Crie blocos extras de conteúdo, como requisitos, condições ou informações importantes.",
    booking: "Configure atendimento, disponibilidade, orientações e conteúdo complementar.",
  };
  const tabCounts: Record<string, number> = {
    price: variants.length, features: features.length, exclusions: exclusions.length,
    factors: priceFactors.length, faq: faqs.length, sections: sections.length,
  };
  const currentTab = availableTabs.find(item => item.id === tab);
  const currentTabIndex = availableTabs.findIndex(item => item.id === tab);

  const catOptions = [{ value: "", label: "Selecionar categoria..." }, ...categories.map(item => ({ value: item.id, label: item.name }))];
  const brandOptions = [{ value: "", label: "Sem marca" }, ...brands.map(item => ({ value: item.id, label: item.name }))];
  const productOptions = [{ value: "", label: "Sem produto vinculado" }, ...products.map(item => ({ value: item.id, label: item.name }))];

  return <AdminPage open={open && canSave} onClose={onClose} breadcrumb="Serviços" title={editItem ? `Editar: ${editItem.title}` : "Novo serviço"} subtitle="Configure o serviço e todas as informações exibidas no site." maxW="max-w-5xl">
    <nav aria-label="Seções do cadastro do serviço" className="sticky top-0 z-10 border-b border-[#dfe6ee] bg-white px-4 py-3 sm:px-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {availableTabs.map(item => {
          const Icon = item.icon;
          const selected = tab === item.id;
          const count = tabCounts[item.id];
          return <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={selected ? "step" : undefined}
            className={cn("flex min-h-[48px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-medium transition-colors",
              selected ? "border-primary bg-primary/5 text-primary" : "border-[#e1e7ef] bg-white text-[#52647c] hover:border-primary/40 hover:bg-[#f8faff]")}>
            <Icon size={17} className="shrink-0"/>
            <span className="min-w-0 flex-1 leading-4">{item.label}</span>
            {count !== undefined && <span className={cn("min-w-5 rounded px-1.5 py-0.5 text-center text-[10px]", selected ? "bg-primary/10 text-primary" : "bg-[#edf2f7] text-[#65758b]")}>{count}</span>}
          </button>;
        })}
      </div>
    </nav>
    <div className="border-b border-[#e5eaf0] bg-[#f8fafc] px-5 py-4 sm:px-7">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold text-[#172b45]">{currentTab?.label || "Cadastro"}</h3>
        <span className="text-[11px] font-medium text-[#718096]">{currentTabIndex + 1} de {availableTabs.length} seções</span>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-[#68788c]">{tabGuidance[tab]}</p>
    </div>
    <div className="space-y-6 p-5 sm:p-7">
      {tab === "info" && <>{canInfo && <><Section title="Identificação"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><FInput label="Nome do Serviço" value={name} required disabled={Boolean(editItem?.general_service_id)} error={fieldErrors.name} onChange={(event: any) => { setFieldErrors(current => ({ ...current, name: undefined })); setName(event.target.value); }} /></div><FSelect label="Categoria" value={categoryId} onChange={(event: any) => setCategoryId(event.target.value)} options={catOptions} /><FSelect label="Marca" value={brandId} onChange={(event: any) => setBrandId(event.target.value)} options={brandOptions} /><FSelect label="Produto relacionado" value={productId} onChange={(event: any) => setProductId(event.target.value)} options={productOptions} /></div></Section><Section title="Descrição"><div className="space-y-4"><div><FTextarea label="Descrição curta" value={shortDesc} onChange={(event: any) => setShortDesc(event.target.value)} rows={2} /><p className="mt-1 text-[11px] text-muted-foreground">Resumo que aparece nos cartões e na apresentação do serviço.</p></div><div><RichTextEditor label="Descrição completa" value={description} onChange={setDescription} minHeight={180} /><p className="mt-1 text-[11px] text-muted-foreground">Explique como funciona o atendimento, para quem é indicado e as principais condições.</p></div></div></Section></>}{canMedia && <Section title="Imagem de capa"><ImageUpload bucket="service-images" currentMediaId={coverMediaId} onUpload={setCoverMediaId} canUpload label="Imagem do serviço" /></Section>}</>}
      {tab === "info" && (canToggleActive || canPublication || creating) && <Section title="Visibilidade e apresentação">
        <div className="grid gap-4 sm:grid-cols-2">
          {(canToggleActive || creating) && <FToggle label="Serviço ativo" description="Ativo aparece no site; inativo fica oculto." checked={active} onChange={setActive} />}
          {canPublication && <FToggle label="Destaque" description="Destacar na página inicial." checked={featured} onChange={setFeatured} />}
          {canPublication && <FIntegerInput label="Ordem de exibição" value={String(sortOrder)} onChange={(event: any) => setSortOrder(Number(event.target.value || 0))} />}
        </div>
      </Section>}
      {tab === "info" && canInfo && <div className="rounded-xl border border-[#dae4f0] bg-[#f7faff] p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#718096]">Prévia dos textos do serviço</p>
        <h4 className="text-[18px] font-semibold text-[#172b45]">{name.trim() || "Nome do serviço"}</h4>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-6 text-[#62738a]">{shortDesc.trim() || "A descrição curta aparecerá aqui conforme você digitar."}</p>
        {description.trim() && <RichTextContent className="mt-3 max-h-32 overflow-hidden border-t border-[#e1e8f2] pt-3 text-[12px] leading-6 text-[#68788c]" value={description}/>}
      </div>}
      {tab === "price" && <>{canPrice && <Section title="Preço base"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FCurrencyInput label="Preço base (R$)" disabled={Boolean(editItem?.general_service_id)} value={basePrice} error={fieldErrors.basePrice} onChange={(event: any) => { setFieldErrors(current => ({ ...current, basePrice: undefined })); setBasePrice(event.target.value); }} /><FSelect label="Modo de preço" disabled={Boolean(editItem?.general_service_id)} value={priceMode} onChange={(event: any) => setPriceMode(event.target.value)} options={[{ value: "FIXED", label: "Preço fixo" }, { value: "STARTING_FROM", label: "Preço a partir de" }, { value: "QUOTE", label: "Consultar orçamento" }, { value: "HIDDEN", label: "Não exibir preço" }]} /></div></Section>}{canVariants && <Section title="Variações de Preço">{variants.map((item, index) => <AdminCard key={index} className="mb-3 bg-[#f8fafc] p-3 shadow-none"><div className="flex items-start gap-3"><div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3"><FInput label="Título" value={item.title} error={fieldErrors.variants?.[index]?.title} onChange={(event: any) => { setFieldErrors(current => ({ ...current, variants: { ...current.variants, [index]: { ...current.variants?.[index], title: undefined } } })); setVariants(current => current.map((value, i) => i === index ? { ...value, title: event.target.value } : value)); }} /><FCurrencyInput label="Preço" value={item.price} error={fieldErrors.variants?.[index]?.price} onChange={(event: any) => { setFieldErrors(current => ({ ...current, variants: { ...current.variants, [index]: { ...current.variants?.[index], price: undefined } } })); setVariants(current => current.map((value, i) => i === index ? { ...value, price: event.target.value } : value)); }} /><FInput label="Descrição" value={item.description} onChange={(event: any) => setVariants(current => current.map((value, i) => i === index ? { ...value, description: event.target.value } : value))} /></div><button type="button" onClick={() => setVariants(current => current.filter((_, i) => i !== index))} className="p-1.5 text-red-400"><X size={15} /></button></div></AdminCard>)}<button type="button" onClick={() => setVariants(current => [...current, { title: "", description: "", price: "" }])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> Adicionar variação</button></Section>}</>}
      {tab === "booking" && canInfo && <ServiceBookingSettings value={booking} onChange={setBooking}/>}
      {tab === "features" && canFeatures && <StringListSection title="O que está incluso" values={features} setValues={setFeatures} icon={<CheckCircle size={14} className="text-emerald-500" />} addLabel="Adicionar item" />}
      {tab === "exclusions" && canExclusions && <StringListSection title="O que não está incluso" values={exclusions} setValues={setExclusions} icon={<X size={14} className="text-red-500" />} addLabel="Adicionar item" />}
      {tab === "factors" && canFactors && <Section title="Fatores que alteram preço">{priceFactors.map((item, index) => <AdminCard key={index} className="mb-3 bg-[#f8fafc] p-3 shadow-none"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FInput label="Título" value={item.name} error={fieldErrors.factors?.[index]?.name} onChange={(event: any) => { setFieldErrors(current => ({ ...current, factors: { ...current.factors, [index]: { ...current.factors?.[index], name: undefined } } })); setPriceFactors(current => current.map((value, i) => i === index ? { ...value, name: event.target.value } : value)); }} /><FSelect label="Impacto" value={item.impact} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, impact: event.target.value } : value))} options={[{ value: "increase", label: "Aumenta" }, { value: "decrease", label: "Reduz" }]} /><FCurrencyInput label="Valor" value={item.amount} error={fieldErrors.factors?.[index]?.amount} onChange={(event: any) => { setFieldErrors(current => ({ ...current, factors: { ...current.factors, [index]: { ...current.factors?.[index], amount: undefined } } })); setPriceFactors(current => current.map((value, i) => i === index ? { ...value, amount: event.target.value } : value)); }} /><FInput label="Unidade" value={item.unit} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, unit: event.target.value } : value))} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={item.description} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, description: event.target.value } : value))} rows={2} /></div><button type="button" onClick={() => setPriceFactors(current => current.filter((_, i) => i !== index))} className="text-xs font-bold text-red-600">Remover fator</button></div></AdminCard>)}<button type="button" onClick={() => setPriceFactors(current => [...current, { name: "", description: "", impact: "increase", amount: "", unit: "" }])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> Adicionar fator</button></Section>}
      {tab === "faq" && canFaq && <Section title="Perguntas frequentes">
        {faqs.length === 0 && <p className="mb-4 rounded-lg border border-dashed border-[#dce6ef] bg-[#f8fafc] p-5 text-center text-[12px] text-[#708198]">Nenhuma pergunta cadastrada. Adicione as dúvidas que os clientes costumam ter.</p>}
        <div className="space-y-4">{faqs.map((item,index)=><div key={index} className="rounded-xl border border-[#e0e7f0] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-[#42566f]">Pergunta {index+1}</span>
            <button type="button" aria-label={`Remover pergunta ${index+1}`} onClick={()=>setFaqs(current=>current.filter((_,i)=>i!==index))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"><X size={14}/> Remover</button>
          </div>
          <div className="space-y-4">
            <FInput label="Pergunta" value={item.question} onChange={(event:any)=>setFaqs(current=>current.map((value,i)=>i===index?{...value,question:event.target.value}:value))}/>
            <RichTextEditor label="Resposta" value={item.answer} onChange={(text)=>setFaqs(current=>current.map((value,i)=>i===index?{...value,answer:text}:value))} minHeight={120}/>
          </div>
        </div>)}</div>
        <button type="button" onClick={()=>setFaqs(current=>[...current,{question:"",answer:""}])} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/35 px-3 py-2 text-[12px] font-semibold text-primary hover:bg-primary/5"><Plus size={16}/> Adicionar pergunta</button>
      </Section>}
      {tab === "sections" && canSections && <Section title="Seções personalizadas">
        {sections.length === 0 && <p className="mb-4 rounded-lg border border-dashed border-[#dce6ef] bg-[#f8fafc] p-5 text-center text-[12px] text-[#708198]">Nenhuma seção extra cadastrada. Você pode adicionar orientações, condições e outras informações úteis.</p>}
        <div className="space-y-4">{sections.map((item,index)=><div key={index} className="rounded-xl border border-[#e0e7f0] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-[#42566f]">Seção {index+1}</span>
            <button type="button" aria-label={`Remover seção ${index+1}`} onClick={()=>setSections(current=>current.filter((_,i)=>i!==index))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"><X size={14}/> Remover</button>
          </div>
          <div className="space-y-4">
            <FInput label="Título da seção" value={item.title} onChange={(event:any)=>setSections(current=>current.map((value,i)=>i===index?{...value,title:event.target.value}:value))}/>
            <RichTextEditor label="Conteúdo" value={item.content} onChange={(text)=>setSections(current=>current.map((value,i)=>i===index?{...value,content:text}:value))} minHeight={160}/>
          </div>
        </div>)}</div>
        <button type="button" onClick={()=>setSections(current=>[...current,{title:"",content:""}])} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/35 px-3 py-2 text-[12px] font-semibold text-primary hover:bg-primary/5"><Plus size={16}/> Adicionar seção</button>
      </Section>}
    </div>
    <AdminStickyToolbar className="flex-wrap justify-between gap-3 px-5 py-3 sm:px-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">Seção {currentTabIndex + 1} de {availableTabs.length}</span>
        {currentTabIndex < availableTabs.length - 1 && <button type="button" onClick={() => setTab(availableTabs[currentTabIndex + 1].id)}
          className="text-xs font-semibold text-primary hover:underline">Próxima seção →</button>}
      </div>
      <div className="flex items-center gap-3">
        <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
        {canSave && <BtnPrimary onClick={handleSave} loading={saving} loadingText="Salvando...">Salvar serviço</BtnPrimary>}
      </div>
    </AdminStickyToolbar>
  </AdminPage>;
}

function StringListSection({ title, values, setValues, icon, addLabel }: { title: string; values: string[]; setValues: React.Dispatch<React.SetStateAction<string[]>>; icon: React.ReactNode; addLabel: string }) {
  return <Section title={title}>
    {values.length === 0 && <div className="mb-4 rounded-lg border border-dashed border-[#d9e3f0] bg-[#f8fafc] px-4 py-5 text-center text-[12px] text-[#6c7e93]">
      Nenhum item cadastrado. Use o botão abaixo para adicionar o primeiro.
    </div>}
    <div className="space-y-2">
      {values.map((value, index) => <div key={index} className="flex items-center gap-3 rounded-lg border border-[#e3eaf1] bg-white p-2 sm:p-3">
        <div className="flex shrink-0 items-center gap-2">{icon}<span className="text-[11px] font-semibold text-[#7b8a9c]">{index + 1}</span></div>
        <input aria-label={`${title}: item ${index+1}`} value={value}
          placeholder="Descreva este item de forma clara..."
          onChange={event => setValues(current => current.map((item, i) => i === index ? event.target.value : item))}
          className={cn(INPUT, "min-w-0 flex-1 py-2 text-[13px]")}/>
        <button type="button" aria-label={`Remover item ${index+1}`} title="Remover item"
          onClick={() => setValues(current => current.filter((_, i) => i !== index))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#a14a54] hover:bg-red-50"><X size={16}/></button>
      </div>)}
    </div>
    <button type="button" onClick={() => setValues(current => [...current, ""])}
      className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/35 bg-primary/[.025] px-3 py-2 text-[12px] font-semibold text-primary hover:bg-primary/5">
      <Plus size={16}/>{addLabel}
    </button>
  </Section>;
}
