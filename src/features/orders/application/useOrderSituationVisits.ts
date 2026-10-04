import { useQuery } from "@tanstack/react-query";
import {
  listServiceOrderSituationVisits,
  type ServiceOrderSituationVisit,
} from "../infrastructure/order-situation-visits.repository";

export function useOrderSituationVisits(
  orderId?: string | null,
  situationId?: string | null,
  situationStartedAt?: string | null,
) {
  const query = useQuery({
    queryKey: ["orders", orderId || "", "situation-visits"],
    enabled: Boolean(orderId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await listServiceOrderSituationVisits(orderId!);
      if (error) throw error;
      return (data || []) as ServiceOrderSituationVisit[];
    },
  });

  // Mantém situação/entrada como dependências sem provocar fetch enquanto o
  // bootstrap ainda está fresco; invalidações Realtime cuidam das mudanças.
  void situationId;
  void situationStartedAt;

  return {
    visits: query.data || [],
    loading: query.isLoading,
    error: query.error instanceof Error
      ? query.error.message
      : query.error
        ? "Não foi possível carregar os registros de SLA da OS."
        : "",
  };
}
