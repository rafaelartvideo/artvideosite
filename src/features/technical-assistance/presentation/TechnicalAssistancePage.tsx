import { ChevronRight, Cpu, Monitor, Package, Tv, Zap } from "lucide-react";
import { useBrands } from "@/lib/hooks";
import { BrandCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { PublicButton as Btn, PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";

const ASSIST_CARDS = [
  { icon: Tv, title: "TVs", desc: "Diagnóstico e reparo de televisores de diversas marcas e modelos." },
  { icon: Monitor, title: "Computadores e notebooks", desc: "Manutenção, diagnóstico e reparo em desktops e notebooks." },
  { icon: Package, title: "Eletrodomésticos", desc: "Avaliação e reparo de eletrodomésticos da linha branca." },
  { icon: Cpu, title: "Eletrônicos", desc: "Diagnóstico e manutenção de equipamentos eletrônicos gerais." },
  { icon: Zap, title: "Placas e componentes", desc: "Reparo de placas eletrônicas e componentes especializados." },
];
const ASSIST_STEPS = [
  { n: "01", title: "Solicitação", desc: "Você informa o equipamento e o problema." },
  { n: "02", title: "Diagnóstico", desc: "Nossa equipe avalia o equipamento." },
  { n: "03", title: "Orçamento", desc: "Você recebe as informações antes da execução." },
  { n: "04", title: "Reparo", desc: "Após aprovação, realizamos o serviço." },
];

export function TechnicalAssistancePage({ setPage }: { setPage: (page: PublicPage) => void }) {
  const { brands, loading: brandsLoading } = useBrands();

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-12 sm:py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionLabel light>Assistência Técnica Artvideo</SectionLabel>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Seu equipamento precisa de atenção?
            </h1>
            <p className="text-white/70 text-base leading-relaxed mb-8">Conte com nossa equipe para diagnóstico, manutenção e reparo de equipamentos eletrônicos.</p>
            <div className="flex flex-wrap gap-3">
              <Btn variant="primary" className="px-6 py-3 text-base" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
              <WhatsAppAction className="px-6 py-3 text-base" />
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=800&h=520&fit=crop&auto=format" alt="Bancada de assistência técnica" className="w-full h-64 sm:h-80 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* O que atendemos */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atendimento</SectionLabel>
          <H2 className="mb-10">O que atendemos</H2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ASSIST_CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="bg-white rounded-xl p-6 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all group">
                  <div className="w-10 h-10 bg-[#0057e7]/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#0057e7]/20 transition-colors">
                    <Icon size={20} className="text-[#0057e7]" />
                  </div>
                  <h3 className="font-bold text-[#0d1b2e] mb-2">{c.title}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed mb-4">{c.desc}</p>
                  <button onClick={() => setPage("servicos")} className="flex items-center gap-1 text-sm font-semibold text-[#0057e7] hover:gap-2 transition-all">
                    Ver serviços <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Marcas autorizadas */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Parceiros</SectionLabel>
          <H2 className="mb-2">Marcas autorizadas</H2>
          <p className="text-[#5a6a82] mb-10">Confira algumas das marcas atendidas pela nossa assistência técnica.</p>
          {brandsLoading ? (
            <div className="text-center py-12 text-[#5a6a82]">Carregando marcas...</div>
          ) : brands.length === 0 ? (
            <div className="text-center py-12 text-[#5a6a82]">Nenhuma marca cadastrada no momento.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {brands.map((b) => (
                <BrandCard key={b.id} brand={b} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Processo</SectionLabel>
          <H2 className="mb-10">Como funciona</H2>
          <div className="relative">
            <div className="hidden lg:block absolute top-8 left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] h-px bg-[#0057e7]/30 z-0" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {ASSIST_STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <div className="w-14 h-14 bg-[#0057e7] rounded-xl flex items-center justify-center shadow-md shadow-[#0057e7]/30"><span className="text-white font-black text-sm">{s.n}</span></div>
                  <h3 className="font-bold text-[#0d1b2e] text-lg">{s.title}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de assistência?</h2>
          <p className="text-white/80 text-lg mb-10">Solicite um orçamento e conte para nossa equipe o que aconteceu com seu equipamento.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => setPage("orcamento")} className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <WhatsAppAction className="px-7 py-3 text-base" />
          </div>
        </div>
      </section>
    </>
  );
}

