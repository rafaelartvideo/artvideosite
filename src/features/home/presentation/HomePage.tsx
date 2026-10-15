import type { ReactNode } from "react";
import { ArrowRight, ChevronRight, ClipboardList, Package, Search, ShoppingCart, ShieldCheck, Wrench } from "lucide-react";
import { useBrands, useFeaturedProducts, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { BrandCard, ProductCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { homeCategories, homeServiceDisplay, publicIcon, siteText } from "@/features/public-shell/domain/site-appearance";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton, PublicHeading } from "@/features/public-shell/presentation/PublicUi";

type HomeProps = {
  setPage: (page: PublicPage) => void;
  onSelectService: (slug: string) => void;
  onSelectProduct: (slug: string) => void;
  trackingSection: ReactNode;
};

function HomePhoto({ mediaId, url, alt, className = "" }: { mediaId?: string; url?: string; alt: string; className?: string }) {
  const { url: mediaUrl } = useMediaUrl(mediaId);
  const source = mediaUrl || url;
  if (!source) {
    return <div className={`relative flex h-full min-h-64 items-center justify-center overflow-hidden bg-gradient-to-br from-[#183759] via-[#0d2849] to-[#0057e7]/45 ${className}`} aria-label="Espaço reservado para imagem da Artvideo">
      <div className="absolute -right-12 -top-20 h-72 w-72 rounded-full bg-blue-400/15 blur-3xl" />
      <div className="absolute -bottom-28 left-0 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5 text-white/70">
        <div className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur"><Wrench size={60} strokeWidth={1.3} /></div>
        <span className="text-xs font-bold tracking-[.24em] uppercase">Eletrônica Artvideo</span>
      </div>
    </div>;
  }
  return <img className={`h-full w-full object-cover ${className}`} src={source} alt={alt} loading="lazy" />;
}

function FeaturedService({ service, display, onOpen }: {
  service: any;
  display?: { icon?: string; media_id?: string };
  onOpen: (slug: string) => void;
}) {
  const Icon = publicIcon(display?.icon || service.public_icon || "wrench");
  const { url: photo } = useMediaUrl(display?.media_id || service.cover_media_id);
  return (
    <button type="button" onClick={() => onOpen(service.slug)} className="group relative isolate flex min-h-[202px] flex-col justify-between overflow-hidden rounded-xl border border-[#dbe5f1] bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      {photo ? <img src={photo} alt="" loading="lazy" className="absolute inset-y-0 right-0 -z-20 h-full w-[60%] object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="absolute inset-y-0 right-0 -z-20 w-[65%] bg-gradient-to-br from-slate-100 via-blue-50 to-blue-200" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-white via-white/95 to-white/5" />
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[var(--art-primary)]"><Icon size={25} strokeWidth={1.8} /></div>
      <div className="relative mt-10 max-w-[73%]">
        <h3 className="line-clamp-2 text-base font-extrabold leading-snug text-[var(--art-dark)]">{service.title}</h3>
        {service.short_description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{service.short_description}</p>}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--art-primary)]">Ver detalhes <ArrowRight size={13} /></span>
      </div>
    </button>
  );
}

const steps = [
  { defaultTitle: "Solicite", defaultDesc: "Conte o que aconteceu com seu equipamento.", icon: ClipboardList },
  { defaultTitle: "Avaliamos", defaultDesc: "Nossa equipe analisa o problema.", icon: Search },
  { defaultTitle: "Orçamento", defaultDesc: "Você recebe as informações antes do serviço.", icon: ClipboardList },
  { defaultTitle: "Reparo", defaultDesc: "Após aprovação, realizamos o serviço.", icon: Wrench },
];

