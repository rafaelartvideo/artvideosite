import { supabase } from "@/lib/supabase";

export function cancelServiceOrder(serviceOrderId: string, reason: string) {
  return supabase.rpc("cancel_service_order", {
    p_service_order_id: serviceOrderId,
    p_reason: reason.trim(),
  });
}
