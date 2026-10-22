import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";

const PAGE_SIZE = 12;
const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function ServicesPage({ setPage, onSelectService }: {
  setPage: (page: PublicPage) => void;
  onSelectService: (slug: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPageNumber] = useState(1);
  const { services, loading, error } = useServices();
  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    return query
      ? services.filter(service => normalize([service.title, service.short_description, service.description].join(" ")).includes(query))
      : services;
  }, [services, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleServices = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <div className="min-h-screen bg-[#f7faff] text-[#132947]">
    <PublicPageHeader title="Como podemos ajudar você?" description="Encontre o serviço para sua casa ou seus equipamentos e solicite um orçamento à Artvideo.">
      <label className="relative block">
        <span className="sr-only">Pesquisar serviços</span>
        <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7991ae]"/>
        <input type="search" value={search} onChange={event => {setSearch(event.target.value);setPageNumber(1);}}
          placeholder="Qual serviço você está procurando?"
          className="min-h-[60px] w-full rounded-lg bg-white py-3 pl-12 pr-5 text-[15px] text-[#10243d] shadow-sm outline-none placeholder:text-[#90a0b5] focus:ring-2 focus:ring-[var(--art-primary)] sm:min-h-[70px]"/>
      </label>
    </PublicPageHeader>
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h2 className="text-[22px] font-semibold tracking-tight">Nossos serviços</h2>
        {!loading && <p className="mt-1 text-[12px] text-[#73839a]">{filtered.length} {filtered.length === 1 ? "serviço encontrado" : "serviços encontrados"}</p>}
      </div>
      {loading ? <div role="status" aria-label="Carregando serviços" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({length:8},(_,index)=><div key={index} className="overflow-hidden rounded-xl border border-[#e4ebf5] bg-white">
          <div className="aspect-[16/10] animate-pulse bg-[#e8eef7]"/>
          <div className="space-y-3 p-5"><div className="h-5 w-3/4 animate-pulse rounded bg-[#e8eef7]"/><div className="h-4 w-full animate-pulse rounded bg-[#e8eef7]"/><div className="mt-10 h-11 animate-pulse rounded bg-[#e8eef7]"/></div>
        </div>)}
      </div> : error ? <div role="alert" className="rounded-xl border border-red-100 bg-white p-8 text-center text-sm text-red-700">{error}</div>
        : visibleServices.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleServices.map(service=><ServiceCard key={service.id} service={service} onSelectService={onSelectService} variant="catalog"/>)}
        </div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[#cfddec] bg-white p-8 text-center">
          <Search size={32} className="text-[#9bb5d3]"/>
          <h3 className="mt-3 text-[15px] font-semibold">Nenhum serviço encontrado</h3>
          <p className="mt-2 text-[12px] text-[#758399]">Tente pesquisar outro serviço.</p>
          <button type="button" onClick={()=>setSearch("")} className="mt-4 rounded-md bg-[var(--art-primary)] px-4 py-2.5 text-[12px] font-semibold text-white">Limpar busca</button>
        </div>}
      {filtered.length>PAGE_SIZE && <nav aria-label="Paginação de serviços" className="mt-8 flex items-center justify-center gap-3">
        <button type="button" aria-label="Página anterior" disabled={currentPage<=1} onClick={()=>setPageNumber(value=>Math.max(1,value-1))}
          className="rounded-md border border-[#dfe7f2] bg-white p-2 disabled:opacity-40"><ChevronLeft size={19}/></button>
        <span className="text-[12px] font-semibold text-[#536881]">{currentPage} de {totalPages}</span>
        <button type="button" aria-label="Próxima página" disabled={currentPage>=totalPages} onClick={()=>setPageNumber(value=>Math.min(totalPages,value+1))}
          className="rounded-md border border-[#dfe7f2] bg-white p-2 disabled:opacity-40"><ChevronRight size={19}/></button>
      </nav>}
    </section>
    <section className="bg-[var(--art-primary)] text-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div><h2 className="text-[21px] font-semibold">Não encontrou o serviço?</h2><p className="mt-1 text-[13px] text-white/85">Nossa equipe pode ajudar a escolher a melhor opção.</p></div>
        <button type="button" onClick={()=>setPage("orcamento")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-[13px] font-semibold text-[var(--art-primary)]">Solicitar orçamento <ArrowRight size={17}/></button>
      </div>
    </section>
  </div>;
}
