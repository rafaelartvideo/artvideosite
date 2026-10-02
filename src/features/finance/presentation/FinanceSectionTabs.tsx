import { cn } from "@/shared/domain/formatters";
import type { FinanceSection } from "../domain/finance.types";

const LABELS: Record<FinanceSection, string> = {
  overview: "Visão geral",
  receivables: "Contas a receber",
  payables: "Contas a pagar",
  movements: "Movimentações",
  accounts: "Caixas e contas",
  recurring: "Recorrências",
  reports: "Relatórios",
  registries: "Cadastros financeiros",
};

export function FinanceSubsectionTabs<T extends string>({
  value,
  items,
  onSelect,
  ariaLabel = "Subseções do financeiro",
}: {
  value: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
  ariaLabel?: string;
}) {
  return <nav className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-border bg-card px-1.5 shadow-sm" aria-label={ariaLabel}>
    <div className="flex min-w-max items-stretch gap-1">
      {items.map(item => {
        const selected = value === item.id;
        return <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          aria-current={selected ? "page" : undefined}
          className={cn(
            "group relative min-h-11 whitespace-nowrap px-4 py-3 text-xs font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
            selected ? "text-primary" : "text-[#5a6a82] hover:text-primary",
          )}
        >
          {item.label}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-primary transition-transform duration-300 ease-out",
              selected ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50",
            )}
          />
        </button>;
      })}
    </div>
  </nav>;
}

export function FinanceSectionTabs({
  section,
  allowedSections,
  onSelect,
}: {
  section: FinanceSection;
  allowedSections: FinanceSection[];
  onSelect: (section: FinanceSection) => void;
}) {
  return <FinanceSubsectionTabs
    value={section}
    items={allowedSections.map(item => ({ id: item, label: LABELS[item] }))}
    onSelect={onSelect}
    ariaLabel="Áreas do financeiro"
  />;
}
