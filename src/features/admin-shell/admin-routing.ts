import type { AdminTab } from "./domain/admin.types";

export type AdminRouteState = {
  tab: AdminTab;
  resourceId: string | null;
  subpage: string | null;
};

export const ADMIN_TAB_PATHS: Record<AdminTab, string> = {
  dashboard: "/admin",
  quotes: "/admin/quotes",
  orders: "/admin/orders",
  agenda: "/admin/agenda",
  customers: "/admin/customers",
  inventory: "/admin/inventory",
  documents: "/admin/operation/documents",
  site: "/admin/site",
  services: "/admin/site/services",
  categories: "/admin/site/categories",
  products: "/admin/site/products",
  brands: "/admin/site/brands",
  operation: "/admin/operation",
  equipment: "/admin/operation/equipment",
  generalServices: "/admin/operation/general-services",
  serviceTypes: "/admin/operation/service-types",
  situations: "/admin/operation/order-situations",
  orderStatuses: "/admin/operation/order-statuses",
  employees: "/admin/operation/employees",
  settings: "/admin/site/settings",
  contact: "/admin/contact",
};

const ROUTES_BY_SPECIFICITY = (Object.entries(ADMIN_TAB_PATHS) as Array<[AdminTab, string]>)
  .sort((left, right) => right[1].length - left[1].length);

export function parseAdminPath(pathname: string): AdminRouteState {
  const normalized = pathname.replace(/\/+$/, "") || "/admin";
  for (const [tab, basePath] of ROUTES_BY_SPECIFICITY) {
    if (normalized !== basePath && !normalized.startsWith(`${basePath}/`)) continue;
    const remainder = normalized.slice(basePath.length).replace(/^\/+/, "");
    const segments = remainder ? remainder.split("/").map(segment => decodeURIComponent(segment)) : [];
    return {
      tab,
      resourceId: segments[0] || null,
      subpage: segments[1] || null,
    };
  }
  return { tab: "dashboard", resourceId: null, subpage: null };
}

export function adminPath(tab: AdminTab, resourceId?: string | null, subpage?: string | null) {
  const basePath = ADMIN_TAB_PATHS[tab];
  const segments = [resourceId, subpage].filter((segment): segment is string => Boolean(segment));
  return segments.length ? `${basePath}/${segments.map(encodeURIComponent).join("/")}` : basePath;
}

export function parentAdminTab(tab: AdminTab): AdminTab | null {
  if (["services", "categories", "products", "brands", "settings"].includes(tab)) return "site";
  if (["documents", "equipment", "generalServices", "serviceTypes", "situations", "orderStatuses", "employees"].includes(tab)) return "operation";
  return null;
}
