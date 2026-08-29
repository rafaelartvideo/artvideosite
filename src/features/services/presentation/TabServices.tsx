import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2,
  Plus,
  Search,
  Star,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  cn,
  ConfirmDialog,
  EmptyState,
  FInput,
  FSelect,
  FTextarea,
  FToggle,
  ImageUpload,
  INPUT,
  InternalBackButton,
  LoadingState,
  PageHeader,
  PaginationBar,
  Section,
  StatusBadge,
  Toast,
} from "@/app/admin/shared";

export function TabServices({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const [sRes, cRes, bRes, pRes] = await Promise.all([
      supabase.from("services").select("*, service_variants(*), service_inclusions(*), service_exclusions(*), service_price_factors(*), service_faqs(*), service_sections(*)").order("sort_order"),
      supabase.from("service_categories").select("id, name").order("sort_order"),
      supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name").eq("is_active", true).order("created_at", { ascending: false }),
    ]);
    if (sRes.error) setToast({ msg: `Erro ao carregar serviços: ${sRes.error.message}`, type: "error" }); else setServices(sRes.data || []);
    if (cRes.error) setToast({ msg: `Erro ao carregar categorias: ${cRes.error.message}`, type: "error" }); else setCategories(cRes.data || []);
    if (bRes.error) setToast({ msg: `Erro ao carregar marcas: ${bRes.error.message}`, type: "error" }); else setBrands(bRes.data || []);
    if (pRes.error) setToast({ msg: `Erro ao carregar produtos: ${pRes.error.message}`, type: "error" }); else setProducts(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditItem(null); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditItem(s); setDrawerOpen(true); };

  const handleDelete = async (id: string) => {
    if (!hasPermission("services.delete")) return;
    console.log("[ADMIN] Deleting service:", id);
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      console.error("[ADMIN] Delete error:", error);
      setToast({ msg: `Erro ao excluir: ${error.message}`, type: "error" });
      return;
    }
    setDelId(null);
    setToast({ msg: "Serviço excluído com sucesso.", type: "success" });
    load();
  };

  const toggleActive = async (s: any) => {
    console.log("[ADMIN] Toggling service active status:", s.id);
    const { error } = await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) {
      console.error("[ADMIN] Toggle active error:", error);
      setToast({ msg: `Erro ao atualizar: ${error.message}`, type: "error" });
      return;
    }
    setToast({ msg: "Status atualizado com sucesso.", type: "success" });
    load();
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

      <ServiceDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); load(); }} editItem={editItem} categories={categories} brands={brands} products={products} userId={user?.id || null} onToast={setToast} />
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

  // Generate unique slug by checking for conflicts in Supabase
  const generateUniqueServiceSlug = async (title: string, excludeId?: string): Promise<string> => {
    const baseSlug = autoSlug(title);
    console.log("[ADMIN] Generating slug for title:", title, "base slug:", baseSlug);
    
    // Query all services to find existing slugs
    const { data: existingServices, error: queryError } = await supabase.from("services").select("id, slug");
    if (queryError) {
      console.error("[ADMIN] Error querying services for slug check:", queryError);
      return baseSlug;
    }
    
    // Filter out the current service being edited
    const existingSlugs = existingServices
      ?.filter((s: any) => !excludeId || s.id !== excludeId)
      .map((s: any) => s.slug) || [];
    
    // Check if base slug is available
    if (!existingSlugs.includes(baseSlug)) {
      console.log("[ADMIN] Slug available:", baseSlug);
      return baseSlug;
    }
    
    // Find next available slug with number suffix
    let counter = 2;
    let candidateSlug = `${baseSlug}-${counter}`;
    while (existingSlugs.includes(candidateSlug)) {
      counter++;
      candidateSlug = `${baseSlug}-${counter}`;
    }
    
    console.log("[ADMIN] Slug available (with suffix):", candidateSlug);
    return candidateSlug;
  };

  const handleSave = async () => {
    if (!(editItem ? hasPermission("services.update") : hasPermission("services.create"))) return;
    if (!name.trim()) { onToast({ msg: "Nome do serviço é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      console.log("[ADMIN] Saving service:", { title: name, is_active: active, is_featured: featured });
      
      
      let finalSlug = slug;
      
      // For new services, always generate a unique slug
      if (!editItem) {
        finalSlug = await generateUniqueServiceSlug(name);
        console.log("[ADMIN] Generated unique slug for new service:", finalSlug);
      } else {
        // For edits, only regenerate slug if title changed
        const previousSlug = autoSlug(editItem.title || "");
        const newSlug = autoSlug(name);
        
        if (previousSlug !== newSlug) {
          // Title changed, generate new unique slug (excluding current service)
          finalSlug = await generateUniqueServiceSlug(name, editItem.id);
          console.log("[ADMIN] Title changed, generated new slug:", finalSlug);
        } else {
          // Title unchanged, keep existing slug
          finalSlug = slug;
          console.log("[ADMIN] Title unchanged, keeping existing slug:", finalSlug);
        }
      }
      
      const payload = { title: name.trim(), slug: finalSlug, category_id: categoryId || null, brand_id: brandId || null, product_id: productId || null, cover_media_id: coverMediaId || null, short_description: shortDesc || null, description: description || null, base_price: basePrice ? Number(basePrice) : null, price_mode: priceMode, is_active: active, is_featured: featured, sort_order: sortOrder, updated_by: userId };
      let serviceId = editItem?.id;
      
      // Insert or Update main service
      if (editItem) {
        console.log("[ADMIN] Updating service:", serviceId);
        const { error: updateError } = await supabase.from("services").update(payload).eq("id", serviceId);
        if (updateError) {
          console.error("[ADMIN] Service update error:", updateError);
          onToast({ msg: `Erro ao atualizar serviço: ${updateError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service updated successfully");
      } else {
        console.log("[ADMIN] Creating new service");
        const { data, error: insertError } = await supabase.from("services").insert({ ...payload, created_by: userId }).select().single();
        if (insertError) {
          console.error("[ADMIN] Service insert error:", insertError);
          onToast({ msg: `Erro ao criar serviço: ${insertError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        serviceId = data?.id;
        console.log("[ADMIN] Service created with ID:", serviceId);
      }
      
      if (!serviceId) {
        onToast({ msg: "Erro: ID do serviço não obtido.", type: "error" });
        setSaving(false);
        return;
      }
      
      // Save service variants
      console.log("[ADMIN] Saving service variants:", variants.length);
      const { error: deleteVariantsError } = await supabase.from("service_variants").delete().eq("service_id", serviceId);
      if (deleteVariantsError) {
        console.error("[ADMIN] Error deleting old variants:", deleteVariantsError);
        onToast({ msg: `Erro ao remover variantes antigas: ${deleteVariantsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (variants.length > 0) {
        const { error: insertVariantsError } = await supabase.from("service_variants").insert(
          variants.map((v, i) => ({
            service_id: serviceId,
            title: v.title,
            description: v.description || null,
            price: v.price ? Number(v.price) : null,
            icon: null,

            is_active: true,
            sort_order: i,
          }))
        );
        if (insertVariantsError) {
          console.error("[ADMIN] Error inserting variants:", insertVariantsError);
          onToast({ msg: `Erro ao salvar variantes: ${insertVariantsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service variants saved");
      }
      
      // Save service inclusions (formerly called "features" in the UI)
      console.log("[ADMIN] Saving service inclusions:", features.filter(Boolean).length);
      const { error: deleteInclusionsError } = await supabase.from("service_inclusions").delete().eq("service_id", serviceId);
      if (deleteInclusionsError) {
        console.error("[ADMIN] Error deleting old inclusions:", deleteInclusionsError);
        onToast({ msg: `Erro ao remover inclusões antigas: ${deleteInclusionsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (features.filter(Boolean).length > 0) {
        const { error: insertInclusionsError } = await supabase.from("service_inclusions").insert(
          features.filter(Boolean).map((f, i) => ({
            service_id: serviceId,
            description: f,
            sort_order: i,
          }))
        );
        if (insertInclusionsError) {
          console.error("[ADMIN] Error inserting inclusions:", insertInclusionsError);
          onToast({ msg: `Erro ao salvar inclusões: ${insertInclusionsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service inclusions saved");
      }

      const { error: deleteExclusionsError } = await supabase.from("service_exclusions").delete().eq("service_id", serviceId);
      if (deleteExclusionsError) { onToast({ msg: `Erro ao remover exclusões antigas: ${deleteExclusionsError.message}`, type: "error" }); return; }
      const validExclusions = exclusions.filter(Boolean);
      if (validExclusions.length > 0) {
        const { error } = await supabase.from("service_exclusions").insert(validExclusions.map((description, sort_order) => ({ service_id: serviceId, description, sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar exclusões: ${error.message}`, type: "error" }); return; }
      }

      const { error: deleteFactorsError } = await supabase.from("service_price_factors").delete().eq("service_id", serviceId);
      if (deleteFactorsError) { onToast({ msg: `Erro ao remover fatores antigos: ${deleteFactorsError.message}`, type: "error" }); return; }
      const validFactors = priceFactors.filter((factor) => factor.name.trim());
      if (validFactors.length > 0) {
        const { error } = await supabase.from("service_price_factors").insert(validFactors.map((factor, sort_order) => ({ service_id: serviceId, name: factor.name.trim(), description: factor.description || null, impact: factor.impact, amount: Number(factor.amount) || 0, unit: factor.unit || null, sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar fatores: ${error.message}`, type: "error" }); return; }
      }

      const { error: deleteSectionsError } = await supabase.from("service_sections").delete().eq("service_id", serviceId);
      if (deleteSectionsError) { onToast({ msg: `Erro ao remover seções antigas: ${deleteSectionsError.message}`, type: "error" }); return; }
      const validSections = sections.filter((section) => section.title.trim() && section.content.trim());
      if (validSections.length > 0) {
        const { error } = await supabase.from("service_sections").insert(validSections.map((section, sort_order) => ({ service_id: serviceId, title: section.title.trim(), content: section.content.trim(), sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar seções: ${error.message}`, type: "error" }); return; }
      }
      
      // Save service FAQs
      console.log("[ADMIN] Saving service FAQs:", faqs.filter(f => f.question).length);
      const { error: deleteFaqsError } = await supabase.from("service_faqs").delete().eq("service_id", serviceId);
      if (deleteFaqsError) {
        console.error("[ADMIN] Error deleting old FAQs:", deleteFaqsError);
        onToast({ msg: `Erro ao remover FAQs antigas: ${deleteFaqsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (faqs.filter(f => f.question).length > 0) {
        const { error: insertFaqsError } = await supabase.from("service_faqs").insert(
          faqs.filter(f => f.question).map((f, i) => ({
            service_id: serviceId,
            question: f.question,
            answer: f.answer,
            section_id: null, is_active: true, sort_order: i,
          }))
        );
        if (insertFaqsError) {
          console.error("[ADMIN] Error inserting FAQs:", insertFaqsError);
          onToast({ msg: `Erro ao salvar FAQs: ${insertFaqsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service FAQs saved");
      }
      
      console.log("[ADMIN] Service save completed successfully");
      onToast({ msg: editItem ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!", type: "success" });
      onClose();
    } catch (err) {
      console.error("[ADMIN] Unexpected error saving service:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      onToast({ msg: `Erro ao salvar: ${errorMessage}`, type: "error" });
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
