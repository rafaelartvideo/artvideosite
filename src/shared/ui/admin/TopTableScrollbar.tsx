import { useLayoutEffect, useRef, useState } from "react";

/**
 * Uma segunda barra de rolagem, acima de qualquer tabela cujo contêiner
 * já tenha overflow-x-auto. Não altera a marcação da tabela, os controles,
 * a paginação nem o scroll inferior.
 *
 * Uso: colocar <TopTableScrollbar /> como PRIMEIRO filho do mesmo elemento
 * overflow-x-auto que contém a <table />. O componente descobre seu próprio
 * contêiner para não exigir um ref novo em cada módulo.
 */
export function TopTableScrollbar() {
  const barRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [show, setShow] = useState(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const container = bar?.parentElement;
    const table = container?.querySelector("table");
    if (!bar || !container || !table) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const width = Math.ceil(table.scrollWidth);
      const viewport = container.clientWidth;
      const overflow = viewport > 0 && width > viewport + 2;
      setContentWidth(width);
      setShow(overflow);
      if (!overflow) {
        bar.scrollLeft = 0;
      } else if (Math.abs(bar.scrollLeft - container.scrollLeft) > 1) {
        bar.scrollLeft = container.scrollLeft;
      }
    };
    const scheduleMeasure = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const syncFromTop = () => {
      if (Math.abs(container.scrollLeft - bar.scrollLeft) > 1) {
        container.scrollLeft = bar.scrollLeft;
      }
    };
    const syncFromTable = () => {
      if (Math.abs(bar.scrollLeft - container.scrollLeft) > 1) {
        bar.scrollLeft = container.scrollLeft;
      }
    };

    bar.addEventListener("scroll", syncFromTop, { passive: true });
    container.addEventListener("scroll", syncFromTable, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(container);
    observer?.observe(table);
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    scheduleMeasure();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      bar.removeEventListener("scroll", syncFromTop);
      container.removeEventListener("scroll", syncFromTable);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  return <div
    ref={barRef}
    aria-label="Rolagem horizontal superior da tabela"
    tabIndex={show ? 0 : -1}
    className={show
      ? "sticky left-0 z-[1] mb-1 h-4 w-full min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable]"
      : "hidden"}
  >
    <div aria-hidden="true" style={{ width: contentWidth, height: 1 }}/>
  </div>;
}
