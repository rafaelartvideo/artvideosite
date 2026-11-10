import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { OrderReturnStartDialog } from "./OrderReturnStartDialog";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { cn } from "@/shared/domain/formatters";
import { BtnPrimary } from "@/shared/ui/admin/AdminLayout";

const CLASSIFICATIONS = [
  { value: "analysis", label: "Garantia em análise" },
  { value: "covered", label: "Garantia procedente — sem cobrança" },
  { value: "not_covered", label: "Garantia improcedente — orçamento" },
  { value: "courtesy", label: "Cortesia — sem cobrança" },
  { value: "unrelated", label: "Outro defeito — serviço independente" },
] as const;

type OrderCycle = {
  id: string;
  os_number: string;
  return_root_id: string | null;
  return_sequence: number;
  completed_at: string | null;
  cancelled_at: string | null;
};

function useOrderReturnChain(order: any) {
  const organizationId = String(order?.organization_id || "");
  const rootId = String(order?.return_root_id || order?.id || "");
  const enabled = Boolean(order?.id && (order?.return_root_id || order?.completed_at));
  const query = useQuery({
    queryKey: ["order-return-chain", organizationId, rootId],
    enabled: enabled && Boolean(organizationId && rootId),
    staleTime: 30_000,
    queryFn: async (): Promise<OrderCycle[]> => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id,os_number,return_root_id,return_sequence,completed_at,cancelled_at")
        .eq("organization_id", organizationId)
        .or("id.eq." + rootId + ",return_root_id.eq." + rootId)
        .order("return_sequence", { ascending: true });
      if (error) throw error;
      return (data || []) as OrderCycle[];
    },
  });
  return { query, chain: query.data || [], organizationId, rootId };
}

/** Apenas os códigos lado a lado na mesma linha do número da OS. */
export function OrderReturnSwitcher({ order }: { order: any }) {
  const navigate = useNavigate();
  const { chain } = useOrderReturnChain(order);
  const title = "OS " + String(order?.os_number || "—");

  if (chain.length < 2) {
    return <span className="mr-1 inline-flex shrink-0 items-center text-lg font-black leading-none text-foreground sm:text-xl">{title}</span>;
  }

  return <nav className="mr-1 inline-flex flex-wrap items-center gap-1.5" aria-label="Alternar entre OS original e retornos">
    {chain.map((cycle, index) => <Fragment key={cycle.id}>
      {index > 0 && <ArrowLeftRight size={13} aria-hidden="true" className="shrink-0 text-muted-foreground/60" />}
      {cycle.id === order?.id
        ? <span aria-current="page" className={cn("inline-flex min-h-8 items-center rounded-md px-2.5 py-1 text-base font-black sm:text-lg", cycle.return_root_id ? "bg-orange-500/10 text-orange-600" : "bg-[#0131CD]/10 text-[#0131CD]")}>
            {index === 0 ? "OS " + cycle.os_number : cycle.os_number}
          </span>
        : <button type="button" onClick={() => navigate(adminPath("orders", cycle.id))}
            className="inline-flex min-h-8 items-center rounded-md px-2.5 py-1 text-base font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-lg"
            title={"Abrir OS " + cycle.os_number}>
            {index === 0 ? "OS " + cycle.os_number : cycle.os_number}
          </button>}
    </Fragment>)}
  </nav>;
}

/** Abertura sempre pela checagem do certificado, na toolbar inferior. */
export function OrderReturnActions({ order, canCreate }: {
  order: any;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canCreate || !order?.completed_at || order?.cancelled_at) return null;
  const serviceType = order?.service_type as { quote_workflow_enabled?: boolean; generates_warranty?: boolean } | undefined;
  const canStartReturn = serviceType?.quote_workflow_enabled === true && serviceType?.generates_warranty === true;
  const label = canStartReturn ? "Iniciar retorno" : "Reabrir OS";
  return <>
    <BtnPrimary onClick={() => setOpen(true)} className="h-10 gap-2 px-3 text-xs font-bold md:px-4">
      <RotateCcw size={15} /> {label}
    </BtnPrimary>
    <OrderReturnStartDialog order={order} open={open} onClose={() => setOpen(false)}
      mode={canStartReturn ? "return" : "reopen"} />
  </>;
}
