import { useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

export type ServiceTestimonial = { name: string; text: string };

/**
 * Only approved customer statements supplied in the service editor are shown here.
 * Nothing is generated or borrowed from third-party service pages.
 */
export function ServiceTestimonialsCarousel({ items }: { items: ServiceTestimonial[] }) {
  const [emblaRef, embla] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', loop: items.length >= 4 });
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!embla || items.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (embla.canScrollNext()) embla.scrollNext();
      else embla.scrollTo(0);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [embla, items.length, paused, reducedMotion]);

  if (!items.length) return null;

  return <section aria-label="Depoimentos de clientes" className="bg-white py-14 sm:py-16 lg:py-20">
    <div className="mx-auto w-full max-w-[1480px] px-5 sm:px-8 lg:px-12">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-[27px] font-medium tracking-tight sm:text-[32px]">O que dizem nossos clientes</h2>
        {items.length > 1 && <div className="flex items-center gap-2" aria-label="Navegar pelos depoimentos">
          <button type="button" onClick={() => embla?.scrollPrev()} aria-label="Depoimento anterior"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 transition-colors hover:border-[var(--art-primary)] hover:text-[var(--art-primary)] focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]"><ChevronLeft size={19}/></button>
          <button type="button" onClick={() => embla?.scrollNext()} aria-label="Próximo depoimento"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 transition-colors hover:border-[var(--art-primary)] hover:text-[var(--art-primary)] focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]"><ChevronRight size={19}/></button>
        </div>}
      </div>
      <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent sm:w-16" aria-hidden="true"/>
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent sm:w-16" aria-hidden="true"/>
        <div ref={emblaRef} className="overflow-hidden">
          <div className="-ml-4 flex touch-pan-y py-1">
            {items.map((item, index) => <div key={`${item.name}-${index}`} className="min-w-0 flex-[0_0_88%] pl-4 sm:flex-[0_0_49%] lg:flex-[0_0_32%]">
              <blockquote className="flex h-full min-h-[220px] flex-col rounded-2xl border border-[#e0e4e8] bg-white px-6 py-6 shadow-[0_3px_12px_rgba(0,0,0,.025)] sm:min-h-[235px]">
                <Quote size={25} className="shrink-0 text-[var(--art-primary)]" strokeWidth={2}/>
                <p className="mt-4 flex-1 whitespace-pre-line text-[15px] leading-[1.7] text-[#4d5662]">{item.text}</p>
                <footer className="mt-6 text-[14px] font-semibold text-[#252c35]">{item.name}</footer>
              </blockquote>
            </div>)}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
