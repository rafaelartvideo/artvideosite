import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Clock, Activity, DollarSign, Edit2, FileText, HelpCircle, List, Plus, Search, Star, Trash2, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteService, findUniqueServiceSlug, loadServicesCatalog, saveServiceAggregate, setServiceActive } from "../infrastructure/services.repository";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { cn, slugify } from "@/shared/domain/formatters";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect, FTextarea, FToggle, INPUT, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function TabServices({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("services.view");
  const canViewTable = hasPermission("services.table.view");
  const canViewDetails = hasPermission("services.details.view");
  const canCreate = hasPermission("services.create");
  const canUpdate = hasPermission("services.update");
  const canDelete = hasPermission("services.delete");
  const canToggleActive = hasPermission("services.toggle_active");
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: queryKeys.catalog.services(), queryFn: loadServicesCatalog, enabled: canView });
  const services = catalogQuery.data?.services ?? [];
  const categories = catalogQuery.data?.categories ?? [];
  const brands = catalogQuery.data?.brands ?? [];
  const products = catalogQuery.data?.products ?? [];
  const loading = catalogQuery.isPending;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!catalogQuery.error) return;
    const message = catalogQuery.error instanceof Error ? catalogQuery.error.message : String(catalogQuery.error);
    setToast({ msg: `Erro ao carregar serviços: ${message}`, type: "error" });
  }, [catalogQuery.error]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.services() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard() }),
  ]);

  const openNew = () => { if (!canCreate) return; setEditItem(null); setDrawerOpen(true); };
  const openEdit = (service: any) => { if (!(canViewDetails && canUpdate)) return; setEditItem(service); setDrawerOpen(true); };
  const closeEditor = () => { setDrawerOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => onRouteChange ? onRouteChange("new", null) : openNew();
  const openEditPage = (item: any) => { if (!(canViewDetails && canUpdate)) return; onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item); };

  useEffect(() => {
    if (!routeResourceId) { if (drawerOpen) setDrawerOpen(false); return; }
    if (routeResourceId === "new") { if (canCreate && (!drawerOpen || editItem)) openNew(); return; }
    if (!(canViewDetails && canUpdate) || routeSubpage !== "edit" || editItem?.id === routeResourceId) return;
    const item = services.find((entry: any) => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, services, drawerOpen, editItem?.id, canCreate, canViewDetails, canUpdate]);

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    try { await deleteService(id); setDelId(null); setToast({ msg: "Serviço excluído com sucesso.", type: "success" }); await refresh(); }
    catch (error) { setToast({ msg: `Erro ao excluir: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
  };

  const toggleActive = async (service: any) => {
    if (!canToggleActive) return;
    try { await setServiceActive(service.id, !service.is_active); setToast({ msg: "Status atualizado com sucesso.", type: "success" }); await refresh(); }
    catch (error) { setToast({ msg: `Erro ao atualizar: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
  };

  const filtered = services.filter(service => !search || service.title?.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedServices = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  if (!canView) return null;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Excluir este serviço e todos os dados associados?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}
    <PageHeader title="Serviços do Site" subtitle={`${services.length} serviço${services.length !== 1 ? "s" : ""} cadastrado${services.length !== 1 ? "s" : ""}`} actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Novo serviço</AdminButton>}</div>} />

    {canViewTable && <AdminCard>
      <AdminCardToolbar><div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar serviços..." className={cn(INPUT, "pl-9 py-2 text-xs")} /></div></AdminCardToolbar>
      {loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Wrench} title={search ? "Nenhum resultado" : "Nenhum serviço cadastrado"} message={search ? `Nenhum serviço com "${search}"` : "Clique em Novo serviço para começar."} onAdd={!search && canCreate ? openNewPage : undefined} addLabel="Novo serviço" /> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b border-[#0d1b2e]/8 bg-[#f8fafc] text-[10px] font-bold uppercase text-[#5a6a82]"><tr><th className="px-4 py-3 text-left">Serviço</th><th className="px-4 py-3 text-left">Categoria</th><th className="px-4 py-3 text-left">Variações</th><th className="px-4 py-3 text-left">Destaque</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-[#0d1b2e]/5">{pagedServices.map(service => { const category = categories.find(item => item.id === service.category_id); return <tr key={service.id} className="transition-colors hover:bg-[#f8fafc]/80"><td className="px-4 py-3.5"><p className="font-bold text-[#0d1b2e]">{service.title}</p>{service.short_description && <p className="max-w-xs truncate text-xs text-[#5a6a82]">{service.short_description}</p>}</td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{category?.name || "—"}</td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{service.service_variants?.length || 0}</td><td className="px-4 py-3.5">{service.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <span className="text-xs text-[#5a6a82]">—</span>}</td><td className="px-4 py-3.5"><StatusBadge status={service.is_active ? "Ativo" : "Inativo"} /></td><td className="px-4 py-3.5"><div className="flex items-center justify-end gap-1">{canViewDetails && canUpdate && <AdminIconButton ariaLabel="Editar serviço" title="Editar" onClick={() => openEditPage(service)}><Edit2 size={15} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={service.is_active ? "Desativar serviço" : "Ativar serviço"} title={service.is_active ? "Desativar" : "Ativar"} onClick={() => toggleActive(service)}>{service.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir serviço" title="Excluir" variant="danger" onClick={() => setDelId(service.id)}><Trash2 size={15} /></AdminIconButton>}</div></td></tr>; })}</tbody></table></div>}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={next => setPage(Math.max(1, Math.min(next, totalPages)))} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
    </AdminCard>}

    <ServiceDrawer open={drawerOpen} onClose={() => { closeEditor(); void refresh(); }} editItem={editItem} categories={categories} brands={brands} products={products} userId={user?.id || null} onToast={setToast} />
  </div>;
}

function ServiceDrawer({ open, onClose, editItem, categories, brands, products, userId, onToast }: { open: boolean; onClose: () => void; editItem: any | null; categories: any[]; brands: any[]; products: any[]; userId: string | null; onToast: (toast: { msg: string; type: "success" | "error" }) => void }) {
  const { hasPermission } = useAuth();
  const creating = !editItem;
  const canCreate = hasPermission("services.create");
  const canInfo = creating ? canCreate : hasPermission("services.info.manage");
  const canPrice = creating ? canCreate : hasPermission("services.price.manage");
  const canMedia = creating ? canCreate : hasPermission("services.media.manage");
  const canVariants = creating ? canCreate : hasPermission("services.variants.manage");
  const canFeatures = creating ? canCreate : hasPermission("services.features.manage");
  const canExclusions = creating ? canCreate : hasPermission("services.exclusions.manage");
  const canFactors = creating ? canCreate : hasPermission("services.factors.manage");
  const canFaq = creating ? canCreate : hasPermission("services.faq.manage");
  const canSections = creating ? canCreate : hasPermission("services.sections.manage");
  const canPublication = creating ? canCreate : hasPermission("services.publication.manage");
  const canToggleActive = creating ? canCreate : hasPermission("services.toggle_active");
  const canSave = creating ? canCreate : [canInfo, canPrice, canMedia, canVariants, canFeatures, canExclusions, canFactors, canFaq, canSections, canPublication, canToggleActive].some(Boolean);

  const [tab, setTab] = useState("info");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [categoryId, setCategoryId] = useState(""); const [brandId, setBrandId] = useState(""); const [productId, setProductId] = useState(""); const [coverMediaId, setCoverMediaId] = useState(""); const [shortDesc, setShortDesc] = useState(""); const [description, setDescription] = useState(""); const [basePrice, setBasePrice] = useState("");
  const [priceMode, setPriceMode] = useState<"FIXED" | "STARTING_FROM" | "QUOTE" | "HIDDEN">("QUOTE"); const [active, setActive] = useState(true); const [featured, setFeatured] = useState(false); const [sortOrder, setSortOrder] = useState(0);
  const [variants, setVariants] = useState<{ title: string; description: string; price: string }[]>([]); const [features, setFeatures] = useState<string[]>([]); const [exclusions, setExclusions] = useState<string[]>([]); const [priceFactors, setPriceFactors] = useState<{ name: string; description: string; impact: "increase" | "decrease"; amount: string; unit: string }[]>([]); const [sections, setSections] = useState<{ title: string; content: string }[]>([]); const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);

  const availableTabs = useMemo(() => [
    { id: "info", label: "Informações", icon: List, visible: canInfo || canMedia },
    { id: "price", label: "Preço", icon: DollarSign, visible: canPrice || canVariants },
    { id: "features", label: "Incluso", icon: CheckCircle, visible: canFeatures },
    { id: "exclusions", label: "Não incluso", icon: X, visible: canExclusions },
    { id: "factors", label: "Fatores", icon: Activity, visible: canFactors },
    { id: "faq", label: "FAQ", icon: HelpCircle, visible: canFaq },
    { id: "sections", label: "Seções", icon: FileText, visible: canSections },
    { id: "publish", label: "Publicação", icon: Star, visible: canPublication || canToggleActive },
  ].filter(item => item.visible), [canInfo, canMedia, canPrice, canVariants, canFeatures, canExclusions, canFactors, canFaq, canSections, canPublication, canToggleActive]);

  useEffect(() => {
    if (!open) return;
    const firstTab = availableTabs[0]?.id || "info";
    setTab(firstTab);
    if (editItem) {
      setName(editItem.title || ""); setSlug(editItem.slug || ""); setCategoryId(editItem.category_id || ""); setBrandId(editItem.brand_id || ""); setProductId(editItem.product_id || ""); setCoverMediaId(editItem.cover_media_id || ""); setShortDesc(editItem.short_description || ""); setDescription(editItem.description || ""); setBasePrice(editItem.base_price == null ? "" : String(editItem.base_price)); setPriceMode(["FIXED", "STARTING_FROM", "QUOTE", "HIDDEN"].includes(editItem.price_mode) ? editItem.price_mode : "QUOTE"); setActive(editItem.is_active ?? true); setFeatured(editItem.is_featured ?? false); setSortOrder(editItem.sort_order ?? 0);
      setVariants((editItem.service_variants || []).map((item: any) => ({ title: item.title || "", description: item.description || "", price: item.price == null ? "" : String(item.price) }))); setFeatures((editItem.service_inclusions || []).map((item: any) => item.description || "")); setExclusions((editItem.service_exclusions || []).map((item: any) => item.description || "")); setPriceFactors((editItem.service_price_factors || []).map((item: any) => ({ name: item.name || "", description: item.description || "", impact: item.impact || "increase", amount: item.amount == null ? "" : String(item.amount), unit: item.unit || "" }))); setSections((editItem.service_sections || []).map((item: any) => ({ title: item.title || "", content: item.content || "" }))); setFaqs((editItem.service_faqs || []).map((item: any) => ({ question: item.question || "", answer: item.answer || "" })));
    } else {
      setName(""); setSlug(""); setCategoryId(""); setBrandId(""); setProductId(""); setCoverMediaId(""); setShortDesc(""); setDescription(""); setBasePrice(""); setPriceMode("QUOTE"); setActive(true); setFeatured(false); setSortOrder(0); setVariants([]); setFeatures([]); setExclusions([]); setPriceFactors([]); setSections([]); setFaqs([]);
    }
  }, [open, editItem, availableTabs]);

  const handleSave = async () => {
    if (!canSave) return;
    if (creating && !name.trim()) { onToast({ msg: "Nome do serviço é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (canInfo) {
        const baseSlug = slugify(name);
        const titleChanged = editItem && slugify(editItem.title || "") !== baseSlug;
        const finalSlug = !editItem || titleChanged ? await findUniqueServiceSlug(baseSlug, editItem?.id) : slug;
        Object.assign(payload, { title: name.trim(), slug: finalSlug, category_id: categoryId || null, brand_id: brandId || null, product_id: productId || null, short_description: shortDesc || null, description: description || null });
      }
      if (canMedia) payload.cover_media_id = coverMediaId || null;
      if (canPrice) Object.assign(payload, { base_price: basePrice ? Number(basePrice) : null, price_mode: priceMode });
      if (canPublication) Object.assign(payload, { is_featured: featured, sort_order: sortOrder });
      if (canToggleActive) payload.is_active = active;
      if (!creating && Object.keys(payload).length) payload.updated_by = userId;

      await saveServiceAggregate({
        serviceId: editItem?.id,
        payload,
        userId,
        variants,
        inclusions: features,
        exclusions,
        priceFactors,
        sections,
        faqs,
        scope: creating ? undefined : { variants: canVariants, inclusions: canFeatures, exclusions: canExclusions, priceFactors: canFactors, sections: canSections, faqs: canFaq },
      });
      onToast({ msg: editItem ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!", type: "success" });
      onClose();
    } catch (error) { onToast({ msg: `Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`, type: "error" }); }
    finally { setSaving(false); }
  };

  const catOptions = [{ value: "", label: "Selecionar categoria..." }, ...categories.map(item => ({ value: item.id, label: item.name }))];
  const brandOptions = [{ value: "", label: "Sem marca" }, ...brands.map(item => ({ value: item.id, label: item.name }))];
  const productOptions = [{ value: "", label: "Sem produto vinculado" }, ...products.map(item => ({ value: item.id, label: item.name }))];

  return <AdminPage open={open && canSave} onClose={onClose} breadcrumb="Serviços" title={editItem ? `Editar: ${editItem.title}` : "Novo serviço"} subtitle="As seções exibidas respeitam as permissões da função" maxW="max-w-3xl">
    <div className="sticky top-0 z-10 flex flex-shrink-0 gap-0 overflow-x-auto border-b border-[#0d1b2e]/8 bg-white px-4">{availableTabs.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold transition-colors", tab === item.id ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}><Icon size={13} /> {item.label}</button>; })}</div>
    <div className="space-y-4 p-5">
      {tab === "info" && <>{canInfo && <><Section title="Identificação"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><FInput label="Nome do Serviço" value={name} required onChange={(event: any) => { setName(event.target.value); if (!editItem) setSlug(slugify(event.target.value)); }} /></div><FInput label="Slug (URL)" value={slug} onChange={(event: any) => setSlug(event.target.value)} /><FSelect label="Categoria" value={categoryId} onChange={(event: any) => setCategoryId(event.target.value)} options={catOptions} /><FSelect label="Marca" value={brandId} onChange={(event: any) => setBrandId(event.target.value)} options={brandOptions} /><FSelect label="Produto relacionado" value={productId} onChange={(event: any) => setProductId(event.target.value)} options={productOptions} /></div></Section><Section title="Descrição"><div className="space-y-4"><FTextarea label="Descrição curta" value={shortDesc} onChange={(event: any) => setShortDesc(event.target.value)} rows={2} /><FTextarea label="Descrição completa" value={description} onChange={(event: any) => setDescription(event.target.value)} rows={5} /></div></Section></>}{canMedia && <Section title="Imagem de capa"><ImageUpload bucket="service-images" currentMediaId={coverMediaId} onUpload={setCoverMediaId} canUpload label="Imagem do serviço" /></Section>}</>}
      {tab === "price" && <>{canPrice && <Section title="Preço base"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FCurrencyInput label="Preço base (R$)" value={basePrice} onChange={(event: any) => setBasePrice(event.target.value)} /><FSelect label="Modo de preço" value={priceMode} onChange={(event: any) => setPriceMode(event.target.value)} options={[{ value: "FIXED", label: "Preço fixo" }, { value: "STARTING_FROM", label: "Preço a partir de" }, { value: "QUOTE", label: "Consultar orçamento" }, { value: "HIDDEN", label: "Não exibir preço" }]} /></div></Section>}{canVariants && <Section title="Variações de Preço">{variants.map((item, index) => <AdminCard key={index} className="mb-3 bg-[#f8fafc] p-3 shadow-none"><div className="flex items-start gap-3"><div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3"><FInput value={item.title} onChange={(event: any) => setVariants(current => current.map((value, i) => i === index ? { ...value, title: event.target.value } : value))} /><FCurrencyInput value={item.price} onChange={(event: any) => setVariants(current => current.map((value, i) => i === index ? { ...value, price: event.target.value } : value))} /><FInput value={item.description} onChange={(event: any) => setVariants(current => current.map((value, i) => i === index ? { ...value, description: event.target.value } : value))} /></div><button type="button" onClick={() => setVariants(current => current.filter((_, i) => i !== index))} className="p-1.5 text-red-400"><X size={15} /></button></div></AdminCard>)}<button type="button" onClick={() => setVariants(current => [...current, { title: "", description: "", price: "" }])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> Adicionar variação</button></Section>}</>}
      {tab === "features" && canFeatures && <StringListSection title="O que está incluso" values={features} setValues={setFeatures} icon={<CheckCircle size={14} className="text-emerald-500" />} addLabel="Adicionar item" />}
      {tab === "exclusions" && canExclusions && <StringListSection title="O que não está incluso" values={exclusions} setValues={setExclusions} icon={<X size={14} className="text-red-500" />} addLabel="Adicionar item" />}
      {tab === "factors" && canFactors && <Section title="Fatores que alteram preço">{priceFactors.map((item, index) => <AdminCard key={index} className="mb-3 bg-[#f8fafc] p-3 shadow-none"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FInput label="Título" value={item.name} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} /><FSelect label="Impacto" value={item.impact} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, impact: event.target.value } : value))} options={[{ value: "increase", label: "Aumenta" }, { value: "decrease", label: "Reduz" }]} /><FCurrencyInput label="Valor" value={item.amount} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, amount: event.target.value } : value))} /><FInput label="Unidade" value={item.unit} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, unit: event.target.value } : value))} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={item.description} onChange={(event: any) => setPriceFactors(current => current.map((value, i) => i === index ? { ...value, description: event.target.value } : value))} rows={2} /></div><button type="button" onClick={() => setPriceFactors(current => current.filter((_, i) => i !== index))} className="text-xs font-bold text-red-600">Remover fator</button></div></AdminCard>)}<button type="button" onClick={() => setPriceFactors(current => [...current, { name: "", description: "", impact: "increase", amount: "", unit: "" }])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> Adicionar fator</button></Section>}
      {tab === "faq" && canFaq && <Section title="Perguntas Frequentes">{faqs.map((item, index) => <AdminCard key={index} className="mb-4 bg-[#f8fafc] p-4 shadow-none"><div className="space-y-2"><div className="flex items-start gap-2"><input value={item.question} onChange={event => setFaqs(current => current.map((value, i) => i === index ? { ...value, question: event.target.value } : value))} className={cn(INPUT, "py-2 text-xs flex-1")} placeholder="Pergunta..." /><button type="button" onClick={() => setFaqs(current => current.filter((_, i) => i !== index))} className="p-1.5 text-red-400"><X size={14} /></button></div><textarea value={item.answer} onChange={event => setFaqs(current => current.map((value, i) => i === index ? { ...value, answer: event.target.value } : value))} rows={2} className={cn(INPUT, "resize-none text-xs")} placeholder="Resposta..." /></div></AdminCard>)}<button type="button" onClick={() => setFaqs(current => [...current, { question: "", answer: "" }])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> Adicionar pergunta</button></Section>}
      {tab === "sections" && canSections && <Section title="Seções personalizadas">{sections.map((item, index) => <AdminCard key={index} className="mb-3 bg-[#f8fafc] p-3 shadow-none"><div className="space-y-3"><FInput label="Título" value={item.title} onChange={(event: any) => setSections(current => current.map((value, i) => i === index ? { ...value, title: event.target.value } : value))} /><FTextarea label="Conteúdo" value={item.content} onChange={(event: any) => setSections(current => current.map((value, i) => i === index ? { ...value, content: event.target.value } : value))} rows={3} /><button type="button" onClick={() => setSections(current => current.filter((_, i) => i !== index))} className="text-xs font-bold text-red-600">Remover seção</button></div></AdminCard>)}<button type="button" onClick={() => setSections(current => [...current, { title: "", content: "" }])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> Adicionar seção</button></Section>}
      {tab === "publish" && <Section title="Publicação"><div className="space-y-4">{canToggleActive && <FToggle label="Serviço ativo" description="Serviços inativos não aparecem no site." checked={active} onChange={setActive} />}{canPublication && <><FToggle label="Destaque" description="Exibe o serviço como destaque na Home e na listagem." checked={featured} onChange={setFeatured} /><FInput label="Ordem de exibição" type="number" min="0" value={sortOrder} onChange={(event: any) => setSortOrder(Number(event.target.value))} /></>}</div></Section>}
    </div>
    <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#0d1b2e]/8 bg-white px-6 py-4"><p className="text-xs text-[#5a6a82]">Somente as seções autorizadas serão alteradas.</p><div className="flex gap-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{canSave && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}{saving ? "Salvando..." : "Salvar serviço"}</BtnPrimary>}</div></div>
  </AdminPage>;
}

function StringListSection({ title, values, setValues, icon, addLabel }: { title: string; values: string[]; setValues: React.Dispatch<React.SetStateAction<string[]>>; icon: React.ReactNode; addLabel: string }) {
  return <Section title={title}>{values.map((value, index) => <div key={index} className="mb-2 flex items-center gap-2">{icon}<input value={value} onChange={event => setValues(current => current.map((item, i) => i === index ? event.target.value : item))} className={cn(INPUT, "flex-1 py-2 text-xs")} /><button type="button" onClick={() => setValues(current => current.filter((_, i) => i !== index))} className="p-1.5 text-red-400"><X size={14} /></button></div>)}<button type="button" onClick={() => setValues(current => [...current, ""])} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#0057e7]/40 px-3 py-2 text-xs font-bold text-[#0057e7]"><Plus size={14} /> {addLabel}</button></Section>;
}
