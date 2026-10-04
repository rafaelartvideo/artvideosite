import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  Eraser,
  Heart,
  Laptop,
  MapPin,
  Menu,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

type MarketplaceKind = "product" | "service";

type MarketplaceCompany = {
  id: string;
  name: string;
  tagline: string;
  city: string;
  verified: boolean;
  initials: string;
};

type MarketplaceItem = {
  id: string;
  companyId: string;
  kind: MarketplaceKind;
  title: string;
  description: string;
  category: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  badge?: string;
  icon: typeof Smartphone;
};

const companies: MarketplaceCompany[] = [
  { id: "techplus", name: "TechPlus", tagline: "Tecnologia que conecta você ao futuro.", city: "Aracaju, SE", verified: true, initials: "T+" },
  { id: "artvideo", name: "Eletrônica Artvideo", tagline: "Assistência técnica e soluções em eletrônica.", city: "Aracaju, SE", verified: true, initials: "AV" },
  { id: "casamoderna", name: "Casa Moderna", tagline: "Produtos selecionados para casa e escritório.", city: "Aracaju, SE", verified: true, initials: "CM" },
  { id: "alphaconsult", name: "Alpha Consultoria", tagline: "Serviços profissionais para empresas.", city: "Online", verified: true, initials: "AC" },
];

const items: MarketplaceItem[] = [
  {
    id: "smartphone-s24",
    companyId: "techplus",
    kind: "product",
    title: "Smartphone Galaxy S24 128GB",
    description: "Smartphone 5G, 128GB, câmera tripla e tela AMOLED.",
    category: "Eletrônicos",
    price: 3499,
    oldPrice: 3899,
    rating: 4.8,
    reviews: 320,
    badge: "Frete grátis",
    icon: Smartphone,
  },
  {
    id: "notebook-pro",
    companyId: "techplus",
    kind: "product",
    title: "Notebook Pro 15",
    description: "Notebook para trabalho e estudo com SSD de alta velocidade.",
    category: "Informática",
    price: 2999,
    oldPrice: 3299,
    rating: 4.7,
    reviews: 184,
    badge: "Oferta",
    icon: Laptop,
  },
  {
    id: "reparo-smartphone",
    companyId: "artvideo",
    kind: "service",
    title: "Manutenção de smartphone",
    description: "Diagnóstico e reparo técnico com acompanhamento do serviço.",
    category: "Assistência técnica",
    price: 149,
    rating: 4.9,
    reviews: 412,
    badge: "Agendamento",
    icon: Wrench,
  },
  {
    id: "reparo-tv",
    companyId: "artvideo",
    kind: "service",
    title: "Diagnóstico de TV",
    description: "Análise técnica completa para TVs e equipamentos eletrônicos.",
    category: "Assistência técnica",
    price: 120,
    rating: 4.8,
    reviews: 238,
    icon: Wrench,
  },
  {
    id: "cadeira-office",
    companyId: "casamoderna",
    kind: "product",
    title: "Cadeira Office Comfort",
    description: "Cadeira ergonômica com regulagem de altura e apoio lombar.",
    category: "Casa e escritório",
    price: 799,
    oldPrice: 949,
    rating: 4.6,
    reviews: 96,
    badge: "Mais vendido",
    icon: ShoppingBag,
  },
  {
    id: "consultoria-financeira",
    companyId: "alphaconsult",
    kind: "service",
    title: "Consultoria financeira empresarial",
    description: "Diagnóstico financeiro e plano de ação para pequenas empresas.",
    category: "Serviços profissionais",
    price: 350,
    rating: 4.9,
    reviews: 67,
    badge: "Online",
    icon: Building2,
  },
];

