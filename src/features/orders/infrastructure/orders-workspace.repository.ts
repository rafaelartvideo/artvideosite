import { supabase } from "@/lib/supabase";

export type OrdersReferenceData = {
  statuses: any[];
  situations: any[];
  services: any[];
  brands: any[];
  products: any[];
  equipmentTypes: any[];
  equipmentBrands: any[];
  equipmentModels: any[];
  technicalFields: any[];
  technicalFieldLinks: any[];
  employees: any[];
  generalServices: any[];
  serviceTypes: any[];
  serviceTypeSituations: any[];
};

function requestReferences(organizationId: string) {
  return supabase.rpc("load_orders_reference_data_v1", { p_organization_id: organizationId })
    .abortSignal(AbortSignal.timeout(35_000));
}

export async function loadOrdersReferenceData(
  organizationId: string,
): Promise<OrdersReferenceData> {
  // Um atraso transitório na API não deve derrubar a tabela de OS.
  // A chamada original abortava em apenas 20 s, gerando TimeoutError na interface.
  let response: Awaited<ReturnType<typeof requestReferences>> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await requestReferences(organizationId);
      if (!response.error) break;
      const transient = /timeout|timed out|abort|network|fetch failed/i.test(response.error.message || "");
      if (!transient || attempt > 0) throw response.error;
    } catch (error) {
      if (attempt > 0 || !/timeout|timed out|abort|network|fetch failed/i.test(String(error))) throw error;
    }
  }
  if (!response) throw new Error("Não foi possível carregar os dados da OS.");
  const { data, error } = response;
  if (error) throw error;

  const reference = (data || {}) as Record<string, unknown>;
  return {
    statuses: Array.isArray(reference.statuses) ? reference.statuses : [],
    situations: Array.isArray(reference.situations) ? reference.situations : [],
    services: Array.isArray(reference.services) ? reference.services : [],
    brands: Array.isArray(reference.brands) ? reference.brands : [],
    products: Array.isArray(reference.products) ? reference.products : [],
    equipmentTypes: Array.isArray(reference.equipmentTypes) ? reference.equipmentTypes : [],
    equipmentBrands: Array.isArray(reference.equipmentBrands) ? reference.equipmentBrands : [],
    equipmentModels: Array.isArray(reference.equipmentModels) ? reference.equipmentModels : [],
    technicalFields: Array.isArray(reference.technicalFields) ? reference.technicalFields : [],
    technicalFieldLinks: Array.isArray(reference.technicalFieldLinks) ? reference.technicalFieldLinks : [],
    employees: Array.isArray(reference.employees) ? reference.employees : [],
    generalServices: Array.isArray(reference.generalServices) ? reference.generalServices : [],
    serviceTypes: Array.isArray(reference.serviceTypes) ? reference.serviceTypes : [],
    serviceTypeSituations: Array.isArray(reference.serviceTypeSituations)
      ? reference.serviceTypeSituations
      : [],
  };
}
