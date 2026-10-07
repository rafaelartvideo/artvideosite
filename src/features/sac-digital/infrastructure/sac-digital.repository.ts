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
  client_id: string;
  credential_updated_at?: string | null;
  webhook_token: string | null;
};

export type SacDigitalIntegrationInput = {
  enabled: boolean;
  workspace_name: string;
  api_base_url: string;
  client_id: string;
  client_secret?: string;
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
    p_client_id: input.client_id?.trim() || null,
    p_client_secret: input.client_secret?.trim() || null,
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

export type SacDigitalProtocolListItem = {
  id: string;
  external_protocol_id: string;
  status: string;
  operator_id: string | null;
  operator_name: string | null;
  department_name: string | null;
  channel_number: string | null;
  opened_at: string | null;
  closed_at: string | null;
  last_message_at: string | null;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    customer_id: string | null;
    customer: {
      id: string;
      full_name: string | null;
    } | null;
  } | null;
};

export type SacDigitalMessage = {
  id: string;
  protocol_id: string;
  direction: "incoming" | "outgoing";
  message_type: string;
  body_text: string | null;
  media_url: string | null;
  sender_name: string | null;
  sent_at: string;
  raw_metadata: Record<string, any> | null;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function listSacDigitalProtocols(organizationId: string) {
  const { data, error } = await supabase
    .from("sac_digital_protocols")
    .select(`
      id,
      external_protocol_id,
      status,
      operator_id,
      operator_name,
      department_name,
      channel_number,
      opened_at,
      closed_at,
      last_message_at,
      contact:sac_digital_contacts(
        id,
        name,
        phone,
        customer_id,
        customer:customers(id,full_name)
      )
    `)
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => {
    const contact = normalizeRelation<any>(row.contact);
    return {
      ...row,
      contact: contact
        ? {
            ...contact,
            customer: normalizeRelation<any>(contact.customer),
          }
        : null,
    };
  }) as SacDigitalProtocolListItem[];
}

export async function listSacDigitalMessages(organizationId: string, protocolId: string) {
  const { data, error } = await supabase
    .from("sac_digital_messages")
    .select("id,protocol_id,direction,message_type,body_text,media_url,sender_name,sent_at,raw_metadata")
    .eq("organization_id", organizationId)
    .eq("protocol_id", protocolId)
    .order("sent_at", { ascending: true });

  if (error) throw error;
  return (data || []) as SacDigitalMessage[];
}


export async function getSacDigitalUnreadCounts(organizationId: string) {
  const { data, error } = await supabase.rpc("get_sac_digital_unread_counts", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const protocolId = String((row as any).protocol_id || "");
    if (!protocolId) continue;
    counts[protocolId] = Number((row as any).unread_count || 0);
  }
  return counts;
}

export async function markSacDigitalProtocolRead(
  organizationId: string,
  protocolId: string,
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError || new Error("Usuário não autenticado.");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("sac_digital_protocol_reads")
    .upsert({
      organization_id: organizationId,
      user_id: userData.user.id,
      protocol_id: protocolId,
      last_read_at: now,
      updated_at: now,
    }, {
      onConflict: "organization_id,user_id,protocol_id",
    });

  if (error) throw error;
}

async function invokeSacDigitalApi(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("sac-digital-api", { body });
  if (error) throw error;
  if (!data?.success) throw new Error(String(data?.error || "A SAC Digital não conseguiu concluir a operação."));
  return data as Record<string, unknown>;
}

export function testSacDigitalConnection(organizationId: string) {
  return invokeSacDigitalApi({
    action: "test_connection",
    organization_id: organizationId,
  });
}

export function refreshSacDigitalProtocol(organizationId: string, protocol: string) {
  return invokeSacDigitalApi({
    action: "refresh_protocol",
    organization_id: organizationId,
    protocol,
  });
}

export function sendSacDigitalTextMessage(
  organizationId: string,
  protocol: string,
  text: string,
) {
  return invokeSacDigitalApi({
    action: "send_message",
    organization_id: organizationId,
    protocol,
    text,
  });
}


export type SacDigitalRoutingOptions = {
  operators: Array<{
    id: string;
    name: string;
    online: boolean;
  }>;
  departments: Array<{
    id: string;
    name: string;
    active: boolean;
  }>;
};

export async function getSacDigitalRoutingOptions(organizationId: string) {
  const data = await invokeSacDigitalApi({
    action: "routing_options",
    organization_id: organizationId,
  });
  return {
    operators: Array.isArray(data.operators) ? data.operators : [],
    departments: Array.isArray(data.departments) ? data.departments : [],
  } as SacDigitalRoutingOptions;
}


export type SacDigitalOperatorBinding = {
  linked: boolean;
  operator: {
    id: string;
    name: string;
  } | null;
};

export async function getMySacDigitalOperatorBinding(organizationId: string) {
  const data = await invokeSacDigitalApi({
    action: "my_operator_binding",
    organization_id: organizationId,
  });
  return {
    linked: data.linked === true,
    operator: data.operator && typeof data.operator === "object"
      ? data.operator as { id: string; name: string }
      : null,
  } as SacDigitalOperatorBinding;
}


export type SacDigitalOperatorAdminData = {
  employees: Array<{
    user_id: string;
    full_name: string;
    email: string;
    is_owner: boolean;
    operator: {
      id: string;
      name: string;
    } | null;
  }>;
  operators: Array<{
    id: string;
    name: string;
    online: boolean;
  }>;
};

export async function getSacDigitalOperatorBindingsAdmin(organizationId: string) {
  const data = await invokeSacDigitalApi({
    action: "operator_bindings_admin",
    organization_id: organizationId,
  });

  return {
    employees: Array.isArray(data.employees) ? data.employees : [],
    operators: Array.isArray(data.operators) ? data.operators : [],
  } as SacDigitalOperatorAdminData;
}

export async function setSacDigitalOperatorBindingAdmin(
  organizationId: string,
  userId: string,
  operatorId: string,
) {
  return invokeSacDigitalApi({
    action: "set_operator_binding_admin",
    organization_id: organizationId,
    user_id: userId,
    operator_id: operatorId,
  });
}

export function linkSacDigitalCustomer(
  organizationId: string,
  contactId: string,
  customerId: string,
) {
  return invokeSacDigitalApi({
    action: "link_customer",
    organization_id: organizationId,
    contact_id: contactId,
    customer_id: customerId,
  });
}

export function assumeSacDigitalProtocol(
  organizationId: string,
  protocol: string,
) {
  return invokeSacDigitalApi({
    action: "assume_protocol",
    organization_id: organizationId,
    protocol,
  });
}

export function forwardSacDigitalProtocol(
  organizationId: string,
  protocol: string,
  input: { departmentId?: string; operatorId?: string },
) {
  return invokeSacDigitalApi({
    action: "forward_protocol",
    organization_id: organizationId,
    protocol,
    department_id: input.departmentId || "",
    operator_id: input.operatorId || "",
  });
}

export function returnSacDigitalProtocolToInbox(
  organizationId: string,
  protocol: string,
) {
  return invokeSacDigitalApi({
    action: "return_to_inbox",
    organization_id: organizationId,
    protocol,
  });
}

export function finishSacDigitalProtocol(
  organizationId: string,
  protocol: string,
) {
  return invokeSacDigitalApi({
    action: "finish_protocol",
    organization_id: organizationId,
    protocol,
  });
}

const SAC_DIGITAL_MEDIA_ORIGIN = "https://relacionamento.gabinete.online";

export function sacDigitalMediaUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return `${SAC_DIGITAL_MEDIA_ORIGIN}${raw}`;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}
