import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
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
  employees: any[];
  serviceTypes: any[];
  generalServices: any[];
};

const EMPTY_WORKSPACE: OrdersWorkspace = {
  orders: [],
  statuses: [],
  situations: [],
  serviceTypeSituations: [],
  profiles: [],
  services: [],
  brands: [],
  products: [],
  equipmentTypes: [],
  equipmentBrands: [],
  equipmentModels: [],
  employees: [],
  serviceTypes: [],
  generalServices: [],
};

async function fetchOrdersWorkspace(): Promise<OrdersWorkspace> {
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

  if (ordersResult.error) throw ordersResult.error;

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

  return {
    orders: ordersResult.data ?? [],
    statuses: statusesResult.data ?? [],
    situations: situationsResult.data ?? [],
    profiles: profilesResult.data ?? [],
    services: servicesResult.data ?? [],
    brands: brandsResult.data ?? [],
    products: productsResult.data ?? [],
    equipmentTypes: equipmentTypesResult.data ?? [],
    equipmentBrands: equipmentBrandsResult.data ?? [],
    equipmentModels: equipmentModelsResult.data ?? [],
    employees: employeesResult.data ?? [],
    generalServices: generalServicesResult.data ?? [],
    serviceTypes: serviceTypesResult.data ?? [],
    serviceTypeSituations: serviceTypeSituationsResult.data ?? [],
  };
}

export function useOrdersWorkspace({
  showToast,
}: {
  showToast: (toast: ToastMessage) => void;
}) {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: queryKeys.orders.workspace(),
    queryFn: fetchOrdersWorkspace,
  });
  const workspace = workspaceQuery.data ?? EMPTY_WORKSPACE;

  useEffect(() => {
    if (!workspaceQuery.error) return;
    console.error("[ADMIN] service_orders load error:", workspaceQuery.error);
    showToast({
      msg: `Erro ao carregar OS: ${
        workspaceQuery.error instanceof Error
          ? workspaceQuery.error.message
          : String(workspaceQuery.error)
      }`,
      type: "error",
    });
  }, [showToast, workspaceQuery.error]);

  const setCollection = useCallback(
    (
      key: "orders" | "equipmentTypes" | "equipmentBrands" | "equipmentModels",
      next: SetStateAction<any[]>,
    ) => {
      queryClient.setQueryData<OrdersWorkspace>(
        queryKeys.orders.workspace(),
        (current) => {
          if (!current) return current;
          const value = typeof next === "function" ? next(current[key]) : next;
          return { ...current, [key]: value };
        },
      );
    },
    [queryClient],
  );

  const setOrders: Dispatch<SetStateAction<any[]>> = useCallback(
    (next) => setCollection("orders", next),
    [setCollection],
  );
  const setEquipmentTypes: Dispatch<SetStateAction<any[]>> = useCallback(
    (next) => setCollection("equipmentTypes", next),
    [setCollection],
  );
  const setEquipmentBrands: Dispatch<SetStateAction<any[]>> = useCallback(
    (next) => setCollection("equipmentBrands", next),
    [setCollection],
  );
  const setEquipmentModels: Dispatch<SetStateAction<any[]>> = useCallback(
    (next) => setCollection("equipmentModels", next),
    [setCollection],
  );

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
    setOrders,
    setEquipmentTypes,
    setEquipmentBrands,
    setEquipmentModels,
    loading: workspaceQuery.isPending,
    reloadWorkspace,
  };
}
