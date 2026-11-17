import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const TOOLBAR_SELECTOR = '[data-admin-sticky-toolbar="true"]';
const TOOLBAR_GAP = 12;

/**
 * Minimum distance from the viewport bottom to keep floating PABX/WhatsApp
 * panels above a visible sticky/fixed CRM action toolbar.
 *
 * Measure the real rectangle instead of assuming a footer height: on mobile
 * the OS actions, browser safe area, and responsive buttons may all change it.
 */
export function measureFloatingToolbarClearance(panel: HTMLElement): number {
  const viewportHeight = window.innerHeight;
  const panelBox = panel.getBoundingClientRect();
  let clearance = 0;

  for (const toolbar of document.querySelectorAll<HTMLElement>(TOOLBAR_SELECTOR)) {
    if (toolbar.closest('[data-admin-floating-panel="true"]')) continue;
    const box = toolbar.getBoundingClientRect();
    if (box.width < 20 || box.height < 20) continue;

    // Ignore sticky toolbars elsewhere on the page or hidden below the fold.
    if (box.top >= viewportHeight - 24 || box.bottom < viewportHeight - 120 ||
        box.top < viewportHeight * 0.4) continue;

    // A mini-window at the opposite side of a short toolbar need not move.
    if (box.left >= panelBox.right - 4 || box.right <= panelBox.left + 4) continue;

    const style = window.getComputedStyle(toolbar);
    if ((style.position !== "sticky" && style.position !== "fixed") ||
        style.display === "none" || style.visibility === "hidden") continue;

    clearance = Math.max(clearance, Math.ceil(viewportHeight - box.top + TOOLBAR_GAP));
  }

  return clearance;
}

/** Lightweight shared observer for both floating CRM panels. */
export function useFloatingToolbarClearance(
  panelRef: RefObject<HTMLElement | null>,
  position: {x:number;y:number} | null,
  expanded: boolean,
): number {
  const [clearance, setClearance] = useState(0);
  const scheduleRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let frame = 0;
    let observed: HTMLElement[] = [];
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null : new ResizeObserver(() => schedule());

    const measure = () => {
      frame = 0;
      const toolbars = Array.from(document.querySelectorAll<HTMLElement>(TOOLBAR_SELECTOR));
      for (const old of observed) if (!toolbars.includes(old)) resizeObserver?.unobserve(old);
      for (const toolbar of toolbars) if (!observed.includes(toolbar)) resizeObserver?.observe(toolbar);
      observed = toolbars;
      const next = measureFloatingToolbarClearance(panel);
      setClearance(current => current === next ? current : next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    scheduleRef.current = schedule;

    resizeObserver?.observe(panel);
    const mutations = new MutationObserver(records => {
      // Ordinary chat messages and dashboard renders should not rescan every
      // time their children change. Only mounted/unmounted toolbars matter.
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element &&
        (node.matches(TOOLBAR_SELECTOR) || Boolean(node.querySelector(TOOLBAR_SELECTOR)))))) {
        schedule();
      }
    });
    mutations.observe(document.body, {childList:true,subtree:true});
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      scheduleRef.current = () => {};
      window.cancelAnimationFrame(frame);
      mutations.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [panelRef]);

  // A manual drag can change which part of a toolbar overlaps the panel.
  // Recheck without reinstalling the document observers on every movement.
  useLayoutEffect(() => { scheduleRef.current(); }, [position?.x, position?.y, expanded]);

  return clearance;
}
