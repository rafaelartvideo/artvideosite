import { supabase } from "@/lib/supabase";

export type SelectedSituation = {
  situation_id: string;
  use_default_hours: boolean;
  sla_hours: string;
};

type SaveServiceTypeInput = {
  serviceTypeId?: string;
  payload: Record<string, unknown>;
  sortOrder: number;
  selectedSituations: SelectedSituation[];
};

export async function loadServiceTypesConfiguration() {
  const [typesResult, situationsResult, linksResult] = await Promise.all([
    supabase
      .from("service_types")
      .select("id,title,description,forecast_days,is_active,sort_order,created_at,updated_at")
      .order("sort_order")
      .order("title"),
    supabase
      .from("os_situations")
      .select("id,name,color,hours,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("service_type_situations")
      .select("service_type_id,situation_id,use_default_hours,sla_hours,sort_order"),
  ]);

  const error = typesResult.error || situationsResult.error || linksResult.error;
  if (error) throw error;

  return {
    serviceTypes: typesResult.data ?? [],
    situations: situationsResult.data ?? [],
    links: linksResult.data ?? [],
  };
}

export async function getServiceTypeSituationLinks(serviceTypeId: string) {
  const { data, error } = await supabase
    .from("service_type_situations")
    .select("situation_id,use_default_hours,sla_hours,sort_order")
    .eq("service_type_id", serviceTypeId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveServiceType({
  serviceTypeId: existingId,
  payload,
  sortOrder,
  selectedSituations,
}: SaveServiceTypeInput): Promise<string> {
  let serviceTypeId = existingId;

  if (serviceTypeId) {
    const { error } = await supabase
      .from("service_types")
      .update(payload)
      .eq("id", serviceTypeId);

    if (error) throw error;

    const { error: deleteError } = await supabase
      .from("service_type_situations")
      .delete()
      .eq("service_type_id", serviceTypeId);

    if (deleteError) throw deleteError;
  } else {
    const { data, error } = await supabase
      .from("service_types")
      .insert({ ...payload, sort_order: sortOrder })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw error ?? new Error("Não foi possível obter o tipo criado.");
    }
    serviceTypeId = data.id;
  }

  const { error: linksError } = await supabase
    .from("service_type_situations")
    .insert(
      selectedSituations.map((selected, index) => ({
        service_type_id: serviceTypeId,
        situation_id: selected.situation_id,
        use_default_hours: selected.use_default_hours,
        sla_hours: selected.use_default_hours ? null : Number(selected.sla_hours),
        sort_order: index,
      })),
    );

  if (linksError) throw linksError;
  return serviceTypeId;
}

export async function setServiceTypeActive(
  serviceTypeId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("service_types")
    .update({ is_active: isActive })
    .eq("id", serviceTypeId);

  if (error) throw error;
}

export async function deleteServiceType(serviceTypeId: string): Promise<void> {
  const { error } = await supabase
    .from("service_types")
    .delete()
    .eq("id", serviceTypeId);

  if (error) throw error;
}
