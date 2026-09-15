export type ChecklistStageType = "entry" | "diagnosis" | "qc" | "custom";
export type ChecklistResponseType = "conformity" | "yes_no" | "confirmation" | "text" | "number";
export type ChecklistPhotoRequirement = "none" | "optional" | "required" | "required_on_failure";
export type ChecklistObservationRequirement = "none" | "optional" | "required" | "required_on_failure";
export type ChecklistStageStatus = "pending" | "in_progress" | "completed" | "reopened";
export type ChecklistStatus = "pending" | "in_progress" | "completed" | "superseded";

export type ChecklistProfile = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ChecklistProfileItem = {
  id: string;
  organization_id: string;
  stage_id: string;
  title: string;
  description: string | null;
  response_type: ChecklistResponseType;
  allow_na: boolean;
  is_required: boolean;
  photo_requirement: ChecklistPhotoRequirement;
  observation_requirement: ChecklistObservationRequirement;
  sort_order: number;
  is_active: boolean;
};

export type ChecklistProfileStage = {
  id: string;
  organization_id: string;
  profile_id: string;
  code: string;
  name: string;
  stage_type: ChecklistStageType;
  situation_id: string | null;
  block_situation_exit: boolean;
  block_resolution: boolean;
  block_completion: boolean;
  sort_order: number;
  is_active: boolean;
  items: ChecklistProfileItem[];
};

export type ChecklistProfileDraftItem = Omit<ChecklistProfileItem, "id" | "organization_id" | "stage_id"> & { id?: string };
export type ChecklistProfileDraftStage = Omit<ChecklistProfileStage, "id" | "organization_id" | "profile_id" | "items"> & {
  id?: string;
  items: ChecklistProfileDraftItem[];
};

export type ChecklistProfileEditor = ChecklistProfile & { stages: ChecklistProfileStage[] };

export type EquipmentChecklistItem = {
  id?: string;
  organization_id?: string;
  equipment_type_id?: string;
  stage_code: string;
  title: string;
  description: string | null;
  response_type: ChecklistResponseType;
  allow_na: boolean;
  is_required: boolean;
  photo_requirement: ChecklistPhotoRequirement;
  observation_requirement: ChecklistObservationRequirement;
  sort_order: number;
  is_active: boolean;
};

export type ChecklistAdminData = {
  profiles: ChecklistProfile[];
  stages: ChecklistProfileStage[];
  items: ChecklistProfileItem[];
  equipmentTypes: Array<{ id: string; name: string; checklist_profile_id: string | null }>;
  situations: Array<{ id: string; name: string; color?: string | null; is_active?: boolean }>;
};

export type OrderChecklistMedia = {
  id: string;
  media_id: string;
  media?: { id: string; bucket_id: string; storage_path: string; file_name: string } | null;
};

export type OrderChecklistItem = {
  id: string;
  organization_id: string;
  stage_id: string;
  source_kind: "profile" | "equipment_extra";
  title_snapshot: string;
  description_snapshot: string | null;
  response_type_snapshot: ChecklistResponseType;
  allow_na_snapshot: boolean;
  is_required_snapshot: boolean;
  photo_requirement_snapshot: ChecklistPhotoRequirement;
  observation_requirement_snapshot: ChecklistObservationRequirement;
  sort_order: number;
  response_code: string | null;
  response_text: string | null;
  response_number: number | null;
  observation: string | null;
  answered_by: string | null;
  answered_at: string | null;
  answered_by_name?: string | null;
  media: OrderChecklistMedia[];
};

export type OrderChecklistStage = {
  id: string;
  organization_id: string;
  checklist_id: string;
  stage_code_snapshot: string;
  stage_type_snapshot: ChecklistStageType;
  name_snapshot: string;
  situation_id_snapshot: string | null;
  situation_name_snapshot: string | null;
  block_situation_exit_snapshot: boolean;
  block_resolution_snapshot: boolean;
  block_completion_snapshot: boolean;
  sort_order: number;
  status: ChecklistStageStatus;
  completed_by: string | null;
  completed_at: string | null;
  completed_by_name?: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopened_by_name?: string | null;
  items: OrderChecklistItem[];
};

export type OrderChecklist = {
  id: string;
  organization_id: string;
  service_order_id: string;
  equipment_type_id: string | null;
  source_profile_id: string | null;
  profile_name_snapshot: string;
  profile_version_snapshot: number;
  status: ChecklistStatus;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
  completed_by_name?: string | null;
  stages: OrderChecklistStage[];
};

export function isChecklistFailure(item: Pick<OrderChecklistItem, "response_type_snapshot" | "response_code">) {
  return (item.response_type_snapshot === "conformity" && item.response_code === "not_ok")
    || (item.response_type_snapshot === "yes_no" && item.response_code === "no");
}

export function checklistItemHasAnswer(item: OrderChecklistItem) {
  if (item.response_code === "na") return item.allow_na_snapshot;
  if (item.response_type_snapshot === "conformity") return item.response_code === "ok" || item.response_code === "not_ok";
  if (item.response_type_snapshot === "yes_no") return item.response_code === "yes" || item.response_code === "no";
  if (item.response_type_snapshot === "confirmation") return item.response_code === "confirmed";
  if (item.response_type_snapshot === "text") return Boolean(item.response_text?.trim());
  if (item.response_type_snapshot === "number") return item.response_number !== null;
  return false;
}

export function checklistStageProgress(stage: OrderChecklistStage) {
  const total = stage.items.length;
  const answered = stage.items.filter(checklistItemHasAnswer).length;
  return { answered, total, percentage: total ? Math.round((answered / total) * 100) : 100 };
}

export function checklistProgress(checklist: OrderChecklist | null | undefined) {
  if (!checklist) return { answered: 0, total: 0, percentage: 0 };
  const items = checklist.stages.flatMap(stage => stage.items);
  const answered = items.filter(checklistItemHasAnswer).length;
  return { answered, total: items.length, percentage: items.length ? Math.round((answered / items.length) * 100) : 100 };
}
