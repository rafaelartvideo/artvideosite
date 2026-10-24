/** Reposiciona as etapas na área branca, sem ocultar o botão voltar sob o cabeçalho. */
export function scrollToQuoteStep() {
  const target = document.querySelector<HTMLElement>("[data-quote-scroll-anchor]");
  if (!target) return;
  const headerHeight = document.querySelector<HTMLElement>(".artvideo-public > header")?.offsetHeight ?? 76;
  const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 12);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: reducedMotion ? "instant" : "smooth" });
}
