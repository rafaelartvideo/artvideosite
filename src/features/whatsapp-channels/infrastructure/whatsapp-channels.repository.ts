import { supabase } from "@/lib/supabase";

export type WhatsAppChannel = {
  id: string;
  organization_id: string;
  display_name: string;
  state: "not_connected" | "connecting" | "connected" | "disconnected" | "error";
  phone: string | null;
  last_checked_at: string | null;
  last_connected_at: string | null;
  webhook_ready: boolean;
};

type ChannelResult = {
  success: boolean;
  error?: string;
  code?: string;
  channel?: WhatsAppChannel | null;
  channels?: WhatsAppChannel[];
  max_connections?: number;
  can_manage?: boolean;
  qr?: string;
  connected?: boolean;
  logged_in?: boolean;
};

export async function operateWhatsAppChannel(
  organizationId: string,
  action: "list" | "activate" | "register" | "provision" | "connect" | "disconnect" | "delete" | "status" | "qr" | "logout" | "webhook_setup",
  connectionId?: string,
  displayName?: string,
): Promise<ChannelResult> {
  const { data, error } = await supabase.functions.invoke("whatsapp-channels", {
    body: { organization_id: organizationId, action, ...(connectionId ? { connection_id: connectionId } : {}),
      ...(displayName ? { display_name: displayName } : {}) },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const details = await response.json().catch(() => null) as { error?: string } | null;
      if (details?.error) throw new Error(details.error);
    }
    throw new Error("Não foi possível acessar os canais. Confira sua conexão e permissões.");
  }
  const result = data as ChannelResult;
  if (!result || result.success !== true) {
    throw new Error(result?.error || "Não foi possível executar a operação de WhatsApp.");
  }
  return result;
}
