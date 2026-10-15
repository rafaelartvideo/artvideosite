import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, BadgeCheck, CheckCircle2, ChevronDown, ChevronRight, Clock3, FileText, Package, X } from "lucide-react";
import { useServiceDetailBySlug } from "@/features/public-catalog/application/usePublicCatalog";
import { resolvePublicMediaUrl } from "@/features/public-catalog/infrastructure/public-media";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { homeServiceDisplay, inferredServiceIcon, publicIcon } from "@/features/public-shell/domain/site-appearance";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { PublicButton, PublicHeading } from "@/features/public-shell/presentation/PublicUi";
import { formatCurrency } from "@/shared/domain/formatters";
import { useMediaUrl } from "@/shared/application/useMediaUrl";

export function ServiceDetailPage({ slug, setPage }: { slug: string | null; setPage: (page: PublicPage) => void }) {
  const { detail, loading, error } = useServiceDetailBySlug(slug);
  const { settings } = useSiteSettings();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const service = detail?.service;
  const appearance = homeServiceDisplay(settings.home_service_display)[service?.id ?? ""];
  const Icon = publicIcon(appearance?.icon || service?.public_icon || inferredServiceIcon(service?.title));
  const { url: customPhoto } = useMediaUrl(appearance?.media_id);
  const mediaBucket = detail?.media?.bucket_id ?? detail?.media?.bucket_name ?? "";
  const mediaPath = detail?.media?.storage_path ?? "";
  const imageQuery = useQuery({
    queryKey: ["public-service-media", mediaBucket, mediaPath],
    enabled: Boolean(mediaBucket && mediaPath && !customPhoto),
    queryFn: () => resolvePublicMediaUrl(detail?.media),
    staleTime: 30 * 60_000,
  });
  const imageUrl = customPhoto || imageQuery.data || null;

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-[#5d6c83]"><Clock3 size={19} className="animate-spin text-[var(--art-primary)]"/> Carregando serviço...</div>;
  if (error || !detail) return <section className="min-h-[55vh] bg-[#f8fbff] py-20"><div className="mx-auto max-w-lg px-4 text-center">
    {error ? <AlertCircle size={36} className="mx-auto mb-4 text-red-500"/> : <Package size={36} className="mx-auto mb-4 text-[var(--art-primary)]"/>}
    <PublicHeading>{error ? "Não foi possível carregar este serviço" : "Serviço não encontrado"}</PublicHeading>
    <p className="mt-3 mb-6 text-[14px] text-[#5d6c83]">{error || "O serviço solicitado não está disponível no momento."}</p>
    <PublicButton onClick={() => setPage("servicos")}>Ver serviços disponíveis</PublicButton>
  </div></section>;

  const { category, brand, product, variants, inclusions, exclusions, priceFactors, faqs, sections, filters } = detail;
  const formattedBase = service.base_price == null ? null : formatCurrency(service.base_price, "");
  const priceLabel = service.price_mode === "HIDDEN" ? null :
    service.price_mode === "STARTING_FROM" && formattedBase ? `A partir de ${formattedBase}` :
    service.price_mode === "FIXED" && formattedBase ? formattedBase : "Consulte o valor";
  const hasInformation = Boolean(service.description || inclusions.length || exclusions.length);

  return <div className="bg-white">
    <nav aria-label="Localização na navegação" className="border-b border-[#e8edf4] bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-hidden px-4 py-3 text-[12px] text-[#68768c] sm:px-6 lg:px-8">
        <button type="button" onClick={() => setPage("home")} className="shrink-0 transition-colors hover:text-[var(--art-primary)]">Início</button>
        <ChevronRight size={14} className="shrink-0"/>
        <button type="button" onClick={() => setPage("servicos")} className="shrink-0 transition-colors hover:text-[var(--art-primary)]">Serviços</button>
        <ChevronRight size={14} className="shrink-0"/>
        <span className="truncate font-semibold text-[#173252]">{service.title}</span>
      </div>
    </nav>

    <section className="relative overflow-hidden bg-gradient-to-r from-[#081a32] via-[var(--art-dark)] to-[#123457] text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-11 sm:px-6 sm:py-14 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 text-[12px] font-semibold text-blue-300"><Icon size={18}/> {category?.name || "Serviço Artvideo"}</p>
          <h1 className="text-[35px] font-extrabold leading-[1.17] tracking-[-.04em] sm:text-[45px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>{service.title}</h1>
          {service.short_description && <p className="mt-4 max-w-xl text-[14px] leading-[1.7] text-white/80">{service.short_description}</p>}
          {priceLabel && <p className="mt-5 text-[22px] font-extrabold text-white">{priceLabel}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <PublicButton onClick={() => setPage("orcamento")} className="gap-2"><FileText size={18}/> Solicitar orçamento <ArrowRight size={16}/></PublicButton>
            <WhatsAppAction className="!min-h-11"/>
          </div>
          {(brand?.name || product?.name) && <p className="mt-5 text-[12px] text-white/65">
            {brand?.name ? `Marca: ${brand.name}` : ""}{brand?.name && product?.name ? " · " : ""}{product?.name ? `Produto: ${product.name}` : ""}
          </p>}
        </div>
        <div className="relative h-[250px] overflow-hidden rounded-[9px] border border-white/15 bg-gradient-to-br from-[#173a62] via-[#225382] to-[#07182f] sm:h-[340px]">
          {imageUrl ? <img src={imageUrl} alt={service.title} loading="eager" className="h-full w-full object-cover"/> :
            <div className="flex h-full items-center justify-center"><Icon size={95} strokeWidth={1.2} className="text-white/50"/></div>}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07182f]/30 to-transparent"/>
        </div>
      </div>
    </section>

    {hasInformation && <section className="bg-[#f8fbff] py-11 sm:py-14">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:gap-8">
        {service.description && <div className="rounded-[8px] border border-[#e5ecf5] bg-white p-6">
          <PublicHeading>Sobre este serviço</PublicHeading>
          <p className="mt-4 whitespace-pre-line text-[14px] leading-[1.85] text-[#53637a]">{service.description}</p>
        </div>}
        {(inclusions.length > 0 || exclusions.length > 0) && <div className="space-y-4">
          {inclusions.length > 0 && <div className="rounded-[8px] border border-[#e5ecf5] bg-white p-6">
            <h2 className="text-[18px] font-extrabold text-[#0b1d37]">O que está incluso</h2>
            <ul className="mt-4 space-y-3">{inclusions.map((item: any) => <li key={item.id} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#53637a]"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/>{item.description}</li>)}</ul>
          </div>}
          {exclusions.length > 0 && <div className="rounded-[8px] border border-[#e5ecf5] bg-white p-6">
            <h2 className="text-[18px] font-extrabold text-[#0b1d37]">O que não está incluso</h2>
            <ul className="mt-4 space-y-3">{exclusions.map((item: any) => <li key={item.id} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#53637a]"><X size={18} className="mt-0.5 shrink-0 text-red-500"/>{item.description}</li>)}</ul>
          </div>}
        </div>}
      </div>
    </section>}

    {variants.length > 0 && <section className="py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PublicHeading>Opções e valores</PublicHeading>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{variants.map((item: any) =>
          <div key={item.id} className="rounded-[8px] border border-[#e5ecf5] bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
            <h3 className="text-[15px] font-extrabold text-[#0b1d37]">{item.title}</h3>
            {item.description && <p className="mt-2 text-[13px] leading-6 text-[#62738a]">{item.description}</p>}
            <p className="mt-4 text-[18px] font-extrabold text-[var(--art-primary)]">{item.price == null ? "Consulte o valor" : formatCurrency(item.price)}</p>
          </div>)}</div>
      </div>
    </section>}

    {priceFactors.length > 0 && <section className="bg-[#f8fbff] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PublicHeading>O que pode alterar o valor?</PublicHeading>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{priceFactors.map((item: any) =>
          <div key={item.id} className="rounded-[8px] border border-[#e5ecf5] bg-white p-5">
            <h3 className="text-[14px] font-extrabold text-[#0b1d37]">{item.name}</h3>
            {item.description && <p className="mt-2 text-[13px] leading-6 text-[#62738a]">{item.description}</p>}
          </div>)}</div>
      </div>
    </section>}

    {filters.length > 0 && <section className="py-9"><div className="mx-auto max-w-6xl px-4 sm:px-6">
      <h2 className="text-[17px] font-extrabold text-[#0b1d37]">Características</h2>
      <div className="mt-4 flex flex-wrap gap-2">{filters.map((item: any) =>
        <span key={item.id} className="rounded-full bg-[#e8f1fd] px-3 py-1.5 text-[12px] font-semibold text-[#28578f]">{item.name || item.value}</span>)}</div>
    </div></section>}

    {sections.map((item: any) => <section key={item.id} className="border-t border-[#edf1f7] bg-white py-11"><div className="mx-auto max-w-6xl px-4 sm:px-6">
      <PublicHeading>{item.title}</PublicHeading>
      <p className="mt-4 whitespace-pre-line text-[14px] leading-[1.85] text-[#53637a]">{item.content}</p>
    </div></section>)}

    {faqs.length > 0 && <section className="bg-[#f8fbff] py-12"><div className="mx-auto max-w-4xl px-4 sm:px-6">
      <PublicHeading>Dúvidas frequentes</PublicHeading>
      <div className="mt-6 space-y-3">{faqs.map((faq: any, i: number) => <div key={faq.id} className="overflow-hidden rounded-[7px] border border-[#e5ecf5] bg-white">
        <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[14px] font-bold text-[#0b1d37] transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
          {faq.question}<ChevronDown size={18} className={`shrink-0 text-[var(--art-primary)] transition-transform ${openFaq === i ? "rotate-180" : ""}`}/>
        </button>
        {openFaq === i && <p className="border-t border-[#edf1f7] px-5 py-4 text-[13px] leading-[1.8] text-[#53637a]">{faq.answer}</p>}
      </div>)}</div>
    </div></section>}

    <section className="bg-[var(--art-primary)] text-white"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
      <div><h2 className="text-[23px] font-extrabold tracking-[-.03em]">Precisa deste serviço?</h2>
        <p className="mt-1 text-[13px] text-white/85">Nossa equipe pode orientar você sobre o atendimento.</p></div>
      <PublicButton onClick={() => setPage("orcamento")} className="gap-2 !bg-white !text-[var(--art-primary)] hover:!bg-blue-50"><FileText size={17}/> Solicitar orçamento <ArrowRight size={16}/></PublicButton>
    </div></section>
  </div>;
}
