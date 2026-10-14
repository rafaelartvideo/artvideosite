import { cn } from "@/shared/domain/formatters";
import type { FinanceSection } from "../domain/finance.types";

const LABELS: Record<FinanceSection, string> = {
  overview: "Resumo",
  receivables: "A receber",
  payables: "A pagar",
  movements: "Extrato",
  accounts: "Contas e caixa",
  recurring: "Recorrências",
  reports: "Relatórios",
  registries: "Configurações",
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
  return <nav className="max-w-full overflow-x-auto" aria-label={ariaLabel}>
    <div className="flex w-max min-w-full items-center gap-1 rounded-lg border border-border bg-card p-1">
      {items.map(item => <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={value === item.id ? "page" : undefined}
        className={cn(
          "min-h-9 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          value === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >{item.label}</button>)}
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
  const primary = allowedSections.filter(id => id !== "recurring" && id !== "registries");
  const secondary = allowedSections.filter(id => id === "recurring" || id === "registries");
  return <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
    {primary.length > 0 && <FinanceSubsectionTabs value={section} items={primary.map(id => ({ id, label: LABELS[id] }))} onSelect={onSelect} ariaLabel="Navegação do financeiro" />}
    {secondary.length > 0 && <select
      aria-label="Outras opções do financeiro"
      value={secondary.includes(section) ? section : ""}
      onChange={event => { if (event.target.value) onSelect(event.target.value as FinanceSection); }}
      className="min-h-11 max-w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <option value="" disabled>Mais opções</option>
      {secondary.map(id => <option key={id} value={id}>{LABELS[id]}</option>)}
    </select>}
  </div>;
}
