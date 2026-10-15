import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";
import type { GeneralService } from "@/lib/database.types";

const generalServiceColumns = "id,name,price,price_at_completion,max_discount_percentage,max_discount_amount,is_active,sort_order,created_at,updated_at,organization_id";

type GeneralServiceWrite = Pick<
  GeneralService,
  "name" | "price" | "price_at_completion" | "max_discount_percentage" | "max_discount_amount" | "is_active" | "sort_order"
>;

/** Seleção inversa dos mesmos vínculos usados no cadastro de equipamentos. */
export type GeneralServiceEquipmentOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export async function loadGeneralServiceEquipments(serviceId: string | null): Promise<{
  equipment: GeneralServiceEquipmentOption[];
  selectedIds: string[];
}> {
  const { loadEquipmentCatalog, loadEquipmentServiceSettings } =
    await import("@/features/equipment/infrastructure/equipment.repository");
  const [catalog, settings] = await Promise.all([
    loadEquipmentCatalog(),
    loadEquipmentServiceSettings(),
  ]);
  if (!settings.available) {
    throw new Error("Os vínculos de equipamentos ainda não estão disponíveis no banco de dados.");
  }
  return {
    equipment: catalog.types.map(type => ({ id: type.id, name: type.name, is_active: type.is_active })),
    selectedIds: serviceId
      ? settings.links.filter(link => link.general_service_id === serviceId).map(link => link.equipment_type_id)
      : [],
  };
}

/**
 * Atualiza somente os equipamentos cujo vínculo com este serviço mudou.
 * Cada RPC recebe também os demais serviços do equipamento para preservá-los.
 */
export async function saveGeneralServiceEquipments(serviceId: string, equipmentIds: string[]): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { loadEquipmentServiceSettings } = await import("@/features/equipment/infrastructure/equipment.repository");
  const settings = await loadEquipmentServiceSettings();
  if (!settings.available) throw new Error("Os vínculos de equipamentos não estão disponíveis.");

  const requested = new Set(equipmentIds);
  const currentEquipmentIds = new Set(
    settings.links.filter(link => link.general_service_id === serviceId).map(link => link.equipment_type_id),
  );
  const changedIds = [...new Set([...requested, ...currentEquipmentIds])]
    .filter(equipmentId => requested.has(equipmentId) !== currentEquipmentIds.has(equipmentId));

  // A mesma RPC do editor de equipamentos mantém a integridade e verifica permissões.
  for (const equipmentTypeId of changedIds) {
    const otherServiceIds = settings.links
      .filter(link => link.equipment_type_id === equipmentTypeId && link.general_service_id !== serviceId)
      .map(link => link.general_service_id);
    const { error } = await supabase.rpc("save_equipment_service_links_v1", {
      p_organization_id: organizationId,
      p_equipment_type_id: equipmentTypeId,
      p_service_ids: requested.has(equipmentTypeId) ? [...otherServiceIds, serviceId] : otherServiceIds,
    });
    if (error) throw error;
  }
}

export async function listGeneralServices(): Promise<GeneralService[]> {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("general_services")
    .select(generalServiceColumns)
    .eq("organization_id", organizationId)
    .order("sort_order")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function createGeneralService(service: GeneralServiceWrite): Promise<string> {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase.from("general_services").insert({ ...service, organization_id: organizationId }).select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("O serviço foi cadastrado, mas não foi possível obter seu identificador.");
  return data.id;
}

export async function updateGeneralService(
  id: string,
  service: Partial<GeneralServiceWrite>,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("general_services")
    .update(service)
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function setGeneralServiceActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("general_services")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) throw error;
}
