import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Grid3X3, Search, SlidersHorizontal, X } from "lucide-react";
import { useServiceCategories, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const PAGE_SIZE = 12;

export function ServicesPage({ setPage, onSelectService }: {
  setPage: (page: PublicPage) => void;
  onSelectService: (slug: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [page, setPageNumber] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const { services, loading, error } = useServices();
  const { categories } = useServiceCategories();
  const availableCategories = useMemo(() => categories.filter(category =>
    services.some(service => service.category_id === category.id)), [categories, services]);
  const categoryOptions = useMemo(() => availableCategories.map(category => ({
    id: category.id, name: category.name,
    count: services.filter(service => service.category_id === category.id).length,
  })), [availableCategories, services]);
  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    const matches = services.filter(service => {
      if (categoryId !== "all" && service.category_id !== categoryId) return false;
      const categoryName = categories.find(category => category.id === service.category_id)?.name ?? "";
      return !query || normalize([service.title, service.short_description, service.description, categoryName].join(" ")).includes(query);
    });
    if (sortBy !== "default") matches.sort((a,b) =>
      (sortBy === "az" ? 1 : -1) * a.title.localeCompare(b.title, "pt-BR"));
    return matches;
  }, [services, categories, categoryId, search, sortBy]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleServices = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectCategory = (id: string) => { setCategoryId(id); setPageNumber(1); setShowFilters(false); };
  const clearFilters = () => { setSearch(""); selectCategory("all"); setSortBy("default"); };

  const filterPanel = <div>
    <div className="mb-4 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-[13px] font-extrabold text-[#142c4b]"><SlidersHorizontal size={17}/> Categorias</h3>
      {(categoryId !== "all" || search) && <button type="button" onClick={clearFilters} className="text-[11px] font-bold text-[var(--art-primary)]">Limpar</button>}
    </div>
    <div className="space-y-1">
      <button type="button" onClick={() => selectCategory("all")} aria-pressed={categoryId === "all"}
        className={"flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-[12px] transition-colors " + (categoryId === "all" ? "bg-blue-50 font-bold text-[var(--art-primary)]" : "text-[#566985] hover:bg-[#f2f7ff]")}>
        <span>Todos os serviços</span><span>{services.length}</span>
      </button>
      {categoryOptions.map(item => <button type="button" key={item.id} onClick={() => selectCategory(item.id)} aria-pressed={categoryId === item.id}
        className={"flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-[12px] transition-colors " + (categoryId === item.id ? "bg-blue-50 font-bold text-[var(--art-primary)]" : "text-[#566985] hover:bg-[#f2f7ff]")}>
        <span>{item.name}</span><span>{item.count}</span>
      </button>)}
    </div>
  </div>;

  return <div className="min-h-screen bg-[#f7faff] text-[#132947]">
    <PublicPageHeader title="Como podemos ajudar você?" description="Encontre o serviço para sua casa ou seus equipamentos e solicite um orçamento à Artvideo.">
      <label className="relative block">
        <span className="sr-only">Buscar serviços</span>
        <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7991ae]"/>
        <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPageNumber(1); }}
          placeholder="O que você está procurando? Serviço ou categoria"
          className="min-h-[60px] w-full rounded-lg bg-white py-3 pl-12 pr-5 text-[15px] text-[#10243d] shadow-lg outline-none transition-shadow duration-300 placeholder:text-[#90a0b5] focus:ring-2 focus:ring-blue-400 sm:min-h-[70px]"/>
      </label>
    </PublicPageHeader>
    <nav aria-label="Categorias de serviços" className="border-b border-[#e1eafa] bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={() => selectCategory("all")} aria-pressed={categoryId === "all"}
          className={"shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-all duration-200 " + (categoryId === "all" ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white" : "border-[#dae5f3] hover:border-blue-300 hover:bg-blue-50")}>
          <Grid3X3 size={14} className="mr-1 inline"/> Todos os serviços
        </button>
        {categoryOptions.map(item => <button type="button" key={item.id} onClick={() => selectCategory(item.id)} aria-pressed={categoryId === item.id}
          className={"shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-all duration-200 " + (categoryId === item.id ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white" : "border-[#dae5f3] hover:border-[var(--art-primary)] hover:bg-blue-50")}>{item.name}</button>)}
      </div>
    </nav>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden self-start rounded-xl border border-[#e4ebf5] bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:block">{filterPanel}</aside>
        <main className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-[21px] font-extrabold tracking-tight">{categoryId === "all" ? "Todos os serviços" : categoryOptions.find(item => item.id === categoryId)?.name || "Serviços"}</h2>
              {!loading && <p aria-live="polite" className="mt-1 text-[12px] text-[#73839a]">{filtered.length} {filtered.length === 1 ? "serviço encontrado" : "serviços encontrados"}</p>}</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#dce5f2] bg-white px-3 text-[12px] font-bold hover:bg-blue-50 lg:hidden">
                <SlidersHorizontal size={17}/> Filtros
              </button>
              <label className="flex items-center gap-2 text-[12px] font-bold text-[#445871]">
                <span className="hidden sm:inline">Ordenar por</span>
                <select value={sortBy} onChange={event => { setSortBy(event.target.value); setPageNumber(1); }} className="min-h-10 rounded-md border border-[#dce5f2] bg-white px-3 text-[12px] outline-none focus:border-[var(--art-primary)]">
                  <option value="default">Padrão</option><option value="az">Nome: A–Z</option><option value="za">Nome: Z–A</option>
                </select>
              </label>
            </div>
          </div>
          {showFilters && <div className="mt-4 rounded-xl border border-[#e4ebf5] bg-white p-5 lg:hidden">{filterPanel}</div>}
          {(categoryId !== "all" || search) && <div className="mt-4 flex flex-wrap items-center gap-2">
            {categoryId !== "all" && <button type="button" onClick={() => selectCategory("all")} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[var(--art-primary)]">{categoryOptions.find(item => item.id === categoryId)?.name} ×</button>}
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6d7890] hover:text-[var(--art-primary)]"><X size={14}/> Limpar filtros</button>
          </div>}
          {loading ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite" aria-label="Carregando serviços">
            {Array.from({length: 9}, (_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-xl border border-[#e4ebf5] bg-white p-3">
              <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-[#e5eef8] via-[#f6faff] to-[#dfeaf8]"/><div className="mx-2 mt-5 h-4 w-4/5 rounded-full bg-[#e5eef8]"/><div className="mx-2 mt-3 h-3 w-3/5 rounded-full bg-[#e5eef8]"/><div className="mx-2 my-5 h-10 rounded-lg bg-[#e5eef8]"/>
            </div>)}
          </div> : error ? <div role="alert" className="mt-5 rounded-xl border border-red-100 bg-white p-8 text-center text-sm text-red-700">{error}</div>
          : visibleServices.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleServices.map(service => <div key={service.id} className="min-w-0">
              <ServiceCard service={service} onSelectService={onSelectService} variant="catalog" categoryName={categories.find(category => category.id === service.category_id)?.name}/>
            </div>)}
          </div> : <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[#cfddec] bg-white p-8 text-center">
            <Search size={34} className="text-[#9bb5d3]"/><h3 className="mt-3 text-[15px] font-bold">Nenhum serviço encontrado</h3>
            <p className="mt-2 max-w-sm text-[12px] text-[#758399]">Ajuste sua busca ou remova os filtros.</p>
            <button type="button" onClick={clearFilters} className="mt-4 rounded-md bg-[var(--art-primary)] px-4 py-2.5 text-[12px] font-bold text-white hover:brightness-110">Limpar filtros</button>
          </div>}
          {filtered.length > PAGE_SIZE && <nav aria-label="Paginação de serviços" className="mt-8 flex items-center justify-center gap-3">
            <button type="button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPageNumber(value => Math.max(1, value - 1))} className="rounded-md border border-[#dfe7f2] bg-white p-2 transition-colors hover:bg-blue-50 disabled:opacity-40"><ChevronLeft size={19}/></button>
            <span className="text-[12px] font-bold text-[#536881]">{currentPage} de {totalPages}</span>
            <button type="button" aria-label="Próxima página" disabled={currentPage >= totalPages} onClick={() => setPageNumber(value => Math.min(totalPages, value + 1))} className="rounded-md border border-[#dfe7f2] bg-white p-2 transition-colors hover:bg-blue-50 disabled:opacity-40"><ChevronRight size={19}/></button>
          </nav>}
        </main>
      </div>
    </div>
    <section className="bg-[var(--art-primary)] text-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
      <div><h2 className="text-[21px] font-extrabold">Não encontrou o serviço?</h2><p className="mt-1 text-[13px] text-white/85">Nossa equipe pode ajudar a escolher a melhor opção.</p></div>
      <button type="button" onClick={() => setPage("orcamento")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-[13px] font-bold text-[var(--art-primary)] transition-colors hover:bg-blue-50">Solicitar orçamento <ArrowRight size={17}/></button>
    </div></section>
  </div>;
}
