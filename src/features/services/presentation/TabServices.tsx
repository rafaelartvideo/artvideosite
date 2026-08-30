import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  DollarSign,
  Edit2,
  FileText,
  HelpCircle,
  List,
  Plus,
  Search,
  Star,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  deleteService,
  findUniqueServiceSlug,
  loadServicesCatalog,
  saveServiceAggregate,
  setServiceActive,
} from "../infrastructure/services.repository";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";
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
} from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function TabServices({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({
    queryKey: queryKeys.catalog.services(),
    queryFn: loadServicesCatalog,
  });
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

  const openNew = () => { setEditItem(null); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditItem(s); setDrawerOpen(true); };

  const handleDelete = async (id: string) => {
    if (!hasPermission("services.delete")) return;
    try {
      await deleteService(id);
      setDelId(null);
      setToast({ msg: "Serviço excluído com sucesso.", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao excluir: ${message}`, type: "error" });
    }
  };

  const toggleActive = async (service: any) => {
    if (!hasPermission("services.update")) return;
    try {
      await setServiceActive(service.id, !service.is_active);
      setToast({ msg: "Status atualizado com sucesso.", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao atualizar: ${message}`, type: "error" });
    }
  };

  const filtered = services.filter(s =>
    !search || s.title?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedServices = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este serviço e todos os dados associados?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Serviços do Site" subtitle={`${services.length} serviço${services.length !== 1 ? "s" : ""} cadastrado${services.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("services.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Novo serviço</BtnPrimary>}</div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar serviços..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Wrench} title={search ? "Nenhum resultado" : "Nenhum serviço cadastrado"} message={search ? `Nenhum serviço com "${search}"` : "Clique em Novo serviço para começar."} onAdd={!search && hasPermission("services.create") ? openNew : undefined} addLabel="Novo serviço" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Serviço</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Variações</th>
                  <th className="px-4 py-3 text-left">Destaque</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedServices.map(s => {
                  const cat = categories.find(c => c.id === s.category_id);
                  return (
                    <tr key={s.id} className="hover:bg-[#f8fafc]/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div>
                          <p className="font-bold text-[#0d1b2e]">{s.title}</p>
                          {s.short_description && <p className="text-xs text-[#5a6a82] truncate max-w-xs">{s.short_description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{cat?.name || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{s.service_variants?.length || 0}</td>
                      <td className="px-4 py-3.5">
                        {s.is_featured ? <Star size={15} className="text-amber-400 fill-amber-400" /> : <span className="text-xs text-[#5a6a82]">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={s.is_active ? "Ativo" : "Inativo"} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {hasPermission("services.update") && <button onClick={() => openEdit(s)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors" title="Editar"><Edit2 size={15} /></button>}
                          {hasPermission("services.update") && <button onClick={() => toggleActive(s)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={s.is_active ? "Desativar" : "Ativar"}>
                            {s.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                          </button>}
                          {hasPermission("services.delete") && <button onClick={() => setDelId(s.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      <ServiceDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); void refresh(); }} editItem={editItem} categories={categories} brands={brands} products={products} userId={user?.id || null} onToast={setToast} />
    </div>
  );
}

function ServiceDrawer({ open, onClose, editItem, categories, brands, products, userId, onToast }: {
  open: boolean; onClose: () => void; editItem: any | null; categories: any[]; brands: any[]; products: any[]; userId: string | null; onToast: (t: { msg: string; type: "success" | "error" }) => void;
}) {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState("info");
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [coverMediaId, setCoverMediaId] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [priceMode, setPriceMode] = useState<"FIXED" | "STARTING_FROM" | "QUOTE" | "HIDDEN">("QUOTE");
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  // Variants
  const [variants, setVariants] = useState<{ title: string; description: string; price: string }[]>([]);
  // Features (incluso)
  const [features, setFeatures] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [priceFactors, setPriceFactors] = useState<{ name: string; description: string; impact: "increase" | "decrease"; amount: string; unit: string }[]>([]);
  const [sections, setSections] = useState<{ title: string; content: string }[]>([]);
  // FAQs
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);

  useEffect(() => {
    if (open) {
      setTab("info");
      if (editItem) {
        setName(editItem.title || "");
        setSlug(editItem.slug || "");
        setCategoryId(editItem.category_id || "");
        setBrandId(editItem.brand_id || ""); setProductId(editItem.product_id || ""); setCoverMediaId(editItem.cover_media_id || "");
        setShortDesc(editItem.short_description || "");
        setDescription(editItem.description || "");
        setBasePrice(editItem.base_price == null ? "" : String(editItem.base_price));
        setPriceMode(["FIXED", "STARTING_FROM", "QUOTE", "HIDDEN"].includes(editItem.price_mode) ? editItem.price_mode : "QUOTE");
        setActive(editItem.is_active ?? true);
        setFeatured(editItem.is_featured ?? false);
        setSortOrder(editItem.sort_order ?? 0);
        setVariants((editItem.service_variants || []).map((v: any) => ({ title: v.title || "", description: v.description || "", price: v.price == null ? "" : String(v.price) })));
        setFeatures((editItem.service_inclusions || []).map((f: any) => f.description || ""));
        setExclusions((editItem.service_exclusions || []).map((item: any) => item.description || ""));
        setPriceFactors((editItem.service_price_factors || []).map((factor: any) => ({ name: factor.name || "", description: factor.description || "", impact: factor.impact || "increase", amount: factor.amount == null ? "" : String(factor.amount), unit: factor.unit || "" })));
        setSections((editItem.service_sections || []).map((section: any) => ({ title: section.title || "", content: section.content || "" })));
        setFaqs((editItem.service_faqs || []).map((f: any) => ({ question: f.question || "", answer: f.answer || "" })));
      } else {
        setName(""); setSlug(""); setCategoryId(""); setBrandId(""); setProductId(""); setCoverMediaId(""); setShortDesc(""); setDescription(""); setBasePrice(""); setPriceMode("QUOTE");
        setActive(true); setFeatured(false); setSortOrder(0);
        setVariants([]); setFeatures([]); setExclusions([]); setPriceFactors([]); setSections([]); setFaqs([]);
      }
    }
  }, [open, editItem]);


  const autoSlug = slugify;

  const handleSave = async () => {
    if (!(editItem ? hasPermission("services.update") : hasPermission("services.create"))) return;
    if (!name.trim()) {
      onToast({ msg: "Nome do serviço é obrigatório.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const baseSlug = autoSlug(name);
      const titleChanged = editItem && autoSlug(editItem.title || "") !== baseSlug;
      const finalSlug = !editItem || titleChanged
        ? await findUniqueServiceSlug(baseSlug, editItem?.id)
        : slug;

      const payload = {
        title: name.trim(),
        slug: finalSlug,
        category_id: categoryId || null,
        brand_id: brandId || null,
        product_id: productId || null,
        cover_media_id: coverMediaId || null,
        short_description: shortDesc || null,
        description: description || null,
        base_price: basePrice ? Number(basePrice) : null,
        price_mode: priceMode,
        is_active: active,
        is_featured: featured,
        sort_order: sortOrder,
        updated_by: userId,
      };

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
      });

      onToast({
        msg: editItem ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!",
        type: "success",
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      onToast({ msg: `Erro ao salvar: ${message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "info", label: "Informações", icon: List },
    { id: "price", label: "Preço", icon: DollarSign },
    { id: "features", label: "Incluso", icon: CheckCircle },
    { id: "exclusions", label: "Não incluso", icon: X },
    { id: "factors", label: "Fatores", icon: Activity },
    { id: "faq", label: "FAQ", icon: HelpCircle },
    { id: "sections", label: "Seções", icon: FileText },
    { id: "publish", label: "Publicação", icon: Star },
  ];

  const catOptions = [{ value: "", label: "Selecionar categoria..." }, ...categories.map(c => ({ value: c.id, label: c.name }))];
  const brandOptions = [{ value: "", label: "Sem marca" }, ...brands.map(brand => ({ value: brand.id, label: brand.name }))];
  const productOptions = [{ value: "", label: "Sem produto vinculado" }, ...products.map(product => ({ value: product.id, label: product.name }))];

  return (
    <AdminPage open={open} onClose={onClose} breadcrumb="Serviços" title={editItem ? `Editar: ${editItem.title}` : "Novo serviço"} subtitle="Preencha todas as seções para publicar o serviço" maxW="max-w-3xl">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#0d1b2e]/8 px-4 flex gap-0 overflow-x-auto flex-shrink-0">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap",
                tab === t.id ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-5 space-y-4">
        {/* INFO TAB */}
        {tab === "info" && (
          <>
            <Section title="Identificação">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FInput label="Nome do Serviço" value={name} required onChange={(e: any) => { setName(e.target.value); if (!editItem) setSlug(autoSlug(e.target.value)); }} placeholder="Ex: Instalação de Ar-condicionado" />
                </div>
                <FInput label="Slug (URL)" value={slug} onChange={(e: any) => setSlug(e.target.value)} placeholder="instalacao-ar-condicionado" hint="Gerado automaticamente a partir do nome." />
                <FSelect label="Categoria" value={categoryId} onChange={(e: any) => setCategoryId(e.target.value)} options={catOptions} />
                <FSelect label="Marca" value={brandId} onChange={(e: any) => setBrandId(e.target.value)} options={brandOptions} />
                <FSelect label="Produto relacionado" value={productId} onChange={(e: any) => setProductId(e.target.value)} options={productOptions} />
              </div>
            </Section>
            <Section title="Descrição">
              <div className="space-y-4">
                <FTextarea label="Descrição curta" value={shortDesc} onChange={(e: any) => setShortDesc(e.target.value)} rows={2} placeholder="Frase resumida que aparece nos cards e listagens." />
                <FTextarea label="Descrição completa" value={description} onChange={(e: any) => setDescription(e.target.value)} rows={5} placeholder="Texto completo que aparece na página do serviço." />
              </div>
            </Section>
            <Section title="Imagem de capa">
              <ImageUpload bucket="service-images" currentMediaId={coverMediaId} onUpload={setCoverMediaId} canUpload={editItem ? hasPermission("services.update") : hasPermission("services.create")} label="Imagem do serviço" />
            </Section>
          </>
        )}

        {/* PRICE TAB */}
        {tab === "price" && (
          <>
            <Section title="Preço base">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FInput label="Preço base (R$)" type="number" min="0" step="0.01" value={basePrice} onChange={(e: any) => setBasePrice(e.target.value)} placeholder="Vazio para consultar" />
                <FSelect label="Modo de preço" value={priceMode} onChange={(e: any) => setPriceMode(e.target.value)} options={[{ value: "FIXED", label: "Preço fixo" }, { value: "STARTING_FROM", label: "Preço a partir de" }, { value: "QUOTE", label: "Consultar orçamento" }, { value: "HIDDEN", label: "Não exibir preço" }]} />
              </div>
            </Section>
            <Section title="Variações de Preço">
              <p className="text-xs text-[#5a6a82] mb-3">Adicione variações para mostrar opções diferentes de preço. Deixe em branco o preço para indicar "Consultar".</p>
              {variants.map((v, i) => (
                <div key={i} className="flex gap-3 items-start mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FInput label={i === 0 ? "Título" : undefined} value={v.title} onChange={(e: any) => { const n = [...variants]; n[i].title = e.target.value; setVariants(n); }} placeholder="Ex: 12.000 BTUs" />
                    <FInput label={i === 0 ? "Preço (R$)" : undefined} value={v.price} onChange={(e: any) => { const n = [...variants]; n[i].price = e.target.value; setVariants(n); }} placeholder="Ex: 250.00 (vazio = consultar)" type="number" min="0" step="0.01" />
                    <FInput label={i === 0 ? "Descrição" : undefined} value={v.description} onChange={(e: any) => { const n = [...variants]; n[i].description = e.target.value; setVariants(n); }} placeholder="Descrição da variação" />
                  </div>
                  {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setVariants(variants.filter((_, idx) => idx !== i))} className="mt-5 p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                    <X size={15} />
                  </button>}
                </div>
              ))}
              {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setVariants([...variants, { title: "", description: "", price: "" }])}
                className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center transition-colors">
                <Plus size={14} /> Adicionar variação
              </button>}
            </Section>
          </>
        )}

        {/* FEATURES TAB */}
        {tab === "features" && (
          <Section title="O que está incluso">
            <p className="text-xs text-[#5a6a82] mb-3">Liste os itens inclusos no serviço. Se não houver itens, a seção não aparecerá no site.</p>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                <input value={f} onChange={(e) => { const n = [...features]; n[i] = e.target.value; setFeatures(n); }}
                  className={cn(INPUT, "py-2 text-xs flex-1")} placeholder={`Item ${i + 1}...`} />
                {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                  <X size={14} />
                </button>}
              </div>
            ))}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFeatures([...features, ""])}
              className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center mt-2 transition-colors">
              <Plus size={14} /> Adicionar item
            </button>}
          </Section>
        )}

        {tab === "exclusions" && (
          <Section title="O que não está incluso">
            {exclusions.map((item, index) => <div key={index} className="flex items-center gap-2 mb-2"><X size={14} className="text-red-500" /><input value={item} onChange={(event) => { const next = [...exclusions]; next[index] = event.target.value; setExclusions(next); }} className={cn(INPUT, "py-2 text-xs flex-1")} placeholder={`Item ${index + 1}...`} />{hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setExclusions(exclusions.filter((_, itemIndex) => itemIndex !== index))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X size={14} /></button>}</div>)}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setExclusions([...exclusions, ""])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center mt-2"><Plus size={14} /> Adicionar item</button>}
          </Section>
        )}

        {tab === "factors" && (
          <Section title="Fatores que alteram preço">
            {priceFactors.map((factor, index) => <div key={index} className="mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 grid grid-cols-1 sm:grid-cols-2 gap-3"><FInput label="Título" value={factor.name} onChange={(event: any) => { const next = [...priceFactors]; next[index].name = event.target.value; setPriceFactors(next); }} /><FSelect label="Impacto" value={factor.impact} onChange={(event: any) => { const next = [...priceFactors]; next[index].impact = event.target.value; setPriceFactors(next); }} options={[{ value: "increase", label: "Aumenta" }, { value: "decrease", label: "Reduz" }]} /><FInput label="Valor" type="number" value={factor.amount} onChange={(event: any) => { const next = [...priceFactors]; next[index].amount = event.target.value; setPriceFactors(next); }} /><FInput label="Unidade" value={factor.unit} onChange={(event: any) => { const next = [...priceFactors]; next[index].unit = event.target.value; setPriceFactors(next); }} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={factor.description} onChange={(event: any) => { const next = [...priceFactors]; next[index].description = event.target.value; setPriceFactors(next); }} rows={2} /></div>{hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setPriceFactors(priceFactors.filter((_, factorIndex) => factorIndex !== index))} className="text-xs text-red-600 font-bold">Remover fator</button>}</div>)}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setPriceFactors([...priceFactors, { name: "", description: "", impact: "increase", amount: "", unit: "" }])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center"><Plus size={14} /> Adicionar fator</button>}
          </Section>
        )}

        {/* FAQ TAB */}
        {tab === "faq" && (
          <Section title="Perguntas Frequentes">
            <p className="text-xs text-[#5a6a82] mb-3">Adicione perguntas e respostas frequentes sobre este serviço. Se não houver, a seção não aparecerá no site.</p>
            {faqs.map((f, i) => (
              <div key={i} className="mb-4 p-4 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[#5a6a82] mt-2.5 flex-shrink-0">P.</span>
                  <input value={f.question} onChange={(e) => { const n = [...faqs]; n[i].question = e.target.value; setFaqs(n); }}
                    className={cn(INPUT, "py-2 text-xs flex-1")} placeholder="Pergunta..." />
                  {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 mt-0.5">
                    <X size={14} />
                  </button>}
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[#5a6a82] mt-2.5 flex-shrink-0">R.</span>
                  <textarea value={f.answer} onChange={(e) => { const n = [...faqs]; n[i].answer = e.target.value; setFaqs(n); }}
                    rows={2} className={cn(INPUT, "resize-none text-xs flex-1")} placeholder="Resposta..." />
                </div>
              </div>
            ))}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}
              className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center transition-colors">
              <Plus size={14} /> Adicionar pergunta
            </button>}
          </Section>
        )}

        {tab === "sections" && (
          <Section title="Seções personalizadas">
            {sections.map((section, index) => <div key={index} className="mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 space-y-3"><FInput label="Título" value={section.title} onChange={(event: any) => { const next = [...sections]; next[index].title = event.target.value; setSections(next); }} /><FTextarea label="Conteúdo" value={section.content} onChange={(event: any) => { const next = [...sections]; next[index].content = event.target.value; setSections(next); }} rows={3} />{hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setSections(sections.filter((_, sectionIndex) => sectionIndex !== index))} className="text-xs text-red-600 font-bold">Remover seção</button>}</div>)}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setSections([...sections, { title: "", content: "" }])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center"><Plus size={14} /> Adicionar seção</button>}
          </Section>
        )}

        {/* PUBLISH TAB */}
        {tab === "publish" && (
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Serviço ativo" description="Serviços inativos não aparecem no site." checked={active} onChange={setActive} />
              <FToggle label="Destaque" description="Exibe o serviço como destaque na Home e na listagem." checked={featured} onChange={setFeatured} />
              <FInput label="Ordem de exibição" type="number" min="0" value={sortOrder} onChange={(e: any) => setSortOrder(Number(e.target.value))} hint="Menor número aparece primeiro." />
            </div>
          </Section>
        )}
      </div>

      {/* Save footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[#5a6a82]">
          {tab !== "publish" ? "Complete todas as seções antes de publicar." : "Revise e salve as alterações."}
        </p>
        <div className="flex gap-3">
          <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("services.update") : hasPermission("services.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>
            {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {saving ? "Salvando..." : "Salvar serviço"}
          </BtnPrimary>}
        </div>
      </div>
    </AdminPage>
  );
}
