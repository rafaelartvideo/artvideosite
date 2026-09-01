import type { ReactNode } from "react";
import { ArrowRight, ChevronRight, Search, ShoppingCart, Wrench } from "lucide-react";
import { useBrands, useFeaturedProducts, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { BrandCard, ProductCard, ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton, PublicHeading, SectionLabel } from "@/features/public-shell/presentation/PublicUi";

const HOME_STEPS = [
  { n: "01", title: "Solicite", desc: "Conte o que aconteceu com seu equipamento." },
  { n: "02", title: "Avaliamos", desc: "Nossa equipe analisa o problema." },
  { n: "03", title: "Orçamento", desc: "Você recebe as informações antes do serviço." },
  { n: "04", title: "Reparo", desc: "Após aprovação, realizamos o serviço." },
];

const ASSIST_CATS = ["TVs", "Computadores", "Eletrodomésticos", "Videogames", "Eletrônicos"];

export function HomePage({ setPage, onSelectService, onSelectProduct, trackingSection }: { setPage: (page: PublicPage) => void; onSelectService: (slug: string) => void; onSelectProduct: (slug: string) => void; trackingSection: ReactNode }) {
  // Buscar dados reais do Supabase
  const { products: featuredProducts, loading: productsLoading } = useFeaturedProducts();
  const { brands, loading: brandsLoading } = useBrands();
  const { services, loading: servicesLoading } = useServices();

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-16 sm:py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionLabel light>Eletrônica Artvideo · Aracaju, SE</SectionLabel>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Tecnologia, produtos e serviços em um só lugar.
            </h1>
            <p className="text-white/70 text-lg mb-8 max-w-lg leading-relaxed">Produtos eletrônicos, assistência técnica, instalações e manutenção para sua casa ou negócio.</p>
            <div className="flex flex-wrap gap-3">
              <PublicButton variant="primary" className="text-base px-6 py-3">Comprar na loja</PublicButton>
              <PublicButton variant="outline" className="text-base px-6 py-3 border-white/40 text-white hover:bg-white/15 hover:border-white" onClick={() => setPage("orcamento")}>Solicitar orçamento</PublicButton>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1761494296583-99b15e9063c5?w=800&h=520&fit=crop&auto=format" alt="Loja de eletrônicos Artvideo" className="w-full h-72 sm:h-80 lg:h-96 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 3 Caminhos */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atendimento completo</SectionLabel>
          <PublicHeading className="mb-10">O que você precisa?</PublicHeading>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { label: "COMPRAR", icon: ShoppingCart, desc: "Encontre produtos eletrônicos, acessórios e equipamentos.", cta: "Ver loja", dark: false, dest: "home" as const },
              { label: "CONSERTAR", icon: Wrench, desc: "Diagnóstico, manutenção e reparo para seus equipamentos.", cta: "Conhecer assistência", dark: true, dest: "servicos" as const },
              { label: "ACOMPANHAR SERVIÇO", icon: Search, desc: "Consulte o andamento do seu serviço ou pedido usando o número da OS.", cta: "Acompanhar serviço", dark: false, dest: "tracking" as const },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className={`${c.dark ? "bg-[#0d1b2e]" : "bg-white"} rounded-xl p-8 flex flex-col gap-4 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md transition-shadow`}>
                  <Icon size={32} className={c.dark ? "text-[#00b4ff]" : "text-[#0057e7]"} />
                  <h3 className={`text-2xl font-black ${c.dark ? "text-white" : "text-[#0d1b2e]"}`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{c.label}</h3>
                  <p className={`text-sm leading-relaxed ${c.dark ? "text-white/70" : "text-[#5a6a82]"}`}>{c.desc}</p>
                  {c.dest === "tracking" ? (
                    <a href="#acompanhar-servico" className={`flex items-center gap-1 text-sm font-semibold mt-auto ${c.dark ? "text-[#00b4ff]" : "text-[#0057e7]"} hover:gap-2 transition-all`}>
                      {c.cta} <ChevronRight size={16} />
                    </a>
                  ) : (
                    <button onClick={() => setPage(c.dest as Page)} className={`flex items-center gap-1 text-sm font-semibold mt-auto ${c.dark ? "text-[#00b4ff]" : "text-[#0057e7]"} hover:gap-2 transition-all`}>
                      {c.cta} <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Acompanhe seu Serviço */}
      {trackingSection}

      {/* Loja */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Destaques</SectionLabel>
          <div className="flex items-end justify-between mb-6 gap-4">
            <PublicHeading>Destaques da loja</PublicHeading>
            <PublicButton variant="ghost" className="flex-shrink-0">Ver todos <ArrowRight size={15} /></PublicButton>
          </div>
          {productsLoading ? (
            <div className="text-center py-12 text-[#5a6a82]">Carregando produtos...</div>
          ) : featuredProducts.length === 0 ? (
            <div className="text-center py-12 text-[#5a6a82]">Nenhum produto em destaque no momento.</div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {featuredProducts.slice(0, 6).map((p) => (
                  <ProductCard key={p.id} product={p} onSelectProduct={onSelectProduct} />
                ))}
              </div>
              <div className="mt-8 text-center"><button type="button" onClick={() => setPage("loja")} className="inline-flex items-center justify-center gap-2 font-semibold rounded-md px-8 py-3 text-base bg-[#0057e7] text-white hover:bg-[#0046c0] active:scale-[0.98] transition-all">Ver todos os produtos</button></div>
            </>
          )}
        </div>
      </section>

      {/* Serviços home preview */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Para sua casa e seus equipamentos</SectionLabel>
          <div className="flex items-end justify-between mb-10 gap-4">
            <PublicHeading>Serviços para sua casa e seus equipamentos</PublicHeading>
            <button onClick={() => setPage("servicos")} className="flex items-center gap-1 text-sm font-semibold text-[#0057e7] hover:gap-2 transition-all flex-shrink-0">Ver todos <ArrowRight size={15} /></button>
          </div>
          {servicesLoading ? <div className="text-center py-10 text-[#5a6a82]">Carregando serviços...</div> : services.length > 0 && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{services.slice(0, 6).map((service) => <ServiceCard key={service.id} service={service} onSelectService={onSelectService} />)}</div>}
          <div className="mt-8 text-center"><PublicButton variant="outline" className="px-8 py-3 text-base" onClick={() => setPage("servicos")}>Ver todos os serviços</PublicButton></div>
        </div>
      </section>

      {/* Assistência */}
      <section className="py-16 bg-[#0d1b2e] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel light>Assistência técnica em Aracaju</SectionLabel>
            <PublicHeading className="!text-white mb-5">Seu equipamento apresentou algum problema?</PublicHeading>
            <p className="text-white/70 text-base leading-relaxed mb-8">Conte com nossa assistência técnica para diagnóstico, manutenção e reparo de equipamentos eletrônicos.</p>
            <div className="flex flex-wrap gap-2 mb-8">{ASSIST_CATS.map((c) => <span key={c} className="bg-white/10 text-white/90 text-sm font-semibold rounded-md px-3 py-1.5 border border-white/10">{c}</span>)}</div>
            <PublicButton variant="primary" className="px-7 py-3 text-base">Conhecer nossa assistência</PublicButton>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=800&h=520&fit=crop&auto=format" alt="Bancada de assistência técnica" className="w-full h-72 sm:h-80 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Marcas */}
      <section className="py-14 bg-white border-y border-[#0d1b2e]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-bold tracking-widest uppercase text-[#5a6a82] mb-8">Marcas que atendemos</p>
          {brandsLoading ? (
            <div className="text-center py-6 text-[#5a6a82]">Carregando marcas...</div>
          ) : brands.length === 0 ? (
            <div className="text-center py-6 text-[#5a6a82]">Nenhuma marca cadastrada no momento.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {brands.map((b) => (
                <BrandCard key={b.id} brand={b} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Processo simples</SectionLabel>
          <PublicHeading className="mb-12">Precisa de assistência? É fácil.</PublicHeading>
          <div className="relative">
            <div className="hidden lg:block absolute top-8 left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] h-px bg-[#0057e7]/30 z-0" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {HOME_STEPS.map((s) => (
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

      {/* CTA Final */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de um produto ou de um reparo?</h2>
          <p className="text-white/80 text-lg mb-10">Encontre o que procura na nossa loja ou fale com nossa equipe.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Comprar na loja</button>
            <button className="border-2 border-white text-white font-bold rounded-md px-7 py-3 text-base hover:bg-white/10 transition-colors">Solicitar orçamento</button>
          </div>
        </div>
      </section>
    </>
  );
}

