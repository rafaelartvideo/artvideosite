import type { LucideIcon } from "lucide-react";

/** Navegação de subseções no mesmo padrão dos botões de Entrega. */
export function AdminSubsectionButtons<T extends string>({
  value, items, onChange, ariaLabel,
}: {
  value: T;
  items: ReadonlyArray<{ id: T; label: string; Icon: LucideIcon }>;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return <nav aria-label={ariaLabel} className="flex min-w-0 flex-wrap gap-2 border-b border-border pb-3">
    {items.map(({ id, label, Icon }) => (
      <button key={id} type="button" onClick={() => onChange(id)}
        aria-current={value === id ? "page" : undefined}
        className={"inline-flex min-h-10 items-center gap-2 rounded-md border px-4 py-2.5 text-xs font-bold transition-colors " +
          (value === id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted")}>
        <Icon size={16} className="shrink-0" />{label}
      </button>
    ))}
  </nav>;
}
