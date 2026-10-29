import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/domain/formatters";

/** One navigation treatment for every CRM module and its subsections. */
export function AdminSectionNav<T extends string>({ value, items, onSelect, ariaLabel, className, trailing, mode = "navigation" }: {
  value: T;
  items: ReadonlyArray<{ id: T; label: string; Icon?: LucideIcon }>;
  onSelect: (value: T) => void;
  ariaLabel: string;
  className?: string;
  trailing?: ReactNode;
  mode?: "navigation" | "tabs";
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const button = selectedRef.current;
    const container = scrollRef.current;
    if (!button || !container) return;
    const reveal = () => {
      if (button.offsetLeft < container.scrollLeft || button.offsetLeft + button.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollTo({ left: Math.max(0, button.offsetLeft - container.clientWidth / 2 + button.offsetWidth / 2), behavior: "auto" });
      }
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value]);

  return <div className={cn("admin-section-nav flex min-w-0 max-w-full flex-wrap items-center gap-x-5 border-b border-border", className)}>
    <nav ref={scrollRef} role={mode === "tabs" ? "tablist" : undefined} aria-label={ariaLabel} className="min-w-0 max-w-full flex-1 basis-full overflow-x-auto sm:basis-0">
      <div className="relative flex min-w-max items-stretch gap-1">
        {items.map(({ id, label, Icon }) => {
          const selected = id === value;
          return <button key={id} ref={selected ? selectedRef : undefined} type="button"
            role={mode === "tabs" ? "tab" : undefined}
            aria-selected={mode === "tabs" ? selected : undefined}
            aria-current={mode === "navigation" && selected ? "page" : undefined} onClick={() => onSelect(id)}
            className={cn("group relative inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30", selected ? "text-primary dark:text-primary-light" : "text-muted-foreground hover:text-foreground")}>
            <span aria-hidden="true" className={cn("absolute inset-x-1 inset-y-2 rounded-lg transition-colors", selected ? "bg-primary/7 dark:bg-primary/20" : "group-hover:bg-muted")} />
            {Icon && <Icon size={16} aria-hidden="true" className="relative shrink-0" />}
            <span className="relative">{label}</span>
            <span aria-hidden="true" className={cn("absolute inset-x-3 bottom-0 h-0.5 rounded-t-full bg-primary dark:bg-primary-light", selected ? "opacity-100" : "opacity-0")} />
          </button>;
        })}
      </div>
    </nav>
    {trailing && <div className="min-w-0 w-full pb-3 sm:ml-auto sm:w-auto sm:shrink-0 sm:pb-2">{trailing}</div>}
  </div>;
}
