import { PublicCatalogCarousel } from "@/features/public-catalog/presentation/PublicCatalogCarousel";
import { PublicBreadcrumb } from "@/features/public-shell/presentation/PublicPageHeader";
import { siteBanners, buildSiteBannerSlides } from "@/features/public-catalog/domain/site-banners";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent, ChevronLeft, ChevronRight, Grid3X3, Package, Search, SlidersHorizontal, X,
  Monitor, Headphones, Smartphone, Laptop, PlugZap,
} from "lucide-react";
import { useBrands, useProductCategories, useProducts, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { ProductCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { loadCatalogAvailability } from "@/features/public-store/infrastructure/storefront.repository";
import type { PublicPage } from "@/features/public-shell/domain/navigation";

const normalize = (text: unknown) => String(text ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
type SortOption = "newest" | "name" | "price-asc" | "price-desc" | "discount";
const PER_PAGE = 12;
const inputStyle = "h-10 w-full rounded-md border border-[#dce5f1] bg-white px-3 text-[13px] text-[#10243d] outline-none transition-colors placeholder:text-[#90a0b5] focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";
const checkStyle = "h-4 w-4 shrink-0 accent-blue-600";

export function StorePage({ setPage, onSelectProduct, onSelectService }: {
  setPage: (page: PublicPage) => void;
  onSelectProduct: (slug: string) => void;
  onSelectService: (slug: string) => void;
}) {
  const { products, loading, error } = useProducts();
  const { services } = useServices();
  const { settings } = useSiteSettings();
  const { brands } = useBrands();
  const { categories } = useProductCategories();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const productIds = useMemo(() => products.map(p => p.id).sort(), [products]);
  const availabilityQuery = useQuery({
    queryKey: ["artvideo-catalog-availability", productIds],
    queryFn: () => loadCatalogAvailability(productIds),
    enabled: !loading && productIds.length > 0,
    staleTime: 30_000,
  });
  const availability = availabilityQuery.data;
  const categoryNames = useMemo(() => new Map(categories.map((c:any) => [c.id, String(c.name)])), [categories]);
  const availableBrands = useMemo(() => brands.filter(b => products.some(p => p.brand_id === b.id)), [brands,products]);
  const availableCategories = useMemo(() => categories.filter((c:any) => products.some(p => p.category_id === c.id)), [categories,products]);
  const uncategorized = products.filter(p => !p.category_id || !categoryNames.has(p.category_id)).length;
  const categoryEntries = [
    ...availableCategories.map((c:any) => ({ id:String(c.id), name:String(c.name), count:products.filter(p=>p.category_id===c.id).length })),
    ...(uncategorized ? [{ id:"uncategorized",name:"Outros produtos",count:uncategorized }] : []),
  ];
  const hasOffers = (p:any) => Number(p.price)>0 && Number(p.compare_at_price)>Number(p.price);
  const parsePrice = (v:string) => v.trim() ? Number(v.replace(",", ".")) : null;
  const min = parsePrice(minPrice), max = parsePrice(maxPrice);
  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return products.filter(p => {
      if (category === "uncategorized") {
        if (p.category_id && categoryNames.has(p.category_id)) return false;
      } else if (category !== "all" && p.category_id !== category) return false;
      if (brandIds.length && !brandIds.includes(String(p.brand_id))) return false;
      if (onlyOffers && !hasOffers(p)) return false;
      if (onlyAvailable && (!availability || Number(availability[p.id] || 0) <= 0)) return false;
      const price=Number(p.price);
      if (min !== null && (!Number.isFinite(min) || price<min)) return false;
      if (max !== null && (!Number.isFinite(max) || price>max)) return false;
      const brandName=availableBrands.find(b=>b.id===p.brand_id)?.name || "";
      const categoryName=categoryNames.get(p.category_id) || "";
      return !term || normalize([p.name,p.short_description,p.description,brandName,categoryName].join(" ")).includes(term);
    }).sort((a,b)=>{
      if (sortBy==="name") return a.name.localeCompare(b.name,"pt-BR");
      if (sortBy==="newest") return String(b.created_at).localeCompare(String(a.created_at));
      const pa=Number(a.price),pb=Number(b.price);
      if (sortBy==="price-asc") return (pa || Infinity)-(pb || Infinity);
      if (sortBy==="price-desc") return pb-pa;
      const da=hasOffers(a) ? (Number(a.compare_at_price)-pa)/Number(a.compare_at_price) : 0;
      const db=hasOffers(b) ? (Number(b.compare_at_price)-pb)/Number(b.compare_at_price) : 0;
      return db-da;
    });
  },[products,category,brandIds,onlyOffers,onlyAvailable,availability,min,max,search,sortBy,availableBrands,categoryNames]);

  const totalPages=Math.max(1,Math.ceil(filtered.length/PER_PAGE));
  const items=filtered.slice((Math.min(currentPage,totalPages)-1)*PER_PAGE,Math.min(currentPage,totalPages)*PER_PAGE);
  const resetPage=()=>setCurrentPage(1);
  const setCategoryFilter=(id:string)=>{setCategory(id);resetPage();};
  const toggleBrand=(id:string)=>{setBrandIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);resetPage();};
  const clearFilters=()=>{setSearch("");setCategory("all");setBrandIds([]);setMinPrice("");setMaxPrice("");setOnlyOffers(false);setOnlyAvailable(false);setSortBy("newest");resetPage();};
  const activeCount=(category!=="all"?1:0)+brandIds.length+(minPrice?1:0)+(maxPrice?1:0)+(onlyOffers?1:0)+(onlyAvailable?1:0);
  const filterPanel=<div className="space-y-5">
    <div className="flex items-center justify-between gap-2">
      <strong className="inline-flex items-center gap-2 text-[15px] text-[#132947]"><SlidersHorizontal size={18} className="text-[var(--art-primary)]"/> Filtrar produtos</strong>
      {activeCount>0 && <button type="button" onClick={clearFilters} className="text-[11px] font-bold text-[var(--art-primary)] hover:underline">Limpar tudo</button>}
    </div>
    <div className="border-t border-[#e6edf6] pt-4">
      <h3 className="mb-3 text-[13px] font-extrabold text-[#17314e]">Categorias</h3>
      <div className="space-y-1">
        <button type="button" onClick={()=>setCategoryFilter("all")}
          className={"flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] transition-colors "+(category==="all"?"bg-blue-50 font-bold text-[var(--art-primary)]":"text-[#566985] hover:bg-[#f2f7ff]")}>
          Todas as categorias <span className="text-[11px]">{products.length}</span>
        </button>
        {categoryEntries.map(item=><button key={item.id} type="button" onClick={()=>setCategoryFilter(item.id)}
          className={"flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] transition-colors "+(category===item.id?"bg-blue-50 font-bold text-[var(--art-primary)]":"text-[#566985] hover:bg-[#f2f7ff]")}>
          <span className="truncate pr-2">{item.name}</span><span className="text-[11px]">{item.count}</span>
        </button>)}
      </div>
    </div>
    {availableBrands.length>0 && <fieldset className="border-t border-[#e6edf6] pt-4">
      <legend className="mb-3 text-[13px] font-extrabold text-[#17314e]">Marcas</legend>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {availableBrands.map(item=><label key={item.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[12px] text-[#536781] hover:bg-blue-50">
          <span className="flex items-center gap-2"><input type="checkbox" className={checkStyle}
            checked={brandIds.includes(item.id)} onChange={()=>toggleBrand(item.id)}/>{item.name}</span>
          <span className="text-[11px] text-[#8d9aae]">{products.filter(p=>p.brand_id===item.id).length}</span>
        </label>)}
      </div>
    </fieldset>}
    <div className="border-t border-[#e6edf6] pt-4">
      <h3 className="mb-3 text-[13px] font-extrabold text-[#17314e]">Faixa de preço</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#607590]">Mínimo (R$)
          <input className={inputStyle+" mt-1"} inputMode="decimal" value={minPrice}
            onChange={e=>{setMinPrice(e.target.value.replace(/[^0-9.,]/g,""));resetPage();}} placeholder="0,00"/>
        </label>
        <label className="text-[11px] text-[#607590]">Máximo (R$)
          <input className={inputStyle+" mt-1"} inputMode="decimal" value={maxPrice}
            onChange={e=>{setMaxPrice(e.target.value.replace(/[^0-9.,]/g,""));resetPage();}} placeholder="Qualquer"/>
        </label>
      </div>
      {min!==null&&max!==null&&min>max&&<p className="mt-2 text-[11px] text-red-600">O valor mínimo deve ser menor que o máximo.</p>}
    </div>
    <fieldset className="space-y-3 border-t border-[#e6edf6] pt-4">
      <legend className="mb-3 text-[13px] font-extrabold text-[#17314e]">Ofertas e disponibilidade</legend>
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#536781]">
        <input type="checkbox" className={checkStyle} checked={onlyOffers}
          onChange={e=>{setOnlyOffers(e.target.checked);resetPage();}}/>
        <BadgePercent size={17} className="text-[var(--art-primary)]"/> Produtos em oferta
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#536781]">
        <input type="checkbox" className={checkStyle} checked={onlyAvailable}
          onChange={e=>{setOnlyAvailable(e.target.checked);resetPage();}}/>
        <Package size={17} className="text-[var(--art-primary)]"/> Somente disponíveis
      </label>
      {onlyAvailable && availabilityQuery.isPending && <p className="text-[11px] text-[#74859a]">Consultando disponibilidade...</p>}
      {onlyAvailable && availabilityQuery.isError && <p className="text-[11px] text-red-600">Não foi possível consultar a disponibilidade.</p>}
    </fieldset>
  </div>;

  const slides = buildSiteBannerSlides(siteBanners(settings.site_banners), "loja", {
    products, services, setPage, onSelectProduct, onSelectService,
  });
  const iconForCategory = (name:string) => {
    const normalized=normalize(name);
    if(/celular|smartphone|telefone/.test(normalized))return Smartphone;
    if(/tv|televis|monitor|tela/.test(normalized))return Monitor;
    if(/fone|audio|som|caixa/.test(normalized))return Headphones;
    if(/comput|notebook|laptop|informat/.test(normalized))return Laptop;
    if(/cabo|fonte|carreg|eletric/.test(normalized))return PlugZap;
    return Package;
  };
  const catalogCategories = [
    {id:"all",name:"Todos",Icon:Grid3X3},
    {id:"offers",name:"Ofertas",Icon:BadgePercent},
    ...categoryEntries.map(item=>({id:item.id,name:item.name,Icon:iconForCategory(item.name)})),
  ];

  return <div className="min-h-screen bg-white text-[#172b45]">
    <PublicCatalogCarousel title="Banners da loja" slides={slides}/>
    <PublicBreadcrumb items={[{ label: "Início", onClick: () => setPage("home") }, { label: "Loja" }]}/>
    <section className="mx-auto max-w-[1630px] px-5 pb-12 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <label className="relative block">
        <span className="sr-only">Pesquisar produtos</span>
        <input type="search" value={search} onChange={event=>{setSearch(event.target.value);resetPage();}}
          placeholder="Encontre o produto que precisa"
          className="h-[62px] w-full rounded-md border border-[#cfd3d8] bg-white pl-5 pr-16 text-[15px] text-[#1a2b3d] outline-none placeholder:text-[#788492] focus:border-[var(--art-primary)] sm:h-[70px] sm:text-[17px]"/>
        <Search size={23} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#21344d]"/>
      </label>
      <nav aria-label="Categorias de produtos" className="mt-8 flex flex-wrap items-start justify-center gap-x-4 gap-y-5 pb-4 sm:gap-x-7">
        {catalogCategories.map(item=>{
          const active=item.id==="offers"?onlyOffers&&category==="all":item.id===category&&!onlyOffers;
          const Icon=item.Icon;
          const select=()=>{if(item.id==="offers"){setCategory("all");setOnlyOffers(true);}
            else{setOnlyOffers(false);setCategoryFilter(item.id);}resetPage();};
          return <button key={item.id} type="button" onClick={select} aria-pressed={active}
            className="group flex w-[94px] shrink-0 flex-col items-center gap-2.5 text-center sm:w-[112px]">
            <span className={`flex h-[68px] w-[68px] items-center justify-center rounded-xl transition-colors ${active?"bg-[#dceef9] text-[#133954]":"bg-[#f5f5f5] text-[#273747] group-hover:bg-[#ededed]"}`}>
              <Icon size={26} strokeWidth={1.4}/>
            </span>
            <span className="max-w-[125px] text-[11px] leading-4 text-[#2d3a4a] sm:text-[12px]">{item.name}</span>
          </button>;
        })}
      </nav>
      <div className="mb-6 mt-7 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-[#24374a]"><strong>{loading?"—":filtered.length}</strong> {filtered.length===1?"produto disponível":"produtos disponíveis"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={()=>setFilterDrawer(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d9dfe8] bg-white px-3 text-[12px] font-medium text-[#32485f] hover:bg-[#f6f7f9]">
            <SlidersHorizontal size={17}/> Filtros {activeCount>0?"("+activeCount+")":""}
          </button>
          <label className="flex items-center gap-2 text-[12px] text-[#45586a]">
            <span className="hidden sm:inline">Ordenar</span>
            <select value={sortBy} onChange={event=>{setSortBy(event.target.value as SortOption);resetPage();}}
              className="min-h-10 rounded-md border border-[#d9dfe8] bg-white px-3 text-[12px] outline-none focus:border-[var(--art-primary)]">
              <option value="newest">Mais recentes</option><option value="price-asc">Menor preço</option>
              <option value="price-desc">Maior preço</option><option value="discount">Maior desconto</option>
              <option value="name">Nome (A–Z)</option>
            </select>
          </label>
        </div>
      </div>
      {(activeCount>0||search) && <div className="mb-5 flex flex-wrap items-center gap-2">
        {category!=="all"&&<button type="button" onClick={()=>setCategoryFilter("all")} className="rounded-md bg-[#f2f5f8] px-3 py-1.5 text-[11px] text-[#526477]">{categoryEntries.find(item=>item.id===category)?.name} ×</button>}
        {brandIds.map(id=><button key={id} type="button" onClick={()=>toggleBrand(id)} className="rounded-md bg-[#f2f5f8] px-3 py-1.5 text-[11px] text-[#526477]">{availableBrands.find(item=>item.id===id)?.name} ×</button>)}
        {onlyOffers&&<button type="button" onClick={()=>{setOnlyOffers(false);resetPage();}} className="rounded-md bg-[#f2f5f8] px-3 py-1.5 text-[11px] text-[#526477]">Ofertas ×</button>}
        <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-[11px] text-[#69798b] hover:underline"><X size={14}/> Limpar filtros</button>
      </div>}
      {loading ? <div role="status" aria-label="Carregando produtos" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({length:8},(_,i)=><div key={i} className="overflow-hidden rounded-lg border border-[#e3e8ee] bg-white">
          <div className="aspect-[4/3] animate-pulse bg-[#ededed]"/>
          <div className="space-y-3 p-4"><div className="h-5 w-4/5 animate-pulse rounded bg-[#e8edf2]"/><div className="h-4 w-3/5 animate-pulse rounded bg-[#e8edf2]"/><div className="mt-6 h-10 animate-pulse rounded bg-[#e8edf2]"/></div>
        </div>)}
      </div> : error ? <div role="alert" className="rounded-lg border border-red-100 p-8 text-center text-sm text-red-700">{error}</div>
        : items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(product=><ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct}
            availableQuantity={availability ? Number(availability[product.id] ?? 0) : undefined}/>)}
        </div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-[#dce2e9] p-7 text-center">
          <Search size={30} className="text-[#9aabbc]"/><p className="mt-3 text-[14px] font-medium">Nenhum produto encontrado</p>
          <button type="button" onClick={clearFilters} className="mt-3 text-[12px] text-[var(--art-primary)]">Limpar pesquisa</button>
        </div>}
      {filtered.length>PER_PAGE&&<nav aria-label="Paginação de produtos" className="mt-9 flex items-center justify-center gap-4">
        <button type="button" aria-label="Página anterior" disabled={currentPage<=1} onClick={()=>setCurrentPage(v=>Math.max(1,v-1))} className="rounded-md border border-[#e0e6eb] p-2 disabled:opacity-40"><ChevronLeft size={19}/></button>
        <span className="text-[12px] text-[#4a596a]">{currentPage} de {totalPages}</span>
        <button type="button" aria-label="Próxima página" disabled={currentPage>=totalPages} onClick={()=>setCurrentPage(v=>Math.min(totalPages,v+1))} className="rounded-md border border-[#e0e6eb] p-2 disabled:opacity-40"><ChevronRight size={19}/></button>
      </nav>}
      <p className="mt-12 border-t border-[#e9edf2] pt-7 text-center text-[13px] text-[#57687a]">Não encontrou o que procura? <button type="button" onClick={()=>setPage("contato")} className="font-semibold text-[var(--art-primary)] hover:underline">Entre em contato</button></p>
    </section>
    {filterDrawer&&<div className="fixed inset-0 z-[100] bg-[#061b33]/60" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setFilterDrawer(false);}}>
      <div role="dialog" aria-modal="true" aria-label="Filtros da loja" className="absolute inset-y-0 right-0 flex w-[min(390px,92vw)] flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[#e8eff6] px-5 py-4"><strong>Filtros</strong><button type="button" onClick={()=>setFilterDrawer(false)} aria-label="Fechar filtros" className="rounded-md p-2 hover:bg-[#f4f6f8]"><X size={20}/></button></div>
        <div className="flex-1 overflow-y-auto p-5">{filterPanel}</div>
        <div className="border-t border-[#e8eff6] p-4"><button type="button" onClick={()=>setFilterDrawer(false)} className="min-h-11 w-full rounded-md bg-[var(--art-primary)] text-[13px] font-semibold text-white">Ver {filtered.length} produtos</button></div>
      </div>
    </div>}
  </div>;
}
