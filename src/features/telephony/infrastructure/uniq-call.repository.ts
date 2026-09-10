import { supabase } from "@/lib/supabase";
import { ARTVIDEO_ORGANIZATION_ID, type UniqCall } from "../domain/uniq-call";

const ACTIVE_CALL_SELECT = [
  "id",
  "organization_id",
  "uniq_call_id",
  "direction",
  "state",
  "remote_phone",
  "remote_phone_digits",
  "uniq_subscriber_id",
  "answered_subscriber_id",
  "customer_id",
  "service_order_id",
  "setup_at",
  "answered_at",
  "ended_at",
  "duration_seconds",
  "updated_at",
  "customer:customers(id,full_name,trade_name)",
  "service_order:service_orders(id,os_number)",
].join(",");

export async function getActiveUniqCall() {
  const { data, error } = await supabase
    .from("uniq_calls")
    .select(ACTIVE_CALL_SELECT)
    .eq("organization_id", ARTVIDEO_ORGANIZATION_ID)
    .eq("state", "ESTABLISHED")
    .is("ended_at", null)
    .order("answered_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return { data: (data as unknown as UniqCall | null) ?? null, error };
}

export function subscribeToUniqCalls(onChange: () => void) {
  const channel = supabase
    .channel("artvideo-uniq-calls")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "uniq_calls",
        filter: `organization_id=eq.${ARTVIDEO_ORGANIZATION_ID}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
