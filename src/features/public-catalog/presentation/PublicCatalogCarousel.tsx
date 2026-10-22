import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, ShoppingBag, Wrench } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";

export type CatalogSlide = {
  id: string;
  title: string;
  description: string;
  label?: string;
  imageId?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  theme?: "loja" | "servicos";
};

function CatalogSlideImage({ slide }: { slide: CatalogSlide }) {
  const { url } = useMediaUrl(slide.imageId);
  const [failed, setFailed] = useState(false);
  const service = slide.theme === "servicos";
  const Icon = service ? Wrench : ShoppingBag;
  return <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
    <div className={service
      ? "absolute inset-0 bg-gradient-to-br from-[#061a33] via-[#164180] to-[#2e54c5]"
      : "absolute inset-0 bg-gradient-to-br from-[#081b36] via-[#163a82] to-[#2448db]"}/>
    {url && !failed ? <img key={url} src={url} alt="" loading="eager"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover object-center"/> : <>
      <div className="absolute -right-20 -top-44 h-[490px] w-[490px] rounded-full border-[68px] border-white/[.06] sm:right-[3%]"/>
      <div className="absolute -bottom-48 right-[8%] h-[430px] w-[430px] rounded-full border-[2px] border-sky-200/20"/>
      <div className="absolute right-[8%] top-1/2 hidden h-48 w-48 -translate-y-1/2 rotate-[-10deg] items-center justify-center rounded-[36px] border border-white/20 bg-white/[.09] shadow-[0_24px_90px_rgba(0,0,0,.13)] backdrop-blur-sm lg:flex">
        <Icon size={94} strokeWidth={1} className="text-white/75"/>
      </div>
      <div className="absolute right-[21%] top-[12%] h-3 w-3 rounded-full bg-sky-200/40"/>
      <div className="absolute bottom-[14%] right-[6%] h-5 w-5 rounded-full bg-white/20"/>
    </>}
    <div className="absolute inset-0 bg-gradient-to-r from-[#071931]/95 via-[#0b254a]/80 to-[#12376f]/25"/>
  </div>;
}

/** Banners editoriais configuráveis no CRM. Sem dependência automática de fotos dos produtos. */
export function PublicCatalogCarousel({ slides, title }: { slides: CatalogSlide[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const activeIndex = count ? index % count : 0;
  useEffect(() => {
    if (count < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % count), 7000);
    return () => window.clearInterval(timer);
  }, [count, paused]);
  if (!count) return null;
  const current = slides[activeIndex];
  const change = (offset: number) => setIndex(value => (value + offset + count) % count);
  return <section aria-label={title} aria-roledescription="carrossel"
    className="relative isolate h-[275px] overflow-hidden bg-[#0b244e] text-white sm:h-[330px]"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <CatalogSlideImage key={current.id} slide={current}/>
    <div className="relative mx-auto flex h-full max-w-[1630px] items-center px-14 sm:px-20 lg:px-24">
      <div className="max-w-[590px]">
        {current.label && <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-sky-200 sm:text-[12px]">{current.label}</p>}
        <h2 className="line-clamp-2 text-[27px] font-bold leading-tight tracking-[-.03em] sm:text-[39px]">{current.title}</h2>
        <p className="mt-3 line-clamp-3 max-w-[470px] text-[13px] leading-relaxed text-white/85 sm:text-[15px]">{current.description}</p>
        {current.onAction && <button type="button" onClick={current.onAction}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-5 text-[13px] font-bold text-[#1337ca] transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          {current.actionLabel || "Saiba mais"} <ArrowRight size={16}/>
        </button>}
      </div>
    </div>
    {count > 1 && <>
      <button type="button" aria-label="Banner anterior" onClick={() => change(-1)} className="absolute left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 sm:left-4"><ChevronLeft size={24}/></button>
      <button type="button" aria-label="Próximo banner" onClick={() => change(1)} className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 sm:right-4"><ChevronRight size={24}/></button>
      <nav aria-label="Selecionar banner" className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
        {slides.map((slide, i) => <button type="button" key={slide.id} onClick={() => setIndex(i)}
          aria-label={`Banner ${i + 1} de ${count}`} aria-current={activeIndex === i ? "true" : undefined}
          className={`h-2 rounded-full transition-[width] duration-200 ${activeIndex === i ? "w-9 bg-white" : "w-2 bg-white/50 hover:bg-white/85"}`}/>)}
      </nav>
    </>}
  </section>;
}
