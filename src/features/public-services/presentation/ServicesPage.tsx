import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Star } from "lucide-react";
import { useServiceCategories, useServices, useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { PublicCatalogCarousel } from "@/features/public-catalog/presentation/PublicCatalogCarousel";
import { siteBanners, buildSiteBannerSlides } from "@/features/public-catalog/domain/site-banners";
import { inferredServiceIcon, publicIcon } from "@/features/public-shell/domain/site-appearance";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import type { PublicPage } from "@/features/public-shell/domain/navigation";

const PAGE_SIZE = 12;
const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function ServicesPage({ setPage, onSelectService, onSelectProduct }: {
  setPage: (page: PublicPage) => void;
  onSelectService: (slug: string) => void;
  onSelectProduct: (slug: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPageNumber] = useState(1);
  const { services, loading, error } = useServices();
  const { products } = useProducts();
  const { categories } = useServiceCategories();
  const { settings } = useSiteSettings();
  const categoriesWithServices = useMemo(() => categories.filter(item =>
    services.some(service => service.category_id === item.id)), [categories, services]);
  const categoryNames = useMemo(() => new Map(categories.map(item => [item.id, item.name])), [categories]);
  const featured = services.filter(service => service.is_featured === true);
  const slides = buildSiteBannerSlides(siteBanners(settings.site_banners), "servicos", {
    products, services, setPage, onSelectProduct, onSelectService,
  });
  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    return services.filter(service => {
      if (category === "featured" && !service.is_featured) return false;
      if (category !== "all" && category !== "featured" && service.category_id !== category) return false;
      return !query || normalize([service.title, service.short_description, service.description,
        categoryNames.get(service.category_id)].join(" ")).includes(query);
    });
  }, [services, search, category, categoryNames]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const choose = (id: string) => { setCategory(id); setPageNumber(1); };
  const categoryChoices = [
    { id: "all", name: "Todos", count: services.length, icon: Star },
    ...(featured.length ? [{ id: "featured", name: "Destaques", count: featured.length, icon: Star }] : []),
    ...categoriesWithServices.map(item => ({
      id: item.id, name: item.name,
      count: services.filter(service => service.category_id === item.id).length,
      icon: publicIcon(inferredServiceIcon(item.name)),
    })),
  ];

  return <div className="min-h-screen bg-white text-[#172b45]">
    <PublicCatalogCarousel title="Banners de serviços" slides={slides}/>
    <section className="mx-auto max-w-[1630px] px-5 pb-12 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <label className="relative block">
        <span className="sr-only">Pesquisar serviços</span>
        <input type="search" value={search} onChange={event => {setSearch(event.target.value);setPageNumber(1);}}
          placeholder="Encontre o serviço que precisa"
          className="h-[62px] w-full rounded-md border border-[#cfd3d8] bg-white pl-5 pr-16 text-[15px] text-[#1a2b3d] outline-none placeholder:text-[#788492] focus:border-[var(--art-primary)] sm:h-[70px] sm:text-[17px]"/>
        <Search size={23} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#21344d]"/>
      </label>
      <nav aria-label="Categorias de serviços" className="art-category-carousel -mx-5 mt-6 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain px-5 pb-4 scroll-smooth sm:mx-0 sm:mt-8 sm:flex-wrap sm:justify-center sm:gap-x-7 sm:gap-y-5 sm:overflow-visible sm:px-0">
        {categoryChoices.map(item => { const Icon = item.icon; const active = category === item.id;
          return <button type="button" key={item.id} onClick={() => choose(item.id)} aria-pressed={active}
            className="group flex w-[94px] shrink-0 snap-start flex-col items-center gap-2.5 text-center sm:w-[112px] sm:snap-align-none">
            <span className={`flex h-[68px] w-[68px] items-center justify-center rounded-xl transition-colors ${active?"bg-[#eef1ff] text-[var(--art-primary)]":"bg-[#f5f5f5] text-[#273747] group-hover:bg-[#ededed]"}`}>
              <Icon size={26} strokeWidth={1.4}/>
            </span>
            <span className="max-w-[125px] text-[11px] leading-4 text-[#2d3a4a] sm:text-[12px]">{item.name}</span>
          </button>;
        })}
      </nav>
      <div className="mb-6 mt-7 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-[#24374a]"><strong>{loading ? "—" : filtered.length}</strong> {filtered.length === 1 ? "serviço disponível" : "serviços disponíveis"}</p>
        {category !== "all" && <button type="button" onClick={() => choose("all")} className="text-[12px] text-[#687789] underline-offset-4 hover:underline">Limpar categoria</button>}
      </div>
      {loading ? <div role="status" aria-label="Carregando serviços" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({length:8},(_,i)=><div key={i} className="overflow-hidden rounded-lg border border-[#e3e8ee] bg-white">
          <div className="aspect-[4/3] animate-pulse bg-[#ededed]"/>
          <div className="space-y-3 p-4"><div className="h-5 w-4/5 animate-pulse rounded bg-[#e8edf2]"/><div className="h-4 w-3/5 animate-pulse rounded bg-[#e8edf2]"/><div className="mt-6 h-10 animate-pulse rounded bg-[#e8edf2]"/></div>
        </div>)}
      </div> : error ? <div role="alert" className="rounded-lg border border-red-100 p-8 text-center text-sm text-red-700">{error}</div>
        : visible.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map(service => <ServiceCard key={service.id} service={service} onSelectService={onSelectService}
            variant="catalog" categoryName={categoryNames.get(service.category_id) || undefined}/>)}
        </div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-[#dce2e9] p-7 text-center">
          <Search size={30} className="text-[#9aabbc]"/><p className="mt-3 text-[14px] font-medium">Nenhum serviço encontrado</p>
          <button type="button" onClick={() => {setSearch("");choose("all");}} className="mt-3 text-[12px] text-[var(--art-primary)]">Limpar pesquisa</button>
        </div>}
      {filtered.length > PAGE_SIZE && <nav aria-label="Paginação de serviços" className="mt-9 flex items-center justify-center gap-4">
        <button type="button" aria-label="Página anterior" disabled={current<=1} onClick={()=>setPageNumber(n=>Math.max(1,n-1))} className="rounded-md border border-[#e0e6eb] p-2 disabled:opacity-40"><ChevronLeft size={19}/></button>
        <span className="text-[12px] text-[#4a596a]">{current} de {pages}</span>
        <button type="button" aria-label="Próxima página" disabled={current>=pages} onClick={()=>setPageNumber(n=>Math.min(pages,n+1))} className="rounded-md border border-[#e0e6eb] p-2 disabled:opacity-40"><ChevronRight size={19}/></button>
      </nav>}
      <p className="mt-12 border-t border-[#e9edf2] pt-7 text-center text-[13px] text-[#57687a]">Não encontrou o atendimento que procura? <button type="button" onClick={()=>setPage("orcamento")} className="font-semibold text-[var(--art-primary)] hover:underline">Solicitar orçamento</button></p>
    </section>
  </div>;
}
