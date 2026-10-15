import { useMemo, useState } from "react";
import { ArrowRight, Package, Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import { useBrands, useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { ProductCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";

const normalize = (text: unknown) => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

type SortOption = "newest" | "name" | "price-asc" | "price-desc";

export function StorePage({ setPage, onSelectProduct }: {
  setPage: (page: PublicPage) => void;
  onSelectProduct: (slug: string) => void;
}) {
  const { products, loading, error } = useProducts();
  const { brands } = useBrands();
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const availableBrands = useMemo(() => brands
    .filter(item => products.some(product => product.brand_id === item.id)), [brands, products]);
  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    const matching = products.filter(product => {
      if (brand !== "all" && product.brand_id !== brand) return false;
      const brandName = availableBrands.find(item => item.id === product.brand_id)?.name ?? "";
      return !term || normalize([product.name, product.short_description, product.description, brandName].join(" ")).includes(term);
    });
    return [...matching].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "newest") return String(b.created_at).localeCompare(String(a.created_at));
      const aPrice = a.price == null ? null : Number(a.price);
      const bPrice = b.price == null ? null : Number(b.price);
      if (aPrice === null) return 1;
      if (bPrice === null) return -1;
      return sortBy === "price-asc" ? aPrice - bPrice : bPrice - aPrice;
    });
  }, [products, availableBrands, search, brand, sortBy]);

  const clearFilters = () => { setSearch(""); setBrand("all"); setSortBy("newest"); };

  return <div className="bg-[#f8fbff]">
    <section className="relative isolate overflow-hidden bg-gradient-to-r from-[#081a32] via-[var(--art-dark)] to-[#153557] text-white">
      <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"/>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 text-[12px] font-semibold text-blue-300"><ShoppingBag size={16}/> Loja Artvideo</div>
          <h1 className="text-[35px] font-extrabold leading-[1.15] tracking-[-.04em] sm:text-[46px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>Tecnologia e produtos para o seu dia a dia</h1>
          <p className="mt-4 max-w-xl text-[14px] leading-6 text-white/75">Explore os produtos cadastrados na Artvideo e fale com nossa equipe para saber mais.</p>
        </div>
        <label className="relative mt-7 block max-w-2xl">
          <span className="sr-only">Buscar produtos</span>
          <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#647792]"/>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por produto, modelo ou marca"
            className="min-h-12 w-full rounded-[6px] border border-white/15 bg-white py-3 pl-12 pr-5 text-[14px] text-[#10213d] shadow-md outline-none transition-all placeholder:text-[#7b8ba1] focus:ring-2 focus:ring-blue-400"/>
        </label>
      </div>
    </section>

    {availableBrands.length > 0 && <section className="sticky top-[74px] z-20 border-b border-[#e4ebf5] bg-white/95 py-3.5 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 overflow-x-auto px-4 sm:px-6 lg:px-8">
        <SlidersHorizontal size={17} className="mr-1 shrink-0 text-[var(--art-primary)]"/>
        <button type="button" onClick={() => setBrand("all")} aria-pressed={brand === "all"}
          className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-all ${brand === "all" ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white" : "border-[#d8e2f0] text-[#33465f] hover:border-[var(--art-primary)] hover:bg-blue-50"}`}>Todas as marcas</button>
        {availableBrands.map(item => <button key={item.id} type="button" aria-pressed={brand === item.id} onClick={() => setBrand(item.id)}
          className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-all ${brand === item.id ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white" : "border-[#d8e2f0] text-[#33465f] hover:border-[var(--art-primary)] hover:bg-blue-50"}`}>{item.name}</button>)}
      </div>
    </section>}

    <section className="mx-auto min-h-[300px] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-.03em] text-[#0b1d37]">Produtos da loja</h2>
          {!loading && <p className="mt-1 text-[12px] text-[#64748b]">{filtered.length} {filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}</p>}
        </div>
        <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#41546f]">
          Ordenar
          <select value={sortBy} onChange={event => setSortBy(event.target.value as SortOption)}
            className="min-h-10 cursor-pointer rounded-[6px] border border-[#dce6f2] bg-white px-3 text-[12px] text-[#0b1d37] outline-none transition-colors focus:border-[var(--art-primary)]">
            <option value="newest">Mais recentes</option>
            <option value="name">Nome (A–Z)</option>
            <option value="price-asc">Menor preço</option>
            <option value="price-desc">Maior preço</option>
          </select>
        </label>
      </div>
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">{Array.from({length:8},(_,i)=><div key={i} className="h-72 animate-pulse rounded-lg bg-[#e5eef8]"/>)}</div>
      : error ? <div className="rounded-lg border border-red-100 bg-white p-8 text-center text-sm text-[#a23a3a]">{error}</div>
      : filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{filtered.map(product => <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct}/>)}</div>
      : <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-[#d1e0f3] bg-white p-8 text-center">
        <Package size={35} className="text-[#8ea8ca]"/>
        <h3 className="mt-3 text-[15px] font-bold text-[#0b1d37]">Nenhum produto encontrado</h3>
        <p className="mt-1 max-w-sm text-[13px] text-[#64748b]">Experimente outro termo ou marca para encontrar o que procura.</p>
        {(search || brand !== "all") && <button type="button" onClick={clearFilters} className="mt-4 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--art-primary)] hover:underline"><X size={15}/> Limpar filtros</button>}
      </div>}
    </section>

    <section className="bg-[var(--art-primary)] text-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div><h2 className="text-[22px] font-extrabold tracking-[-.025em]">Procurando um produto específico?</h2>
          <p className="mt-1 text-[13px] text-white/85">Converse com a Artvideo para verificar as opções disponíveis.</p></div>
        <PublicButton variant="outline" onClick={() => setPage("contato")} className="gap-2 !border-white !bg-white !text-[var(--art-primary)] hover:!bg-blue-50">Entrar em contato <ArrowRight size={17}/></PublicButton>
      </div>
    </section>
  </div>;
}
