import type { ReactNode } from "react";
import {
  ArrowRight, ClipboardList, FileText, Search, Settings2,
  ShieldCheck, ShoppingCart, Star, Store, Wrench, Quote,
} from "lucide-react";
import { useBrands, useFeaturedProducts, useServices } from "@/features/public-catalog/application/usePublicCatalog";
import { BrandCard, ProductCard, ServiceCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { homeCategories, publicIcon, siteText } from "@/features/public-shell/domain/site-appearance";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicButton, PublicHeading } from "@/features/public-shell/presentation/PublicUi";

type HomeProps = {
  setPage: (page: PublicPage) => void;
  onSelectService: (slug: string) => void;
  onSelectProduct: (slug: string) => void;
  trackingSection: ReactNode;
};

const steps = [
  { defaultTitle: "Solicite", defaultDesc: "Abra sua solicitação pelo site, WhatsApp ou na loja.", Icon: FileText },
  { defaultTitle: "Avaliamos", defaultDesc: "Nossa equipe técnica analisa o equipamento.", Icon: Search },
  { defaultTitle: "Orçamento", defaultDesc: "Você recebe o diagnóstico e o valor do serviço.", Icon: ClipboardList },
  { defaultTitle: "Reparo", defaultDesc: "Após a aprovação, realizamos o reparo com qualidade e garantia.", Icon: Wrench },
];

