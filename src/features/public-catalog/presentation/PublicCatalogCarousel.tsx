import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Image as ImageIcon } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";

export type CatalogSlide = {
  id: string;
  title: string;
  description: string;
  label?: string;
  imageId?: string | null;
  actionLabel: string;
  onAction: () => void;
};

function CatalogSlideImage({ mediaId, alt }: { mediaId?: string | null; alt: string }) {
  const { url } = useMediaUrl(mediaId);
  const [ready, setReady] = useState("");
  return <div className="absolute inset-0 overflow-hidden bg-[#323a43]">
    {url ? <img key={url} src={url} alt={alt} fetchPriority="high"
      onLoad={() => setReady(url)} onError={() => setReady(url)}
      className={`h-full w-full object-cover object-center ${ready===url?"opacity-100":"opacity-0"}`}/>
      : <div className="absolute inset-0 flex items-center justify-center bg-[#42484e]"><ImageIcon className="text-white/20" size={72}/></div>}
    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15"/>
  </div>;
}

/** Carrossel de catálogo com imagens dos próprios itens publicados; não introduz banners externos. */
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
  if (!count) return <div aria-hidden="true" className="h-[240px] bg-[#f1f3f5] sm:h-[300px]"/>;
  const current = slides[activeIndex];
  const change = (offset: number) => setIndex(value => (value + offset + count) % count);
  return <section aria-label={title} aria-roledescription="carrossel" className="relative isolate h-[270px] overflow-hidden bg-[#353a41] text-white sm:h-[330px]"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <CatalogSlideImage key={current.id} mediaId={current.imageId} alt={current.title}/>
    <div className="relative mx-auto flex h-full max-w-[1630px] items-center px-16 sm:px-20 lg:px-24">
      <div className="max-w-[590px]">
        {current.label && <p className="mb-2 text-[12px] font-medium text-white/85">{current.label}</p>}
        <h2 className="line-clamp-2 text-[27px] font-semibold leading-tight tracking-tight sm:text-[38px]">{current.title}</h2>
        <p className="mt-3 line-clamp-2 max-w-[440px] text-[13px] leading-5 text-white/90 sm:text-[16px]">{current.description}</p>
        <button type="button" onClick={current.onAction} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--art-primary)] px-5 text-[13px] font-semibold text-white hover:brightness-110">
          {current.actionLabel} <ArrowRight size={16}/>
        </button>
      </div>
    </div>
    {count > 1 && <>
      <button type="button" aria-label="Banner anterior" onClick={() => change(-1)} className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/90 hover:bg-white/10 sm:left-4"><ChevronLeft size={25}/></button>
      <button type="button" aria-label="Próximo banner" onClick={() => change(1)} className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/90 hover:bg-white/10 sm:right-4"><ChevronRight size={25}/></button>
      <nav aria-label="Selecionar banner" className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
        {slides.map((slide, i) => <button type="button" key={slide.id} onClick={() => setIndex(i)}
          aria-label={`Banner ${i+1} de ${count}`} aria-current={activeIndex===i?"true":undefined}
          className={`h-2 rounded-full transition-[width] duration-150 ${activeIndex===i?"w-12 bg-white":"w-2 bg-white/60 hover:bg-white"}`}/>)}
      </nav>
    </>}
  </section>;
}
