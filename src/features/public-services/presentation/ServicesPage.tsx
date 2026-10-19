import { useMemo, useState } from "react";
import { ArrowRight, LayoutGrid, Search, X } from "lucide-react";
import { useServiceCategories, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { inferredServiceIcon, publicIcon } from "@/features/public-shell/domain/site-appearance";

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function ServicesPage({ setPage, onSelectService }: {
  setPage: (page: PublicPage) => void;
  onSelectService: (slug: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const { services, loading, error } = useServices();
  const { categories } = useServiceCategories();
  const availableCategories = useMemo(() => categories
    .filter(category => services.some(service => service.category_id === category.id)), [categories, services]);
  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    return services.filter(service => {
      if (categoryId !== "all" && service.category_id !== categoryId) return false;
      const categoryName = categories.find(category => category.id === service.category_id)?.name ?? "";
      return !query || normalize([service.title, service.short_description, service.description, categoryName].join(" ")).includes(query);
    });
  }, [services, categories, categoryId, search]);
  const clearFilters = () => { setSearch(""); setCategoryId("all"); };
  const categoryOptions = [
    { id: "all", name: "Todos os serviços", Icon: LayoutGrid },
    ...availableCategories.map(category => ({ ...category, Icon: publicIcon(inferredServiceIcon(category.name)) })),
  ];

  return <div className="art-services-catalog bg-white text-[#172b45]">
    <PublicPageHeader title="Como podemos ajudar você?" description="Encontre o serviço para sua casa ou seus equipamentos e solicite um orçamento à Artvideo.">
      <label className="relative block">
        <span className="sr-only">Encontre o serviço que precisa</span>
        <input value={search} onChange={event => setSearch(event.target.value)} type="search"
          placeholder="Encontre o serviço que precisa"
          className="art-catalog-search min-h-[60px] w-full rounded-lg border border-[#8c98a5] bg-white py-4 pl-5 pr-14 text-[15px] text-[#172b45] outline-none transition-shadow placeholder:text-[#697684] focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-100 sm:min-h-[70px] sm:pl-6 sm:text-base"/>
        <Search size={24} strokeWidth={1.5} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--art-primary)]"/>
      </label>
    </PublicPageHeader>
    <div className="mx-auto max-w-[1344px] px-5 pb-16 sm:px-8 lg:px-10">

      <nav aria-label="Categorias de serviços" className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-5 sm:-mx-0 sm:mt-10 sm:gap-4 sm:px-0">
        {categoryOptions.map(({ id, name, Icon }) => <button type="button" key={id}
          aria-pressed={categoryId === id} onClick={() => setCategoryId(id)}
          className={`group flex w-[100px] shrink-0 flex-col items-center gap-3 rounded-lg px-1 py-1 text-center text-[12px] leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] sm:w-[112px] sm:text-[13px] ${categoryId === id ? "font-semibold text-[var(--art-primary)]" : "text-[#475563] hover:text-[var(--art-primary)]"}`}>
          <span className={`flex h-[72px] w-[72px] items-center justify-center rounded-xl border transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-blue-200 group-hover:bg-[#eaf4ff] ${categoryId === id ? "border-[#b7d9f6] bg-[#e6f3ff]" : "border-transparent bg-[#f2f4f6]"}`}>
            <Icon size={30} strokeWidth={1.35}/>
          </span>
          <span>{name}</span>
        </button>)}
      </nav>

      <section aria-label="Serviços disponíveis" className="min-h-[300px] pt-5 sm:pt-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f3] pt-6">
          <p role="status" aria-live="polite" className="text-sm text-[#566473]">{loading ? "Carregando serviços…" : `${filtered.length} ${filtered.length === 1 ? "serviço disponível" : "serviços disponíveis"}`}</p>
          {(search || categoryId !== "all") && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-sm text-[var(--art-primary)] hover:underline"><X size={15}/> Limpar filtros</button>}
        </div>
        {loading ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-8">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[390px] animate-pulse rounded-xl bg-[#f0f3f6]"/>)}</div>
        : error ? <div role="alert" className="rounded-lg border border-red-100 p-8 text-center text-sm text-[#a23a3a]">{error}</div>
        : filtered.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-8">{filtered.map(service => <ServiceCard key={service.id} service={service} onSelectService={onSelectService} variant="catalog" categoryName={categories.find(category => category.id === service.category_id)?.name}/>)}</div>
        : <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl bg-[#f7f9fb] p-8 text-center">
          <Search size={32} strokeWidth={1.3} className="text-[#8a9daf]"/>
          <h2 className="mt-4 text-xl font-semibold">Nenhum serviço encontrado</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#697684]">Tente outro nome ou escolha uma categoria para encontrar o que precisa.</p>
          <button type="button" onClick={clearFilters} className="mt-5 text-sm font-medium text-[var(--art-primary)] hover:underline">Ver todos os serviços</button>
        </div>}
      </section>

      <aside className="mt-14 flex flex-col justify-between gap-5 rounded-xl bg-[#f2f7fc] px-6 py-7 sm:flex-row sm:items-center sm:px-8">
        <div><h2 className="text-xl font-semibold tracking-tight">Precisa de ajuda para escolher?</h2><p className="mt-2 text-sm leading-6 text-[#697684]">Conte o que precisa. Nossa equipe entra em contato com você.</p></div>
        <button type="button" onClick={() => setPage("orcamento")} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-md border border-[var(--art-primary)] px-6 text-sm font-medium text-[var(--art-primary)] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">Solicitar orçamento <ArrowRight size={17}/></button>
      </aside>
    </div>
  </div>;
}
