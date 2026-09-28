import { supabase } from "@/lib/supabase";
import { prepareImageForUpload } from "@/shared/application/upload-file-optimizer";

export type MobileOrderChecklistSession = {
  id: string;
  token: string;
  pairingCode: string;
  expiresAt: string;
  serviceOrderId: string;
  osNumber?: string;
};

export type MobileChecklistItem = {
  id: string;
  organization_id: string;
  stage_id: string;
  title_snapshot: string;
  description_snapshot: string | null;
  response_type_snapshot: "conformity" | "yes_no" | "confirmation" | "text" | "number";
  allow_na_snapshot: boolean;
  is_required_snapshot: boolean;
  photo_requirement_snapshot: "none" | "optional" | "required" | "required_on_failure";
  observation_requirement_snapshot: "none" | "optional" | "required" | "required_on_failure";
  sort_order: number;
  response_code: string | null;
  response_text: string | null;
  response_number: number | null;
  observation: string | null;
  answered_at: string | null;
  media_count: number;
};

export type MobileChecklistStage = {
  id: string;
  name_snapshot: string;
  stage_type_snapshot: "entry" | "diagnosis" | "qc" | "custom";
  situation_name_snapshot: string | null;
  sort_order: number;
  status: "pending" | "in_progress" | "completed" | "reopened";
  completed_at: string | null;
  reopened_at: string | null;
  items: MobileChecklistItem[];
};

export type MobileOrderChecklistData = {
  expires_at: string;
  order: { id: string; os_number: string | null };
  checklist: {
    id: string;
    profile_name_snapshot: string;
    profile_version_snapshot: number;
    status: "pending" | "in_progress" | "completed" | "superseded";
    completed_at: string | null;
    stages: MobileChecklistStage[];
  } | null;
  can_reopen: boolean;
};

async function edgeFunctionErrorMessage(error: any) {
  const fallback = error?.message || "Não foi possível acessar o checklist móvel.";
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
  const { data, error } = await supabase.functions.invoke("order-mobile-checklist", { body });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  if (!data?.success) throw new Error(data?.error || "Não foi possível acessar o checklist móvel.");
  return data;
}

export async function createMobileOrderChecklistSession(
  organizationId: string,
  serviceOrderId: string,
): Promise<MobileOrderChecklistSession> {
  const data = await invoke({
    action: "create_session",
    organization_id: organizationId,
    service_order_id: serviceOrderId,
  });
  return {
    id: String(data.session.id),
    token: String(data.session.token),
    pairingCode: String(data.session.pairing_code || ""),
    expiresAt: String(data.session.expires_at || ""),
    serviceOrderId: String(data.session.service_order_id || serviceOrderId),
    osNumber: data.session.os_number ? String(data.session.os_number) : undefined,
  };
}

export async function pairMobileOrderChecklistCode(code: string) {
  const data = await invoke({ action: "pair_code", code });
  return {
    id: String(data.session.id),
    token: String(data.session.token),
    expiresAt: String(data.session.expires_at || ""),
    serviceOrderId: String(data.session.service_order_id || ""),
  };
}

export async function getMobileOrderChecklistStatus(sessionId: string, token: string) {
  return invoke({ action: "status", session_id: sessionId, token });
}

export async function pollMobileOrderChecklistSession(sessionId: string) {
  return invoke({ action: "poll_session", session_id: sessionId });
}

export async function closeMobileOrderChecklistSession(sessionId: string) {
  return invoke({ action: "close_session", session_id: sessionId });
}

export async function getMobileOrderChecklist(
  sessionId: string,
  token: string,
): Promise<MobileOrderChecklistData> {
  return invoke({ action: "get", session_id: sessionId, token }) as Promise<MobileOrderChecklistData>;
}

export async function saveMobileOrderChecklistItem(input: {
  sessionId: string;
  token: string;
  itemId: string;
  responseCode?: string | null;
  responseText?: string | null;
  responseNumber?: number | null;
  observation?: string | null;
}) {
  return invoke({
    action: "save_item",
    session_id: input.sessionId,
    token: input.token,
    item_id: input.itemId,
    response_code: input.responseCode || null,
    response_text: input.responseText || null,
    response_number: input.responseNumber ?? null,
    observation: input.observation || null,
  });
}

export async function completeMobileOrderChecklistStage(sessionId: string, token: string, stageId: string) {
  return invoke({ action: "complete_stage", session_id: sessionId, token, stage_id: stageId });
}

export async function reopenMobileOrderChecklistStage(sessionId: string, token: string, stageId: string) {
  return invoke({ action: "reopen_stage", session_id: sessionId, token, stage_id: stageId });
}

export async function uploadMobileOrderChecklistPhoto(
  sessionId: string,
  token: string,
  itemId: string,
  file: File,
) {
  const preparedFile = await prepareImageForUpload(file, "service-photo");
  const body = new FormData();
  body.append("action", "upload_photo");
  body.append("session_id", sessionId);
  body.append("token", token);
  body.append("item_id", itemId);
  body.append("file", preparedFile, preparedFile.name);
  return invoke(body);
}
