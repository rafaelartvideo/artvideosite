import { supabase } from "@/lib/supabase";

export async function getPublicOrder(identifier: string) {
  return supabase
    .from("service_orders")
    .select("id, os_number, tracking_token, customer_id, service_id, status_id, created_at, updated_at, customer_notes, internal_notes, customer:customers(full_name), order_status:order_statuses(name)")
    .or(`os_number.eq.${identifier},tracking_token.eq.${identifier}`)
    .maybeSingle();
}

export async function listPublicOrderHistory(serviceOrderId: string) {
  return supabase
    .from("service_order_status_history")
    .select("created_at, notes, order_status:order_statuses(name)")
    .eq("service_order_id", serviceOrderId)
    .eq("is_visible_to_customer", true)
    .order("created_at", { ascending: true });
}