export function HomePage({ setPage, onSelectService, onSelectProduct, trackingSection }: HomeProps) {
  const { settings } = useSiteSettings();
  const { products: featuredProducts, loading: productsLoading } = useFeaturedProducts();
  const { brands, loading: brandsLoading } = useBrands();
  const { services, loading: servicesLoading } = useServices();
  const { url: heroMediaUrl } = useMediaUrl(typeof settings.hero_image_media_id === "string" ? settings.hero_image_media_id : undefined);
  const imageUrl = heroMediaUrl || siteText(settings, "hero_image_url", "");
  const display = homeServiceDisplay(settings.home_service_display);
  const categories = homeCategories(settings.home_categories);
  const featuredServices = (services.some(service => service.is_featured) ? services.filter(service => service.is_featured) : services).slice(0, 3);
  const text = (key: string, fallback: string) => siteText(settings, key, fallback);
  const heroHighlight = text("hero_highlight", "em um só lugar.");
  const rawHeroTitle = text("hero_title", "Tecnologia, produtos e serviços");
  const heroTitle = rawHeroTitle.endsWith(heroHighlight) ? rawHeroTitle.slice(0, -heroHighlight.length).trim() : rawHeroTitle;
  const features = [
    { icon: ShoppingCart, title: text("home_buy_title", "COMPRAR"), description: text("home_buy_description", "Encontre eletrônicos, acessórios e equipamentos."), label: "Ver loja", onClick: () => setPage("loja") },
    { icon: Wrench, title: text("home_repair_title", "CONSERTAR"), description: text("home_repair_description", "Assistência técnica e manutenção para seus equipamentos."), label: "Conhecer assistência", onClick: () => setPage("assistencia") },
    { icon: ClipboardList, title: text("home_tracking_title", "ACOMPANHAR SERVIÇO"), description: text("home_tracking_description", "Consulte o andamento do seu serviço usando o número da OS."), label: "Acompanhar serviço", onClick: () => document.getElementById("acompanhar-servico")?.scrollIntoView({ behavior: "smooth" }) },
  ];

  return <div className="bg-[#f5f7fa]">
    <section className="relative isolate overflow-hidden bg-[var(--art-dark)] text-white">
      {imageUrl && <img src={imageUrl} alt={text("hero_image_alt", "Interior da Eletrônica Artvideo")} className="absolute inset-0 -z-20 h-full w-full object-cover object-center" fetchPriority="high" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#09182e] via-[#0d1b2e]/95 to-[#0d1b2e]/45" />
      <div className="absolute -left-32 top-0 -z-10 h-[460px] w-[500px] rounded-full bg-blue-600/20 blur-[130px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-7 px-4 py-16 sm:px-6 sm:py-20 lg:min-h-[480px] lg:grid-cols-[1.05fr_.95fr]">
        <div className="max-w-2xl">
          <p className="mb-5 text-xs font-extrabold uppercase tracking-[.2em] text-blue-300">{text("home_hero_eyebrow", "Eletrônica Artvideo · Aracaju, SE")}</p>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {heroTitle} <span className="text-[#2588ff]">{heroHighlight}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">{text("hero_subtitle", "Produtos eletrônicos, assistência técnica, instalações e manutenção para sua casa ou negócio.")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PublicButton onClick={() => setPage("loja")} className="gap-2 px-6 py-3"><ShoppingCart size={17}/> Comprar na loja</PublicButton>
            <PublicButton onClick={() => setPage("orcamento")} variant="outline" className="border-white/50 px-6 py-3 text-white hover:border-white hover:bg-white/10">Solicitar orçamento</PublicButton>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-white/80">
            <span className="flex items-center gap-2"><ShieldCheck size={16} /> Atendimento especializado</span>
            <span className="flex items-center gap-2"><Package size={16} /> Produtos selecionados</span>
            <span className="flex items-center gap-2"><Wrench size={16} /> Suporte técnico</span>
          </div>
        </div>
        <div className="relative hidden h-80 overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:block">
          <HomePhoto mediaId={typeof settings.hero_image_media_id === "string" ? settings.hero_image_media_id : undefined} url={imageUrl} alt="Artvideo" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d1b2e]/35 to-transparent" />
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6">
      <div className="grid gap-4 md:grid-cols-3">{features.map(({ icon: Icon, title, description, label, onClick }, i) =>
        <button key={i} onClick={onClick} className="group flex min-h-44 items-start gap-4 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-blue-600">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[var(--art-primary)]"><Icon size={28} /></span>
          <span className="flex h-full flex-col">
            <strong className="text-lg font-black text-[var(--art-dark)]">{title}</strong>
            <span className="mt-2 text-sm leading-relaxed text-slate-600">{description}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-bold text-[var(--art-primary)]">{label}<ChevronRight size={14}/></span>
          </span>
        </button>
      )}</div>
    </section>

    <div className="mx-auto max-w-7xl px-4 sm:px-6">{trackingSection}</div>

    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><PublicHeading>{text("home_products_title", "Destaques da loja")}</PublicHeading><p className="mt-2 text-sm text-slate-600">{text("home_products_subtitle", "Produtos selecionados para você.")}</p></div>
        <button onClick={() => setPage("loja")} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)]">Ver todos os produtos <ArrowRight size={16}/></button>
      </div>
      {productsLoading ? <p className="py-12 text-center text-slate-600">Carregando produtos...</p> : featuredProducts.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{featuredProducts.slice(0, 4).map(product => <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Os produtos destacados no CRM aparecerão aqui.</div>}
    </section>

    <section className="bg-white py-14"><div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div><PublicHeading>{text("home_services_title", "Serviços para sua casa e seus equipamentos")}</PublicHeading><p className="mt-2 text-sm text-slate-600">{text("home_services_subtitle", "Instalações, manutenções e suporte técnico com profissionais especializados.")}</p></div>
        <button onClick={() => setPage("servicos")} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)]">Ver todos os serviços <ArrowRight size={16}/></button>
      </div>
      {servicesLoading ? <p className="py-10 text-center text-slate-600">Carregando serviços...</p> : featuredServices.length ? <div className="grid gap-4 md:grid-cols-3">{featuredServices.map(service => <FeaturedService key={service.id} service={service} display={display[service.id]} onOpen={onSelectService} />)}</div> : <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">Os serviços ativos cadastrados no CRM aparecerão aqui.</div>}
    </div></section>

    <section className="relative overflow-hidden bg-[var(--art-dark)] py-12 text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/5 to-[#0057e7]/25"/>
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[.9fr_1.1fr]">
        <div><h2 className="text-3xl font-black leading-tight sm:text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{text("home_assistance_title", "Seu equipamento apresentou algum problema?")}</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">{text("home_assistance_subtitle", "Nossa assistência técnica atende diversos tipos de equipamentos com transparência e qualidade.")}</p></div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{categories.map((item, i) => { const Icon = publicIcon(item.icon); return <button key={i} onClick={() => setPage("assistencia")} className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 p-2 text-center text-xs font-semibold transition-colors hover:bg-white/20"><Icon size={26} strokeWidth={1.5}/>{item.title}</button>; })}</div>
          <PublicButton className="w-full py-3" onClick={() => setPage("assistencia")}>Conhecer nossa assistência <ArrowRight size={16}/></PublicButton>
        </div>
      </div>
    </section>

    <section className="bg-white py-12"><div className="mx-auto max-w-7xl px-4 sm:px-6">
      <PublicHeading>{text("home_brands_title", "Marcas que atendemos")}</PublicHeading><p className="mb-7 mt-2 text-sm text-slate-600">{text("home_brands_subtitle", "Trabalhamos com marcas de diversos segmentos do mercado.")}</p>
      {brandsLoading ? <p className="text-sm text-slate-600">Carregando marcas...</p> : brands.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">{brands.slice(0, 10).map(brand => <BrandCard key={brand.id} brand={brand}/>)}</div> : <p className="text-sm text-slate-500">As marcas cadastradas aparecerão aqui.</p>}
    </div></section>

    <section className="bg-white pb-16"><div className="mx-auto max-w-7xl px-4 sm:px-6">
      <PublicHeading>{text("home_steps_title", "Precisa de assistência? É fácil.")}</PublicHeading><p className="mt-2 text-sm text-slate-600">{text("home_steps_subtitle", "Em poucos passos seu equipamento estará em boas mãos.")}</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step, i) => { const Icon = step.icon; return <div className="relative flex gap-3" key={i}><div className="flex shrink-0 items-start gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--art-primary)] text-xs font-bold text-white">{i + 1}</span><Icon size={27} className="mt-0.5 text-[var(--art-primary)]"/></div><div><h3 className="text-sm font-bold text-[var(--art-dark)]">{text(`home_step_${i + 1}_title`, step.defaultTitle)}</h3><p className="mt-2 text-xs leading-relaxed text-slate-600">{text(`home_step_${i + 1}_description`, step.defaultDesc)}</p></div></div>; })}</div>
    </div></section>

    <section className="relative overflow-hidden bg-[var(--art-primary)] py-7 text-white"><div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-800/25 via-transparent to-cyan-400/10"/><div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 sm:px-6 md:flex-row md:items-center"><div><h2 className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{text("home_cta_title", "Precisa de um produto ou de um reparo?")}</h2><p className="mt-1 text-sm text-white/80">{text("home_cta_subtitle", "Conte com a Eletrônica Artvideo para encontrar a melhor solução.")}</p></div><div className="flex w-full flex-wrap gap-3 md:w-auto"><button onClick={() => setPage("loja")} className="rounded-md bg-white px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50">Comprar na loja</button><button onClick={() => setPage("orcamento")} className="rounded-md border border-white/75 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Solicitar orçamento</button></div></div></section>
  </div>;
}
