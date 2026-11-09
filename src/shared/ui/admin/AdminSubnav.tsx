import { useEffect, useRef } from "react";
import { cn } from "@/shared/domain/formatters";
import { ADMIN_SUBSECTION_TAB_CLASS, ADMIN_SUBSECTION_TAB_ACTIVE_CLASS, ADMIN_SUBSECTION_TAB_INACTIVE_CLASS } from "@/shared/ui/admin/AdminSubsectionTabs";

/** Mesmo padrão visual das subseções, preservando a navegação móvel com item ativo visível. */
export function AdminSubnav<T extends string>({ value, items, onSelect, ariaLabel, className }: {
  value: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const button = selectedRef.current, container = scrollRef.current;
    if (!button || !container) return;
    const reveal = () => {
      if (button.offsetLeft < container.scrollLeft || button.offsetLeft + button.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollTo({ left: Math.max(0, button.offsetLeft - container.clientWidth / 2 + button.offsetWidth / 2), behavior: "auto" });
      }
    };
    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value]);
  return <nav aria-label={ariaLabel} className={cn("w-full min-w-0 border-b border-border", className)}>
    <div ref={scrollRef} role="tablist" aria-label={ariaLabel}
      className="flex min-w-0 items-center justify-start gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map(item => {
        const selected = item.id === value;
        return <button key={item.id} ref={selected ? selectedRef : undefined} type="button"
          role="tab" aria-selected={selected} aria-current={selected ? "page" : undefined}
          onClick={() => onSelect(item.id)}
          className={cn(ADMIN_SUBSECTION_TAB_CLASS, selected ? ADMIN_SUBSECTION_TAB_ACTIVE_CLASS : ADMIN_SUBSECTION_TAB_INACTIVE_CLASS)}>
          {item.label}
        </button>;
      })}
    </div>
  </nav>;
}
