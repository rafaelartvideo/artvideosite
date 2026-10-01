import { supabase } from "@/lib/supabase";

export type ServiceOrderSituationHistoryEntry = {
  audit_log_id: number;
  changed_at: string;
  actor_user_id: string | null;
  actor_name: string;
  previous_situation_id: string | null;
  previous_situation_name: string;
  previous_situation_color: string | null;
  next_situation_id: string | null;
  next_situation_name: string;
  next_situation_color: string | null;
};

export async function getServiceOrderSituationHistory(
  organizationId: string,
  serviceOrderId: string,
): Promise<ServiceOrderSituationHistoryEntry[]> {
  const { data, error } = await supabase.rpc("get_service_order_situation_history_v1", {
    p_organization_id: organizationId,
    p_service_order_id: serviceOrderId,
  });
  if (error) throw error;
  return (data || []) as ServiceOrderSituationHistoryEntry[];
}
