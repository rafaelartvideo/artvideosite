import { FileText, Package } from "lucide-react";

// Utilizado pela OS regular e pela OS no Painel do Técnico para manter
// navegação visual idêntica, sem compartilhar a política de acesso aos dados.
export type OrderDetailTab = "details" | "products-services";

export function OrderDetailSectionTabs({
  value,
  onChange,
  itemBadge,
  commercialLabel = "Produtos e Serviços",
  commercialActionsHostId,
  compactMobile = false,
}: {
  value: OrderDetailTab;
  onChange: (next: OrderDetailTab) => void;
  itemBadge?: { label: string; style: string } | null;
  commercialLabel?: string;
  commercialActionsHostId?: string;
  compactMobile?: boolean;
}) {
  return <div className="border-b border-border">
    <div className={compactMobile ? "grid min-w-0 grid-cols-2 gap-2 sm:flex sm:gap-5" : "flex h-11 min-w-0 items-stretch gap-5 overflow-x-auto"}>
      <button type="button" onClick={() => onChange("details")}
        aria-pressed={value === "details"}
        className={"relative flex min-w-0 items-center border-b-2 font-bold transition-colors duration-150 motion-reduce:transition-none " + (compactMobile ? "min-h-12 justify-center gap-1 px-0.5 py-2 text-[11px] leading-tight sm:min-h-0 sm:justify-start sm:gap-2 sm:px-1 sm:pb-3 sm:pt-1 sm:text-xs " : "h-full shrink-0 gap-2 px-1 py-0 text-xs ") + (value === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
        <FileText size={15} className="shrink-0" /> <span className="min-w-0">Detalhes da OS</span>
      </button>
      <div className={compactMobile ? "flex min-w-0 items-center gap-1" : "flex h-full min-w-0 items-center gap-1"}>
      <button type="button" onClick={() => onChange("products-services")}
        aria-pressed={value === "products-services"}
        className={"relative flex min-w-0 items-center border-b-2 font-bold transition-colors duration-150 motion-reduce:transition-none " + (compactMobile ? "min-h-12 justify-center gap-1 px-0.5 py-2 text-[11px] leading-tight sm:min-h-0 sm:justify-start sm:gap-2 sm:px-1 sm:pb-3 sm:pt-1 sm:text-xs " : "h-full shrink-0 gap-2 px-1 py-0 text-xs ") + (value === "products-services" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
        <span className="inline-flex min-w-0 items-center justify-center gap-1 leading-tight sm:gap-1.5"><Package size={15} className="shrink-0" /><span className={compactMobile ? "min-w-0 whitespace-normal break-words" : undefined}>{commercialLabel}</span></span>
        {itemBadge && <span title={itemBadge.label} className={"inline-flex shrink-0 items-center justify-center rounded-md border px-1 py-0.5 text-[10px] font-bold leading-none sm:px-1.5 " + itemBadge.style}>{compactMobile ? <><span className="sm:hidden">{itemBadge.label.match(/^\d+/)?.[0] || itemBadge.label}</span><span className="hidden sm:inline">{itemBadge.label}</span></> : itemBadge.label}</span>}
      </button>
      {commercialActionsHostId && <span id={commercialActionsHostId} className="inline-flex h-8 shrink-0 items-center justify-center self-center" />}
      </div>
    </div>
  </div>;
}
