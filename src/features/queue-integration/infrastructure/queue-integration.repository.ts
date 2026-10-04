import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type QueueOutagePolicy = "block" | "manager_override" | "allow";

export type QueueIntegrationSettings = {
  organization_id: string;
  enabled: boolean;
  require_code_for_orders: boolean;
  reservation_ttl_seconds: number;
  outage_policy: QueueOutagePolicy;
};

export type QueueReservation = {
  id: string;
  ticket_number: string;
  service_type_name: string | null;
  service_priority: string | null;
  expires_at: string;
};

export const defaultQueueIntegrationSettings = (organizationId: string): QueueIntegrationSettings => ({
  organization_id: organizationId,
  enabled: false,
  require_code_for_orders: false,
  reservation_ttl_seconds: 600,
  outage_policy: "manager_override",
});

export class QueueIntegrationError extends Error {
  code: string | null;
  outagePolicy: QueueOutagePolicy | null;

  constructor(message: string, code?: string | null, outagePolicy?: QueueOutagePolicy | null) {
    super(message);
    this.name = "QueueIntegrationError";
    this.code = code || null;
    this.outagePolicy = outagePolicy || null;
  }
}

async function edgeError(error: unknown, fallback: string): Promise<QueueIntegrationError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      return new QueueIntegrationError(
        typeof payload?.error === "string" && payload.error.trim() ? payload.error.trim() : fallback,
        typeof payload?.code === "string" ? payload.code : null,
        payload?.outage_policy === "block" || payload?.outage_policy === "manager_override" || payload?.outage_policy === "allow"
          ? payload.outage_policy
          : null,
      );
    } catch {}
  }
  return new QueueIntegrationError(fallback);
}

export async function getQueueIntegrationSettings(organizationId: string): Promise<QueueIntegrationSettings> {
  const { data, error } = await supabase
    .from("queue_integration_settings")
    .select("organization_id,enabled,require_code_for_orders,reservation_ttl_seconds,outage_policy")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return defaultQueueIntegrationSettings(organizationId);

  return {
    organization_id: organizationId,
    enabled: Boolean(data.enabled),
    require_code_for_orders: Boolean(data.require_code_for_orders),
    reservation_ttl_seconds: Number(data.reservation_ttl_seconds || 600),
    outage_policy: (data.outage_policy || "manager_override") as QueueOutagePolicy,
  };
}

export async function saveQueueIntegrationSettings(settings: QueueIntegrationSettings): Promise<void> {
  const { error } = await supabase
    .from("queue_integration_settings")
    .upsert({
      organization_id: settings.organization_id,
      enabled: settings.enabled,
      require_code_for_orders: settings.require_code_for_orders,
      reservation_ttl_seconds: settings.reservation_ttl_seconds,
      outage_policy: settings.outage_policy,
    }, { onConflict: "organization_id" });
  if (error) throw error;
}

export async function reserveQueueOsCode(organizationId: string, code: string): Promise<QueueReservation> {
  const { data, error } = await supabase.functions.invoke("queue-integration", {
    body: { action: "reserve", organization_id: organizationId, code },
  });
  if (error) throw await edgeError(error, "Não foi possível validar o código da fila.");
  if (!data?.success || !data?.reservation) {
    throw new QueueIntegrationError(
      String(data?.error || "Não foi possível validar o código da fila."),
      data?.code ? String(data.code) : null,
      data?.outage_policy || null,
    );
  }
  return data.reservation as QueueReservation;
}

export async function releaseQueueOsCode(organizationId: string, reservationId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("queue-integration", {
    body: { action: "release", organization_id: organizationId, reservation_id: reservationId },
  });
  if (error) throw await edgeError(error, "Não foi possível liberar a reserva da fila.");
  if (!data?.success) throw new QueueIntegrationError(String(data?.error || "Não foi possível liberar a reserva da fila."));
}

export async function consumeQueueOsCode(
  organizationId: string,
  reservationId: string,
  orderId: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("queue-integration", {
    body: {
      action: "consume-order",
      organization_id: organizationId,
      reservation_id: reservationId,
      order_id: orderId,
    },
  });
  if (error) throw await edgeError(error, "A OS foi criada, mas a confirmação na fila ficou pendente.");
  if (!data?.success) {
    throw new QueueIntegrationError(
      String(data?.error || "A OS foi criada, mas a confirmação na fila ficou pendente."),
      data?.code ? String(data.code) : null,
    );
  }
}
