import { supabase } from "@/lib/supabase";
import { prepareImageForUpload } from "@/shared/application/upload-file-optimizer";

export type MobileOrderEditSession = {
  id: string;
  token: string;
  pairingCode: string;
  expiresAt: string;
  serviceOrderId: string;
  osNumber?: string;
};

export type MobileOrderEditorData = {
  expires_at: string;
  order: Record<string, any>;
  options: {
    statuses: any[];
    situations: any[];
    service_types: any[];
    general_services: any[];
    equipment_types: any[];
    equipment_brands: any[];
    equipment_models: any[];
    employees: any[];
  };
  technician_ids: string[];
  seller_ids: string[];
  technical_values: Record<string, string>;
  technical_fields: any[];
};

async function edgeFunctionErrorMessage(error: any) {
  const fallback = error?.message || "Não foi possível acessar a edição móvel da OS.";
  const context = error?.context;
  if (!context || typeof context.clone !== "function") return fallback;

  try {
    const payload = await context.clone().json();
    return String(payload?.error || payload?.message || fallback);
  } catch {
    return fallback;
  }
}

async function invoke(body: Record<string, unknown> | FormData) {
  const { data, error } = await supabase.functions.invoke("order-mobile-edit", { body });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  if (!data?.success) throw new Error(data?.error || "Não foi possível acessar a edição móvel da OS.");
  return data;
}

export async function createMobileOrderEditSession(organizationId: string, serviceOrderId: string): Promise<MobileOrderEditSession> {
  const data = await invoke({ action: "create_session", organization_id: organizationId, service_order_id: serviceOrderId });
  return {
    id: String(data.session.id),
    token: String(data.session.token),
    pairingCode: String(data.session.pairing_code || ""),
    expiresAt: String(data.session.expires_at || ""),
    serviceOrderId: String(data.session.service_order_id || serviceOrderId),
    osNumber: data.session.os_number ? String(data.session.os_number) : undefined,
  };
}

export async function pairMobileOrderEditCode(code: string) {
  const data = await invoke({ action: "pair_code", code });
  return {
    id: String(data.session.id),
    token: String(data.session.token),
    expiresAt: String(data.session.expires_at || ""),
    serviceOrderId: String(data.session.service_order_id || ""),
  };
}

export async function getMobileOrderEditStatus(sessionId: string, token: string) {
  return invoke({ action: "status", session_id: sessionId, token });
}

export async function pollMobileOrderEditSession(sessionId: string) {
  return invoke({ action: "poll_session", session_id: sessionId });
}

export async function closeMobileOrderEditSession(sessionId: string) {
  return invoke({ action: "close_session", session_id: sessionId });
}

export async function getMobileOrderEditor(sessionId: string, token: string): Promise<MobileOrderEditorData> {
  return invoke({ action: "get", session_id: sessionId, token }) as Promise<MobileOrderEditorData>;
}

export async function saveMobileOrderEditor({
  sessionId,
  token,
  patch,
  technicianIds,
  sellerIds,
  technicalValues,
}: {
  sessionId: string;
  token: string;
  patch: Record<string, unknown>;
  technicianIds: string[];
  sellerIds: string[];
  technicalValues: Record<string, string>;
}) {
  return invoke({
    action: "save",
    session_id: sessionId,
    token,
    patch,
    technician_ids: technicianIds,
    seller_ids: sellerIds,
    technical_values: technicalValues,
  });
}

export async function uploadMobileOrderEditPhoto(sessionId: string, token: string, kind: "label" | "equipment", file: File) {
  const preparedFile = await prepareImageForUpload(file, kind === "label" ? "service-label" : "service-photo");
  const body = new FormData();
  body.append("action", "upload_photo");
  body.append("session_id", sessionId);
  body.append("token", token);
  body.append("kind", kind);
  body.append("file", preparedFile, preparedFile.name);
  return invoke(body);
}
