import { Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeftRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { getServiceOrderForRoute } from "../infrastructure/orders-list.repository";

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
  const queryClient = useQueryClient();
  const { chain, organizationId } = useOrderReturnChain(order);
  // Reaproveita a mesma consulta da rota antes do clique, evitando buscas
  // extras e reduzindo a duração da transição entre original e retorno.
  const prefetchCycle = (id: string) => {
    if (!organizationId || !id || id === order?.id) return;
    void queryClient.prefetchQuery({
      queryKey: ["orders", "route-preview", organizationId, id],
      queryFn: () => getServiceOrderForRoute(organizationId, id),
      staleTime: 30_000,
    });
  };
  const title = "OS " + String(order?.os_number || "—");

  if (chain.length < 2) {
    return <span className="mr-1 inline-flex shrink-0 items-center text-lg font-black leading-none text-foreground sm:text-xl">{title}</span>;
  }

  return <nav className="mr-1 inline-flex flex-wrap items-center gap-1.5" aria-label="Alternar entre OS original e retornos">
    {chain.map((cycle, index) => <Fragment key={cycle.id}>
      {index > 0 && <ArrowLeftRight size={13} aria-hidden="true" className="shrink-0 text-muted-foreground/60" />}
      {cycle.id === order?.id
        ? <span aria-current="page" className="inline-flex min-h-8 items-center border-b-2 border-primary px-2.5 py-1 text-base font-bold tabular-nums text-primary sm:text-lg">
            {index === 0 ? "OS " + cycle.os_number : cycle.os_number}
          </span>
        : <button type="button"
            onPointerEnter={() => prefetchCycle(cycle.id)}
            onFocus={() => prefetchCycle(cycle.id)}
            onClick={() => navigate(adminPath("orders", cycle.id))}
            className="inline-flex min-h-8 items-center border-b-2 border-transparent px-2.5 py-1 text-base font-bold tabular-nums text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-lg"
            title={"Abrir OS " + cycle.os_number}>
            {index === 0 ? "OS " + cycle.os_number : cycle.os_number}
          </button>}
    </Fragment>)}
  </nav>;
}

