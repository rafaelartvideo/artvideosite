import { useEffect, useState } from "react";
import {
  listServiceOrderSituationVisits,
  type ServiceOrderSituationVisit,
} from "../infrastructure/order-situation-visits.repository";

export function useOrderSituationVisits(orderId?: string | null, situationId?: string | null, situationStartedAt?: string | null) {
  const [visits, setVisits] = useState<ServiceOrderSituationVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) {
      setVisits([]);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    listServiceOrderSituationVisits(orderId).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) {
        setVisits([]);
        setError(loadError.message || "Não foi possível carregar os registros de SLA da OS.");
      } else {
        setVisits((data || []) as ServiceOrderSituationVisit[]);
      }
      setLoading(false);
    });

    return () => { active = false; };
  }, [orderId, situationId, situationStartedAt]);

  return { visits, loading, error };
}
