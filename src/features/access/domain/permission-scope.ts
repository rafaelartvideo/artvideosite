export type PermissionScopeContext = {
  isPlatformOperator: boolean;
  isArtvideoTenant: boolean;
  enabledModules: ReadonlySet<string>;
};

const PLATFORM_SHARED_PREFIXES = [
  "dashboard.",
  "customers.",
  "employees.",
  "roles.",
  "users.",
  "settings.",
  "field_tracking.",
  "tools.",
  "queue.",
  "pbx.",
  "marketplace.",
  "ai.",
  "sac_digital.",
] as const;

const SITE_MODULES = ["site_categories", "site_brands", "site_services", "site_settings"] as const;
const OPERATION_MODULES = [
  "customers",
  "orders",
  "agenda",
  "inventory",
  "products",
  "equipment",
  "checklists",
  "services",
  "service_types",
  "order_situations",
  "order_statuses",
  "documents",
  "quotes",
  "employees",
  "company_settings",
  "finance",
  "pdv",
] as const;
const TOOL_MODULES = ["field_tracking", "queue", "pbx", "marketplace", "ai", "sac_digital"] as const;

export function isPlatformOnlyPermissionKey(key: string) {
  return (
    (key.startsWith("organizations.") && key !== "organizations.audit.view")
    || key.startsWith("integrations.")
    || key.startsWith("audit.")
    || key.startsWith("orders.monitor.")
    || key.startsWith("platform.")
  );
}

export function isPlatformSharedPermissionKey(key: string) {
  return key === "organizations.audit.view"
    || PLATFORM_SHARED_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function isArtvideoOnlyPermissionKey(key: string) {
  return key.startsWith("products.")
    || key.startsWith("categories.")
    || key.startsWith("brands.")
    || key.startsWith("services.")
    || key.startsWith("filters.")
    || key.startsWith("site.")
    || key.startsWith("site_settings.")
    || key.startsWith("contact.")
    || key === "tools.sac_digital.use"
    || key === "tools.uniq.use";
}

function requiredModuleKeys(key: string): readonly string[] | null {
  if (key === "organizations.audit.view") return null;

  if (key.startsWith("dashboard.")) return ["dashboard"];
  if (key.startsWith("customers.") || key.startsWith("registrations.")) return ["customers"];
  if (key.startsWith("employees.") || key.startsWith("roles.") || key.startsWith("users.")) return ["employees"];
  if (key.startsWith("agenda.")) return ["agenda"];
  if (key.startsWith("field_tracking.")) return ["field_tracking"];
  if (key.startsWith("inventory.") || key.startsWith("products.")) return ["inventory", "products"];
  if (key.startsWith("pdv.")) return ["pdv"];
  if (key.startsWith("finance.")) return ["finance"];
  if (key.startsWith("equipment.")) return ["equipment"];
  if (key.startsWith("checklists.")) return ["checklists"];
  if (key.startsWith("general_services.")) return ["services"];
  if (key.startsWith("service_types.")) return ["service_types"];
  if (key.startsWith("situations.")) return ["order_situations"];
  if (key.startsWith("order_statuses.")) return ["order_statuses"];
  if (key.startsWith("documents.")) return ["documents"];
  if (key.startsWith("quotes.")) return ["quotes"];
  if (key.startsWith("settings.") || key.startsWith("terms.")) return ["company_settings"];

  if (key.startsWith("categories.")) return ["site_categories"];
  if (key.startsWith("brands.")) return ["site_brands"];
  if (key.startsWith("services.") || key.startsWith("filters.")) return ["site_services"];
  if (key.startsWith("site_settings.") || key.startsWith("contact.")) return ["site_settings"];
  if (key.startsWith("site.")) return SITE_MODULES;

  if (key === "tools.view") return TOOL_MODULES;
  if (key === "tools.sac_digital.use" || key === "tools.uniq.use") return null;
  if (key.startsWith("queue.")) return ["queue"];
  if (key.startsWith("pbx.")) return ["pbx"];
  if (key.startsWith("marketplace.")) return ["marketplace"];
  if (key.startsWith("ai.")) return ["ai"];
  if (key.startsWith("sac_digital.")) return ["sac_digital"];

  if (key.startsWith("operation.")) return OPERATION_MODULES;

  const prefix = key.split(".")[0];
  return prefix ? [prefix] : [];
}

export function isPermissionVisibleForOrganization(
  key: string,
  context: PermissionScopeContext,
) {
  if (context.isPlatformOperator) {
    return isPlatformOnlyPermissionKey(key) || isPlatformSharedPermissionKey(key);
  }

  if (isPlatformOnlyPermissionKey(key)) return false;
  if (isArtvideoOnlyPermissionKey(key) && !context.isArtvideoTenant) return false;

  const requiredModules = requiredModuleKeys(key);
  if (requiredModules === null) return true;
  if (requiredModules.length === 0) return false;

  return requiredModules.some(moduleKey => context.enabledModules.has(moduleKey));
}

export function filterPermissionsForOrganization<T extends { key?: string | null }>(
  permissions: T[],
  context: PermissionScopeContext,
) {
  return permissions.filter(permission =>
    isPermissionVisibleForOrganization(String(permission.key || ""), context),
  );
}
