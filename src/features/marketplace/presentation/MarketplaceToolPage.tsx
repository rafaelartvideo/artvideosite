import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CirclePause, Pencil, Send, Store, Tag, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { MarketplaceRequestsPanel } from "./MarketplaceRequestsPanel";
import {
  changeMarketplaceListingStatus, changeMarketplaceStoreStatus,
  loadMarketplaceManagement, loadMarketplaceSourceCatalog,
  saveMarketplaceCategory, saveMarketplaceListing, saveMarketplaceStore,
  type MarketplaceCategory, type MarketplaceListing, type MarketplaceSource, type MarketplaceStore,
} from "../infrastructure/marketplace.repository";

type Tab = "stores" | "listings" | "categories" | "requests";
type ListingForm = {
  source_key: string; category_id: string; title: string; description: string;
  price_type: "fixed" | "quote" | "appointment"; price: string; cover_image_url: string;
};
const emptyListing: ListingForm = { source_key: "", category_id: "", title: "", description: "", price_type: "quote", price: "", cover_image_url: "" };
const inputClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary";
const areaClass = "min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const labelClass = "mb-1.5 block text-xs font-bold text-foreground";
function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function priceLabel(amount: number | null) {
  return amount == null ? "Sob consulta" : amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const statusName: Record<string, string> = {
  pending: "Aguardando aprovação", approved: "Aprovado", suspended: "Suspenso",
  draft: "Rascunho", rejected: "Rejeitado", paused: "Pausado",
};

export function MarketplaceToolPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, activeOrganization, hasPermission } = useAuth();
  const platform = activeOrganization?.is_platform_operator === true;
  const canModerate = platform && hasPermission("platform.marketplace.manage");
  const canManageStore = !platform && hasPermission("marketplace.store.manage");
  const canManageListings = !platform && hasPermission("marketplace.listings.manage");

  const [tab, setTab] = useState<Tab>("stores");
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [sources, setSources] = useState<MarketplaceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [listingModalOpen, setListingModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editListing, setEditListing] = useState<MarketplaceListing | null>(null);
  const [listingForm, setListingForm] = useState<ListingForm>(emptyListing);
  const [categoryName, setCategoryName] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const [storeForm, setStoreForm] = useState({
    display_name: "", slug: "", description: "", city: "", state: "", logo_url: "", banner_url: "",
  });

  const ownStore = useMemo(
    () => stores.find(x => x.organization_id === activeOrganizationId) ?? null,
    [stores, activeOrganizationId],
  );
  const refresh = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      const [management, sourceList] = await Promise.all([
        loadMarketplaceManagement(activeOrganizationId, platform),
        platform ? Promise.resolve([] as MarketplaceSource[]) : loadMarketplaceSourceCatalog(activeOrganizationId),
      ]);
      setStores(management.stores);
      setListings(management.listings);
      setCategories(management.categories);
      setSources(sourceList);
    } catch (error) {
      setToast({ msg: systemErrorMessage(error), type: "error" });
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, platform]);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (fn: () => Promise<void>, success: string) => {
    setSaving(true);
    try {
      await fn();
      setToast({ msg: success, type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: systemErrorMessage(error), type: "error" });
    } finally {
      setSaving(false);
    }
  };
  const openStore = () => {
    if (!canManageStore) return;
    setStoreForm({
      display_name: ownStore?.display_name || activeOrganization?.organization_name || "",
      slug: ownStore?.slug || slugify(activeOrganization?.organization_name || ""),
      description: ownStore?.description || "", city: ownStore?.city || "", state: ownStore?.state || "",
      logo_url: ownStore?.logo_url || "", banner_url: ownStore?.banner_url || "",
    });
    setStoreModalOpen(true);
  };
  const submitStore = async () => {
    if (!activeOrganizationId || !storeForm.display_name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeForm.slug)) {
      setToast({ msg: "Informe o nome e o endereço da loja (sem espaços ou acentos).", type: "error" });
      return;
    }
    await act(async () => {
      await saveMarketplaceStore({
        organization_id: activeOrganizationId,
        display_name: storeForm.display_name.trim(), slug: storeForm.slug,
        description: storeForm.description.trim(), city: storeForm.city.trim(),
        state: storeForm.state.trim().toUpperCase(), logo_url: storeForm.logo_url.trim() || null,
        banner_url: storeForm.banner_url.trim() || null,
      }, Boolean(ownStore));
      setStoreModalOpen(false);
    }, ownStore ? "Loja atualizada." : "Loja criada e enviada para aprovação.");
  };

  const openListing = (listing?: MarketplaceListing) => {
    if (!canManageListings) return;
    setEditListing(listing || null);
    setListingForm(listing ? {
      source_key: listing.source_kind + ":" + listing.source_id,
      category_id: listing.category_id || "", title: listing.title, description: listing.description,
      price_type: listing.price_type, price: listing.price == null ? "" : String(listing.price),
      cover_image_url: listing.cover_image_url || "",
    } : emptyListing);
    setListingModalOpen(true);
  };
  const submitListing = async () => {
    if (!activeOrganizationId || !ownStore) return;
    const [source_kind, source_id] = listingForm.source_key.split(":");
    const numberPrice = listingForm.price.trim() === "" ? null : Number(listingForm.price);
    if ((source_kind !== "service" && source_kind !== "product") || !source_id || listingForm.title.trim().length < 3
      || (listingForm.price_type === "fixed" && numberPrice == null)
      || (numberPrice != null && (!Number.isFinite(numberPrice) || numberPrice < 0))) {
      setToast({ msg: "Selecione um item do CRM, informe o título e um preço válido quando necessário.", type: "error" });
      return;
    }
    await act(async () => {
      await saveMarketplaceListing({
        organization_id: activeOrganizationId,
        source_kind, source_id, category_id: listingForm.category_id || null,
        title: listingForm.title.trim(), description: listingForm.description.trim(),
        price_type: listingForm.price_type, price: numberPrice,
        cover_image_url: listingForm.cover_image_url.trim() || null,
      }, editListing?.id);
      setListingModalOpen(false);
    }, editListing ? "Anúncio atualizado." : "Rascunho de anúncio criado.");
  };
  const submitCategory = async () => {
    if (!categoryName.trim()) return;
    await act(async () => {
      await saveMarketplaceCategory({ name: categoryName.trim(), slug: slugify(categoryName) });
      setCategoryModalOpen(false);
      setCategoryName("");
    }, "Categoria cadastrada.");
  };

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Marketplace Union" subtitle={platform
      ? "Administre as lojas cadastradas, modere anúncios e organize categorias do marketplace."
      : "Configure sua loja e publique serviços e produtos do CRM, sujeitos à aprovação da Union."}
    />
    <div className="flex flex-wrap gap-2 border-b border-border pb-3">
      <button type="button" onClick={() => setTab("stores")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "stores" ? "bg-primary text-white" : "bg-muted text-foreground"}`}>{platform ? "Lojas" : "Minha loja"}</button>
      <button type="button" onClick={() => setTab("listings")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "listings" ? "bg-primary text-white" : "bg-muted text-foreground"}`}>Anúncios</button>
      {(canModerate || canManageListings) && <button type="button" onClick={() => setTab("requests")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "requests" ? "bg-primary text-white" : "bg-muted text-foreground"}`}>Solicitações</button>}
      {platform && <button type="button" onClick={() => setTab("categories")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "categories" ? "bg-primary text-white" : "bg-muted text-foreground"}`}>Categorias</button>}
    </div>

    {loading ? <LoadingState /> : tab === "requests" ? <MarketplaceRequestsPanel categories={categories} stores={stores} enabled={canModerate || canManageListings} platform={platform} organizationId={activeOrganizationId} storeApproved={ownStore?.status === "approved"} /> : tab === "stores" ? <Section
      title={platform ? "Empresas participantes" : "Dados comerciais da loja"}
      description={platform ? "Somente empresas com o módulo ativado podem criar lojas." : "Sua loja depende de aprovação da Union para ficar pública."}
      actions={!platform && canManageStore ? <BtnPrimary onClick={openStore}>{ownStore ? "Editar loja" : "Criar loja"}</BtnPrimary> : undefined}
    >
      {stores.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma loja cadastrada. O módulo não cria empresas automaticamente.</p> :
        <div className="divide-y divide-border">
          {stores.map(store => <div key={store.organization_id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted"><Store size={20} /></span>
              <div className="min-w-0"><p className="font-bold text-foreground">{store.display_name}</p>
                <p className="break-all text-xs text-muted-foreground">/marketplace/loja/{store.slug} · {store.city || "Localização não informada"} {store.state}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={statusName[store.status]} />
              {store.status === "approved" && <BtnSecondary onClick={() => window.open("/marketplace/loja/" + store.slug, "_blank", "noopener,noreferrer")}>Ver loja</BtnSecondary>}
              {canModerate && store.status !== "approved" && <BtnPrimary disabled={saving} onClick={() => void act(() => changeMarketplaceStoreStatus(store.organization_id, "approved"), "Loja aprovada.")}>Aprovar</BtnPrimary>}
              {canModerate && store.status === "approved" && <BtnSecondary disabled={saving} onClick={() => void act(() => changeMarketplaceStoreStatus(store.organization_id, "suspended"), "Loja suspensa.")}>Suspender</BtnSecondary>}
            </div>
          </div>)}
        </div>}
    </Section> : tab === "listings" ? <Section
      title="Anúncios"
      description="Cada anúncio é vinculado a um item já cadastrado no CRM. Preço e descrição de divulgação podem ser personalizados."
      actions={canManageListings && ownStore ? <BtnPrimary onClick={() => openListing()}>Novo</BtnPrimary> : undefined}
    >
      {!platform && !ownStore && <p className="mb-3 text-sm text-muted-foreground">Cadastre sua loja antes de publicar anúncios.</p>}
      {!platform && ownStore && sources.length === 0 && <p className="mb-3 text-sm text-muted-foreground">Nenhum item disponível nos cadastros acessíveis de Serviços Gerais ou Estoque. Confira as permissões e os itens ativos.</p>}
      {listings.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum anúncio cadastrado.</p> :
        <div className="divide-y divide-border">
          {listings.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-foreground">{item.title}</strong><StatusBadge status={statusName[item.status]} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{item.source_kind === "service" ? "Serviço" : "Produto"} · {item.price_type === "quote" ? "Sob orçamento" : item.price_type === "appointment" ? "Agendamento" : priceLabel(item.price)}
                {platform ? ` · Loja: ${stores.find(x => x.organization_id === item.organization_id)?.display_name || "Empresa"}` : ""}</p>
              {item.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {item.status === "approved" && <BtnSecondary onClick={() => window.open("/marketplace/" + (item.source_kind === "service" ? "servico" : "produto") + "/" + item.id, "_blank", "noopener,noreferrer")}>Ver anúncio</BtnSecondary>}
              {canManageListings && <BtnSecondary onClick={() => openListing(item)}><Pencil size={14} /> Editar</BtnSecondary>}
              {canManageListings && ["draft","rejected","paused"].includes(item.status) && <BtnPrimary disabled={saving} onClick={() => void act(() => changeMarketplaceListingStatus(item.id, item.organization_id, "pending"), "Anúncio enviado para análise.")}><Send size={14} /> Enviar</BtnPrimary>}
              {canManageListings && ["approved","pending"].includes(item.status) && <BtnSecondary disabled={saving} onClick={() => void act(() => changeMarketplaceListingStatus(item.id, item.organization_id, "paused"), "Anúncio pausado.")}><CirclePause size={14} /> Pausar</BtnSecondary>}
              {canModerate && item.status !== "approved" && <BtnPrimary disabled={saving} onClick={() => void act(() => changeMarketplaceListingStatus(item.id, item.organization_id, "approved"), "Anúncio aprovado.")}><Check size={14} /> Aprovar</BtnPrimary>}
              {canModerate && item.status !== "rejected" && <BtnSecondary disabled={saving} onClick={() => void act(() => changeMarketplaceListingStatus(item.id, item.organization_id, "rejected"), "Anúncio rejeitado.")}><X size={14} /> Rejeitar</BtnSecondary>}
            </div>
          </div>)}
        </div>}
    </Section> : <Section title="Categorias do marketplace" actions={canModerate ? <BtnPrimary onClick={() => setCategoryModalOpen(true)}>Nova categoria</BtnPrimary> : undefined}>
      {categories.map(category => <div key={category.id} className="flex items-center gap-3 border-b border-border py-2 last:border-0"><Tag size={16} className="text-primary" /><span className="text-sm font-medium">{category.name}</span></div>)}
    </Section>}

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
      <BtnSecondary onClick={() => window.open("/marketplace", "_blank", "noopener,noreferrer")}>Abrir marketplace</BtnSecondary>
    </AdminStickyToolbar>

    <AdminDialog open={storeModalOpen} onClose={() => !saving && setStoreModalOpen(false)} title={ownStore ? "Editar loja" : "Criar loja"} footer={<><BtnSecondary disabled={saving} onClick={() => setStoreModalOpen(false)}>Cancelar</BtnSecondary><BtnPrimary disabled={saving} loading={saving} onClick={() => void submitStore()}>Salvar</BtnPrimary></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={labelClass}>Nome público da loja</span><input className={inputClass} maxLength={120} value={storeForm.display_name} onChange={e => setStoreForm(s => ({ ...s, display_name: e.target.value, slug: ownStore ? s.slug : slugify(e.target.value) }))} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Endereço da loja (slug)</span><input className={inputClass} value={storeForm.slug} onChange={e => setStoreForm(s => ({ ...s, slug: slugify(e.target.value) }))} /></label>
        <label><span className={labelClass}>Cidade</span><input className={inputClass} value={storeForm.city} onChange={e => setStoreForm(s => ({ ...s, city: e.target.value }))} /></label>
        <label><span className={labelClass}>UF</span><input className={inputClass} maxLength={2} value={storeForm.state} onChange={e => setStoreForm(s => ({ ...s, state: e.target.value }))} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Apresentação</span><textarea className={areaClass} value={storeForm.description} onChange={e => setStoreForm(s => ({ ...s, description: e.target.value }))} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>URL pública da imagem da loja (opcional)</span><input className={inputClass} value={storeForm.logo_url} onChange={e => setStoreForm(s => ({ ...s, logo_url: e.target.value }))} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>URL pública do banner (opcional)</span><input className={inputClass} value={storeForm.banner_url} onChange={e => setStoreForm(s => ({ ...s, banner_url: e.target.value }))} /></label>
      </div>
    </AdminDialog>

    <AdminDialog open={listingModalOpen} onClose={() => !saving && setListingModalOpen(false)} title={editListing ? "Editar anúncio" : "Novo anúncio"} footer={<><BtnSecondary disabled={saving} onClick={() => setListingModalOpen(false)}>Cancelar</BtnSecondary><BtnPrimary disabled={saving} loading={saving} onClick={() => void submitListing()}>Salvar</BtnPrimary></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={labelClass}>Item do CRM</span>
          <select className={inputClass} value={listingForm.source_key} disabled={Boolean(editListing)} onChange={e => {
            const source = sources.find(x => x.kind + ":" + x.id === e.target.value);
            setListingForm(s => ({ ...s, source_key: e.target.value, title: source?.name || "", price: source?.price == null ? "" : String(source.price), price_type: source?.price == null ? "quote" : "fixed" }));
          }}><option value="">Selecione um serviço ou produto</option>
            {sources.map(source => <option key={source.kind + source.id} value={source.kind + ":" + source.id}>{source.kind === "service" ? "Serviço" : "Produto"} · {source.name}</option>)}
            {editListing && !sources.some(s => s.kind + ":" + s.id === listingForm.source_key) && <option value={listingForm.source_key}>Item de origem vinculado</option>}
          </select>
        </label>
        <label className="sm:col-span-2"><span className={labelClass}>Título</span><input className={inputClass} maxLength={180} value={listingForm.title} onChange={e => setListingForm(s => ({ ...s, title: e.target.value }))} /></label>
        <label><span className={labelClass}>Categoria</span><select className={inputClass} value={listingForm.category_id} onChange={e => setListingForm(s => ({ ...s, category_id: e.target.value }))}><option value="">Sem categoria</option>{categories.filter(x => x.is_active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span className={labelClass}>Forma de contratação</span><select className={inputClass} value={listingForm.price_type} onChange={e => setListingForm(s => ({ ...s, price_type: e.target.value as ListingForm["price_type"] }))}><option value="quote">Sob orçamento</option><option value="fixed">Preço fixo</option><option value="appointment">Agendamento</option></select></label>
        <label><span className={labelClass}>Preço anunciado (R$)</span><input type="number" min="0" step="0.01" className={inputClass} value={listingForm.price} onChange={e => setListingForm(s => ({ ...s, price: e.target.value }))} /></label>
        <label><span className={labelClass}>URL pública da imagem (opcional)</span><input className={inputClass} value={listingForm.cover_image_url} onChange={e => setListingForm(s => ({ ...s, cover_image_url: e.target.value }))} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Descrição comercial</span><textarea className={areaClass} value={listingForm.description} onChange={e => setListingForm(s => ({ ...s, description: e.target.value }))} /></label>
      </div>
    </AdminDialog>

    <AdminDialog open={categoryModalOpen} onClose={() => !saving && setCategoryModalOpen(false)} title="Nova categoria" footer={<><BtnSecondary onClick={() => setCategoryModalOpen(false)}>Cancelar</BtnSecondary><BtnPrimary loading={saving} onClick={() => void submitCategory()}>Salvar</BtnPrimary></>}>
      <label><span className={labelClass}>Nome da categoria</span><input className={inputClass} value={categoryName} onChange={e => setCategoryName(e.target.value)} /></label>
    </AdminDialog>
  </div>;
}
