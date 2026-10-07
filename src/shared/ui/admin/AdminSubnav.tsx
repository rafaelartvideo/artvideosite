import { useEffect, useRef } from 'react';
import { cn } from '@/shared/domain/formatters';

/** Navigation between existing CRM sections, with one scrollable row on mobile. */
export function AdminSubnav<T extends string>({ value, items, onSelect, ariaLabel, className }: {
  value: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = selectedRef.current;
    const container = button?.parentElement?.parentElement;
    if (!button || !container) return;
    const reveal = () => {
      if (button.offsetLeft < container.scrollLeft || button.offsetLeft + button.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollTo({ left: Math.max(0, button.offsetLeft - container.clientWidth / 2 + button.offsetWidth / 2), behavior: 'auto' });
      }
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value]);
  return <nav aria-label={ariaLabel} className={cn('mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-border bg-card px-1.5 shadow-sm', className)}>
    <div className="relative flex min-w-max items-stretch gap-1">
      {items.map(item => <button
        key={item.id}
        ref={item.id === value ? selectedRef : undefined}
        type="button"
        aria-current={item.id === value ? 'page' : undefined}
        onClick={() => onSelect(item.id)}
        className={cn('group relative min-h-11 whitespace-nowrap px-4 py-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30', item.id === value ? 'text-primary' : 'text-muted-foreground hover:text-primary')}
      >
        {item.label}
        <span aria-hidden="true" className={cn('absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', item.id === value ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50')} />
      </button>)}
    </div>
  </nav>;
}
