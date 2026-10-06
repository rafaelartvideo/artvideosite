import { matchPath } from "react-router";
import type { AdminTab } from "./domain/admin.types";

export type AdminRouteParts = {
  tab: AdminTab;
  resourceId: string | null;
  subpage: string | null;
};

export const ADMIN_TAB_PATHS: Record<AdminTab, string> = {
  home: "/admin",
  dashboard: "/admin/dashboard",
  crm: "/admin/crm",
  announcements: "/admin/announcements",
  quotes: "/admin/quotes",
  orders: "/admin/orders",
  agenda: "/admin/agenda",
  fieldTracking: "/admin/field-map",
  customers: "/admin/customers",
  inventory: "/admin/inventory",
  finance: "/admin/finance",
  documents: "/admin/operation/documents",
  partnerCompanies: "/admin/partner-companies",
  audit: "/admin/audit",
  site: "/admin/site",
  services: "/admin/site/services",
  categories: "/admin/site/categories",
  products: "/admin/products",
  pdv: "/admin/pdv",
  brands: "/admin/site/brands",
  operation: "/admin/operation",
  tools: "/admin/tools",
  equipment: "/admin/operation/equipment",
  checklists: "/admin/operation/checklists",
  generalServices: "/admin/operation/general-services",
  serviceTypes: "/admin/operation/service-types",
  situations: "/admin/operation/order-situations",
  orderStatuses: "/admin/operation/order-statuses",
  roles: "/admin/operation/roles",
  siteSettings: "/admin/site/settings",
  settings: "/admin/operation/company",
  integrations: "/admin/operation/integrations",
  planUsage: "/admin/plan-usage",
  terms: "/admin/operation/terms",
  contact: "/admin/contact",
};

const LEGACY_EMPLOYEES_PATH = "/admin/operation/employees";
const LEGACY_PRODUCTS_PATH = "/admin/site/products";
const LEGACY_ROOT_PRODUCTS_PATH = "/admin/products";
const LEGACY_SETTINGS_PATH = "/admin/settings";

const ROUTES_BY_SPECIFICITY = (Object.entries(ADMIN_TAB_PATHS) as Array<[AdminTab, string]>)
  .sort((left, right) => right[1].length - left[1].length);

export function adminPath(tab: AdminTab, resourceId?: string | null, subpage?: string | null) {
  const basePath = ADMIN_TAB_PATHS[tab];
  const segments = [resourceId, subpage]
    .filter((segment): segment is string => Boolean(segment))
    .map(segment => encodeURIComponent(segment));
  return segments.length ? `${basePath}/${segments.join("/")}` : basePath;
}

export function resolveAdminRoute(pathname: string): AdminRouteParts {
  if (pathname === LEGACY_SETTINGS_PATH || matchPath({ path: `${LEGACY_SETTINGS_PATH}/*`, end: false }, pathname)) {
    const remainder = pathname.slice(LEGACY_SETTINGS_PATH.length).replace(/^\/+/, "");
    const segments = remainder ? remainder.split("/").map(segment => decodeURIComponent(segment)) : [];
    return { tab: "settings", resourceId: segments[0] || null, subpage: segments[1] || null };
  }

  if (pathname === LEGACY_EMPLOYEES_PATH || matchPath({ path: `${LEGACY_EMPLOYEES_PATH}/*`, end: false }, pathname)) {
    return { tab: "roles", resourceId: null, subpage: null };
  }

  if (pathname === LEGACY_PRODUCTS_PATH || matchPath({ path: `${LEGACY_PRODUCTS_PATH}/*`, end: false }, pathname)) {
    const remainder = pathname.slice(LEGACY_PRODUCTS_PATH.length).replace(/^\/+/, "");
    const segments = remainder ? remainder.split("/").map(segment => decodeURIComponent(segment)) : [];
    return { tab: "inventory", resourceId: segments[0] || null, subpage: segments[1] || null };
  }

  if (pathname === LEGACY_ROOT_PRODUCTS_PATH || matchPath({ path: `${LEGACY_ROOT_PRODUCTS_PATH}/*`, end: false }, pathname)) {
    const remainder = pathname.slice(LEGACY_ROOT_PRODUCTS_PATH.length).replace(/^\/+/, "");
    const segments = remainder ? remainder.split("/").map(segment => decodeURIComponent(segment)) : [];
    return { tab: "inventory", resourceId: segments[0] || null, subpage: segments[1] || null };
  }

  for (const [tab, basePath] of ROUTES_BY_SPECIFICITY) {
    if (pathname !== basePath && !matchPath({ path: `${basePath}/*`, end: false }, pathname)) continue;
    const remainder = pathname.slice(basePath.length).replace(/^\/+/, "");
    const segments = remainder ? remainder.split("/").map(segment => decodeURIComponent(segment)) : [];
    return { tab, resourceId: segments[0] || null, subpage: segments[1] || null };
  }
  return { tab: "home", resourceId: null, subpage: null };
}

export function resolveAdminTab(pathname: string): AdminTab {
  return resolveAdminRoute(pathname).tab;
}

export function parentAdminTab(tab: AdminTab): AdminTab | null {
  if (["services", "categories", "brands", "siteSettings", "contact"].includes(tab)) return "site";
  if (["documents", "equipment", "checklists", "generalServices", "serviceTypes", "situations", "orderStatuses", "roles", "settings", "integrations", "terms"].includes(tab)) return "operation";
  return null;
}
