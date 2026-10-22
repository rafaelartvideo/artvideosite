import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { ChevronRight, Cpu, Monitor, Package, Tv, Zap, Wrench } from "lucide-react";
import { useBrands } from "@/features/public-catalog/application/usePublicCatalog";
import { BrandCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
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
  const { settings } = useSiteSettings();
  const { url: assistancePhoto } = useMediaUrl(typeof settings.assistance_image_media_id === "string" ? settings.assistance_image_media_id : undefined);

  return (
    <>
      {/* Hero */}
      <PublicPageHeader title="Seu equipamento precisa de atenção?" description="Conte com nossa equipe para diagnóstico, manutenção e reparo de equipamentos eletrônicos.">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-wrap gap-3">
            <Btn variant="primary" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
            <WhatsAppAction/>
          </div>
          {assistancePhoto && <img src={assistancePhoto} alt="Assistência técnica Artvideo" className="h-52 w-full rounded-xl border border-white/15 object-cover sm:h-64"/>}
        </div>
      </PublicPageHeader>

      {/* O que atendemos */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atendimento</SectionLabel>
          <H2 className="mb-10">O que atendemos</H2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ASSIST_CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="bg-white rounded-xl p-6 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#1032dc]/30 transition-all group">
                  <div className="w-10 h-10 bg-[#1032dc]/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#1032dc]/20 transition-colors">
                    <Icon size={20} className="text-[var(--art-primary)]" />
                  </div>
                  <h3 className="font-bold text-[#0d1b2e] mb-2">{c.title}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed mb-4">{c.desc}</p>
                  <button onClick={() => setPage("servicos")} className="flex items-center gap-1 text-sm font-semibold text-[var(--art-primary)] hover:gap-2 transition-all">
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
          <H2 className="mb-2">Marcas que atendemos</H2>
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
            {/* Os conectores passam exatamente pelo centro das quatro etapas, sem depender da altura dos textos. */}
            <div aria-hidden="true" className="pointer-events-none absolute left-[calc(12.5%_-_9px)] right-[calc(12.5%_-_9px)] top-7 hidden h-px bg-[#1032dc]/30 lg:block"/>
            <div className="relative z-10 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {ASSIST_STEPS.map((step) => (
                <div key={step.n} className="flex min-w-0 flex-col items-center text-center">
                  <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--art-primary)] text-sm font-extrabold text-white shadow-[0_5px_12px_rgba(30,60,200,.22)]">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-[17px] font-bold text-[#0d1b2e]">{step.title}</h3>
                  <p className="mt-2 max-w-[240px] text-[13px] leading-[1.6] text-[#5a6a82]">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="art-public-brand-gradient py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de assistência?</h2>
          <p className="text-white/80 text-lg mb-10">Solicite um orçamento e conte para nossa equipe o que aconteceu com seu equipamento.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => setPage("orcamento")} className="bg-white text-[var(--art-primary)] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <WhatsAppAction className="px-7 py-3 text-base" />
          </div>
        </div>
      </section>
    </>
  );
}

