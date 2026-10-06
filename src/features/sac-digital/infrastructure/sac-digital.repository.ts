import { supabase, supabaseUrl } from "@/lib/supabase";

export type SacDigitalConnectionStatus = "not_configured" | "configured" | "receiving" | "error";

export type SacDigitalIntegrationStatus = {
  organization_id: string;
  enabled: boolean;
  credential_configured: boolean;
  connection_status: SacDigitalConnectionStatus;
  last_webhook_at: string | null;
  last_event_type: string | null;
  last_error: string | null;
};

export type SacDigitalIntegrationSettings = SacDigitalIntegrationStatus & {
  workspace_name: string;
  api_base_url: string;
  credential_updated_at?: string | null;
  webhook_token: string | null;
};

export type SacDigitalIntegrationInput = {
  enabled: boolean;
  workspace_name: string;
  api_base_url: string;
  api_key?: string;
};

function normalizeRpcData<T>(data: unknown): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("A integração SAC Digital retornou uma resposta inválida.");
  }
  return data as T;
}

export async function getSacDigitalIntegrationStatus(organizationId: string) {
  const { data, error } = await supabase.rpc("get_sac_digital_integration_status", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return normalizeRpcData<SacDigitalIntegrationStatus>(data);
}

export async function getSacDigitalIntegrationSettings(organizationId: string) {
  const { data, error } = await supabase.rpc("get_sac_digital_integration_settings", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return normalizeRpcData<SacDigitalIntegrationSettings>(data);
}

export async function saveSacDigitalIntegrationSettings(
  organizationId: string,
  input: SacDigitalIntegrationInput,
) {
  const { data, error } = await supabase.rpc("configure_sac_digital_integration", {
    p_organization_id: organizationId,
    p_enabled: input.enabled,
    p_workspace_name: input.workspace_name || null,
    p_api_base_url: input.api_base_url || null,
    p_api_key: input.api_key?.trim() || null,
  });
  if (error) throw error;
  return normalizeRpcData<SacDigitalIntegrationSettings>(data);
}

export async function rotateSacDigitalWebhookToken(organizationId: string) {
  const { data, error } = await supabase.rpc("rotate_sac_digital_webhook_token", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return String(data || "");
}

export function sacDigitalWebhookUrl(token?: string | null) {
  if (!token) return "";
  return `${supabaseUrl}/functions/v1/sac-digital-webhook?token=${encodeURIComponent(token)}`;
}
