import { useCallback, useEffect, useState } from "react";
import { loadOrdersWorkspace } from "../infrastructure/orders.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

export function useOrdersWorkspace({
  showToast,
}: {
  showToast: (toast: ToastMessage) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [situations, setSituations] = useState<any[]>([]);
  const [serviceTypeSituations, setServiceTypeSituations] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [equipmentBrands, setEquipmentBrands] = useState<any[]>([]);
  const [equipmentModels, setEquipmentModels] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [generalServices, setGeneralServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadWorkspace = useCallback(async () => {
    setLoading(true);
    const [
      ordersResult,
      statusesResult,
      situationsResult,
      profilesResult,
      servicesResult,
      brandsResult,
      productsResult,
      equipmentTypesResult,
      equipmentBrandsResult,
      equipmentModelsResult,
      employeesResult,
      generalServicesResult,
      serviceTypesResult,
      serviceTypeSituationsResult,
    ] = await loadOrdersWorkspace();

    if (ordersResult.error) {
      console.error("[ADMIN] service_orders load error:", {
        code: ordersResult.error.code,
        message: ordersResult.error.message,
        details: ordersResult.error.details,
        hint: ordersResult.error.hint,
      });
      showToast({
        msg: `Erro ao carregar OS: ${ordersResult.error.message}`,
        type: "error",
      });
    } else {
      setOrders(ordersResult.data || []);
    }

    [
      statusesResult,
      situationsResult,
      profilesResult,
      servicesResult,
      brandsResult,
      productsResult,
      equipmentTypesResult,
      equipmentBrandsResult,
      equipmentModelsResult,
      employeesResult,
      generalServicesResult,
      serviceTypesResult,
      serviceTypeSituationsResult,
    ].forEach((result, index) => {
      if (result.error) {
        console.error("[ADMIN] OS related query error:", index, result.error);
      }
    });

    setStatuses(statusesResult.data || []);
    setSituations(situationsResult.data || []);
    setProfiles(profilesResult.data || []);
    setServices(servicesResult.data || []);
    setBrands(brandsResult.data || []);
    setProducts(productsResult.data || []);
    setEquipmentTypes(equipmentTypesResult.data || []);
    setEquipmentBrands(equipmentBrandsResult.data || []);
    setEquipmentModels(equipmentModelsResult.data || []);
    setEmployees(employeesResult.data || []);
    setGeneralServices(generalServicesResult.data || []);
    setServiceTypes(serviceTypesResult.data || []);
    setServiceTypeSituations(serviceTypeSituationsResult.data || []);
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    void reloadWorkspace();
  }, [reloadWorkspace]);

  return {
    orders,
    setOrders,
    statuses,
    situations,
    serviceTypeSituations,
    profiles,
    services,
    brands,
    products,
    equipmentTypes,
    setEquipmentTypes,
    equipmentBrands,
    setEquipmentBrands,
    equipmentModels,
    setEquipmentModels,
    employees,
    serviceTypes,
    generalServices,
    loading,
    reloadWorkspace,
  };
}