export function HomePage({ setPage, onSelectService, onSelectProduct, trackingSection }: HomeProps) {
  const { settings } = useSiteSettings();
  const { products: featuredProducts, loading: productsLoading } = useFeaturedProducts();
  const { brands, loading: brandsLoading } = useBrands();
  const { services, loading: servicesLoading } = useServices();
  const { url: heroMediaUrl } = useMediaUrl(typeof settings.hero_image_media_id === "string" ? settings.hero_image_media_id : undefined);
  const heroImage = heroMediaUrl || siteText(settings, "hero_image_url", "");
  const categories = homeCategories(settings.home_categories);
  const featuredServices = (services.some(service => service.is_featured)
    ? services.filter(service => service.is_featured) : services).slice(0, 3);
  const t = (key: string, fallback: string) => siteText(settings, key, fallback);
  const highlight = t("hero_highlight", "em um só lugar.");
  const title = t("hero_title", "Tecnologia, produtos e serviços");
  const heroTitle = title.endsWith(highlight) ? title.slice(0, -highlight.length).trim() : title;
  const paths = [
    {
      Icon: ShoppingCart, title: t("home_buy_title", "COMPRAR"),
      description: t("home_buy_description", "Explore nossa loja com uma variedade de eletrônicos, acessórios e muito mais."),
      onClick: () => setPage("loja"), label: "Ir para a loja",
    },
    {
      Icon: Wrench, title: t("home_repair_title", "CONSERTAR"),
      description: t("home_repair_description", "Assistência técnica especializada para TVs, computadores, videogames e eletrodomésticos."),
      onClick: () => setPage("assistencia"), label: "Conhecer a assistência",
    },
    {
      Icon: ClipboardList, title: t("home_tracking_title", "ACOMPANHAR SERVIÇO"),
      description: t("home_tracking_description", "Acompanhe o status do seu serviço de forma rápida e fácil usando o número da OS."),
      onClick: () => document.getElementById("acompanhar-servico")?.scrollIntoView({ behavior: "smooth" }),
      label: "Acompanhar serviço",
    },
  ];

  return <div className="bg-white">
    <section className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1fr_1.2fr] lg:gap-14 lg:py-16">
      <div className="py-3">
        <p className="mb-5 text-sm font-medium text-[var(--art-primary)]">Eletrônica Artvideo</p>
        <h1 className="max-w-xl text-[36px] font-semibold leading-[1.16] tracking-[-.04em] sm:text-[46px]">{heroTitle} <span className="text-[var(--art-primary)]">{highlight}</span></h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-[#576574]">{t("hero_subtitle", "Produtos, assistência técnica, instalações e manutenção para sua casa ou seu negócio.")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PublicButton onClick={() => setPage("servicos")} className="!min-h-12">Encontrar um serviço <ArrowRight size={17}/></PublicButton>
          <PublicButton onClick={() => setPage("loja")} variant="outline" className="!min-h-12">Conhecer a loja</PublicButton>
        </div>
      </div>
      <div className="aspect-[6/5] overflow-hidden rounded-xl bg-[#eef2f5] sm:aspect-[4/3]">
        {heroImage ? <img src={heroImage} alt={t("hero_image_alt", "Eletrônica Artvideo")} fetchPriority="high" className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center"><Store size={110} strokeWidth={1} className="text-[#9ab1c8]"/></div>}
      </div>
    </section>

    {/* Acessos rápidos. */}
    <section className="bg-[#f8fbff] pt-6 pb-5">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
        {paths.map(({ Icon, title: label, description, onClick, label: accessibleLabel }) =>
          <button key={label} type="button" onClick={onClick} aria-label={accessibleLabel}
            className="group flex min-h-[157px] w-full items-start gap-4 rounded-[7px] border border-[#e8edf4] bg-white px-5 py-6 text-left shadow-[0_3px_15px_rgba(7,33,71,.03)] transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_14px_28px_rgba(16,53,96,.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">
            <Icon size={43} strokeWidth={2.6} className="mt-0.5 shrink-0 text-[var(--art-primary)] transition-transform duration-200 group-hover:scale-110"/>
            <div className="flex min-h-[105px] flex-col items-start">
              <h2 className="text-[15px] font-semibold tracking-[-.02em] text-[#0c1a32]">{label}</h2>
              <p className="mt-2 text-[12px] leading-[1.48] text-[#57657b]">{description}</p>
              <span className="mt-auto flex h-7 w-7 items-center justify-center rounded-full border border-[#e0e7f0] bg-white text-[var(--art-primary)] transition-all group-hover:translate-x-1 group-hover:border-blue-300 group-hover:bg-blue-50">
                <ArrowRight size={15} strokeWidth={2.2}/>
              </span>
            </div>
          </button>)}
      </div>
    </section>

    <div className="bg-[#f8fbff] pb-6"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{trackingSection}</div></div>

    {/* Produtos reais; preço e fotos vêm do CRM. */}
    <section className="bg-white py-9 sm:py-11">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div><PublicHeading>{t("home_products_title", "Destaques da loja")}</PublicHeading>
            <p className="mt-1 text-[13px] leading-5 text-[#617088]">{t("home_products_subtitle", "Produtos selecionados para você com qualidade e ótimos preços.")}</p></div>
          <button type="button" onClick={() => setPage("loja")} className="group inline-flex min-h-9 items-center gap-2 text-[12px] font-semibold text-[var(--art-primary)] transition-colors hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-500">
            Ver todos os produtos <ArrowRight size={16} className="transition-transform group-hover:translate-x-1"/>
          </button>
        </div>
        {productsLoading ? <div aria-live="polite" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length: 4}, (_, i) => <div key={i} className="h-72 animate-pulse rounded-lg border border-slate-200 bg-slate-100"/>)}</div>
        : featuredProducts.length > 0 ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.slice(0, 4).map(product => <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct}/>)}
        </div> : <div className="rounded-lg border border-dashed border-[#d7e3f4] bg-[#f8fbff] p-8 text-center text-sm text-[#64748b]">Novidades e produtos em destaque chegarão em breve. Confira nossa loja.</div>}
      </div>
    </section>

    {/* Serviços: imagem à direita, ícone à esquerda, degradê suave. */}
    <section className="bg-[#f8fbff] py-9 sm:py-11">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div><PublicHeading>{t("home_services_title", "Serviços para sua casa e seus equipamentos")}</PublicHeading>
            <p className="mt-1 text-[13px] leading-5 text-[#617088]">{t("home_services_subtitle", "Instalações, manutenções e suporte técnico com profissionais especializados.")}</p></div>
          <button type="button" onClick={() => setPage("servicos")} className="group inline-flex min-h-9 items-center gap-2 text-[12px] font-semibold text-[var(--art-primary)] transition-colors hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-500">
            Ver todos os serviços <ArrowRight size={16} className="transition-transform group-hover:translate-x-1"/>
          </button>
        </div>
        {servicesLoading ? <div aria-live="polite" className="grid gap-4 md:grid-cols-3">{Array.from({length: 3}, (_, i) => <div key={i} className="h-52 animate-pulse rounded-lg bg-slate-200"/>)}</div>
        : featuredServices.length > 0 ? <div className="grid gap-4 md:grid-cols-3">
          {featuredServices.map(service => <ServiceCard key={service.id} service={service} onSelectService={onSelectService}/>)}
        </div> : <div className="rounded-lg border border-dashed border-[#d7e3f4] bg-white p-8 text-center text-sm text-[#64748b]">Conheça nossos serviços e fale com a equipe para encontrar a melhor solução.</div>}
      </div>
    </section>

    {/* Assistência e categorias configuráveis. */}
    <section className="relative overflow-hidden bg-gradient-to-r from-[#081a32] via-[var(--art-dark)] to-[#0c2344] py-7 text-white sm:py-9">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 sm:px-6 lg:grid-cols-[.78fr_1.22fr] lg:gap-10 lg:px-8">
        <div>
          <h2 className="text-[24px] font-semibold leading-[1.2] tracking-[-.03em] sm:text-[29px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>{t("home_assistance_title", "Seu equipamento apresentou algum problema?")}</h2>
          <p className="mt-3 text-[13px] leading-[1.55] text-white/75">{t("home_assistance_subtitle", "Nossa assistência técnica é especializada em diversas marcas e categorias. Agilidade, transparência e qualidade no atendimento.")}</p>
        </div>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category, i) => {
              const Icon = publicIcon(category.icon);
              return <button key={i} type="button" onClick={() => setPage("assistencia")} title={category.title}
                className="group flex min-h-[102px] flex-col items-center justify-center gap-2 rounded-[7px] border border-white/10 bg-white/[.075] p-2 text-center text-[11px] font-medium leading-tight text-white transition-all duration-200 hover:-translate-y-1 hover:border-blue-300/45 hover:bg-white/15 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
                <Icon size={32} strokeWidth={1.65} className="transition-transform group-hover:scale-110"/><span>{category.title}</span>
              </button>;
            })}
          </div>
          <PublicButton onClick={() => setPage("assistencia")} className="w-full gap-2 sm:w-auto sm:min-w-[285px]">
            Conhecer nossa assistência <ArrowRight size={16}/>
          </PublicButton>
        </div>
      </div>
    </section>

    {/* Marcas e etapas seguem o ritmo visual da referência. */}
    <section className="bg-white pt-8 pb-4">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <PublicHeading>{t("home_brands_title", "Marcas que atendemos")}</PublicHeading>
        <p className="mt-1 text-[13px] text-[#617088]">{t("home_brands_subtitle", "Trabalhamos com as principais marcas do mercado.")}</p>
        {brandsLoading ? <div aria-live="polite" className="mt-4 h-16 animate-pulse rounded-lg bg-slate-100"/> :
          brands.length > 0 ? <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {brands.slice(0, 10).map(brand => <BrandCard key={brand.id} brand={brand}/>)}
          </div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-[#64748b]">Conheça as marcas e equipamentos que atendemos.</p>}
      </div>
    </section>

    <section className="bg-white py-6 pb-11">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <PublicHeading>{t("home_steps_title", "Precisa de assistência? É fácil.")}</PublicHeading>
        <p className="mt-1 text-[13px] text-[#617088]">{t("home_steps_subtitle", "Em poucos passos seu equipamento estará em boas mãos.")}</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {steps.map(({ defaultTitle, defaultDesc, Icon }, i) => <div key={i} className="relative flex min-w-0 items-start gap-3 pr-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--art-primary)] text-[12px] font-bold text-white">{i + 1}</span>
            <Icon size={31} strokeWidth={1.8} className="shrink-0 text-[var(--art-primary)]"/>
            <div className="min-w-0"><h3 className="text-[12px] font-semibold text-[#0d1d37]">{t(`home_step_${i + 1}_title`, defaultTitle)}</h3>
              <p className="mt-1 text-[11px] leading-[1.45] text-[#66738a]">{t(`home_step_${i + 1}_description`, defaultDesc)}</p></div>
            {i < steps.length - 1 && <ArrowRight aria-hidden="true" size={17} className="absolute -right-3 top-3 hidden text-[#a6b7d2] lg:block"/>}
          </div>)}
        </div>
      </div>
    </section>

    {/* Exemplos temporários e identificados, sem fingir avaliações reais. */}
    <section className="border-t border-[#e8eef7] bg-[#f8fbff] py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <PublicHeading>{t("home_testimonials_title", "Uma experiência de atendimento que faz diferença")}</PublicHeading>
          <p className="mt-1 text-[13px] text-[#617088]">{t("home_testimonials_subtitle", "Cuidado, transparência e atenção em cada atendimento.")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            "Atendimento atencioso e explicações claras em cada etapa.",
            "Facilidade para tirar dúvidas e acompanhar o serviço.",
            "Produtos e soluções pensados para o que você realmente precisa.",
          ].map((message, index) => <div key={index}
            className="rounded-[8px] border border-[#e3eaf4] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md">
            <Quote size={24} className="text-[var(--art-primary)]" strokeWidth={1.7}/>
            <p className="mt-3 text-[13px] leading-[1.7] text-[#42546e]">“{message}”</p>
            <p className="mt-4 border-t border-[#edf1f7] pt-3 text-[11px] font-medium text-[#7b8aa0]">Texto ilustrativo</p>
          </div>)}
        </div>
        <p className="mt-3 text-[11px] text-[#8693a6]">Estes textos são exemplos visuais e não representam depoimentos de clientes. Serão substituídos por avaliações reais.</p>
      </div>
    </section>

    {/* Faixa final. */}
    <section className="bg-[var(--art-primary)] text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div className="flex items-center gap-4">
          <Store size={35} strokeWidth={1.6} className="hidden shrink-0 sm:block"/>
          <div>
            <h2 className="text-[20px] font-semibold leading-tight tracking-[-.025em]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>{t("home_cta_title", "Precisa de um produto ou de um reparo?")}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-white/85">{t("home_cta_subtitle", "Conte com a Eletrônica Artvideo para encontrar a melhor solução em eletrônicos.")}</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-3 md:w-auto">
          <button type="button" onClick={() => setPage("loja")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-white px-5 text-[12px] font-bold text-[var(--art-primary)] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex-none"><ShoppingCart size={17}/> Comprar na loja</button>
          <button type="button" onClick={() => setPage("orcamento")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-white/85 px-5 text-[12px] font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex-none"><FileText size={17}/> Solicitar orçamento</button>
        </div>
      </div>
    </section>
  </div>;
}
