import { actionEnabled } from '../../../../supabase/functions/_shared/sac-runtime.mjs';
import { singleFlight } from '../domain/refresh-coordinator.mjs';
import { mediaMaximum, apiDiagnostic, IntentLedger, privateMediaIds, hydrateMedia, resultItems } from '../domain/resource-ui.mjs';
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
  sector_id: string | null;
  department_name: string | null;
  channel_number: string | null;
  opened_at: string | null;
  created_at?: string | null;
  closed_at: string | null;
  last_message_at: string | null;
  is_pending?: boolean;
  pending_message?: string | null;
  notification_id?: string | null;
  delivery_state?: string | null;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    avatar_url: string | null;
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

export async function getSacDigitalFinishedProtocolCount(organizationId: string) {
  return singleFlight(`${organizationId}:finished-count`, async () => {
    const { count, error } = await supabase
      .from("sac_digital_protocols")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "finished");

    if (error) throw error;
    return Number(count || 0);
  });
}

export async function listSacDigitalProtocols(organizationId: string) {
  return singleFlight(`${organizationId}:protocols`, async () => {
    const selection = `
      id,
      external_protocol_id,
      status,
      operator_id,
      operator_name,
      sector_id,
      department_name,
      channel_number,
      opened_at,
      created_at,
      closed_at,
      last_message_at,
      contact:sac_digital_contacts(
        id,
        name,
        phone,
        avatar_url,
        customer_id,
        customer:customers(id,full_name)
      )
    `;

    // Atendimentos ativos precisam estar todos disponíveis. O histórico
    // finalizado cresce continuamente e não deve ser transferido inteiro em
    // toda abertura/refresh da caixa.
    const [activeResult, finishedResult] = await Promise.all([
      supabase
        .from("sac_digital_protocols")
        .select(selection)
        .eq("organization_id", organizationId)
        .neq("status", "finished")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("sac_digital_protocols")
        .select(selection)
        .eq("organization_id", organizationId)
        .eq("status", "finished")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(400),
    ]);

    if (activeResult.error) throw activeResult.error;
    if (finishedResult.error) throw finishedResult.error;

    const rows = [...(activeResult.data || []), ...(finishedResult.data || [])];
    const protocols = rows.map((row: any) => {
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

    // A primeira mensagem pode ser aceita pela SAC sem abrir protocolo.
    // Exibir o registro pendente com identidade propria, sem fabricar protocolo.
    const { data: pendingRows, error: pendingError } = await supabase
      .from("sac_digital_outbound_starts")
      .select(`
        id,
        contact_id,
        external_contact_id,
        message_text,
        notification_id,
        delivery_state,
        sent_at,
        contact:sac_digital_contacts(
          id,
          name,
          phone,
          avatar_url,
          customer_id,
          customer:customers(id,full_name)
        )
      `)
      .eq("organization_id", organizationId)
      .order("sent_at", { ascending: false })
      .limit(100);

    // Compatibilidade enquanto a migracao ainda nao foi aplicada: nao quebrar
    // os protocolos reais so porque o recurso de pendentes nao esta disponivel.
    if (pendingError) return protocols;

    const pending = (pendingRows || []).filter((row: any) => {
      const sentAt = new Date(String(row.sent_at)).getTime();
      return !protocols.some(protocol =>
        protocol.contact?.id === row.contact_id
        && Number.isFinite(sentAt)
        && new Date(String(protocol.opened_at || protocol.created_at || "")).getTime() >= sentAt - 30_000,
      );
    }).map((row: any): SacDigitalProtocolListItem => {
      const contact = normalizeRelation<any>(row.contact);
      return {
        id: `pending:${row.id}`,
        external_protocol_id: "",
        status: "pending",
        operator_id: null,
        operator_name: null,
        sector_id: null,
        department_name: null,
        channel_number: null,
        opened_at: null,
        closed_at: null,
        last_message_at: row.sent_at,
        is_pending: true,
        pending_message: String(row.message_text || ""),
        notification_id: row.notification_id || null,
        delivery_state: row.delivery_state || "queued",
        contact: contact
          ? {
              ...contact,
              customer: normalizeRelation<any>(contact.customer),
            }
          : null,
      };
  });

  return [...protocols, ...pending].sort((left, right) =>
    new Date(String(right.last_message_at || right.opened_at || 0)).getTime()
    - new Date(String(left.last_message_at || left.opened_at || 0)).getTime()
  );
  });
}

export async function listSacDigitalMessages(organizationId: string, protocolId: string) {
  return singleFlight(`${organizationId}:messages:${protocolId}`, async () => {
    const { data, error } = await supabase
      .from("sac_digital_messages")
      .select("id,protocol_id,direction,message_type,body_text,media_url,sender_name,sent_at,raw_metadata")
      .eq("organization_id", organizationId)
      .eq("protocol_id", protocolId)
      .order("sent_at", { ascending: true });

    if (error) throw error;
    const messages = (data || []) as SacDigitalMessage[];
    const messageIds = privateMediaIds(messages);
    if (!messageIds.length) return messages;
    try {
      const signed = await invokeSacDigitalApi({action: "media_urls", organization_id: organizationId, message_ids: messageIds});
      return hydrateMedia(messages, signed.urls as Record<string,string>);
    } catch {
      // Cached URLs and historic public attachments stay readable during outages.
      return messages;
    }
  });
}


export async function getSacDigitalUnreadCounts(organizationId: string) {
  return singleFlight(`${organizationId}:unread`, async () => {
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
  });
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

const requestIntents = new IntentLedger(() => crypto.randomUUID(), typeof sessionStorage === "undefined" ? undefined : sessionStorage);

async function invokeSacDigitalApi(body: Record<string, unknown> | FormData) {
  const intentBody = body instanceof FormData ? Object.fromEntries([...body.entries()].filter(([key])=>key!=="intent_key").map(([key,value]) => [key,value instanceof File ? {name:value.name,size:value.size,lastModified:value.lastModified}:value])) : body;
  const action = String(intentBody.action || "");
  if (!actionEnabled(action, intentBody.endpoint_id)) throw new Error("Este recurso está desativado na Union. Utilize o painel da SAC Digital.");
  const mutation = /^(send_|start_new|finish_|forward_|return_to_|assume_|resource_operation)/.test(action);
  if (mutation) { const intent = requestIntents.begin(intentBody); if (body instanceof FormData) body.set("intent_key",intent); else body={...body,intent_key:intent}; }
  const { data, error } = await supabase.functions.invoke("sac-digital-api", { body });

  if (error) {
    let apiMessage = "";
    try {
      const context = (error as any)?.context;
      const response = context && typeof context.clone === "function" ? context.clone() : context;
      if (response && typeof response.json === "function") {
        const payload = await response.json();
        apiMessage = apiDiagnostic(payload);
        if(payload?.type && !apiMessage.includes(String(payload.type))) apiMessage = `${payload.type}: ${apiMessage}`;
        if(mutation) requestIntents.finish(intentBody, payload?.outcome || "unknown");
      }
    } catch {
      // Mantém a mensagem padrão quando a resposta da função não puder ser lida.
    }

    throw new Error(
      apiMessage
      || String((error as any)?.message || "").trim()
      || "A SAC Digital não conseguiu concluir a operação.",
    );
  }

  if (mutation && !error) requestIntents.finish(intentBody, data?.outcome || (data?.success ? "accepted" : "rejected"));
  if (!data?.success) {
    const rejection = new Error(apiDiagnostic(data));
    Object.assign(rejection, { outcome: data?.outcome, type: data?.type });
    throw rejection;
  }
  return data as Record<string, unknown>;
}

export function testSacDigitalConnection(organizationId: string) {
  return invokeSacDigitalApi({
    action: "test_connection",
    organization_id: organizationId,
  });
}

export function retrySacDigitalWebhookEvent(organizationId: string, eventId: number) {
  return invokeSacDigitalApi({
    action: "retry_webhook_event",
    organization_id: organizationId,
    event_id: String(eventId),
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


export function sendSacDigitalMediaMessage(
  organizationId: string,
  protocol: string,
  file: File,
  caption = "",
) {
  if (!file.size) throw new Error("O arquivo está vazio.");
  if (file.size > mediaMaximum(file.type)) throw new Error(`O arquivo deve ter no máximo ${mediaMaximum(file.type) / (1024 * 1024)} MB.`);
  if (file.type.startsWith("image/") && file.size > 1024 * 1024) {
    throw new Error("A SAC Digital aceita imagens de até 1 MB.");
  }
  const form = new FormData();
  form.set("action", "send_media");
  form.set("organization_id", organizationId);
  form.set("protocol", protocol);
  form.set("text", caption);
  form.set("file", file, file.name);
  return invokeSacDigitalApi(form);
}

export function sendSacDigitalOrderMessage(
  organizationId: string,
  orderId: string,
  text: string,
) {
  return invokeSacDigitalApi({
    action: "send_order_message",
    organization_id: organizationId,
    order_id: orderId,
    text,
  });
}


export type SacDigitalNewConversationCandidate = {
  source: "sac" | "customer";
  external_contact_id: string | null;
  customer_id: string | null;
  name: string;
  phone: string;
  whatsapp_available: boolean;
  blocked?: boolean;
  channel_id?: string | null;
  channel_number?: string | null;
  customer_type?: string | null;
};

export type SacDigitalPreparedContact = {
  prepared: boolean;
  imported: boolean;
  whatsapp_available: boolean;
  error?: string;
  contact?: {
    external_contact_id: string;
    customer_id: string | null;
    name: string;
    phone: string;
    channel_id: string | null;
    blocked: boolean;
  };
};

export async function searchSacDigitalNewConversation(
  organizationId: string,
  search: string,
) {
  const data = await invokeSacDigitalApi({
    action: "new_conversation_search",
    organization_id: organizationId,
    search,
  });
  return {
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
  } as {
    contacts: SacDigitalNewConversationCandidate[];
    customers: SacDigitalNewConversationCandidate[];
  };
}

export async function prepareSacDigitalNewConversationContact(
  organizationId: string,
  input: {
    externalContactId?: string;
    customerId?: string;
    name?: string;
    phone?: string;
  },
) {
  const data = await invokeSacDigitalApi({
    action: "prepare_new_conversation_contact",
    organization_id: organizationId,
    external_contact_id: input.externalContactId || "",
    customer_id: input.customerId || "",
    name: input.name || "",
    phone: input.phone || "",
  });
  return data as unknown as SacDigitalPreparedContact;
}

export async function startSacDigitalNewConversation(
  organizationId: string,
  externalContactId: string,
  text: string,
  channel?: string,
) {
  const data = await invokeSacDigitalApi({
    action: "start_new_conversation",
    organization_id: organizationId,
    external_contact_id: externalContactId,
    text,
    channel,
  });
  return data as {
    success: true;
    mode: "protocol" | "notification";
    protocol: string | null;
    pending_start_id: string | null;
    external_contact_id: string;
  };
}


export type SacDigitalRoutingOptions = {
  operators: Array<{
    id: string;
    name: string;
    email: string;
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
  access_mode: "manager" | "operator" | null;
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
    access_mode: data.access_mode === "manager"
      ? "manager"
      : data.access_mode === "operator" ? "operator" : null,
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
    access_mode: "manager" | "operator" | null;
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
  accessMode: "manager" | "operator" | null,
  operatorId = "",
) {
  return invokeSacDigitalApi({
    action: "set_operator_binding_admin",
    organization_id: organizationId,
    user_id: userId,
    access_mode: accessMode || "",
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

export type SacDigitalCustomerOrder = {
  id: string;
  os_number: string | null;
  external_os_number: string | null;
  created_at: string;
  is_solved: boolean | null;
  order_status: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  situation: {
    id: string;
    name: string;
    color: string | null;
  } | null;
};

export async function listSacDigitalCustomerOrders(
  organizationId: string,
  customerId: string,
) {
  const { data, error } = await supabase
    .from("service_orders")
    .select("id,os_number,external_os_number,created_at,is_solved,order_status:order_statuses(id,name,color),situation:os_situations(id,name,color)")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    ...row,
    order_status: normalizeRelation(row.order_status),
    situation: normalizeRelation(row.situation),
  })) as SacDigitalCustomerOrder[];
}

export type SacDigitalOperatorQueueItem = {
  protocol: string;
};

function queueProtocolId(row: Record<string, any>) {
  const nestedCandidates = [
    row.attendance,
    row.att,
    row.info,
    row.protocol_info,
  ].filter(value => value && typeof value === "object" && !Array.isArray(value));

  const direct = row.protocol ?? row.protocolo ?? row.protocol_id;
  if (direct != null && String(direct).trim()) return String(direct).trim();

  for (const nested of nestedCandidates) {
    const value = nested.protocol ?? nested.protocolo ?? nested.protocol_id;
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export async function listSacDigitalOperatorQueue(
  organizationId: string,
): Promise<SacDigitalOperatorQueueItem[]> {
  const result = await operateSacDigitalResource(organizationId, 72, {});
  const seen = new Set<string>();
  const queue: SacDigitalOperatorQueueItem[] = [];

  for (const item of resultItems(result.data)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const protocol = queueProtocolId(item as Record<string, any>);
    if (!protocol || seen.has(protocol)) continue;
    seen.add(protocol);
    queue.push({ protocol });
  }

  return queue;
}

export async function assumeSacDigitalProtocol(
  organizationId: string,
  protocol: string,
) {
  await operateSacDigitalResource(organizationId, 73, { protocol });
  const binding = await getMySacDigitalOperatorBinding(organizationId);
  return {
    success: true as const,
    protocol,
    operator: binding.operator,
  };
}

export function forwardSacDigitalProtocol(
  organizationId: string,
  protocol: string,
  input: { departmentId?: string; operatorId?: string },
) {
  if (input.operatorId) {
    return operateSacDigitalResource(organizationId, 90, {
      protocol,
      to: "operator",
      operator: input.operatorId,
    });
  }
  if (input.departmentId) {
    return operateSacDigitalResource(organizationId, 90, {
      protocol,
      to: "department",
      department: input.departmentId,
    });
  }
  throw new Error("Escolha um departamento ou operador.");
}

export function returnSacDigitalProtocolToQueue(
  organizationId: string,
  protocol: string,
  departmentId: string | null | undefined,
) {
  if (!departmentId) {
    throw new Error("A SAC Digital não informou o departamento deste atendimento. Atualize o protocolo e tente novamente.");
  }
  return operateSacDigitalResource(organizationId, 90, {
    protocol,
    to: "department",
    department: departmentId,
  });
}

export function finishSacDigitalProtocol(
  organizationId: string,
  protocol: string,
  vote: number,
) {
  return operateSacDigitalResource(organizationId, 92, {
    protocol,
    vote,
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

export type SacDigitalResourceResult = { success: boolean; data: unknown; outcome?: string; has_more?: boolean; next_page?: number | string | null; error?: string; type?: string };
export async function operateSacDigitalResource(organizationId: string, endpointId: number, values: Record<string, unknown>) {
  return await invokeSacDigitalApi({ action: 'resource_operation', organization_id: organizationId, endpoint_id: endpointId, values }) as unknown as SacDigitalResourceResult;
}
export async function syncSacDigitalResources(organizationId: string) {
  return singleFlight(`${organizationId}:sync`, async () => {
    await invokeSacDigitalApi({ action: 'bootstrap', organization_id: organizationId });
    // The scheduled private worker drains jobs independently of open CRM tabs.
    return invokeSacDigitalApi({ action: 'reconcile_outbound', organization_id: organizationId });
  });
}
export function syncSacDigitalResource(organizationId: string, endpointId: number, cursor?: unknown) {
  return invokeSacDigitalApi({ action: 'sync_resource', organization_id: organizationId, endpoint_id: endpointId, cursor });
}

export type SacDigitalMenuSettings = { enabled: boolean; text: string; choices: Array<{tag:string;text:string}>; source:'static'|'service_order_status' };
export async function getSacDigitalMenuSettings(organizationId:string) {
 const {data,error}=await supabase.rpc('get_sac_digital_menu_settings',{p_organization_id:organizationId}); if(error)throw error;return normalizeRpcData<SacDigitalMenuSettings>(data);
}
export async function configureSacDigitalMenu(organizationId:string,settings:SacDigitalMenuSettings) {
 const {data,error}=await supabase.rpc('configure_sac_digital_menu',{p_organization_id:organizationId,p_enabled:settings.enabled,p_text:settings.text,p_choices:settings.choices,p_source:settings.source});if(error)throw error;return normalizeRpcData<SacDigitalMenuSettings>(data);
}
export function sacDigitalMenuUrl(token?:string|null){return token?`${supabaseUrl}/functions/v1/sac-digital-menu?token=${encodeURIComponent(token)}`:'';}
export function getSacDigitalResourceHealth(organizationId:string){return invokeSacDigitalApi({action:'resource_health',organization_id:organizationId});}
