import { FileText, Package } from "lucide-react";

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
  return <div className="border-b border-border">
    <div className="flex min-w-0 gap-5 overflow-x-auto">
      <button type="button" onClick={() => onChange("details")}
        aria-pressed={value === "details"}
        className={"flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors " + (value === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
        <FileText size={15} /> Detalhes da OS
      </button>
      <button type="button" onClick={() => onChange("products-services")}
        aria-pressed={value === "products-services"}
        className={"flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors " + (value === "products-services" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
        <Package size={15} /> Produtos e Serviços
        {itemBadge && <span className={"inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold " + itemBadge.style}>{itemBadge.label}</span>}
      </button>
    </div>
  </div>;
}
