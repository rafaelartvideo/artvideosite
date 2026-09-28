import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";

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
  const organizationId = await getActiveOrganizationId();
  const [typesResult, situationsResult, linksResult] = await Promise.all([
    supabase
      .from("service_types")
      .select("id,title,description,forecast_days,is_active,sort_order,created_at,updated_at,organization_id")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("title"),
    supabase
      .from("os_situations")
      .select("id,name,color,hours,sort_order,is_active,organization_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("service_type_situations")
      .select("service_type_id,situation_id,use_default_hours,sla_hours,sort_order,organization_id")
      .eq("organization_id", organizationId),
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
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("service_type_situations")
    .select("situation_id,use_default_hours,sla_hours,sort_order")
    .eq("organization_id", organizationId)
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
  const organizationId = await getActiveOrganizationId();
  let serviceTypeId = existingId;

  let existingLinks: Array<{
    situation_id: string;
    use_default_hours: boolean;
    sla_hours: number | string | null;
    sort_order: number;
  }> = [];

  if (serviceTypeId) {
    const { data: currentLinks, error: currentLinksError } = await supabase
      .from("service_type_situations")
      .select("situation_id,use_default_hours,sla_hours,sort_order")
      .eq("organization_id", organizationId)
      .eq("service_type_id", serviceTypeId);

    if (currentLinksError) throw currentLinksError;
    existingLinks = currentLinks ?? [];

    const { error } = await supabase
      .from("service_types")
      .update(payload)
      .eq("id", serviceTypeId)
      .eq("organization_id", organizationId);

    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("service_types")
      .insert({ ...payload, sort_order: sortOrder, organization_id: organizationId })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw error ?? new Error("Não foi possível obter o tipo criado.");
    }
    serviceTypeId = data.id;
  }

  const desiredLinks = selectedSituations.map((selected, index) => ({
    organization_id: organizationId,
    service_type_id: serviceTypeId,
    situation_id: selected.situation_id,
    use_default_hours: selected.use_default_hours,
    sla_hours: selected.use_default_hours ? null : Number(selected.sla_hours),
    sort_order: index,
  }));

  const desiredSituationIds = new Set(desiredLinks.map(link => link.situation_id));
  const removedSituationIds = existingLinks
    .filter(link => !desiredSituationIds.has(link.situation_id))
    .map(link => link.situation_id);

  if (removedSituationIds.length) {
    const { error: deleteError } = await supabase
      .from("service_type_situations")
      .delete()
      .eq("organization_id", organizationId)
      .eq("service_type_id", serviceTypeId)
      .in("situation_id", removedSituationIds);

    if (deleteError) throw deleteError;
  }

  const existingBySituation = new Map(existingLinks.map(link => [link.situation_id, link]));
  const changedLinks = desiredLinks.filter(link => {
    const current = existingBySituation.get(link.situation_id);
    if (!current) return true;
    const currentHours = current.sla_hours == null ? null : Number(current.sla_hours);
    const nextHours = link.sla_hours == null ? null : Number(link.sla_hours);
    return current.use_default_hours !== link.use_default_hours
      || currentHours !== nextHours
      || Number(current.sort_order) !== link.sort_order;
  });

  if (changedLinks.length) {
    const { error: linksError } = await supabase
      .from("service_type_situations")
      .upsert(changedLinks, { onConflict: "service_type_id,situation_id" });

    if (linksError) throw linksError;
  }

  return serviceTypeId;
}

export async function setServiceTypeActive(
  serviceTypeId: string,
  isActive: boolean,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("service_types")
    .update({ is_active: isActive })
    .eq("id", serviceTypeId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

export async function deleteServiceType(serviceTypeId: string): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("service_types")
    .delete()
    .eq("id", serviceTypeId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}
