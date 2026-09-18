import { supabase } from "@/lib/supabase";

export async function getPublicOrder(identifier: string) {
  return supabase.rpc("track_service_order", {
    p_os_number: identifier.trim(),
    p_tracking_token: null,
  });
}
