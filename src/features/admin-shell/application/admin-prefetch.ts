/**
 * Apenas antecipa o download de código dos módulos mais usados.
 * Não chama Supabase e não inicia consultas de dados.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  home: () => import("@/features/admin-home/presentation/AdminHomePage"),
  dashboard: () => import("@/features/dashboard/presentation/TabDashboard"),
  orders: () => import("@/features/orders/presentation/TabOrders"),
  customers: () => import("@/features/customers/presentation/TabCustomers"),
  agenda: () => import("@/features/appointments/presentation/TabAgenda"),
  inventory: () => import("@/features/inventory/presentation/TabInventory"),
  pdv: () => import("@/features/pdv/presentation/TabPdv"),
  finance: () => import("@/features/finance/presentation/TabFinance"),
  quotes: () => import("@/features/quotes/presentation/TabQuotes"),
  equipment: () => import("@/features/equipment/presentation/EquipmentAdminPanel"),
  checklists: () => import("@/features/checklists/presentation/ChecklistAdminPanel"),
  documents: () => import("@/features/documents/presentation/TabDocuments"),
  services: () => import("@/features/services/presentation/TabServices"),
  products: () => import("@/features/inventory/presentation/TabInventory"),
  brands: () => import("@/features/brands/presentation/TabBrands"),
  categories: () => import("@/features/categories/presentation/TabCategories"),
  serviceTypes: () => import("@/features/service-types/presentation/ServiceTypesAdminPanel"),
  situations: () => import("@/features/order-situations/presentation/OSSituationsView"),
  orderStatuses: () => import("@/features/order-statuses/presentation/OrderStatusesAdminPanel"),
  generalServices: () => import("@/features/general-services/presentation/GeneralServicesPanel"),
  roles: () => import("@/features/roles/presentation/TabRoles"),
  audit: () => import("@/features/audit/presentation/TabAuditLog"),
};

const pending = new Map<string, Promise<unknown>>();

export function prefetchAdminModule(moduleKey: string) {
  const loader = loaders[moduleKey];
  if (!loader || pending.has(moduleKey)) return;
  // Em caso de falha de rede, permitir nova tentativa no próximo hover.
  const task = loader().catch(() => {
    pending.delete(moduleKey);
  });
  pending.set(moduleKey, task);
}
