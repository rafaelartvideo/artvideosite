import { supabase } from "@/lib/supabase";
import { getNewOrderEntryChecklistDraft } from "@/features/checklists/application/new-order-entry-checklist";
import { prepareImageForUpload } from "@/shared/application/upload-file-optimizer";

export type DeviceCapturePhotoKind = "label" | "equipment";

export type DeviceCaptureSession = {
  id: string;
  token: string;
  pairingCode: string;
  expiresAt: string;
};

export type DeviceChecklistPayload = {
  responseCode?: string;
  responseText?: string;
  responseNumber?: string;
  observation?: string;
};

export type DeviceEntryChecklistPhoto = {
  id: number;
  signedUrl: string;
  fileName: string;
  mimeType: string;
  createdAt?: string;
};

export type DeviceEntryChecklistItem = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  responseType: "conformity" | "yes_no" | "confirmation" | "text" | "number";
  allowNA: boolean;
  required: boolean;
  photoRequirement: "none" | "optional" | "required" | "required_on_failure";
  observationRequirement: "none" | "optional" | "required" | "required_on_failure";
  sortOrder: number;
  responseCode: string;
  responseText: string;
  responseNumber: string;
  observation: string;
  photos: DeviceEntryChecklistPhoto[];
};

export type DeviceEntryChecklist = {
  equipmentTypeId: string;
  stageName: string;
  stageCode: string;
  items: DeviceEntryChecklistItem[];
};

export type DeviceCaptureEvent =
  | { id: number; type: "serial"; value: string; createdAt?: string }
  | { id: number; type: "photo"; kind: DeviceCapturePhotoKind; signedUrl: string; fileName: string; mimeType: string; createdAt?: string };

export type DeviceChecklistEvent =
  | { id: number; type: "checklist"; itemKey: string; payload: DeviceChecklistPayload; createdAt?: string }
  | { id: number; type: "checklist_photo"; itemKey: string; signedUrl: string; fileName: string; mimeType: string; createdAt?: string };

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("device-capture", { body });
  if (error) throw new Error("Não foi possível acessar a captura por celular.");
  if (!data?.success) throw new Error(data?.error || "Falha na captura por celular.");
  return data;
}

async function checklistInvoke(body: Record<string, unknown> | FormData) {
  const { data, error } = await supabase.functions.invoke("device-checklist", { body });
  if (error) throw new Error("Não foi possível acessar o checklist pelo celular.");
  if (!data?.success) throw new Error(data?.error || "Falha no checklist pelo celular.");
  return data;
}

export async function bindDeviceCaptureChecklist(sessionId: string, equipmentTypeId?: string | null) {
  return checklistInvoke({
    action: "bind",
    session_id: sessionId,
    equipment_type_id: equipmentTypeId || null,
  });
}

export async function createDeviceCaptureSession(
  organizationId: string,
  equipmentTypeId?: string | null,
): Promise<DeviceCaptureSession> {
  const data = await invoke({ action: "create", organization_id: organizationId });
  const session = {
    id: String(data.session.id),
    token: String(data.session.token),
    pairingCode: String(data.session.pairing_code || ""),
    expiresAt: String(data.session.expires_at),
  };

  const linkedEquipmentTypeId = equipmentTypeId || getNewOrderEntryChecklistDraft()?.equipmentTypeId || null;
  if (linkedEquipmentTypeId) await bindDeviceCaptureChecklist(session.id, linkedEquipmentTypeId);
  return session;
}

export async function connectDeviceCaptureByCode(code: string) {
  const data = await invoke({ action: "pair_code", code });
  return {
    sessionId: String(data.session.id),
    token: String(data.session.token),
    expiresAt: String(data.session.expires_at || ""),
  };
}

export async function pollDeviceCaptureSession(sessionId: string, lastEventId: number) {
  const data = await invoke({ action: "poll", session_id: sessionId, last_event_id: lastEventId });
  const events: DeviceCaptureEvent[] = (data.events || []).map((event: any) => event.type === "serial"
    ? {
        id: Number(event.id),
        type: "serial" as const,
        value: String(event.value || ""),
        createdAt: event.created_at,
      }
    : {
        id: Number(event.id),
        type: "photo" as const,
        kind: event.kind === "label" ? "label" as const : "equipment" as const,
        signedUrl: String(event.signed_url || ""),
        fileName: String(event.file_name || "foto.jpg"),
        mimeType: String(event.mime_type || "image/jpeg"),
        createdAt: event.created_at,
      });
  return {
    connected: Boolean(data.connected),
    status: String(data.status || "active") as "active" | "closed" | "expired",
    expiresAt: String(data.expires_at || ""),
    events,
  };
}

export async function closeDeviceCaptureSession(sessionId: string, token?: string) {
  if (token) {
    await checklistInvoke({ action: "cleanup", session_id: sessionId, token }).catch(() => undefined);
  }
  await invoke({ action: "close", session_id: sessionId });
}

