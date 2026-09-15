import { supabase } from "@/lib/supabase";
import { completeOrderChecklistStage, ensureOrderChecklist, saveOrderChecklistItemAnswer, uploadAndAttachOrderChecklistPhoto } from "../infrastructure/checklists.repository";

export type EntryDraftItem = {
  key: string;
  title: string;
  description: string | null;
  responseType: "conformity" | "yes_no" | "confirmation" | "text" | "number";
  allowNA: boolean;
  required: boolean;
  photoRequirement: "none" | "optional" | "required" | "required_on_failure";
  observationRequirement: "none" | "optional" | "required" | "required_on_failure";
  responseCode: string;
  responseText: string;
  responseNumber: string;
  observation: string;
  photos: File[];
};

export type EntryChecklistDraft = {
  equipmentTypeId: string;
  profileId: string;
  stageCode: string;
  stageName: string;
  items: EntryDraftItem[];
};

export type EntryChecklistDevicePayload = {
  responseCode?: string;
  responseText?: string;
  responseNumber?: string;
  observation?: string;
};

const DRAFT_CHANGED_EVENT = "artvideo:entry-checklist-draft-changed";
let currentDraft: EntryChecklistDraft | null = null;
const pendingDeviceAnswers = new Map<string, EntryChecklistDevicePayload>();
const pendingDevicePhotos = new Map<string, File[]>();

function notifyDraftChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DRAFT_CHANGED_EVENT));
}

function mergePendingDeviceChanges(draft: EntryChecklistDraft | null) {
  if (!draft) return null;
  return {
    ...draft,
    items: draft.items.map(item => {
      const answer = pendingDeviceAnswers.get(item.key);
      const photos = pendingDevicePhotos.get(item.key) || [];
      if (!answer && !photos.length) return item;
      return {
        ...item,
        ...(answer ? {
          responseCode: answer.responseCode ?? item.responseCode,
          responseText: answer.responseText ?? item.responseText,
          responseNumber: answer.responseNumber ?? item.responseNumber,
          observation: answer.observation ?? item.observation,
        } : {}),
        photos: photos.length ? [...item.photos, ...photos] : item.photos,
      };
    }),
  };
}

export function subscribeNewOrderEntryChecklistDraft(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DRAFT_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DRAFT_CHANGED_EVENT, listener);
}

export function setNewOrderEntryChecklistDraft(draft: EntryChecklistDraft | null) {
  currentDraft = mergePendingDeviceChanges(draft);
  if (currentDraft) {
    for (const item of currentDraft.items) {
      pendingDeviceAnswers.delete(item.key);
      pendingDevicePhotos.delete(item.key);
    }
  }
  notifyDraftChanged();
  return currentDraft;
}

export function getNewOrderEntryChecklistDraft() {
  return currentDraft;
}

export function clearNewOrderEntryChecklistDraft() {
  currentDraft = null;
  pendingDeviceAnswers.clear();
  pendingDevicePhotos.clear();
  notifyDraftChanged();
}

export function applyDeviceEntryChecklistAnswer(itemKey: string, payload: EntryChecklistDevicePayload) {
  if (!itemKey) return;
  if (!currentDraft) {
    pendingDeviceAnswers.set(itemKey, payload);
    return;
  }
  const exists = currentDraft.items.some(item => item.key === itemKey);
  if (!exists) {
    pendingDeviceAnswers.set(itemKey, payload);
    return;
  }
  currentDraft = {
    ...currentDraft,
    items: currentDraft.items.map(item => item.key === itemKey ? {
      ...item,
      responseCode: payload.responseCode ?? item.responseCode,
      responseText: payload.responseText ?? item.responseText,
      responseNumber: payload.responseNumber ?? item.responseNumber,
      observation: payload.observation ?? item.observation,
    } : item),
  };
  notifyDraftChanged();
}

export function applyDeviceEntryChecklistPhoto(itemKey: string, file: File) {
  if (!itemKey || !file) return;
  if (!currentDraft) {
    pendingDevicePhotos.set(itemKey, [...(pendingDevicePhotos.get(itemKey) || []), file]);
    return;
  }
  const exists = currentDraft.items.some(item => item.key === itemKey);
  if (!exists) {
    pendingDevicePhotos.set(itemKey, [...(pendingDevicePhotos.get(itemKey) || []), file]);
    return;
  }
  currentDraft = {
    ...currentDraft,
    items: currentDraft.items.map(item => item.key === itemKey ? {
      ...item,
      photos: [...item.photos, file],
    } : item),
  };
  notifyDraftChanged();
}

