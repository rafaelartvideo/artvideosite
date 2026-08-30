import { CheckCircle, Plug, Shield, ShoppingCart, Star, Users, Wrench } from "lucide-react";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { PublicButton as Btn, PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";

export function AboutPage({ setPage }: { setPage: (page: PublicPage) => void }) {
  const WHAT_WE_DO = [
    { icon: ShoppingCart, label: "Loja de produtos", desc: "Eletrônicos, eletrodomésticos e acessórios." },
    { icon: Plug, label: "Instalações", desc: "TVs, ar-condicionado e equipamentos." },
    { icon: Wrench, label: "Manutenção", desc: "Preventiva e corretiva para seus equipamentos." },
    { icon: Zap, label: "Assistência técnica", desc: "Diagnóstico e reparo especializado." },
    { icon: Monitor, label: "Diagnóstico", desc: "Identificação de falhas e soluções." },
    { icon: Settings, label: "Suporte técnico", desc: "Configuração e orientação ao cliente." },
  ];
  const WHY_US = [
    { icon: Users, label: "Atendimento próximo", desc: "Equipe local, focada em você." },
    { icon: Shield, label: "Transparência", desc: "Orçamento antes de qualquer execução." },
    { icon: Star, label: "Conhecimento técnico", desc: "Experiência em eletrônicos e instalações." },
    { icon: Layers, label: "Variedade de soluções", desc: "Loja, serviços e assistência em um só lugar." },
    { icon: CheckCircle, label: "Orçamento prévio", desc: "Você aprova antes de realizarmos o serviço." },
  ];

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Eletrônica Artvideo</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Tecnologia, experiência e atendimento próximo.
          </h1>
          <p className="text-white/70 text-lg leading-relaxed">
            A Eletrônica Artvideo atua com produtos, serviços, instalações, manutenção e assistência técnica, oferecendo soluções para equipamentos eletrônicos em Aracaju e região.
          </p>
        </div>
      </section>

      {/* Quem somos */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel>Quem somos</SectionLabel>
            <H2 className="mb-5">Uma empresa completa para suas necessidades</H2>
            <p className="text-[#5a6a82] leading-relaxed mb-4">
              A Artvideo reúne loja de produtos, serviços de instalação, manutenção e assistência técnica em um único lugar. Atendemos pessoas físicas e empresas que buscam soluções para seus equipamentos eletrônicos em Aracaju e região.
            </p>
            <p className="text-[#5a6a82] leading-relaxed">
              Nossa proposta é simples: oferecer atendimento próximo, técnico e transparente, para que o cliente saiba exatamente o que está contratando.
            </p>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-[#0d1b2e]/10">
            <img src="https://images.unsplash.com/photo-1761494296583-99b15e9063c5?w=800&h=500&fit=crop&auto=format" alt="Loja Eletrônica Artvideo" className="w-full h-64 sm:h-80 object-cover" />
          </div>
        </div>
      </section>

      {/* O que fazemos */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atuação</SectionLabel>
          <H2 className="mb-10">O que fazemos</H2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHAT_WE_DO.map((w) => {
              const Icon = w.icon;
              return (
                <div key={w.label} className="bg-white rounded-xl p-6 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all">
                  <div className="w-10 h-10 bg-[#0057e7]/10 rounded-lg flex items-center justify-center mb-4"><Icon size={20} className="text-[#0057e7]" /></div>
                  <h3 className="font-bold text-[#0d1b2e] mb-1">{w.label}</h3>
                  <p className="text-sm text-[#5a6a82]">{w.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Por que escolher */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div className="relative rounded-xl overflow-hidden border border-[#0d1b2e]/10">
            <img src="https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=800&h=500&fit=crop&auto=format" alt="Técnico Artvideo" className="w-full h-64 sm:h-80 object-cover" />
          </div>
          <div>
            <SectionLabel>Diferenciais</SectionLabel>
            <H2 className="mb-8">Por que escolher a Artvideo?</H2>
            <div className="space-y-4">
              {WHY_US.map((w) => {
                const Icon = w.icon;
                return (
                  <div key={w.label} className="flex items-start gap-4 bg-[#f5f7fa] rounded-xl p-4 border border-[#0d1b2e]/8">
                    <div className="w-9 h-9 bg-[#0057e7]/10 rounded-lg flex items-center justify-center flex-shrink-0"><Icon size={16} className="text-[#0057e7]" /></div>
                    <div>
                      <p className="font-bold text-[#0d1b2e] text-sm">{w.label}</p>
                      <p className="text-xs text-[#5a6a82]">{w.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de ajuda?</h2>
          <p className="text-white/80 text-lg mb-10">Fale com nossa equipe ou visite nossa loja.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => setPage("contato")} className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <button className="border-2 border-white text-white font-bold rounded-md px-7 py-3 text-base hover:bg-white/10 transition-colors">Visitar loja</button>
          </div>
        </div>
      </section>
    </>
  );
}

