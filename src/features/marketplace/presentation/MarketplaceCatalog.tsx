import { useEffect, useLayoutEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, MapPin, Search, ShoppingBag, SlidersHorizontal, Wrench, X } from "lucide-react";
import { searchPublicMarketplaceListings, type MarketplaceCategory, type MarketplaceListing, type MarketplaceStore } from "../infrastructure/marketplace.repository";

type Props = {
  stores: MarketplaceStore[];
  categories: MarketplaceCategory[];
  selectedStore: MarketplaceStore | null;
  onOpenListing: (listing: MarketplaceListing) => void;
};
type FilterPatch = Record<string, string | null>;
const pageSize = 12;

function money(value: number | null) {
  return value == null ? "Sob orçamento" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MarketplaceCatalog({ stores, categories, selectedStore, onOpenListing }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const kind = params.get("tipo") || "all";
  const category = params.get("categoria") || "";
  const state = params.get("uf") || "";
  const city = params.get("cidade") || "";
  const priceMode = params.get("modalidade") || "all";
  const sort = params.get("ordem") || "newest";
  const search = params.get("q") || "";
  const requestedPage = Number(params.get("pagina"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [priceMin, setPriceMin] = useState(params.get("min") || "");
  const [priceMax, setPriceMax] = useState(params.get("max") || "");
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const cities = useMemo(() => Array.from(new Set(stores
    .filter(store => !state || store.state.toUpperCase() === state.toUpperCase())
    .map(store => store.city.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [stores, state]);
  const states = useMemo(() => Array.from(new Set(stores.map(store => store.state.trim().toUpperCase())
    .filter(Boolean))).sort(), [stores]);

  useEffect(() => {
    setPriceMin(params.get("min") || "");
    setPriceMax(params.get("max") || "");
  }, [location.search]);

  useLayoutEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    searchPublicMarketplaceListings({
      query: search,
      kind: kind === "service" || kind === "product" ? kind : "all",
      categoryId: category,
      state,
      city,
      priceMode: priceMode === "fixed" || priceMode === "quote" || priceMode === "appointment" ? priceMode : "all",
      minPrice: params.has("min") && params.get("min") !== "" ? Number(params.get("min")) : null,
      maxPrice: params.has("max") && params.get("max") !== "" ? Number(params.get("max")) : null,
      sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
      page,
      pageSize,
      storeId: selectedStore?.organization_id,
    }, stores).then(result => {
      if (!active) return;
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > lastPage) {
        const corrected = new URLSearchParams(location.search);
        if (lastPage === 1) corrected.delete("pagina");
        else corrected.set("pagina", String(lastPage));
        navigate({ pathname: location.pathname, search: corrected.toString() ? "?" + corrected.toString() : "" }, { replace: true });
        return;
      }
      setListings(result.listings);
      setTotal(result.total);
    }).catch(() => {
      if (active) setError("Não foi possível consultar os anúncios. Tente novamente.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [location.search, stores, selectedStore?.organization_id, retry]);

  const update = (patch: FilterPatch) => {
    const next = new URLSearchParams(location.search);
    Object.entries(patch).forEach(([key, value]) => {
      if (value && value.trim()) next.set(key, value.trim());
      else next.delete(key);
    });
    if (!Object.prototype.hasOwnProperty.call(patch, "pagina")) next.delete("pagina");
    navigate({ pathname: location.pathname, search: next.toString() ? "?" + next.toString() : "" });
  };
  const reset = () => navigate(location.pathname);
  const activeFilters = Boolean(location.search);
  const submitPrices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const min = priceMin.trim() !== "" && Number(priceMin) >= 0 && Number.isFinite(Number(priceMin)) ? priceMin : null;
    const max = priceMax.trim() !== "" && Number(priceMax) >= 0 && Number.isFinite(Number(priceMax)) ? priceMax : null;
    update({ min, max });
  };
  const pages = Math.ceil(total / pageSize);
  const visiblePages = Array.from({ length: Math.min(pages, 5) }, (_, index) =>
    Math.max(1, Math.min(page - 2, pages - 4)) + index);

  return <section id="catalogo" className="space-y-5 scroll-mt-32">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase text-[#1032dc]">Marketplace</p>
        <h2 className="mt-1 text-xl font-black">{selectedStore ? "Anúncios desta empresa" : "Encontre o que você precisa"}</h2>
        <p className="mt-1 min-h-5 text-sm text-[#768399]" aria-live="polite">
          {loading ? "Consultando anúncios..." : total === 1 ? "1 anúncio encontrado" : total + " anúncios encontrados"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-[#66748b]">
          Ordenar por
          <select aria-label="Ordenar anúncios" value={sort} onChange={event => update({ ordem: event.target.value === "newest" ? null : event.target.value })}
            className="h-10 rounded-lg border border-[#dce2ec] bg-white px-3 text-xs font-bold text-[#344561]">
            <option value="newest">Mais recentes</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
          </select>
        </label>
      </div>
    </div>

    <div className="grid items-start gap-5 lg:grid-cols-[235px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-[#e1e6ef] bg-white p-4 lg:sticky lg:top-32" aria-label="Filtros de anúncios">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black"><SlidersHorizontal size={16} className="text-[#1032dc]" /> Filtros</h3>
          {activeFilters && <button onClick={reset} className="inline-flex items-center gap-1 text-xs font-bold text-[#1032dc]"><X size={13} /> Limpar</button>}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold text-[#526078]">Tipo de anúncio</p>
            <div className="flex flex-wrap gap-1.5 lg:flex-col">
              {([{ id: "all", label: "Todos" }, { id: "service", label: "Serviços" }, { id: "product", label: "Produtos" }] as const).map(option =>
                <button key={option.id} type="button" onClick={() => update({ tipo: option.id === "all" ? null : option.id })}
                  aria-pressed={kind === option.id} className={"rounded-lg px-3 py-2 text-left text-xs font-semibold " +
                    (kind === option.id ? "bg-[#eef1ff] text-[#1032dc]" : "text-[#526078] hover:bg-[#f5f7fc]")}>{option.label}</button>)}
            </div>
          </div>
          <label className="block text-xs font-bold text-[#526078]">Categoria
            <select value={category} onChange={event => update({ categoria: event.target.value })}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#dce2ec] bg-white px-2.5 text-xs font-medium text-[#344561]">
              <option value="">Todas as categorias</option>
              {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-[#526078]">Estado
            <select value={state} onChange={event => update({ uf: event.target.value, cidade: null })}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#dce2ec] bg-white px-2.5 text-xs font-medium text-[#344561]">
              <option value="">Todos os estados</option>
              {states.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-[#526078]">Cidade
            <select value={city} onChange={event => update({ cidade: event.target.value })}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#dce2ec] bg-white px-2.5 text-xs font-medium text-[#344561]">
              <option value="">Todas as cidades</option>
              {cities.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-[#526078]">Forma de contratação
            <select value={priceMode} onChange={event => update({ modalidade: event.target.value === "all" ? null : event.target.value })}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#dce2ec] bg-white px-2.5 text-xs font-medium text-[#344561]">
              <option value="all">Todas</option>
              <option value="fixed">Preço fixo</option>
              <option value="quote">Sob orçamento</option>
              <option value="appointment">Agendamento</option>
            </select>
          </label>
          <form onSubmit={submitPrices} className="space-y-2">
            <label className="block text-xs font-bold text-[#526078]">Faixa de preço (R$)</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.01" aria-label="Preço mínimo" placeholder="Mín." value={priceMin}
                onChange={event => setPriceMin(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-[#dce2ec] px-2 text-xs" />
              <input type="number" min="0" step="0.01" aria-label="Preço máximo" placeholder="Máx." value={priceMax}
                onChange={event => setPriceMax(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-[#dce2ec] px-2 text-xs" />
            </div>
            <button type="submit" className="w-full rounded-lg border border-[#d4dcf7] px-3 py-2 text-xs font-bold text-[#1032dc] hover:bg-[#eef1ff]">Aplicar preço</button>
          </form>
          {search && <div className="flex items-center justify-between gap-2 rounded-lg bg-[#eef1ff] p-2 text-xs text-[#1032dc]">
            <span className="min-w-0 truncate">Busca: {search}</span>
            <button onClick={() => update({ q: null })} aria-label="Limpar busca"><X size={14} /></button>
          </div>}
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando anúncios" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="overflow-hidden rounded-xl border border-[#e1e6ef] bg-white">
            <div className="aspect-[5/4] animate-pulse bg-[#edf0f7]" /><div className="space-y-3 p-4"><div className="h-3 w-1/3 animate-pulse rounded bg-[#edf0f7]" /><div className="h-5 w-4/5 animate-pulse rounded bg-[#edf0f7]" /><div className="h-4 w-1/2 animate-pulse rounded bg-[#edf0f7]" /></div>
          </div>)}
        </div> : error ? <div role="alert" className="rounded-xl border border-red-200 bg-white px-6 py-12 text-center text-sm text-red-700">
          {error} <button onClick={() => setRetry(value => value + 1)} className="ml-2 font-bold underline">Tentar novamente</button>
        </div> : !listings.length ? <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-[#e1e7ef] bg-white px-6 py-12 text-center">
          <Search size={28} className="mb-3 text-[#a3b0c2]" />
          <h3 className="font-black">Nenhum anúncio encontrado</h3>
          <p className="mt-2 max-w-md text-sm text-[#73829a]">{activeFilters ? "Experimente retirar alguns filtros ou buscar por outro termo." : "As empresas participantes poderão publicar serviços e produtos após a aprovação."}</p>
          {activeFilters && <button onClick={reset} className="mt-4 rounded-lg border border-[#dfe4ee] px-4 py-2 text-sm font-bold">Limpar filtros</button>}
        </div> : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map(item => {
              const company = stores.find(store => store.organization_id === item.organization_id);
              return <button key={item.id} type="button" onClick={() => onOpenListing(item)}
                className="group min-w-0 overflow-hidden rounded-xl border border-[#e4e8f0] bg-white text-left shadow-sm transition hover:border-[#b9c4e0] hover:shadow-md">
                <div className="relative flex aspect-[5/4] w-full items-center justify-center overflow-hidden bg-[#f5f7fb]">
                  {item.cover_image_url ? <img src={item.cover_image_url} alt={item.title} loading="lazy" className="h-full w-full object-contain" />
                    : item.source_kind === "service" ? <Wrench size={48} strokeWidth={1.1} className="text-[#9aa8c3]" />
                      : <ShoppingBag size={48} strokeWidth={1.1} className="text-[#9aa8c3]" />}
                </div>
                <div className="space-y-2 border-t border-[#edf0f6] p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1032dc]">{item.source_kind === "service" ? "Serviço" : "Produto"}</span>
                  <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-[#18253d]">{item.title}</h3>
                  <p className="truncate text-xs text-[#738097]">{company?.display_name || "Empresa participante"}</p>
                  {company && (company.city || company.state) && <p className="flex items-center gap-1 truncate text-xs text-[#8390a4]"><MapPin size={12} />{[company.city, company.state].filter(Boolean).join(" · ")}</p>}
                  <p className="text-xl font-black text-[#112244]">{item.price_type === "quote" ? "Sob orçamento" : money(item.price)}</p>
                  <p className="flex items-center gap-1 text-xs font-bold text-[#1032dc]">Ver detalhes <ChevronRight size={13} /></p>
                </div>
              </button>;
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e0e5ee] pt-4">
            <p className="text-xs text-[#728097]">Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</p>
            {pages > 1 && <nav aria-label="Paginação do marketplace" className="flex flex-wrap items-center gap-1.5">
              <button aria-label="Página anterior" disabled={page <= 1} onClick={() => update({ pagina: String(page - 1) })}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe4ee] bg-white disabled:opacity-40"><ChevronLeft size={16} /></button>
              {visiblePages.map(number => <button key={number} aria-current={page === number ? "page" : undefined}
                onClick={() => update({ pagina: number === 1 ? null : String(number) })}
                className={"flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-bold " +
                  (page === number ? "border-[#1032dc] bg-[#1032dc] text-white" : "border-[#dfe4ee] bg-white text-[#50617d]")}>{number}</button>)}
              <button aria-label="Próxima página" disabled={page >= pages} onClick={() => update({ pagina: String(page + 1) })}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe4ee] bg-white disabled:opacity-40"><ChevronRight size={16} /></button>
            </nav>}
          </div>
        </>}
      </div>
    </div>
  </section>;
}
