import type { ElementType } from "react";
import { ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, Landmark, LayoutDashboard, List, Settings2 } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import type { FinanceSection } from "../domain/finance.types";

const LABELS: Record<FinanceSection, string> = {
  overview: "Resumo",
  receivables: "A receber",
  payables: "A pagar",
  movements: "Extrato",
  accounts: "Contas e caixas",
  reports: "Relatórios",
  registries: "Configurações",
};

const ICONS: Record<FinanceSection, ElementType> = {
  overview: LayoutDashboard,
  receivables: ArrowDownLeft,
  payables: ArrowUpRight,
  movements: List,
  accounts: Landmark,
  reports: ChartNoAxesCombined,
  registries: Settings2,
};

const tabClasses = "relative inline-flex min-h-11 shrink-0 cursor-default items-center justify-center gap-2 bg-transparent px-3 text-xs font-black transition-colors duration-200 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-primary after:transition-transform after:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

export function FinanceSubsectionTabs<T extends string>({
  value, items, onSelect, ariaLabel = "Subseções do financeiro",
}: {
  value: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
  ariaLabel?: string;
}) {
  return <nav className="mr-auto flex w-fit max-w-full justify-start overflow-x-auto" aria-label={ariaLabel}>
    <div className="flex w-max items-center justify-start gap-1">
      {items.map(item => (
        <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={item.id === value ? "page" : undefined}
          className={cn(tabClasses, item.id === value ? "text-primary after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-primary")}>
          {item.label}
        </button>
      ))}
    </div>
  </nav>;
}

export function FinanceSectionTabs({
  section, allowedSections, onSelect, counts,
}: {
  section: FinanceSection;
  allowedSections: FinanceSection[];
  onSelect: (section: FinanceSection) => void;
  counts?: Partial<Record<FinanceSection, number>>;
}) {
  const primary = allowedSections.filter(id => id !== "registries");
  const secondary = allowedSections.filter(id => id === "registries");
  const isOptionsActive = secondary.includes(section);

  return <nav className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-border bg-card px-2 shadow-sm" aria-label="Áreas do financeiro">
    <div className="flex w-max items-center justify-center gap-1">
      {primary.map(id => {
        const Icon = ICONS[id];
        const selected = id === section;
        return <button key={id} type="button" onClick={() => onSelect(id)} aria-current={selected ? "page" : undefined}
          className={cn(tabClasses, selected ? "text-primary after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-primary")}>
          <Icon size={15} aria-hidden="true" />
          {LABELS[id]}
          {counts?.[id] !== undefined && <span
            aria-label={`${counts[id]!.toLocaleString("pt-BR")} cadastradas`}
            className={cn("ml-0.5 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums", selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {counts[id]!.toLocaleString("pt-BR")}
          </span>}
        </button>;
      })}
      {secondary.length > 0 && <>
        {primary.length > 0 && <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Configurações do financeiro" title="Configurações do financeiro"
              aria-current={isOptionsActive ? "page" : undefined}
              className={cn(tabClasses, "px-3", isOptionsActive ? "text-primary after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-primary")}>
              <Settings2 size={17} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {secondary.map(id => {
              const Icon = ICONS[id];
              return <DropdownMenuItem key={id} onSelect={() => onSelect(id)} className={cn("gap-2 text-sm font-semibold", section === id && "text-primary")}>
                <Icon size={16} />
                {LABELS[id]}
              </DropdownMenuItem>;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </>}
    </div>
  </nav>;
}
