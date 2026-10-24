import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Grid3X3, Headset, Search, Star } from "lucide-react";
import { PublicCategoryChip } from "@/features/public-catalog/presentation/PublicCategoryChip";
import { useServiceCategories, useServices, useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { PublicCatalogCarousel } from "@/features/public-catalog/presentation/PublicCatalogCarousel";
import { siteBanners, buildSiteBannerSlides } from "@/features/public-catalog/domain/site-banners";
import { inferredServiceIcon, publicIcon } from "@/features/public-shell/domain/site-appearance";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";

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
    { id: "all", name: "Todos", count: services.length, icon: null, mediaId: null, fallbackIcon: Grid3X3 },
    ...(featured.length ? [{ id: "featured", name: "Destaques", count: featured.length, icon: null, mediaId: null, fallbackIcon: Star }] : []),
    ...categoriesWithServices.map(item => ({
      id: item.id, name: item.name,
      count: services.filter(service => service.category_id === item.id).length,
      icon: item.icon || null,
      mediaId: item.image_media_id || null,
      fallbackIcon: publicIcon(inferredServiceIcon(item.name)),
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
      <nav aria-label="Categorias de serviços" className="art-category-carousel -mx-5 mt-7 snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-5 pb-3 scroll-smooth sm:mx-0 sm:mt-9 sm:px-0">
        <div className="mx-auto flex w-max min-w-full flex-nowrap items-center justify-center gap-3 sm:gap-4">
        {categoryChoices.map(item => <PublicCategoryChip key={item.id} name={item.name}
          icon={item.icon} mediaId={item.mediaId} fallbackIcon={item.fallbackIcon}
          active={category === item.id} onClick={() => choose(item.id)} />)}
        </div>
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
    </section>
    <section aria-labelledby="services-contact-heading" className="bg-gradient-to-r from-[var(--art-primary)] to-[#123b72] text-white">
      <div className="mx-auto flex max-w-[1630px] flex-col justify-between gap-5 px-5 py-8 sm:px-8 md:flex-row md:items-center lg:px-12">
        <div className="flex items-start gap-4 sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10">
            <Headset size={26} strokeWidth={1.7} aria-hidden="true"/>
          </span>
          <div>
            <h2 id="services-contact-heading" className="text-[21px] font-semibold">Não encontrou o que procura?</h2>
            <p className="mt-1 text-[13px] leading-6 text-white/85">Fale com nossa equipe para consultar outras opções de serviços.</p>
          </div>
        </div>
        <PublicButton variant="outline" onClick={()=>setPage("contato")}
          className="gap-2 self-start !border-white !bg-white !text-[var(--art-primary)] hover:!bg-blue-50 md:self-auto">
          Entre em contato <ArrowRight size={17} aria-hidden="true"/>
        </PublicButton>
      </div>
    </section>
  </div>;
}
