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

/** Transição suave de opacidade e leve zoom, automática ou via setas/indicadores. */
export function PublicCatalogCarousel({ slides, title }: { slides: CatalogSlide[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const activeIndex = count ? ((index % count) + count) % count : 0;
  useEffect(() => {
    if (count < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % count), 5500);
    return () => window.clearInterval(timer);
  }, [count, paused]);
  if (!count) return null;
  const change = (offset: number) => setIndex(value => (value + offset + count) % count);
  return <section aria-label={title} aria-roledescription="carrossel"
    className="relative isolate h-[275px] overflow-hidden bg-[#0b244e] text-white sm:h-[330px]"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setPaused(false); }}>
    {slides.map((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      return <div key={slide.id} aria-hidden={!active}
        className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-in-out motion-reduce:transition-none ${active ? "z-10 scale-100 opacity-100" : "pointer-events-none z-0 scale-[1.045] opacity-0"}`}>
        <CatalogSlideImage slide={slide}/>
        <div className="relative mx-auto flex h-full max-w-[1630px] items-center px-14 sm:px-20 lg:px-24">
          <div className="max-w-[590px]">
            {slide.label && <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-sky-200 sm:text-[12px]">{slide.label}</p>}
            <h2 className="line-clamp-2 text-[27px] font-bold leading-tight tracking-[-.03em] sm:text-[39px]">{slide.title}</h2>
            <p className="mt-3 line-clamp-3 max-w-[470px] text-[13px] leading-relaxed text-white/85 sm:text-[15px]">{slide.description}</p>
            {slide.onAction && <button type="button" tabIndex={active ? 0 : -1} onClick={slide.onAction}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-5 text-[13px] font-bold text-[#1337ca] transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {slide.actionLabel || "Saiba mais"} <ArrowRight size={16} strokeWidth={1.75}/>
            </button>}
          </div>
        </div>
      </div>;
    })}
    {count > 1 && <>
      <button type="button" aria-label="Banner anterior" onClick={() => change(-1)}
        className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-[#102c50]/60 text-white shadow-md backdrop-blur-sm transition-[background-color,transform] hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-5 sm:h-11 sm:w-11">
        <ChevronLeft size={22} strokeWidth={1.8}/>
      </button>
      <button type="button" aria-label="Próximo banner" onClick={() => change(1)}
        className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-[#102c50]/60 text-white shadow-md backdrop-blur-sm transition-[background-color,transform] hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5 sm:h-11 sm:w-11">
        <ChevronRight size={22} strokeWidth={1.8}/>
      </button>
      <nav aria-label="Selecionar banner" className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-2">
        {slides.map((slide, i) => <button type="button" key={slide.id} onClick={() => setIndex(i)}
          aria-label={`Banner ${i + 1} de ${count}`} aria-current={activeIndex === i ? "true" : undefined}
          className={`h-2 rounded-full transition-[width,background-color] duration-300 ${activeIndex === i ? "w-9 bg-white" : "w-2 bg-white/50 hover:bg-white/85"}`}/>)}
      </nav>
    </>}
  </section>;
}
