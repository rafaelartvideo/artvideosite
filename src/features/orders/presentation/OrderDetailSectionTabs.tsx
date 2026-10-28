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
  commercialLabel = "Produtos e Serviços",
  compactMobile = false,
}: {
  value: OrderDetailTab;
  onChange: (next: OrderDetailTab) => void;
  itemBadge?: { label: string; style: string } | null;
  commercialLabel?: string;
  compactMobile?: boolean;
}) {
  const indicatorId = useId();
  return <div className="border-b border-border">
    <div className={compactMobile ? "grid min-w-0 grid-cols-2 gap-2 sm:flex sm:gap-5" : "flex min-w-0 gap-5 overflow-x-auto"}>
      <button type="button" onClick={() => onChange("details")}
        aria-pressed={value === "details"}
        className={"relative flex min-w-0 items-center border-b-2 border-transparent font-bold transition-colors " + (compactMobile ? "min-h-12 justify-center gap-1 px-0.5 py-2 text-[11px] leading-tight sm:min-h-0 sm:justify-start sm:gap-2 sm:px-1 sm:pb-3 sm:pt-1 sm:text-xs " : "shrink-0 gap-2 px-1 pb-3 pt-1 text-xs ") + (value === "details" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
        <FileText size={15} className="shrink-0" /> <span className="min-w-0">Detalhes da OS</span>
        {value === "details" && <motion.span aria-hidden="true"
          layoutId={indicatorId + "-underline"}
          transition={{ type: "spring", stiffness: 440, damping: 38 }}
          className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-primary" />}
      </button>
      <button type="button" onClick={() => onChange("products-services")}
        aria-pressed={value === "products-services"}
        className={"relative flex min-w-0 items-center border-b-2 border-transparent font-bold transition-colors " + (compactMobile ? "min-h-12 justify-center gap-1 px-0.5 py-2 text-[11px] leading-tight sm:min-h-0 sm:justify-start sm:gap-2 sm:px-1 sm:pb-3 sm:pt-1 sm:text-xs " : "shrink-0 gap-2 px-1 pb-3 pt-1 text-xs ") + (value === "products-services" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
        <span className="inline-flex min-w-0 items-center justify-center gap-1 leading-tight sm:gap-1.5"><Package size={15} className="shrink-0" /><span className={compactMobile ? "min-w-0 whitespace-normal break-words" : undefined}>{commercialLabel}</span></span>
        {itemBadge && <span title={itemBadge.label} className={"inline-flex shrink-0 items-center justify-center rounded-md border px-1 py-0.5 text-[10px] font-bold leading-none sm:px-1.5 " + itemBadge.style}>{compactMobile ? <><span className="sm:hidden">{itemBadge.label.match(/^\d+/)?.[0] || itemBadge.label}</span><span className="hidden sm:inline">{itemBadge.label}</span></> : itemBadge.label}</span>}
        {value === "products-services" && <motion.span aria-hidden="true"
          layoutId={indicatorId + "-underline"}
          transition={{ type: "spring", stiffness: 440, damping: 38 }}
          className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-primary" />}
      </button>
    </div>
  </div>;
}
