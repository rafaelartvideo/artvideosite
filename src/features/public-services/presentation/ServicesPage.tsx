import { useMemo, useState } from "react";
import { ArrowRight, Search, SlidersHorizontal, Wrench, X } from "lucide-react";
import { useServiceCategories, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";

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

  return <div className="bg-[#f8fbff]">
    <section className="relative isolate overflow-hidden bg-gradient-to-r from-[#081a32] via-[var(--art-dark)] to-[#153557] text-white">
      <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"/>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 text-[12px] font-semibold text-blue-300"><Wrench size={16}/> Serviços da Artvideo</div>
          <h1 className="text-[35px] font-extrabold leading-[1.15] tracking-[-.04em] sm:text-[46px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>
            Serviços para sua casa e seus equipamentos
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-6 text-white/75">Instalação, manutenção, configuração e reparos. Encontre o serviço que precisa e solicite um orçamento.</p>
        </div>
        <label className="relative mt-7 block max-w-2xl">
          <span className="sr-only">Buscar serviços</span>
          <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#647792]"/>
          <input value={search} onChange={e => setSearch(e.target.value)} type="search"
            placeholder="Qual serviço você procura?"
            className="min-h-12 w-full rounded-[6px] border border-white/15 bg-white py-3 pl-12 pr-5 text-[14px] text-[#10213d] shadow-md outline-none transition-all placeholder:text-[#7b8ba1] focus:ring-2 focus:ring-blue-400"/>
        </label>
      </div>
    </section>

    <section className="sticky top-[74px] z-20 border-b border-[#e4ebf5] bg-white/95 py-3.5 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 overflow-x-auto px-4 sm:px-6 lg:px-8">
        <SlidersHorizontal size={17} className="mr-1 shrink-0 text-[var(--art-primary)]"/>
        <button type="button" onClick={() => setCategoryId("all")} aria-pressed={categoryId === "all"}
          className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-all focus-visible:outline-2 focus-visible:outline-[var(--art-primary)] ${categoryId === "all" ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white shadow-sm" : "border-[#d8e2f0] text-[#33465f] hover:border-[var(--art-primary)] hover:bg-blue-50"}`}>Todos</button>
        {availableCategories.map(category => <button type="button" key={category.id} aria-pressed={categoryId === category.id}
          onClick={() => setCategoryId(category.id)}
          className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-bold transition-all focus-visible:outline-2 focus-visible:outline-[var(--art-primary)] ${categoryId === category.id ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white shadow-sm" : "border-[#d8e2f0] text-[#33465f] hover:border-[var(--art-primary)] hover:bg-blue-50"}`}>{category.name}</button>)}
      </div>
    </section>

    <section className="mx-auto min-h-[300px] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-extrabold tracking-[-.03em] text-[#0b1d37]">{categoryId === "all" ? "Todos os serviços" : availableCategories.find(c => c.id === categoryId)?.name ?? "Serviços"}</h2>
        {!loading && <span className="text-[12px] text-[#64748b]">{filtered.length} {filtered.length === 1 ? "serviço encontrado" : "serviços encontrados"}</span>}
      </div>
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">{Array.from({length:6},(_,i)=><div key={i} className="h-64 animate-pulse rounded-lg bg-[#e5eef8]"/>)}</div>
      : error ? <div className="rounded-lg border border-red-100 bg-white p-8 text-center text-sm text-[#a23a3a]">{error}</div>
      : filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(service => <ServiceCard key={service.id} service={service} onSelectService={onSelectService}/>)}</div>
      : <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-[#d1e0f3] bg-white p-8 text-center">
        <Search size={33} className="text-[#8ea8ca]"/>
        <h3 className="mt-3 text-[15px] font-bold text-[#0b1d37]">Nenhum serviço encontrado</h3>
        <p className="mt-1 max-w-sm text-[13px] text-[#64748b]">Tente outro nome ou categoria. Também podemos atender sua solicitação diretamente.</p>
        {(search || categoryId !== "all") && <button type="button" onClick={clearFilters} className="mt-4 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--art-primary)] hover:underline"><X size={15}/> Limpar filtros</button>}
      </div>}
    </section>
    <section className="bg-[var(--art-primary)] text-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-.025em]">Não encontrou o serviço que procura?</h2>
          <p className="mt-1 text-[13px] text-white/85">Explique o que precisa e nossa equipe poderá orientar você.</p>
        </div>
        <PublicButton variant="outline" onClick={() => setPage("orcamento")} className="gap-2 !border-white !bg-white !text-[var(--art-primary)] hover:!-translate-y-0.5 hover:!bg-blue-50">Solicitar orçamento <ArrowRight size={17}/></PublicButton>
      </div>
    </section>
  </div>;
}
