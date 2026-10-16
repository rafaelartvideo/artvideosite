import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BadgePercent, Check, ChevronDown, ChevronLeft, ChevronRight,
  Grid3X3, Package, Search, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Tag, Truck, X,
} from "lucide-react";
import { useBrands, useProductCategories, useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { ProductCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { loadCatalogAvailability } from "@/features/public-store/infrastructure/storefront.repository";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";

const normalize = (text: unknown) => String(text ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
type SortOption = "newest" | "name" | "price-asc" | "price-desc" | "discount";
const PER_PAGE = 12;
const inputStyle = "h-10 w-full rounded-md border border-[#dce5f1] bg-white px-3 text-[13px] text-[#10243d] outline-none transition-colors placeholder:text-[#90a0b5] focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";
const checkStyle = "h-4 w-4 shrink-0 accent-blue-600";

export function StorePage({ setPage, onSelectProduct }: {
  setPage: (page: PublicPage) => void;
  onSelectProduct: (slug: string) => void;
}) {
  const { products, loading, error } = useProducts();
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
  const [page, setPage] = useState(1);
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
  const items=filtered.slice((Math.min(page,totalPages)-1)*PER_PAGE,Math.min(page,totalPages)*PER_PAGE);
  const resetPage=()=>setPage(1);
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

  return <div className="bg-[#f7faff] text-[#132947]">
    <section className="relative isolate overflow-hidden bg-gradient-to-r from-[#081a32] via-[#0c294c] to-[#164978] text-white">
      <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"/>
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-blue-200">
          <ShoppingBag size={17}/> Eletrônica Artvideo <ChevronRight size={13}/> Loja
        </div>
        <h1 className="mt-3 text-[30px] font-extrabold tracking-[-.04em] sm:text-[42px]" style={{fontFamily:"'Poppins','Inter',sans-serif"}}>Nossa loja</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-white/75">Encontre produtos, compare preços e escolha como receber seu pedido.</p>
        <label className="relative mt-6 block max-w-3xl">
          <span className="sr-only">Pesquisar produtos</span>
          <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7991ae]"/>
          <input type="search" value={search} onChange={e=>{setSearch(e.target.value);resetPage();}}
            placeholder="O que você está procurando? Produto, modelo ou marca"
            className="h-12 w-full rounded-lg bg-white py-3 pl-12 pr-5 text-[13px] text-[#10243d] shadow-lg outline-none focus:ring-2 focus:ring-blue-400"/>
        </label>
      </div>
    </section>
    <div className="border-b border-[#e1eafa] bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={()=>setCategoryFilter("all")}
          className={"shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-colors "+(category==="all"?"border-[var(--art-primary)] bg-[var(--art-primary)] text-white":"border-[#dae5f3] hover:bg-blue-50")}>
          <Grid3X3 size={14} className="mr-1 inline"/> Todos os produtos
        </button>
        {categoryEntries.map(item=><button key={item.id} type="button" onClick={()=>setCategoryFilter(item.id)}
          className={"shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-colors "+(category===item.id?"border-[var(--art-primary)] bg-[var(--art-primary)] text-white":"border-[#dae5f3] hover:border-[var(--art-primary)] hover:bg-blue-50")}>
          {item.name}
        </button>)}
      </div>
    </div>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 grid gap-3 rounded-lg border border-[#e2ebf7] bg-white p-4 text-[12px] text-[#53708e] sm:grid-cols-3">
        <p className="flex items-center gap-2"><ShieldCheck size={19} className="text-[var(--art-primary)]"/> Compra com pagamento seguro</p>
        <p className="flex items-center gap-2"><Truck size={19} className="text-[var(--art-primary)]"/> Entrega local por CEP</p>
        <p className="flex items-center gap-2"><Check size={19} className="text-[var(--art-primary)]"/> Retirada na loja quando disponível</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden self-start rounded-xl border border-[#e4ebf5] bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:block">
          {filterPanel}
        </aside>
        <main className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-extrabold tracking-tight">{category==="all"?"Todos os produtos":categoryEntries.find(c=>c.id===category)?.name||"Produtos"}</h2>
              {!loading&&<p className="mt-1 text-[12px] text-[#73839a]">{filtered.length} {filtered.length===1?"produto encontrado":"produtos encontrados"}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>setFilterDrawer(true)}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#dce5f2] bg-white px-3 text-[12px] font-bold hover:bg-blue-50 lg:hidden">
                <SlidersHorizontal size={17}/> Filtros {activeCount>0?"("+activeCount+")":""}
              </button>
              <label className="flex items-center gap-2 text-[12px] font-bold text-[#445871]">
                <span className="hidden sm:inline">Ordenar por</span>
                <select value={sortBy} onChange={e=>{setSortBy(e.target.value as SortOption);resetPage();}}
                  className="min-h-10 rounded-md border border-[#dce6f2] bg-white px-2 text-[12px] outline-none focus:border-[var(--art-primary)]">
                  <option value="newest">Mais recentes</option><option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option><option value="discount">Maior desconto</option>
                  <option value="name">Nome (A–Z)</option>
                </select>
              </label>
            </div>
          </div>
          {(activeCount>0||search) && <div className="mt-4 flex flex-wrap items-center gap-2">
            {category!=="all"&&<button className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[var(--art-primary)]" onClick={()=>setCategoryFilter("all")}>{categoryEntries.find(c=>c.id===category)?.name} ×</button>}
            {brandIds.map(id=><button key={id} onClick={()=>toggleBrand(id)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[var(--art-primary)]">{availableBrands.find(b=>b.id===id)?.name} ×</button>)}
            {onlyOffers&&<button onClick={()=>{setOnlyOffers(false);resetPage();}} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[var(--art-primary)]">Ofertas ×</button>}
            {onlyAvailable&&<button onClick={()=>{setOnlyAvailable(false);resetPage();}} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[var(--art-primary)]">Disponíveis ×</button>}
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6d7890] hover:text-[var(--art-primary)]"><X size={14}/> Limpar filtros</button>
          </div>}
          {loading ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">{Array.from({length:9},(_,i)=><div key={i} className="h-80 animate-pulse rounded-lg bg-[#e5eef8]"/>)}</div>
            : error ? <div role="alert" className="mt-5 rounded-lg border border-red-100 bg-white p-8 text-center text-sm text-red-700">{error}</div>
            : items.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map(product=><ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct}/>)}
            </div>
            : <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[#cfddec] bg-white p-8 text-center">
              <Package size={34} className="text-[#9bb5d3]"/>
              <h3 className="mt-3 text-[15px] font-bold">Nenhum produto encontrado</h3>
              <p className="mt-2 max-w-sm text-[12px] text-[#758399]">Ajuste sua busca ou remova alguns filtros.</p>
              <button onClick={clearFilters} className="mt-4 rounded-md bg-[var(--art-primary)] px-4 py-2.5 text-[12px] font-bold text-white hover:brightness-110">Limpar filtros</button>
            </div>}
          {filtered.length>PER_PAGE&&<nav aria-label="Paginação de produtos" className="mt-8 flex items-center justify-center gap-3">
            <button type="button" aria-label="Página anterior" disabled={page<=1}
              onClick={()=>setPage(v=>Math.max(1,v-1))} className="rounded-md border border-[#dfe7f2] bg-white p-2 disabled:opacity-40"><ChevronLeft size={19}/></button>
            <span className="text-[12px] font-bold text-[#536881]">{page} de {totalPages}</span>
            <button type="button" aria-label="Próxima página" disabled={page>=totalPages}
              onClick={()=>setPage(v=>Math.min(totalPages,v+1))} className="rounded-md border border-[#dfe7f2] bg-white p-2 disabled:opacity-40"><ChevronRight size={19}/></button>
          </nav>}
        </main>
      </div>
    </div>
    <section className="bg-[var(--art-primary)] text-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
      <div><h2 className="text-[21px] font-extrabold">Não encontrou o que procurava?</h2><p className="mt-1 text-[13px] text-white/85">Fale com nossa equipe para consultar outras opções.</p></div>
      <PublicButton variant="outline" onClick={()=>setPage("contato")} className="gap-2 !border-white !bg-white !text-[var(--art-primary)] hover:!bg-blue-50">Entrar em contato <ArrowRight size={17}/></PublicButton>
    </div></section>
    {filterDrawer&&<div className="fixed inset-0 z-[100] bg-[#061b33]/70 lg:hidden" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setFilterDrawer(false);}}>
      <div role="dialog" aria-modal="true" aria-label="Filtros da loja" className="absolute inset-y-0 right-0 flex w-[min(360px,92vw)] flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[#e8eff6] px-5 py-4"><strong>Filtros</strong><button onClick={()=>setFilterDrawer(false)} aria-label="Fechar filtros" className="rounded-md p-2 hover:bg-blue-50"><X size={20}/></button></div>
        <div className="flex-1 overflow-y-auto p-5">{filterPanel}</div>
        <div className="border-t border-[#e8eff6] p-4"><button onClick={()=>setFilterDrawer(false)} className="min-h-11 w-full rounded-md bg-[var(--art-primary)] text-[13px] font-bold text-white hover:brightness-110">Ver {filtered.length} produtos</button></div>
      </div>
    </div>}
  </div>;
}
