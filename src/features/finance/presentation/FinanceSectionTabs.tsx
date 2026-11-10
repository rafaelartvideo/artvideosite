import { ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, CreditCard, FolderTree, Landmark, LayoutDashboard, List, Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSubsectionTabs, ADMIN_SUBSECTION_TAB_CLASS, ADMIN_SUBSECTION_TAB_ACTIVE_CLASS, ADMIN_SUBSECTION_TAB_INACTIVE_CLASS } from "@/shared/ui/admin/AdminSubsectionTabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import type { FinanceRegistrySection, FinanceSection } from "../domain/finance.types";

const LABELS: Record<FinanceSection, string> = {
  overview: "Resumo",
  receivables: "A receber",
  payables: "A pagar",
  movements: "Extrato",
  accounts: "Contas e caixas",
  reports: "Relatórios",
  registries: "Configurações",
};

const ICONS: Record<FinanceSection, LucideIcon> = {
  overview: LayoutDashboard,
  receivables: ArrowDownLeft,
  payables: ArrowUpRight,
  movements: List,
  accounts: Landmark,
  reports: ChartNoAxesCombined,
  registries: Settings2,
};

export function FinanceSubsectionTabs<T extends string>({
  value, items, onSelect, ariaLabel = "Subseções do financeiro", centered = false,
}: {
  value: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
  ariaLabel?: string;
  centered?: boolean;
}) {
  return <AdminSubsectionTabs value={value} items={items} onChange={onSelect} ariaLabel={ariaLabel} centered={centered} />;
}

export function FinanceSectionTabs({
  section, allowedSections, onSelect, counts, countErrors = [], availableRegistrySections, activeRegistry, onOpenRegistry,
}: {
  section: FinanceSection;
  allowedSections: FinanceSection[];
  onSelect: (section: FinanceSection) => void;
  counts?: Partial<Record<FinanceSection, number>>;
  countErrors?: FinanceSection[];
  availableRegistrySections: FinanceRegistrySection[];
  activeRegistry: FinanceRegistrySection | null;
  onOpenRegistry: (registry: FinanceRegistrySection) => void;
}) {
  const primary = allowedSections.filter(id => id !== "registries");
  const hasRegistryMenu = allowedSections.includes("registries") && availableRegistrySections.length > 0;
  const isOptionsActive = Boolean(activeRegistry);

  return <AdminSubsectionTabs
    value={section} items={primary.map(id => ({
      id, label: LABELS[id], Icon: ICONS[id],
      count: counts?.[id], countUnavailable: countErrors.includes(id),
      countTone: id === "receivables" || id === "payables" ? "pending" as const : undefined,
    }))}
    onChange={onSelect} ariaLabel="Áreas do financeiro"
    trailing={hasRegistryMenu ? <>
      {primary.length > 0 && <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Configurações do financeiro" title="Configurações do financeiro"
            aria-current={isOptionsActive ? "page" : undefined}
            className={cn(ADMIN_SUBSECTION_TAB_CLASS, isOptionsActive ? ADMIN_SUBSECTION_TAB_ACTIVE_CLASS : ADMIN_SUBSECTION_TAB_INACTIVE_CLASS)}>
            <Settings2 size={14} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {availableRegistrySections.includes("categories") && <DropdownMenuItem onSelect={() => onOpenRegistry("categories")} className={cn("gap-2 text-sm font-semibold", activeRegistry === "categories" && "text-primary")}>
            <FolderTree size={16} /> Categorias
          </DropdownMenuItem>}
          {availableRegistrySections.includes("payment-methods") && <DropdownMenuItem onSelect={() => onOpenRegistry("payment-methods")} className={cn("gap-2 text-sm font-semibold", activeRegistry === "payment-methods" && "text-primary")}>
            <CreditCard size={16} /> Formas de pagamento
          </DropdownMenuItem>}
          {availableRegistrySections.includes("settings") && <DropdownMenuItem onSelect={() => onOpenRegistry("settings")} className={cn("gap-2 text-sm font-semibold", activeRegistry === "settings" && "text-primary")}>
            <Settings2 size={16} /> Configurações
          </DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </> : undefined}
  />;
}
