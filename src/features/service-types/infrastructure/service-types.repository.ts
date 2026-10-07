import { changedServiceTypeSituationLinks } from "../domain/service-type-links.mjs";
import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";
import { listOrdersUsingServiceType } from "@/features/orders/infrastructure/linked-orders.repository";

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
  const { data, error } = await supabase.rpc(
    "load_service_types_configuration_v1",
    { p_organization_id: organizationId },
  );
  if (error) throw error;

  const configuration = (data || {}) as Record<string, unknown>;
  return {
    serviceTypes: Array.isArray(configuration.serviceTypes) ? configuration.serviceTypes : [],
    situations: Array.isArray(configuration.situations) ? configuration.situations : [],
    links: Array.isArray(configuration.links) ? configuration.links : [],
    monitoredServiceTypeIds: Array.isArray(configuration.monitoredServiceTypeIds)
      ? configuration.monitoredServiceTypeIds.map(String)
      : [],
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

  const changedLinks = changedServiceTypeSituationLinks(desiredLinks, existingLinks);

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
  const linkedOrders = await listOrdersUsingServiceType(serviceTypeId);
  if (linkedOrders.length > 0) {
    throw new Error(`Este tipo de atendimento ainda está vinculado a ${linkedOrders.length} OS. Altere o tipo antes de excluir.`);
  }

  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("service_types")
    .delete()
    .eq("id", serviceTypeId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}
