import { FileText, Package } from "lucide-react";
import { useId } from "react";
import { motion } from "motion/react";

// Utilizado pela OS regular e pela OS no Painel do Técnico para manter
// navegação visual idêntica, sem compartilhar a política de acesso aos dados.
export type OrderDetailTab = "details" | "products-services";

export function OrderDetailSectionTabs({
  value,
  onChange,
  itemBadge,
}: {
  value: OrderDetailTab;
  onChange: (next: OrderDetailTab) => void;
  itemBadge?: { label: string; style: string } | null;
}) {
  const indicatorId = useId();
  return <div className="border-b border-border">
    <div className="flex min-w-0 gap-5 overflow-x-auto">
      <button type="button" onClick={() => onChange("details")}
        aria-pressed={value === "details"}
        className={"relative flex shrink-0 items-center gap-2 border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-bold transition-colors " + (value === "details" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
        <FileText size={15} /> Detalhes da OS
        {value === "details" && <motion.span aria-hidden="true"
          layoutId={indicatorId + "-underline"}
          transition={{ type: "spring", stiffness: 440, damping: 38 }}
          className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-primary" />}
      </button>
      <button type="button" onClick={() => onChange("products-services")}
        aria-pressed={value === "products-services"}
        className={"relative flex shrink-0 items-center gap-2 border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-bold transition-colors " + (value === "products-services" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
        <Package size={15} /> Produtos e Serviços
        {itemBadge && <span className={"inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold " + itemBadge.style}>{itemBadge.label}</span>}
        {value === "products-services" && <motion.span aria-hidden="true"
          layoutId={indicatorId + "-underline"}
          transition={{ type: "spring", stiffness: 440, damping: 38 }}
          className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-primary" />}
      </button>
    </div>
  </div>;
}
