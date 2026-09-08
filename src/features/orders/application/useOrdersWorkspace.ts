import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { loadOrdersWorkspace } from "../infrastructure/orders.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

type OrdersWorkspace = {
  orders: any[];
  statuses: any[];
  situations: any[];
  serviceTypeSituations: any[];
  profiles: any[];
  services: any[];
  brands: any[];
  products: any[];
  equipmentTypes: any[];
  equipmentBrands: any[];
  equipmentModels: any[];
  technicalFields: any[];
  technicalFieldLinks: any[];
  employees: any[];
  serviceTypes: any[];
  generalServices: any[];
};

const EMPTY_WORKSPACE: OrdersWorkspace = {
  orders: [], statuses: [], situations: [], serviceTypeSituations: [], profiles: [], services: [], brands: [], products: [],
  equipmentTypes: [], equipmentBrands: [], equipmentModels: [], technicalFields: [], technicalFieldLinks: [], employees: [], serviceTypes: [], generalServices: [],
};

async function fetchOrdersWorkspace(organizationId: string): Promise<OrdersWorkspace> {
  const [ordersResult, statusesResult, situationsResult, profilesResult, servicesResult, brandsResult, productsResult, equipmentTypesResult, equipmentBrandsResult, equipmentModelsResult, technicalFieldsResult, technicalFieldLinksResult, employeesResult, generalServicesResult, serviceTypesResult, serviceTypeSituationsResult] = await loadOrdersWorkspace(organizationId);
  if (ordersResult.error) throw ordersResult.error;
  [statusesResult, situationsResult, profilesResult, servicesResult, brandsResult, productsResult, equipmentTypesResult, equipmentBrandsResult, equipmentModelsResult, technicalFieldsResult, technicalFieldLinksResult, employeesResult, generalServicesResult, serviceTypesResult, serviceTypeSituationsResult].forEach((result, index) => {
    if (result.error) console.error("[ADMIN] OS related query error:", index, result.error);
  });
  return {
    orders: ordersResult.data ?? [], statuses: statusesResult.data ?? [], situations: situationsResult.data ?? [], profiles: profilesResult.data ?? [],
    services: servicesResult.data ?? [], brands: brandsResult.data ?? [], products: productsResult.data ?? [], equipmentTypes: equipmentTypesResult.data ?? [],
    equipmentBrands: equipmentBrandsResult.data ?? [], equipmentModels: equipmentModelsResult.data ?? [], technicalFields: technicalFieldsResult.data ?? [],
    technicalFieldLinks: technicalFieldLinksResult.data ?? [], employees: employeesResult.data ?? [], generalServices: generalServicesResult.data ?? [],
    serviceTypes: serviceTypesResult.data ?? [], serviceTypeSituations: serviceTypeSituationsResult.data ?? [],
  };
}

export function useOrdersWorkspace({
  showToast,
  organizationIdOverride,
}: {
  showToast: (toast: ToastMessage) => void;
  organizationIdOverride?: string | null;
}) {
  const { activeOrganizationId } = useAuth();
  const organizationId = organizationIdOverride || activeOrganizationId;
  const queryClient = useQueryClient();
  const workspaceKey = [...queryKeys.orders.workspace(), organizationId || "none"] as const;
  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    enabled: Boolean(organizationId),
    queryFn: () => fetchOrdersWorkspace(organizationId!),
  });
  const workspace = workspaceQuery.data ?? EMPTY_WORKSPACE;

  useEffect(() => {
    if (!workspaceQuery.error) return;
    console.error("[ADMIN] service_orders load error:", workspaceQuery.error);
    showToast({ msg: `Erro ao carregar OS: ${workspaceQuery.error instanceof Error ? workspaceQuery.error.message : String(workspaceQuery.error)}`, type: "error" });
  }, [showToast, workspaceQuery.error]);

  const setCollection = useCallback((key: "orders" | "equipmentTypes" | "equipmentBrands" | "equipmentModels", next: SetStateAction<any[]>) => {
    queryClient.setQueryData<OrdersWorkspace>([...queryKeys.orders.workspace(), organizationId || "none"], current => {
      if (!current) return current;
      const value = typeof next === "function" ? next(current[key]) : next;
      return { ...current, [key]: value };
    });
  }, [queryClient, organizationId]);

  const setOrders: Dispatch<SetStateAction<any[]>> = useCallback(next => setCollection("orders", next), [setCollection]);
  const setEquipmentTypes: Dispatch<SetStateAction<any[]>> = useCallback(next => setCollection("equipmentTypes", next), [setCollection]);
  const setEquipmentBrands: Dispatch<SetStateAction<any[]>> = useCallback(next => setCollection("equipmentBrands", next), [setCollection]);
  const setEquipmentModels: Dispatch<SetStateAction<any[]>> = useCallback(next => setCollection("equipmentModels", next), [setCollection]);

  const reloadWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard() }),
    ]);
  }, [queryClient]);

  return {
    ...workspace,
    organizationId,
    isOrganizationOverride: Boolean(organizationIdOverride),
    setOrders,
    setEquipmentTypes,
    setEquipmentBrands,
    setEquipmentModels,
    loading: Boolean(organizationId) && workspaceQuery.isPending,
    reloadWorkspace,
  };
}
