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

export function FinanceSectionTabs({
  section,
  allowedSections,
  onSelect,
}: {
  section: FinanceSection;
  allowedSections: FinanceSection[];
  onSelect: (section: FinanceSection) => void;
}) {
  return <div className="overflow-x-auto border-b border-[#0d1b2e]/10">
    <div className="flex min-w-max gap-1">
      {allowedSections.map(item => <button
        key={item}
        type="button"
        onClick={() => onSelect(item)}
        className={cn(
          "border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap",
          section === item ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]",
        )}
      >{LABELS[item]}</button>)}
    </div>
  </div>;
}
