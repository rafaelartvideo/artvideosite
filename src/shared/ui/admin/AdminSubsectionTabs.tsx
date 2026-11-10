import type { ElementType, ReactNode } from "react";
import { cn } from "@/shared/domain/formatters";
import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";

/** Padrão único de subseções do CRM, baseado no editor de Novo item.
 * Mantém a divisória inferior sem exibir barra de rolagem horizontal.
 */
export const ADMIN_SUBSECTION_TAB_CLASS =
  "inline-flex h-12 min-h-12 shrink-0 items-center justify-center gap-2 border-b-[3px] bg-transparent px-1 text-sm whitespace-nowrap font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export const ADMIN_SUBSECTION_TAB_ACTIVE_CLASS = "border-primary text-primary";
export const ADMIN_SUBSECTION_TAB_INACTIVE_CLASS = "border-transparent text-muted-foreground";

export type AdminSubsectionItem<T extends string> = {
  id: T;
  label: string;
  Icon?: ElementType;
  count?: number;
  countUnavailable?: boolean;
  countTone?: "pending";
  disabled?: boolean;
};

export function AdminSubsectionTabs<T extends string>({
  value, items, onChange, ariaLabel, trailing, centered = false,
}: {
  value: T;
  items: ReadonlyArray<AdminSubsectionItem<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  trailing?: ReactNode;
  centered?: boolean;
}) {
  return <nav aria-label={ariaLabel} className="w-full min-w-0 border-b border-border">
    <div role="tablist" aria-label={ariaLabel}
      className={cn("flex min-w-0 items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", centered ? "justify-start sm:justify-center" : "justify-start")}>
      {items.map(({ id, label, Icon, count, countUnavailable, countTone, disabled }) => {
        const selected = id === value;
        return <button key={id} type="button" role="tab" aria-selected={selected}
          aria-current={selected ? "page" : undefined} disabled={disabled}
          onClick={() => onChange(id)}
          className={cn(ADMIN_SUBSECTION_TAB_CLASS, "disabled:cursor-not-allowed disabled:opacity-50", selected ? ADMIN_SUBSECTION_TAB_ACTIVE_CLASS : ADMIN_SUBSECTION_TAB_INACTIVE_CLASS)}>
          {Icon && <Icon size={14} className="shrink-0" aria-hidden="true" />}
          <span>{label}</span>
          {typeof count === "number" && <span className={cn("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", countTone === "pending" ? `border ${STATUS_TONE_CLASSES.pending.badge}` : selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{count.toLocaleString("pt-BR")}</span>}
          {count === undefined && countUnavailable && <span aria-label="Contagem indisponível" title="Não foi possível carregar esta contagem" className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">—</span>}
        </button>;
      })}
      {trailing}
    </div>
  </nav>;
}