export async function loadNewOrderEntryChecklist(equipmentTypeId: string): Promise<EntryChecklistDraft | null> {
  if (!equipmentTypeId) return null;
  const { data: equipment, error: equipmentError } = await supabase.from("equipment_types").select("id,checklist_profile_id").eq("id", equipmentTypeId).maybeSingle();
  if (equipmentError) throw equipmentError;
  if (!equipment?.checklist_profile_id) return null;

  const { data: stage, error: stageError } = await supabase.from("checklist_profile_stages").select("id,profile_id,code,name").eq("profile_id", equipment.checklist_profile_id).eq("stage_type", "entry").eq("is_active", true).order("sort_order").limit(1).maybeSingle();
  if (stageError) throw stageError;
  if (!stage) return null;

  const [profileItems, extras] = await Promise.all([
    supabase.from("checklist_profile_items").select("id,title,description,response_type,allow_na,is_required,photo_requirement,observation_requirement,sort_order").eq("stage_id", stage.id).eq("is_active", true).order("sort_order"),
    supabase.from("equipment_checklist_items").select("id,title,description,response_type,allow_na,is_required,photo_requirement,observation_requirement,sort_order").eq("equipment_type_id", equipmentTypeId).eq("stage_code", stage.code).eq("is_active", true).order("sort_order"),
  ]);
  if (profileItems.error) throw profileItems.error;
  if (extras.error) throw extras.error;

  const rows = [
    ...(profileItems.data || []).map((item: any) => ({ ...item, key: `profile:${item.id}` })),
    ...(extras.data || []).map((item: any) => ({ ...item, key: `extra:${item.id}` })),
  ];

  return {
    equipmentTypeId,
    profileId: stage.profile_id,
    stageCode: stage.code,
    stageName: stage.name,
    items: rows.map((item: any) => ({
      key: item.key,
      title: item.title,
      description: item.description,
      responseType: item.response_type,
      allowNA: item.allow_na,
      required: item.is_required,
      photoRequirement: item.photo_requirement,
      observationRequirement: item.observation_requirement,
      responseCode: "",
      responseText: "",
      responseNumber: "",
      observation: "",
      photos: [],
    })),
  };
}

function isFailure(item: EntryDraftItem) {
  return (item.responseType === "conformity" && item.responseCode === "not_ok")
    || (item.responseType === "yes_no" && item.responseCode === "no");
}

function hasAnswer(item: EntryDraftItem) {
  if (item.responseCode === "na") return item.allowNA;
  if (item.responseType === "conformity") return ["ok", "not_ok"].includes(item.responseCode);
  if (item.responseType === "yes_no") return ["yes", "no"].includes(item.responseCode);
  if (item.responseType === "confirmation") return item.responseCode === "confirmed";
  if (item.responseType === "text") return Boolean(item.responseText.trim());
  return item.responseType === "number" && item.responseNumber.trim() !== "" && Number.isFinite(Number(item.responseNumber.replace(",", ".")));
}

export function validateNewOrderEntryChecklist(draft = currentDraft) {
  if (!draft) return "";
  for (const item of draft.items) {
    const answered = hasAnswer(item);
    const failure = isFailure(item);
    if (item.required && !answered) return `Preencha o item obrigatório “${item.title}” do checklist de entrada.`;
    if (answered && (item.photoRequirement === "required" || (item.photoRequirement === "required_on_failure" && failure)) && !item.photos.length) return `Adicione a foto obrigatória do item “${item.title}”.`;
    if (answered && (item.observationRequirement === "required" || (item.observationRequirement === "required_on_failure" && failure)) && !item.observation.trim()) return `Preencha a observação obrigatória do item “${item.title}”.`;
  }
  return "";
}

export async function persistNewOrderEntryChecklist(serviceOrderId: string, organizationId: string) {
  const draft = currentDraft;
  if (!draft || draft.equipmentTypeId === "") return;
  const validation = validateNewOrderEntryChecklist(draft);
  if (validation) throw new Error(validation);

  const checklist = await ensureOrderChecklist(serviceOrderId);
  if (!checklist) return;
  const stage = checklist.stages.find(item => item.stage_type_snapshot === "entry");
  if (!stage) return;

  for (let index = 0; index < draft.items.length; index += 1) {
    const source = draft.items[index];
    const target = stage.items[index];
    if (!target) continue;
    await saveOrderChecklistItemAnswer({
      itemId: target.id,
      responseCode: source.responseCode || null,
      responseText: source.responseCode === "na" ? null : source.responseText || null,
      responseNumber: source.responseCode === "na" || !source.responseNumber.trim() ? null : Number(source.responseNumber.replace(",", ".")),
      observation: source.observation || null,
    });
    for (const file of source.photos) {
      await uploadAndAttachOrderChecklistPhoto({ organizationId, serviceOrderId, checklistId: checklist.id, itemId: target.id, file });
    }
  }

  await completeOrderChecklistStage(stage.id);
  clearNewOrderEntryChecklistDraft();
}