export async function connectDeviceCaptureSession(sessionId: string, token: string) {
  return invoke({ action: "status", session_id: sessionId, token });
}

export async function sendDeviceCaptureSerial(sessionId: string, token: string, serial: string) {
  return invoke({ action: "send_serial", session_id: sessionId, token, serial });
}

export async function uploadDeviceCapturePhoto(
  sessionId: string,
  token: string,
  kind: DeviceCapturePhotoKind,
  file: File,
) {
  const preparedFile = await prepareImageForUpload(file, kind === "label" ? "service-label" : "service-photo");
  const body = new FormData();
  body.append("action", "upload_photo");
  body.append("session_id", sessionId);
  body.append("token", token);
  body.append("kind", kind);
  body.append("file", preparedFile, preparedFile.name);
  const { data, error } = await supabase.functions.invoke("device-capture", { body });
  if (error) throw new Error("Não foi possível enviar a foto.");
  if (!data?.success) throw new Error(data?.error || "Não foi possível enviar a foto.");
  return { photoCount: Number(data.photo_count || 0) };
}

export async function getDeviceEntryChecklist(sessionId: string, token: string): Promise<DeviceEntryChecklist | null> {
  const data = await checklistInvoke({ action: "get_entry", session_id: sessionId, token });
  const checklist = data.checklist;
  if (!checklist) return null;
  return {
    equipmentTypeId: String(checklist.equipment_type_id || ""),
    stageName: String(checklist.stage_name || "Checklist de entrada"),
    stageCode: String(checklist.stage_code || "entry"),
    items: (checklist.items || []).map((item: any) => ({
      id: String(item.id),
      key: String(item.key),
      title: String(item.title || ""),
      description: item.description ? String(item.description) : null,
      responseType: String(item.response_type || "confirmation") as DeviceEntryChecklistItem["responseType"],
      allowNA: Boolean(item.allow_na),
      required: Boolean(item.is_required),
      photoRequirement: String(item.photo_requirement || "none") as DeviceEntryChecklistItem["photoRequirement"],
      observationRequirement: String(item.observation_requirement || "none") as DeviceEntryChecklistItem["observationRequirement"],
      sortOrder: Number(item.sort_order || 0),
      responseCode: String(item.responseCode || ""),
      responseText: String(item.responseText || ""),
      responseNumber: String(item.responseNumber || ""),
      observation: String(item.observation || ""),
      photos: (item.photos || []).map((photo: any) => ({
        id: Number(photo.id),
        signedUrl: String(photo.signed_url || ""),
        fileName: String(photo.file_name || "foto.jpg"),
        mimeType: String(photo.mime_type || "image/jpeg"),
        createdAt: photo.created_at,
      })),
    })),
  };
}

export async function sendDeviceChecklistAnswer(
  sessionId: string,
  token: string,
  itemKey: string,
  payload: DeviceChecklistPayload,
) {
  const data = await checklistInvoke({
    action: "answer",
    session_id: sessionId,
    token,
    item_key: itemKey,
    payload,
  });
  return data.payload as DeviceChecklistPayload;
}

export async function uploadDeviceChecklistPhoto(
  sessionId: string,
  token: string,
  itemKey: string,
  file: File,
): Promise<DeviceEntryChecklistPhoto> {
  const preparedFile = await prepareImageForUpload(file, "service-photo");
  const body = new FormData();
  body.append("action", "upload_photo");
  body.append("session_id", sessionId);
  body.append("token", token);
  body.append("item_key", itemKey);
  body.append("file", preparedFile, preparedFile.name);
  const data = await checklistInvoke(body);
  const photo = data.photo || {};
  return {
    id: Number(photo.id),
    signedUrl: String(photo.signed_url || ""),
    fileName: String(photo.file_name || preparedFile.name || "foto.webp"),
    mimeType: String(photo.mime_type || preparedFile.type || "image/webp"),
    createdAt: photo.created_at,
  };
}

export async function pollDeviceChecklistEvents(
  sessionId: string,
  token: string,
  lastEventId: number,
): Promise<DeviceChecklistEvent[]> {
  const data = await checklistInvoke({
    action: "poll",
    session_id: sessionId,
    token,
    last_event_id: lastEventId,
  });
  return (data.events || []).map((event: any) => event.type === "checklist"
    ? {
        id: Number(event.id),
        type: "checklist" as const,
        itemKey: String(event.item_key || ""),
        payload: (event.payload || {}) as DeviceChecklistPayload,
        createdAt: event.created_at,
      }
    : {
        id: Number(event.id),
        type: "checklist_photo" as const,
        itemKey: String(event.item_key || ""),
        signedUrl: String(event.signed_url || ""),
        fileName: String(event.file_name || "foto.jpg"),
        mimeType: String(event.mime_type || "image/jpeg"),
        createdAt: event.created_at,
      });
}
