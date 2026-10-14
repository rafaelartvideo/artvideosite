import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ClipboardList,
  MapPin, Menu, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Store, Wrench, X,
} from "lucide-react";
import {
  loadPublicMarketplace, type MarketplaceCategory, type MarketplaceListing, type MarketplaceStore,
} from "../infrastructure/marketplace.repository";

const money = (value: number | null) => value == null
  ? "Sob orçamento"
  : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const promotions = [
  { label: "Encontre o profissional certo", title: "O serviço que você precisa, em um só lugar.", text: "Compare soluções oferecidas por empresas participantes da Union World.", accent: "bg-[#e7ecff]", icon: Wrench },
  { label: "Contrate com mais informação", title: "Conheça os serviços antes de contratar.", text: "Explore descrições, preços anunciados e perfis das empresas.", accent: "bg-[#e7f6f1]", icon: ShieldCheck },
  { label: "Empresas participantes", title: "Encontre prestadores perto de você.", text: "Descubra profissionais e fornecedores cadastrados e habilitados na Union.", accent: "bg-[#fff0dc]", icon: Store },
];

const cardBorder = "border border-[#e4e8f0] bg-white shadow-sm transition hover:border-[#b9c4e0] hover:shadow-md";
function ListingPhoto({ listing, large = false }: { listing: MarketplaceListing; large?: boolean }) {
  return <div className={`relative flex w-full items-center justify-center overflow-hidden bg-[#f5f7fb] ${large ? "aspect-[4/3]" : "aspect-[5/4]"}`}>
    {listing.cover_image_url
      ? <img src={listing.cover_image_url} alt={listing.title} className="h-full w-full object-contain" loading="lazy" />
      : listing.source_kind === "service"
        ? <Wrench size={large ? 88 : 50} strokeWidth={1.1} className="text-[#9aa8c3]" />
        : <ShoppingBag size={large ? 88 : 50} strokeWidth={1.1} className="text-[#9aa8c3]" />}
  </div>;
}

