import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";
import { uploadServiceOrderMediaFile } from "@/shared/infrastructure/media.repository";
import type {
  ChecklistAdminData,
  ChecklistProfile,
  ChecklistProfileDraftStage,
  ChecklistProfileEditor,
  ChecklistProfileItem,
  ChecklistProfileStage,
  EquipmentChecklistItem,
  OrderChecklist,
  OrderChecklistItem,
  OrderChecklistMedia,
  OrderChecklistStage,
} from "../domain/checklist";

export async function loadChecklistAdminData(): Promise<ChecklistAdminData> {
  const organizationId = await getActiveOrganizationId();
  const [profilesResult, stagesResult, itemsResult, equipmentResult, situationsResult] = await Promise.all([
    supabase.from("checklist_profiles").select("*").eq("organization_id", organizationId).order("name"),
    supabase.from("checklist_profile_stages").select("*").eq("organization_id", organizationId).order("sort_order").order("name"),
    supabase.from("checklist_profile_items").select("*").eq("organization_id", organizationId).order("sort_order").order("title"),
    supabase.from("equipment_types").select("id,name,checklist_profile_id").eq("organization_id", organizationId).order("name"),
    supabase.from("os_situations").select("id,name,color,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
  ]);
  const error = profilesResult.error || stagesResult.error || itemsResult.error || equipmentResult.error || situationsResult.error;
  if (error) throw error;
  const items = (itemsResult.data ?? []) as ChecklistProfileItem[];
  const stages = ((stagesResult.data ?? []) as Omit<ChecklistProfileStage, "items">[]).map(stage => ({
    ...stage,
    items: items.filter(item => item.stage_id === stage.id),
  }));
  return {
    profiles: (profilesResult.data ?? []) as ChecklistProfile[],
    stages,
    items,
    equipmentTypes: (equipmentResult.data ?? []) as ChecklistAdminData["equipmentTypes"],
    situations: (situationsResult.data ?? []) as ChecklistAdminData["situations"],
  };
}

export function profileEditorFromAdminData(data: ChecklistAdminData, profileId: string): ChecklistProfileEditor | null {
  const profile = data.profiles.find(item => item.id === profileId);
  if (!profile) return null;
  return {
    ...profile,
    stages: data.stages.filter(stage => stage.profile_id === profileId).map(stage => ({
      ...stage,
      items: data.items.filter(item => item.stage_id === stage.id),
    })),
  };
}

export async function saveChecklistProfile(input: {
  id?: string | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  stages: ChecklistProfileDraftStage[];
}) {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase.rpc("save_checklist_profile", {
    p_organization_id: organizationId,
    p_profile_id: input.id || null,
    p_name: input.name,
    p_description: input.description || null,
    p_is_active: input.is_active,
    p_stages: input.stages.map((stage, stageIndex) => ({
      code: stage.code,
      stage_type: stage.stage_type,
      name: stage.name,
      situation_id: stage.situation_id || null,
      block_situation_exit: stage.block_situation_exit,
      block_resolution: stage.block_resolution,
      block_completion: stage.block_completion,
      sort_order: stage.sort_order ?? stageIndex * 10,
      is_active: stage.is_active,
      items: stage.items.map((item, itemIndex) => ({
        title: item.title,
        description: item.description || null,
        response_type: item.response_type,
        allow_na: item.allow_na,
        is_required: item.is_required,
        photo_requirement: item.photo_requirement,
        observation_requirement: item.observation_requirement,
        sort_order: item.sort_order ?? itemIndex * 10,
        is_active: item.is_active,
      })),
    })),
  });
  if (error) throw error;
  return data as string;
}

export async function listActiveChecklistProfiles() {
  const organizationId = await getActiveOrganizationId();
  const [profilesResult, stagesResult] = await Promise.all([
    supabase.from("checklist_profiles").select("id,name,version,is_active").eq("organization_id", organizationId).eq("is_active", true).order("name"),
    supabase.from("checklist_profile_stages").select("id,profile_id,code,name,stage_type,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order"),
  ]);
  const error = profilesResult.error || stagesResult.error;
  if (error) throw error;
  return { profiles: profilesResult.data ?? [], stages: stagesResult.data ?? [] };
}

export async function listEquipmentChecklistItems(equipmentTypeId?: string | null) {
  if (!equipmentTypeId) return [] as EquipmentChecklistItem[];
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("equipment_checklist_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("equipment_type_id", equipmentTypeId)
    .order("sort_order")
    .order("title");
  if (error) throw error;
  return (data ?? []) as EquipmentChecklistItem[];
}

export async function saveEquipmentChecklistConfiguration(
  equipmentTypeId: string,
  profileId: string | null,
  items: EquipmentChecklistItem[],
) {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.rpc("save_equipment_checklist_configuration", {
    p_organization_id: organizationId,
    p_equipment_type_id: equipmentTypeId,
    p_profile_id: profileId,
    p_items: items.map((item, index) => ({
      stage_code: item.stage_code,
      title: item.title,
      description: item.description || null,
      response_type: item.response_type,
      allow_na: item.allow_na,
      is_required: item.is_required,
      photo_requirement: item.photo_requirement,
      observation_requirement: item.observation_requirement,
      sort_order: item.sort_order ?? index * 10,
      is_active: item.is_active,
    })),
  });
  if (error) throw error;
}

async function loadOrderChecklistById(checklistId: string): Promise<OrderChecklist | null> {
  const [checklistResult, stagesResult] = await Promise.all([
    supabase.from("service_order_checklists").select("*").eq("id", checklistId).maybeSingle(),
    supabase.from("service_order_checklist_stages").select("*").eq("checklist_id", checklistId).order("sort_order"),
  ]);
  if (checklistResult.error) throw checklistResult.error;
  if (stagesResult.error) throw stagesResult.error;
  if (!checklistResult.data) return null;

  const checklistBase = checklistResult.data as Omit<OrderChecklist, "stages">;
  const stagesBase = (stagesResult.data ?? []) as Omit<OrderChecklistStage, "items">[];
  const stageIds = stagesBase.map(stage => stage.id);
  const itemsResult = stageIds.length
    ? await supabase.from("service_order_checklist_items").select("*").in("stage_id", stageIds).order("sort_order")
    : { data: [], error: null };
  if (itemsResult.error) throw itemsResult.error;
  const itemsBase = (itemsResult.data ?? []) as Omit<OrderChecklistItem, "media">[];
  const itemIds = itemsBase.map(item => item.id);
  const mediaResult = itemIds.length
    ? await supabase.from("service_order_checklist_item_media").select("id,item_id,media_id,media:media(id,bucket_id,storage_path,file_name)").in("item_id", itemIds).order("created_at")
    : { data: [], error: null };
  if (mediaResult.error) throw mediaResult.error;
  const mediaRows = (mediaResult.data ?? []) as Array<OrderChecklistMedia & { item_id: string }>;

  const actorIds = Array.from(new Set([
    checklistBase.completed_by,
    ...stagesBase.flatMap(stage => [stage.completed_by, stage.reopened_by]),
    ...itemsBase.map(item => item.answered_by),
  ].filter((value): value is string => Boolean(value))));
  const profilesResult = actorIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", actorIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileNames = new Map((profilesResult.data ?? []).map(profile => [profile.id, profile.full_name || "Usuário"]));

  const items: OrderChecklistItem[] = itemsBase.map(item => ({
    ...item,
    answered_by_name: item.answered_by ? profileNames.get(item.answered_by) || "Usuário" : null,
    media: mediaRows.filter(media => media.item_id === item.id).map(({ item_id: _itemId, ...media }) => media),
  }));
  const stages: OrderChecklistStage[] = stagesBase.map(stage => ({
    ...stage,
    completed_by_name: stage.completed_by ? profileNames.get(stage.completed_by) || "Usuário" : null,
    reopened_by_name: stage.reopened_by ? profileNames.get(stage.reopened_by) || "Usuário" : null,
    items: items.filter(item => item.stage_id === stage.id),
  }));
  return {
    ...checklistBase,
    completed_by_name: checklistBase.completed_by ? profileNames.get(checklistBase.completed_by) || "Usuário" : null,
    stages,
  };
}

export async function getOrderChecklist(serviceOrderId: string) {
  const { data, error } = await supabase
    .from("service_order_checklists")
    .select("id")
    .eq("service_order_id", serviceOrderId)
    .neq("status", "superseded")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return loadOrderChecklistById(data.id);
}

export async function ensureOrderChecklist(serviceOrderId: string) {
  const { data, error } = await supabase.rpc("ensure_service_order_checklist", { p_service_order_id: serviceOrderId });
  if (error) throw error;
  if (!data) return null;
  return loadOrderChecklistById(data as string);
}

export async function saveOrderChecklistItemAnswer(input: {
  itemId: string;
  responseCode?: string | null;
  responseText?: string | null;
  responseNumber?: number | null;
  observation?: string | null;
}) {
  const { error } = await supabase.rpc("save_service_order_checklist_item_response", {
    p_item_id: input.itemId,
    p_response_code: input.responseCode || null,
    p_response_text: input.responseText || null,
    p_response_number: input.responseNumber ?? null,
    p_observation: input.observation || null,
  });
  if (error) throw error;
}

export async function completeOrderChecklistStage(stageId: string) {
  const { error } = await supabase.rpc("complete_service_order_checklist_stage", { p_stage_id: stageId });
  if (error) throw error;
}

export async function reopenOrderChecklistStage(stageId: string) {
  const { error } = await supabase.rpc("reopen_service_order_checklist_stage", { p_stage_id: stageId });
  if (error) throw error;
}

export async function uploadAndAttachOrderChecklistPhoto(input: {
  organizationId: string;
  serviceOrderId: string;
  checklistId: string;
  itemId: string;
  file: File;
}) {
  const mediaId = await uploadServiceOrderMediaFile(
    input.serviceOrderId,
    `checklists/${input.checklistId}/${input.itemId}`,
    input.file,
    input.organizationId,
  );
  const { error } = await supabase.rpc("attach_service_order_checklist_media", {
    p_item_id: input.itemId,
    p_media_id: mediaId,
  });
  if (error) throw error;
  return mediaId;
}
