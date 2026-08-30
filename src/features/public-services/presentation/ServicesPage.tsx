import { useState } from "react";
import { Search } from "lucide-react";
import { useServiceCategories, useServices } from "@/lib/hooks";
import { ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { SectionLabel } from "@/features/public-shell/presentation/PublicUi";

export function ServicesPage({ setPage, onSelectService }: { setPage: (page: PublicPage) => void; onSelectService: (slug: string) => void }) {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");

  // Buscar dados do Supabase
  const { services, loading: servicesLoading } = useServices();
  const { categories, loading: categoriesLoading } = useServiceCategories();

  // Filtrar serviços por categoria e busca
  const filtered = services.filter((s) => {
    const category = categories.find((c) => c.id === s.category_id);
    const categoryName = category?.name || "Sem categoria";
    const matchCat = filter === "Todos" || categoryName === filter;
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.short_description?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      categoryName.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Agrupar por categoria
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach((s) => {
    const category = categories.find((c) => c.id === s.category_id);
    const categoryName = category?.name || "Sem categoria";
    if (!grouped[categoryName]) grouped[categoryName] = [];
    grouped[categoryName].push(s);
  });

  const categoryLabels = ["Todos", ...Array.from(new Set(categories.map((c) => c.name)))];

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Serviços Artvideo</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Serviços para sua casa e seus equipamentos
          </h1>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">Instalação, manutenção, configuração e reparos com atendimento profissional em Aracaju e região.</p>
          {/* search */}
          <div className="relative max-w-lg mx-auto">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input
              type="text"
              placeholder="Qual serviço você procura?"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white rounded-xl pl-11 pr-4 py-3.5 text-[#0d1b2e] text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-[#0057e7]"
            />
          </div>
        </div>
      </section>

      {/* filter strip */}
      <section className="bg-white border-b border-[#0d1b2e]/10 py-4 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categoryLabels.map((f, i) => (
            <button key={`filter-${i}-${f}`} onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-all whitespace-nowrap flex-shrink-0 ${filter === f ? "bg-[#0057e7] border-[#0057e7] text-white" : "bg-[#f5f7fa] border-[#0d1b2e]/15 text-[#0d1b2e] hover:border-[#0057e7]/50"}`}>
              {f}
            </button>
          ))}
        </div>
      </section>

      {/* services grid */}
      <section className="py-12 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          {servicesLoading ? (
            <div className="text-center py-20 text-[#5a6a82]">Carregando serviços...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-20 text-[#5a6a82]">
              {search ? `Nenhum serviço encontrado para "${search}".` : "Nenhum serviço disponível."}
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items], i) => (
              <div key={`group-${i}-${cat}`}>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-[#0057e7] font-bold">◆</span>
                  <h2 className="text-xs font-black tracking-widest uppercase text-[#0057e7]">{cat}</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {items.map((s) => (
                    <ServiceCard key={s.id} service={s} onSelectService={onSelectService} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de ajuda com seu equipamento?</h2>
          <p className="text-white/80 text-lg mb-10">Não encontrou exatamente o serviço que procura? Entre em contato com nossa equipe.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <button onClick={() => setPage("contato")} className="border-2 border-white text-white font-bold rounded-md px-7 py-3 text-base hover:bg-white/10 transition-colors">Falar com a Artvideo</button>
          </div>
        </div>
      </section>
    </>
  );
}