export function MarketplaceHomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "service" | "product">("all");
  const [category, setCategory] = useState<string | null>(null);
  const [banner, setBanner] = useState(0);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadPublicMarketplace().then(data => {
      if (!mounted) return;
      setStores(data.stores); setListings(data.listings); setCategories(data.categories);
    }).catch(() => { if (mounted) setError("Não foi possível carregar o catálogo neste momento."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const path = location.pathname;
  const listingId = path.match(/^\/marketplace\/(?:servico|produto)\/([^/]+)$/)?.[1];
  const storeSlug = path.match(/^\/marketplace\/loja\/([^/]+)$/)?.[1];
  const detail = listings.find(x => x.id === listingId);
  const selectedStore = stores.find(x => x.slug === storeSlug);
  const vendor = detail ? stores.find(x => x.organization_id === detail.organization_id) : null;
  const visible = useMemo(() => listings.filter(item => {
    if (kind !== "all" && item.source_kind !== kind) return false;
    if (category && item.category_id !== category) return false;
    if (selectedStore && item.organization_id !== selectedStore.organization_id) return false;
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return true;
    const company = stores.find(x => x.organization_id === item.organization_id);
    return [item.title, item.description, company?.display_name].some(text => text?.toLocaleLowerCase("pt-BR").includes(normalized));
  }), [listings, kind, category, query, selectedStore, stores]);
  const openListing = (item: MarketplaceListing) => {
    navigate(`/marketplace/${item.source_kind === "service" ? "servico" : "produto"}/${item.id}`);
    window.scrollTo({ top: 0 });
  };
  const openStore = (store: MarketplaceStore) => {
    setCategory(null); setQuery(""); setKind("all");
    navigate(`/marketplace/loja/${store.slug}`); window.scrollTo({ top: 0 });
  };
  const backHome = () => { navigate("/marketplace"); setCategory(null); setQuery(""); setKind("all"); window.scrollTo({ top: 0 }); };
  const activeBanner = promotions[banner];
  const PromoIcon = activeBanner.icon;
  const serviceItems = visible.filter(x => x.source_kind === "service");
  const productItems = visible.filter(x => x.source_kind === "product");

  function itemCard(item: MarketplaceListing) {
    const company = stores.find(x => x.organization_id === item.organization_id);
    return <button key={item.id} type="button" onClick={() => openListing(item)} className={`group min-w-0 overflow-hidden rounded-xl text-left ${cardBorder}`}>
      <ListingPhoto listing={item} />
      <div className="space-y-2 border-t border-[#edf0f6] p-4">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#1032dc]">{item.source_kind === "service" ? "Serviço" : "Produto"}</span>
        <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-[#18253d]">{item.title}</h3>
        <p className="truncate text-xs text-[#738097]">{company?.display_name || "Empresa participante"}</p>
        <p className="text-xl font-black text-[#112244]">{item.price_type === "quote" ? "Sob orçamento" : money(item.price)}</p>
        <p className="flex items-center gap-1 text-xs font-bold text-[#1032dc]">Ver detalhes <ChevronRight size={13} /></p>
      </div>
    </button>;
  }

  return <div className="min-h-dvh bg-[#f5f6fa] text-[#16243c]">
    <header className="sticky top-0 z-40 border-b border-[#e5e9f0] bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 lg:flex-nowrap lg:gap-6 lg:px-6">
        <button type="button" onClick={backHome} className="flex shrink-0 items-center gap-2 text-left">
          <img src="/assets/crm/login/logotelalogin.png" alt="Union World" className="h-8 max-w-[128px] object-contain" />
          <span className="hidden border-l border-[#d7ddeb] pl-2 text-xs font-black uppercase text-[#1032dc] sm:block">Marketplace</span>
        </button>
        <label className="order-3 flex h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-[#d4dbe7] bg-[#f8faff] px-3 transition focus-within:border-[#1032dc] lg:order-none lg:flex-1">
          <Search size={18} className="shrink-0 text-[#78859b]" />
          <input value={query} onChange={e => { if (detail) { navigate("/marketplace"); setCategory(null); setKind("all"); } setQuery(e.target.value); }} placeholder="O que você precisa contratar?" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8b96a7]" />
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <a href="/admin" className="hidden text-xs font-bold text-[#304563] hover:text-[#1032dc] sm:block">Área da empresa</a>
          <button type="button" className="rounded-lg border border-[#dfe4ed] p-2 lg:hidden" onClick={() => setMenuOpen(v => !v)} aria-label="Abrir menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </div>
      <nav className={`mx-auto max-w-[1400px] items-center gap-1 overflow-x-auto px-4 pb-3 lg:flex lg:px-6 ${menuOpen ? "flex" : "hidden lg:flex"}`}>
        <button onClick={backHome} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold hover:bg-[#eef1ff]">Início</button>
        <button onClick={() => { backHome(); setKind("service"); }} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold hover:bg-[#eef1ff]">Serviços</button>
        <button onClick={() => { backHome(); setKind("product"); }} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold hover:bg-[#eef1ff]">Produtos</button>
        {categories.slice(0, 6).map(item => <button key={item.id} onClick={() => { backHome(); setCategory(item.id); }} className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-[#526178] hover:bg-[#eef1ff]">{item.name}</button>)}
        <a href="/admin" className="ml-auto shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-[#1032dc] sm:hidden">Área da empresa</a>
      </nav>
    </header>

    <main className="mx-auto max-w-[1400px] space-y-8 px-4 pb-16 pt-5 lg:px-6">
      {notice && <div role="status" className="flex items-center justify-between gap-4 rounded-lg border border-[#c8d1f5] bg-[#eef1ff] px-4 py-3 text-sm text-[#233d91]">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={18} /></button></div>}
      {loading ? <div className="py-20 text-center text-sm text-[#66758e]">Carregando catálogo...</div> :
      error ? <div className="rounded-xl bg-white p-10 text-center text-sm text-red-700">{error}</div> :
      detail ? <div className="space-y-6">
        <button onClick={backHome} className="flex items-center gap-2 text-sm font-semibold text-[#53657f] hover:text-[#1032dc]"><ArrowLeft size={16} /> Voltar ao marketplace</button>
        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr_.8fr]">
          <div className="overflow-hidden rounded-xl border border-[#e1e6ef] bg-white"><ListingPhoto listing={detail} large /></div>
          <div className="rounded-xl border border-[#e1e6ef] bg-white p-6">
            <span className="text-xs font-bold uppercase tracking-wide text-[#1032dc]">{detail.source_kind === "service" ? "Serviço" : "Produto"}</span>
            <h1 className="mt-3 text-2xl font-black leading-tight">{detail.title}</h1>
            <div className="my-5 h-px bg-[#e8ecf3]" />
            <h2 className="mb-2 text-sm font-black">Descrição</h2>
            <p className="whitespace-pre-line text-sm leading-7 text-[#596981]">{detail.description || "Entre em contato com a empresa para saber mais sobre este anúncio."}</p>
            <div className="mt-6 flex flex-wrap gap-2">{detail.price_type === "appointment" && <span className="rounded-full bg-[#edf1ff] px-3 py-1 text-xs font-bold text-[#1032dc]">Agendamento</span>}{detail.price_type === "quote" && <span className="rounded-full bg-[#edf1ff] px-3 py-1 text-xs font-bold text-[#1032dc]">Mediante orçamento</span>}</div>
          </div>
          <aside className="h-fit space-y-4 rounded-xl border border-[#e1e6ef] bg-white p-5">
            <p className="text-xs text-[#78859b]">Valor anunciado</p>
            <p className="text-3xl font-black">{detail.price_type === "quote" ? "Sob orçamento" : money(detail.price)}</p>
            <button className="w-full rounded-lg bg-[#1032dc] px-4 py-3 text-sm font-black text-white hover:bg-[#0928b8]" onClick={() => setNotice("A contratação direta e o envio de solicitações serão habilitados na etapa de intermediação.")}>{detail.price_type === "quote" ? "Solicitar orçamento" : detail.price_type === "appointment" ? "Solicitar agendamento" : "Solicitar contratação"}</button>
            <p className="text-xs leading-5 text-[#8a96a7]">Contratação online em preparação. Nenhuma cobrança é realizada nesta etapa.</p>
            {vendor && <button onClick={() => openStore(vendor)} className="flex w-full items-center gap-3 border-t border-[#e8ecf3] pt-4 text-left"><Store size={22} className="text-[#1032dc]" /><span className="min-w-0"><strong className="block truncate text-sm">{vendor.display_name}</strong><span className="text-xs text-[#75849b]">{vendor.city} {vendor.state}</span></span><ChevronRight size={16} className="ml-auto" /></button>}
          </aside>
        </div>
      </div> : <>
        {selectedStore ? <section className="overflow-hidden rounded-xl border border-[#e1e6ef] bg-white">
          {selectedStore.banner_url && <img src={selectedStore.banner_url} className="max-h-64 w-full object-cover" alt="" />}
          <div className="flex flex-wrap items-center gap-4 p-6">
            {selectedStore.logo_url ? <img src={selectedStore.logo_url} className="h-16 w-16 rounded-xl object-cover" alt={selectedStore.display_name} /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#eef1ff]"><Store size={28} className="text-[#1032dc]" /></div>}
            <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase text-[#1032dc]">Empresa participante</p><h1 className="mt-1 text-2xl font-black">{selectedStore.display_name}</h1><p className="mt-1 text-sm text-[#63738c]">{selectedStore.description}</p><p className="mt-2 flex items-center gap-1 text-xs text-[#7c8ca3]"><MapPin size={13} /> {selectedStore.city || "Localização não informada"} {selectedStore.state}</p></div>
            <button onClick={backHome} className="rounded-lg border border-[#dbe1eb] px-4 py-2 text-xs font-bold">Todas as lojas</button>
          </div>
        </section> : <section className="relative overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className={`grid min-h-[250px] gap-6 p-7 sm:p-10 lg:grid-cols-[1fr_260px] lg:items-center lg:p-14 ${activeBanner.accent}`}>
            <div className="relative z-10 max-w-2xl space-y-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1032dc]">{activeBanner.label}</p>
              <h1 className="text-3xl font-black leading-tight sm:text-4xl">{activeBanner.title}</h1>
              <p className="text-sm leading-7 text-[#51617a]">{activeBanner.text}</p>
              <button onClick={() => document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" })} className="flex items-center gap-2 rounded-lg bg-[#1032dc] px-5 py-3 text-sm font-black text-white">Explorar serviços <ArrowRight size={17} /></button>
            </div>
            <div className="hidden h-44 w-44 items-center justify-center justify-self-center rounded-[40px] bg-white/70 lg:flex"><PromoIcon size={94} strokeWidth={1} className="text-[#1032dc]" /></div>
          </div>
          <div className="absolute bottom-4 right-4 flex items-center gap-3">
            <button onClick={() => setBanner(v => (v + promotions.length - 1) % promotions.length)} aria-label="Banner anterior" className="rounded-full bg-white p-2 shadow"><ChevronLeft size={16} /></button>
            <span className="text-xs font-bold">{banner + 1} / {promotions.length}</span>
            <button onClick={() => setBanner(v => (v + 1) % promotions.length)} aria-label="Próximo banner" className="rounded-full bg-white p-2 shadow"><ChevronRight size={16} /></button>
          </div>
        </section>}

        {!selectedStore && <section className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl bg-white p-4"><ShieldCheck className="text-[#1032dc]" /><p className="text-sm font-bold">Empresas autorizadas pela Union</p></div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4"><ClipboardList className="text-[#1032dc]" /><p className="text-sm font-bold">Serviços com informações detalhadas</p></div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4"><Store className="text-[#1032dc]" /><p className="text-sm font-bold">Prestadores do ecossistema Union</p></div>
        </section>}

        {!selectedStore && <section className="space-y-4">
          <div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase text-[#1032dc]">Explore</p><h2 className="text-xl font-black">Categorias de serviços</h2></div></div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {categories.map(item => <button key={item.id} onClick={() => setCategory(category === item.id ? null : item.id)} className={`min-w-[160px] flex-1 shrink-0 rounded-xl border p-4 text-left text-sm font-bold transition ${category === item.id ? "border-[#1032dc] bg-[#edf1ff] text-[#1032dc]" : "border-[#e4e8f0] bg-white hover:border-[#9cadde]"}`}><div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef1ff]"><SlidersHorizontal size={18} className="text-[#1032dc]" /></div>{item.name}</button>)}
          </div>
        </section>}

        <section id="catalogo" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-[#1032dc]">Marketplace</p><h2 className="text-xl font-black">{selectedStore ? "Anúncios desta empresa" : "Encontre o que você precisa"}</h2><p className="text-sm text-[#7b8799]">{visible.length} {visible.length === 1 ? "anúncio disponível" : "anúncios disponíveis"}</p></div>
            <div className="flex gap-1 rounded-lg border border-[#e0e6ef] bg-white p-1">
              {([["all","Tudo"],["service","Serviços"],["product","Produtos"]] as const).map(([id,label]) => <button key={id} onClick={() => setKind(id)} className={`rounded-md px-3 py-2 text-xs font-bold ${kind === id ? "bg-[#1032dc] text-white" : "text-[#53627a]"}`}>{label}</button>)}
            </div>
          </div>
          {visible.length === 0 ? <div className="rounded-xl border border-[#e1e7ef] bg-white px-6 py-16 text-center"><Search size={28} className="mx-auto mb-3 text-[#a3b0c2]" /><h3 className="font-black">Nenhum anúncio disponível</h3><p className="mt-2 text-sm text-[#73829a]">As empresas participantes poderão publicar serviços e produtos após aprovação.</p>{(query || category || kind !== "all") && <button onClick={() => { setQuery(""); setCategory(null); setKind("all"); }} className="mt-4 rounded-lg border border-[#dfe4ee] px-4 py-2 text-sm font-bold">Limpar filtros</button>}</div> : <>
            {(kind !== "product" && serviceItems.length > 0) && <div className="space-y-3"><h3 className="text-lg font-black">Serviços disponíveis</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{serviceItems.map(itemCard)}</div></div>}
            {(kind !== "service" && productItems.length > 0) && <div className="space-y-3"><h3 className="text-lg font-black">Produtos</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{productItems.map(itemCard)}</div></div>}
          </>}
        </section>
        {!selectedStore && stores.length > 0 && <section className="space-y-4">
          <h2 className="text-xl font-black">Lojas participantes</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">{stores.map(store => <button key={store.organization_id} onClick={() => openStore(store)} className={`min-w-64 max-w-80 shrink-0 rounded-xl p-5 text-left ${cardBorder}`}><div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#edf1ff]">{store.logo_url ? <img src={store.logo_url} alt="" className="h-full w-full object-cover" /> : <Store size={23} className="text-[#1032dc]" />}</div><p className="font-black">{store.display_name}</p><p className="mt-1 line-clamp-2 text-xs text-[#728097]">{store.description || "Empresa participante"}</p><p className="mt-4 flex items-center gap-1 text-xs font-bold text-[#1032dc]">Ver loja <ChevronRight size={15} /></p></button>)}</div>
        </section>}
      </>}
    </main>
    <footer className="border-t border-[#e5e9f0] bg-white"><div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-7 text-xs text-[#7e8ba0]"><span>Union Marketplace · Serviços e produtos de empresas participantes</span><span>Vendedores habilitados pela Union World</span></div></footer>
  </div>;
}
