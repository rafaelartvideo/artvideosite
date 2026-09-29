import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { loadOrdersReferenceData } from "../infrastructure/orders-workspace.repository";
import type { ServiceOrderPage } from "../infrastructure/orders-list.repository";

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
  const reference = await loadOrdersReferenceData(organizationId);
  return {
    orders: [],
    statuses: reference.statuses,
    situations: reference.situations,
    profiles: reference.employees
      .filter((employee: any) => Boolean(employee.profile_id))
      .map((employee: any) => ({ id: employee.profile_id, full_name: employee.full_name })),
    services: reference.services,
    brands: reference.brands,
    products: reference.products,
    equipmentTypes: reference.equipmentTypes,
    equipmentBrands: reference.equipmentBrands,
    equipmentModels: reference.equipmentModels,
    technicalFields: reference.technicalFields,
    technicalFieldLinks: reference.technicalFieldLinks,
    employees: reference.employees.filter((employee: any) => employee.is_active),
    generalServices: reference.generalServices,
    serviceTypes: reference.serviceTypes,
    serviceTypeSituations: reference.serviceTypeSituations,
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
    staleTime: 30 * 60_000,
    queryFn: () => fetchOrdersWorkspace(organizationId!),
  });
  const workspace = workspaceQuery.data ?? EMPTY_WORKSPACE;

  useEffect(() => {
    if (!workspaceQuery.error) return;
    console.error("[ADMIN] OS reference data load error:", workspaceQuery.error);
    showToast({ msg: `Erro ao carregar dados da OS: ${systemErrorMessage(workspaceQuery.error)}`, type: "error" });
  }, [showToast, workspaceQuery.error]);

  const setCollection = useCallback((key: "equipmentTypes" | "equipmentBrands" | "equipmentModels", next: SetStateAction<any[]>) => {
    queryClient.setQueryData<OrdersWorkspace>(workspaceKey, current => {
      if (!current) return current;
      const value = typeof next === "function" ? next(current[key]) : next;
      return { ...current, [key]: value };
    });
  }, [queryClient, workspaceKey]);

  const setOrders: Dispatch<SetStateAction<any[]>> = useCallback(next => {
    queryClient.setQueriesData<ServiceOrderPage>({ queryKey: queryKeys.orders.lists() }, current => {
      if (!current) return current;
      const items = typeof next === "function" ? next(current.items) : next;
      return { ...current, items };
    });
  }, [queryClient]);
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
