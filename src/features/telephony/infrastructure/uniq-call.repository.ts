import { supabase } from "@/lib/supabase";
import type { UniqCall } from "../domain/uniq-call";

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

let artvideoOrganizationIdPromise: Promise<string> | null = null;

async function artvideoOrganizationId() {
  if (!artvideoOrganizationIdPromise) {
    artvideoOrganizationIdPromise = (async () => {
      const { data, error } = await supabase.rpc("artvideo_organization_id");
      if (error) throw error;
      if (!data) throw new Error("Tenant ArtVideo não configurado.");
      return String(data);
    })().catch(error => {
      artvideoOrganizationIdPromise = null;
      throw error;
    });
  }
  return artvideoOrganizationIdPromise;
}

export async function getActiveUniqCall(subscriberId?: string | null) {
  const linkedSubscriberId = subscriberId?.trim() || null;
  if (!linkedSubscriberId) {
    return { data: null as UniqCall | null, error: null };
  }

  let organizationId: string;
  try {
    organizationId = await artvideoOrganizationId();
  } catch (error) {
    return { data: null as UniqCall | null, error };
  }

  const { data, error } = await supabase
    .from("uniq_calls")
    .select(ACTIVE_CALL_SELECT)
    .eq("organization_id", organizationId)
    .eq("state", "ESTABLISHED")
    .is("ended_at", null)
    .eq("answered_subscriber_id", linkedSubscriberId)
    .order("answered_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return { data: (data as unknown as UniqCall | null) ?? null, error };
}

export async function startUniqCall(phone: string, serviceOrderId?: string | null) {
  return supabase.functions.invoke("uniq-call", {
    body: {
      phone,
      service_order_id: serviceOrderId || null,
    },
  });
}

export function subscribeToUniqCalls(onChange: () => void) {
  let disposed = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  void (async () => {
    try {
      const organizationId = await artvideoOrganizationId();
      if (disposed) return;

      channel = supabase
        .channel("artvideo-uniq-calls")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "uniq_calls",
            filter: `organization_id=eq.${organizationId}`,
          },
          onChange,
        )
        .subscribe();
    } catch (error) {
      console.error("Erro ao preparar Realtime da Uniq:", error);
    }
  })();

  return () => {
    disposed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
