import { useEffect, useRef, useState, type ReactNode } from "react";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { ArrowRight, CheckCircle, Layers, Monitor, Plug, Settings, Shield, ShoppingCart, Star, Users, Wrench, Zap } from "lucide-react";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";

type RevealProps = {
  children: ReactNode;
  className?: string;
  direction?: "up" | "left" | "right";
  delay?: number;
};

/** Aparece quando entra na tela, uma única vez; preserva acessibilidade e movimento reduzido. */
export function Reveal({ children, className = "", direction = "up", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -7% 0px", threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const hidden = direction === "left" ? "-translate-x-8" : direction === "right" ? "translate-x-8" : "translate-y-9";
  return <div ref={ref} style={{ transitionDelay: visible ? delay + "ms" : "0ms" }}
    className={"min-w-0 transition-[opacity,transform] duration-700 ease-out motion-reduce:!transform-none motion-reduce:!opacity-100 motion-reduce:!transition-none " +
      (visible ? "translate-x-0 translate-y-0 opacity-100 " : hidden + " opacity-0 ") + className}>
    {children}
  </div>;
}

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

export function AboutPage({ setPage }: { setPage: (page: PublicPage) => void }) {
  const { settings } = useSiteSettings();
  const { url: aboutPhoto } = useMediaUrl(typeof settings.about_image_media_id === "string" ? settings.about_image_media_id : undefined);
  const { url: teamPhoto } = useMediaUrl(typeof settings.team_image_media_id === "string" ? settings.team_image_media_id : undefined);
  return <>
    <PublicPageHeader title="Tecnologia, experiência e atendimento próximo."
      description="A Eletrônica Artvideo atua com produtos, serviços, instalações, manutenção e assistência técnica, oferecendo soluções para equipamentos eletrônicos em Aracaju e região." />

    <section className="overflow-hidden bg-white py-14 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal direction="left">
          <SectionLabel>Quem somos</SectionLabel>
          <H2 className="mb-5">Uma empresa completa para suas necessidades</H2>
          <p className="mb-4 text-[#5a6a82] leading-relaxed">
            A Artvideo reúne loja de produtos, serviços de instalação, manutenção e assistência técnica em um único lugar. Atendemos pessoas físicas e empresas que buscam soluções para seus equipamentos eletrônicos em Aracaju e região.
          </p>
          <p className="text-[#5a6a82] leading-relaxed">
            Nossa proposta é simples: oferecer atendimento próximo, técnico e transparente, para que o cliente saiba exatamente o que está contratando.
          </p>
        </Reveal>
        <Reveal direction="right" delay={130} className="h-full">
          <div className="group relative overflow-hidden rounded-2xl border border-[#0d1b2e]/10 shadow-[0_18px_45px_rgba(11,29,55,.09)]">
            {aboutPhoto
              ? <img src={aboutPhoto} alt="Eletrônica Artvideo" loading="lazy" className="h-64 w-full object-cover transition-transform duration-700 group-hover:scale-[1.035] sm:h-80" />
              : <div className="flex h-64 items-center justify-center bg-gradient-to-br from-[#122439] via-[#203e58] to-[#37607e] text-center text-xl font-extrabold text-white sm:h-80">Eletrônica Artvideo</div>}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06192d]/20 to-transparent"/>
          </div>
        </Reveal>
      </div>
    </section>

    <section className="overflow-hidden bg-[#f5f7fa] py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionLabel>Atuação</SectionLabel>
          <H2 className="mb-10">O que fazemos</H2>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHAT_WE_DO.map((item, index) => {
            const Icon = item.icon;
            return <Reveal key={item.label} delay={(index % 3) * 110} className="h-full">
              <div className="group h-full rounded-xl border border-[#0d1b2e]/10 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#21466e]/25 hover:shadow-[0_12px_32px_rgba(11,29,55,.09)]">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e9f0f8] text-[var(--art-primary)] transition-transform duration-300 group-hover:scale-110">
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <h3 className="mb-2 font-bold text-[#122439]">{item.label}</h3>
                <p className="text-sm leading-relaxed text-[#5a6a82]">{item.desc}</p>
              </div>
            </Reveal>;
          })}
        </div>
      </div>
    </section>

    <section className="overflow-hidden bg-white py-14 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal direction="left">
          <div className="group relative overflow-hidden rounded-2xl border border-[#0d1b2e]/10 shadow-[0_18px_45px_rgba(11,29,55,.09)]">
            {teamPhoto
              ? <img src={teamPhoto} alt="Equipe Artvideo" loading="lazy" className="h-64 w-full object-cover transition-transform duration-700 group-hover:scale-[1.035] sm:h-80" />
              : <div className="flex h-64 items-center justify-center bg-gradient-to-br from-[#122439] via-[#203e58] to-[#37607e] text-white sm:h-80"><Wrench size={64} strokeWidth={1.25}/></div>}
          </div>
        </Reveal>
        <div>
          <Reveal direction="right">
            <SectionLabel>Diferenciais</SectionLabel>
            <H2 className="mb-8">Por que escolher a Artvideo?</H2>
          </Reveal>
          <div className="space-y-4">
            {WHY_US.map((item, index) => {
              const Icon = item.icon;
              return <Reveal key={item.label} direction="right" delay={index * 75}>
                <div className="flex items-start gap-4 rounded-xl border border-[#0d1b2e]/[.07] bg-[#f5f7fa] p-4 transition-all duration-300 hover:translate-x-1 hover:bg-[#edf3f9]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ecf7] text-[var(--art-primary)]"><Icon size={18} strokeWidth={1.8}/></div>
                  <div>
                    <p className="text-sm font-bold text-[#122439]">{item.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">{item.desc}</p>
                  </div>
                </div>
              </Reveal>;
            })}
          </div>
        </div>
      </div>
    </section>

    <section className="overflow-hidden art-public-brand-gradient py-16 text-white sm:py-20">
      <Reveal className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="mb-4 text-3xl font-extrabold tracking-tight sm:text-5xl">Precisa de ajuda?</h2>
        <p className="mb-9 text-lg text-white/75">Fale com nossa equipe ou visite nossa loja.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <button type="button" onClick={() => setPage("orcamento")}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-7 py-3 text-sm font-bold text-[var(--art-primary)] transition-all hover:-translate-y-0.5 hover:bg-[#e8f0f8]">Solicitar orçamento <ArrowRight size={17}/></button>
          <button type="button" onClick={() => setPage("loja")}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/75 px-7 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/10">Visitar loja <ArrowRight size={17}/></button>
        </div>
      </Reveal>
    </section>
  </>;
}
