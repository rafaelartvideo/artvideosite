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

export async function loadOrdersReferenceData(
  organizationId: string,
): Promise<OrdersReferenceData> {
  const { data, error } = await supabase.rpc("load_orders_reference_data_v1", {
    p_organization_id: organizationId,
  });
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
