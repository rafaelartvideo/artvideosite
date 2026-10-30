import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function FinanceModalDropdown({ anchorRef, open, id, children }: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  id: string;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{
    container: HTMLElement; left: number; top: number; width: number; height: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const update = () => {
      const anchor = anchorRef.current;
      const container = anchor?.closest<HTMLElement>('[data-admin-dialog-content="true"]');
      if (!anchor || !container) { setPosition(null); return; }
      const field = anchor.getBoundingClientRect();
      const modal = container.getBoundingClientRect();
      const below = modal.bottom - field.bottom - 12;
      const above = field.top - modal.top - 12;
      const up = below < 200 && above > below;
      const height = Math.max(52, Math.min(200, (up ? above : below) - 4));
      setPosition({
        container, height, width: Math.min(field.width, modal.width - 16),
        left: Math.max(8, Math.min(field.left - modal.left, modal.width - field.width - 8)),
        top: up ? field.top - modal.top - height - 4 : field.bottom - modal.top + 4,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [anchorRef, open]);
  if (!open || !position) return null;
  return createPortal(<div id={id} role="listbox" data-finance-combobox-popup="true"
    className="absolute z-[100] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
    style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }}>
    {children}
  </div>, position.container);
}