const categories = [
  { label: "Eletrônicos", icon: Smartphone },
  { label: "Informática", icon: Laptop },
  { label: "Assistência técnica", icon: Wrench },
  { label: "Casa e escritório", icon: ShoppingBag },
  { label: "Serviços profissionais", icon: Building2 },
];

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MarketplaceHomePage() {
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<"all" | MarketplaceKind>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selectedCompany = activeCompany ? companies.find(company => company.id === activeCompany) ?? null : null;

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return items.filter(item => {
      if (activeKind !== "all" && item.kind !== activeKind) return false;
      if (activeCategory && item.category !== activeCategory) return false;
      if (activeCompany && item.companyId !== activeCompany) return false;
      if (!normalized) return true;
      const company = companies.find(current => current.id === item.companyId);
      return [item.title, item.description, item.category, company?.name]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("pt-BR").includes(normalized));
    });
  }, [activeCategory, activeCompany, activeKind, query]);

  const clearFilters = () => {
    setQuery("");
    setActiveKind("all");
    setActiveCategory(null);
    setActiveCompany(null);
  };

  return (
    <div className="min-h-dvh bg-[#f6f7fb] text-[#0d1b2e]">
      <header className="sticky top-0 z-40 border-b border-[#dfe4ec] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/marketplace" className="flex min-w-0 items-center gap-3">
            <img src="/assets/crm/login/logotelalogin.png" alt="Union World" className="h-8 w-auto max-w-[132px] object-contain" />
            <span className="hidden border-l border-[#dfe4ec] pl-3 text-sm font-black text-[#1032dc] sm:block">Marketplace</span>
          </a>

          <div className="hidden flex-1 md:block">
            <label className="relative mx-auto block max-w-2xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7a8799]" size={18} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar produtos, serviços ou empresas"
                className="h-11 w-full border border-[#d7deea] bg-[#f8fafc] pl-11 pr-4 text-sm font-medium outline-none transition focus:border-[#1032dc] focus:bg-white"
              />
            </label>
          </div>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <button className="flex h-10 items-center gap-2 px-3 text-sm font-bold text-[#334155] transition hover:text-[#1032dc]">
              <UserRound size={18} /> Entrar
            </button>
            <button className="relative flex h-10 items-center gap-2 px-3 text-sm font-bold text-[#334155] transition hover:text-[#1032dc]">
              <ShoppingCart size={18} /> Carrinho
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1032dc] px-1 text-[10px] font-black text-white">0</span>
            </button>
          </div>

          <button
            type="button"
            className="ml-auto flex h-10 w-10 items-center justify-center md:hidden"
            onClick={() => setMobileMenuOpen(open => !open)}
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <div className="border-t border-[#eef1f5] md:hidden">
          <div className="p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8799]" size={17} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="O que você procura?"
                className="h-10 w-full border border-[#d7deea] bg-[#f8fafc] pl-10 pr-3 text-sm outline-none focus:border-[#1032dc]"
              />
            </label>
          </div>
          {mobileMenuOpen && (
            <div className="grid grid-cols-2 gap-2 border-t border-[#eef1f5] p-3">
              <button className="border border-[#dfe4ec] bg-white p-3 text-left text-sm font-bold">Minha conta</button>
              <button className="border border-[#dfe4ec] bg-white p-3 text-left text-sm font-bold">Carrinho</button>
            </div>
          )}
        </div>
      </header>

      <nav className="border-b border-[#e5e9f0] bg-white">
        <div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          {[
            ["all", "Tudo"],
            ["product", "Produtos"],
            ["service", "Serviços"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveKind(value as "all" | MarketplaceKind)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-bold transition ${activeKind === value ? "bg-[#1032dc] text-white" : "text-[#536174] hover:bg-[#f1f4f9]"}`}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => document.getElementById("empresas")?.scrollIntoView({ behavior: "smooth" })} className="whitespace-nowrap px-4 py-2 text-sm font-bold text-[#536174] hover:bg-[#f1f4f9]">
            Empresas parceiras
          </button>
          <button type="button" onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })} className="whitespace-nowrap px-4 py-2 text-sm font-bold text-[#536174] hover:bg-[#f1f4f9]">
            Como funciona
          </button>
        </div>
      </nav>

      <main>
        <section className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {selectedCompany ? (
            <div className="relative overflow-hidden bg-[#0d1b2e] p-6 text-white sm:p-8 lg:p-10">
              <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#1032dc]/45 blur-3xl" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-black text-[#1032dc]">{selectedCompany.initials}</div>
                  <div>
                    <button type="button" onClick={() => setActiveCompany(null)} className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/55 hover:text-white">← Voltar ao marketplace</button>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-black sm:text-3xl">{selectedCompany.name}</h1>
                      {selectedCompany.verified && <BadgeCheck size={20} className="text-[#6ea8ff]" />}
                    </div>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">{selectedCompany.tagline}</p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-white/60"><MapPin size={14} /> {selectedCompany.city}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/8 px-4 py-3"><strong className="block text-xl">{items.filter(item => item.companyId === selectedCompany.id).length}</strong><span className="text-[11px] text-white/60">Anúncios</span></div>
                  <div className="bg-white/8 px-4 py-3"><strong className="block text-xl">4,9</strong><span className="text-[11px] text-white/60">Avaliação</span></div>
                  <div className="bg-white/8 px-4 py-3"><strong className="block text-xl">100%</strong><span className="text-[11px] text-white/60">Verificada</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden bg-[#0d1b2e] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-16">
              <div className="absolute -right-16 -top-20 h-80 w-80 rounded-full bg-[#1032dc]/70 blur-3xl" />
              <div className="absolute bottom-0 right-[18%] h-44 w-44 rounded-full bg-[#5d73ef]/30 blur-3xl" />
              <div className="relative grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
                <div className="max-w-2xl">
                  <div className="mb-4 inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#b9c7ff]">
                    <Sparkles size={14} /> Union Marketplace
                  </div>
                  <h1 className="text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
                    Diversas empresas.<br />Um só marketplace.
                  </h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/70 sm:text-base">
                    Produtos e serviços de empresas parceiras em um ambiente administrado pela Union World.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <button type="button" onClick={() => document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" })} className="flex h-11 items-center gap-2 bg-white px-5 text-sm font-black text-[#0d1b2e] transition hover:bg-[#edf1ff]">
                      Explorar marketplace <ArrowRight size={17} />
                    </button>
                    <button type="button" onClick={() => document.getElementById("empresas")?.scrollIntoView({ behavior: "smooth" })} className="flex h-11 items-center gap-2 border border-white/20 bg-white/5 px-5 text-sm font-black text-white transition hover:bg-white/10">
                      Ver empresas
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [ShieldCheck, "Empresas verificadas", "Parceiros aprovados pela Union"],
                    [ShoppingBag, "Produtos e serviços", "Tudo no mesmo ambiente"],
                    [Truck, "Entrega e atendimento", "Cada parceiro define sua operação"],
                    [PackageCheck, "Compra acompanhada", "Pedidos centralizados na plataforma"],
                  ].map(([Icon, title, description]) => {
                    const CardIcon = Icon as typeof ShieldCheck;
                    return (
                      <div key={String(title)} className="border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                        <CardIcon size={22} className="text-[#8ea2ff]" />
                        <p className="mt-3 text-sm font-black">{String(title)}</p>
                        <p className="mt-1 text-xs leading-5 text-white/55">{String(description)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {!selectedCompany && (
          <section className="mx-auto max-w-[1440px] px-4 pb-4 sm:px-6 lg:px-8">
            <div className="grid border border-[#e0e5ed] bg-white sm:grid-cols-2 lg:grid-cols-4">
              {[
                [ShieldCheck, "Compra protegida", "Ambiente administrado pela Union"],
                [BadgeCheck, "Parceiros verificados", "Empresas validadas na plataforma"],
                [Tag, "Ofertas em um só lugar", "Compare produtos e serviços"],
                [Store, "Catálogo por empresa", "Visite a loja de cada parceiro"],
              ].map(([Icon, title, description], index) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className={`flex items-center gap-3 p-4 ${index ? "border-t border-[#e8ecf2] sm:border-l sm:border-t-0" : ""}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef1ff] text-[#1032dc]"><FeatureIcon size={19} /></span>
                    <div><p className="text-sm font-black">{String(title)}</p><p className="mt-0.5 text-xs text-[#738095]">{String(description)}</p></div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1032dc]">Explore</p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">Categorias</h2>
            </div>
            {(activeCategory || activeCompany || activeKind !== "all" || query) && (
              <button type="button" onClick={clearFilters} className="inline-flex h-8 items-center gap-1.5 border border-[#1032dc]/20 bg-white px-3 text-xs font-black text-[#1032dc] transition hover:bg-[#eef1ff]"><Eraser size={13} /> Limpar filtros</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map(category => {
              const Icon = category.icon;
              const active = activeCategory === category.label;
              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => setActiveCategory(active ? null : category.label)}
                  className={`flex min-h-24 flex-col items-center justify-center border p-4 text-center transition ${active ? "border-[#1032dc] bg-[#eef1ff] text-[#1032dc]" : "border-[#e0e5ed] bg-white hover:border-[#b9c4d4]"}`}
                >
                  <Icon size={24} />
                  <span className="mt-2 text-xs font-black sm:text-sm">{category.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section id="catalogo" className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1032dc]">{selectedCompany ? "Catálogo da empresa" : "Marketplace"}</p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">{selectedCompany ? `Anúncios de ${selectedCompany.name}` : "Produtos e serviços em destaque"}</h2>
              <p className="mt-1 text-sm text-[#6b788b]">{visibleItems.length} {visibleItems.length === 1 ? "resultado encontrado" : "resultados encontrados"}</p>
            </div>
            <select
              className="h-10 border border-[#d7deea] bg-white px-3 text-sm font-bold outline-none"
              aria-label="Ordenar catálogo"
              defaultValue="relevance"
            >
              <option value="relevance">Mais relevantes</option>
              <option value="price-low">Menor preço</option>
              <option value="price-high">Maior preço</option>
              <option value="rating">Melhor avaliação</option>
            </select>
          </div>

          {visibleItems.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map(item => {
                const company = companies.find(current => current.id === item.companyId)!;
                const Icon = item.icon;
                return (
                  <article key={item.id} className="group border border-[#e0e5ed] bg-white transition hover:-translate-y-0.5 hover:border-[#cbd4e2] hover:shadow-lg hover:shadow-[#0d1b2e]/5">
                    <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-[#f4f6fb] to-[#e8edf6]">
                      {item.badge && <span className="absolute left-3 top-3 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#1032dc] shadow-sm">{item.badge}</span>}
                      <button type="button" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#68768a] shadow-sm transition hover:text-[#e11d48]" aria-label="Favoritar"><Heart size={16} /></button>
                      <Icon size={68} strokeWidth={1.2} className="text-[#20324f] transition-transform group-hover:scale-105" />
                    </div>
                    <div className="p-4">
                      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#738095]">
                        <span className={`px-2 py-1 ${item.kind === "service" ? "bg-[#effaf5] text-[#16835f]" : "bg-[#eef1ff] text-[#1032dc]"}`}>{item.kind === "service" ? "Serviço" : "Produto"}</span>
                        <span className="truncate">{item.category}</span>
                      </div>
                      <h3 className="line-clamp-2 min-h-10 text-sm font-black leading-5">{item.title}</h3>
                      <button type="button" onClick={() => setActiveCompany(company.id)} className="mt-2 flex items-center gap-1 text-xs font-bold text-[#657286] hover:text-[#1032dc]">
                        {company.name} {company.verified && <BadgeCheck size={13} className="text-[#1032dc]" />}
                      </button>
                      <div className="mt-3 flex items-center gap-1 text-xs">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        <strong>{item.rating.toFixed(1).replace(".", ",")}</strong>
                        <span className="text-[#8a96a8]">({item.reviews})</span>
                      </div>
                      <div className="mt-4">
                        {item.oldPrice && <p className="text-xs text-[#97a2b2] line-through">{money(item.oldPrice)}</p>}
                        <p className="text-xl font-black">{money(item.price)}</p>
                        <p className="mt-0.5 text-[11px] text-[#7a8799]">{item.kind === "product" ? "em até 10x sem juros" : "valor inicial"}</p>
                      </div>
                      <button type="button" className="mt-4 flex h-10 w-full items-center justify-center gap-2 bg-[#1032dc] px-4 text-sm font-black text-white transition hover:bg-[#0c28b8]">
                        {item.kind === "product" ? "Ver produto" : "Ver serviço"} <ChevronRight size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-[#cfd7e4] bg-white px-6 py-16 text-center">
              <Search size={30} className="mx-auto text-[#9aa5b5]" />
              <h3 className="mt-4 text-base font-black">Nenhum anúncio encontrado</h3>
              <p className="mt-1 text-sm text-[#738095]">Tente remover algum filtro ou buscar outro termo.</p>
              <button type="button" onClick={clearFilters} className="mt-5 inline-flex items-center gap-2 bg-[#1032dc] px-5 py-2.5 text-sm font-black text-white"><Eraser size={15} /> Limpar filtros</button>
            </div>
          )}
        </section>

        <section id="empresas" className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1032dc]">Parceiros</p>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">Empresas no marketplace</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {companies.map(company => (
              <button
                key={company.id}
                type="button"
                onClick={() => {
                  setActiveCompany(company.id);
                  setActiveCategory(null);
                  document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="group border border-[#e0e5ed] bg-white p-5 text-left transition hover:border-[#aebbd0] hover:shadow-lg hover:shadow-[#0d1b2e]/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d1b2e] text-sm font-black text-white">{company.initials}</span>
                  {company.verified && <span className="flex items-center gap-1 bg-[#eef1ff] px-2 py-1 text-[10px] font-black uppercase text-[#1032dc]"><BadgeCheck size={12} /> Verificada</span>}
                </div>
                <h3 className="mt-4 flex items-center gap-1.5 text-base font-black">{company.name}</h3>
                <p className="mt-1 min-h-10 text-xs leading-5 text-[#718096]">{company.tagline}</p>
                <p className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#718096]"><MapPin size={13} /> {company.city}</p>
                <span className="mt-5 flex items-center gap-2 text-sm font-black text-[#1032dc]">Visitar catálogo <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></span>
              </button>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="border-y border-[#e0e5ed] bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1032dc]">Ecossistema Union</p>
              <h2 className="mt-2 text-2xl font-black">Um marketplace conectado às empresas parceiras</h2>
              <p className="mt-3 text-sm leading-6 text-[#718096]">No modelo final, cada parceiro controla o que deseja publicar, enquanto a Union administra regras, moderação, categorias, pedidos e a operação geral do marketplace.</p>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[
                ["01", "Empresa publica", "Produtos e serviços do sistema podem ser disponibilizados no marketplace sem recadastro."],
                ["02", "Union administra", "A plataforma controla aprovação, destaque, regras comerciais, qualidade e segurança."],
                ["03", "Cliente compra", "O cliente encontra empresas diferentes, compara ofertas e acompanha tudo em um só lugar."],
              ].map(([number, title, description]) => (
                <div key={number} className="border border-[#e0e5ed] p-5">
                  <span className="text-2xl font-black text-[#1032dc]">{number}</span>
                  <h3 className="mt-4 text-base font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#718096]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0d1b2e] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <img src="/assets/crm/login/logotelalogin.png" alt="Union World" className="h-8 w-auto max-w-[140px] object-contain brightness-0 invert" />
            <p className="mt-2 text-xs text-white/50">Union Marketplace · Primeiro esboço de interface</p>
          </div>
          <div className="flex flex-wrap gap-5 text-xs font-bold text-white/60">
            <span>Termos</span><span>Privacidade</span><span>Ajuda</span><span>Empresas parceiras</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
