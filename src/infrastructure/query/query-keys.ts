export const queryKeys = {
  publicSite: {
    all: ["public-site"] as const,
    settings: () => ["public-site", "settings"] as const,
    services: () => ["public-site", "services"] as const,
    serviceById: (serviceId: string) => ["public-site", "services", "id", serviceId] as const,
    service: (slug: string) => ["public-site", "services", slug] as const,
    categories: () => ["public-site", "categories"] as const,
    products: () => ["public-site", "products"] as const,
    featuredProducts: () => ["public-site", "products", "featured"] as const,
    product: (slug: string) => ["public-site", "products", slug] as const,
    brands: () => ["public-site", "brands"] as const,
    media: (mediaId: string) => ["public-site", "media", mediaId] as const,
  },
  admin: {
    all: ["admin"] as const,
    dashboard: (periodDays = 30, accessScope = "default") => ["admin", "dashboard", periodDays, accessScope] as const,
  },
  customers: {
    all: ["customers"] as const,
    lists: () => ["customers", "list"] as const,
    history: (customerId: string) => ["customers", "history", customerId] as const,
  },
  equipment: {
    all: ["equipment"] as const,
    catalog: () => ["equipment", "catalog"] as const,
    technicalFields: (equipmentTypeId: string) => ["equipment", "technical-fields", equipmentTypeId] as const,
  },
  generalServices: {
    all: ["general-services"] as const,
    lists: () => ["general-services", "list"] as const,
  },
  serviceTypes: {
    all: ["service-types"] as const,
    configuration: () => ["service-types", "configuration"] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    lists: () => ["inventory", "list"] as const,
    active: () => ["inventory", "active"] as const,
    movements: (itemId: string) => ["inventory", "movements", itemId] as const,
  },
  appointments: {
    all: ["appointments"] as const,
    lists: () => ["appointments", "list"] as const,
    list: (scope: { userId: string | null; canViewOtherAgendas: boolean }) =>
      ["appointments", "list", scope] as const,
  },
  quotes: {
    all: ["quotes"] as const,
    lists: () => ["quotes", "list"] as const,
  },
  employees: {
    all: ["employees"] as const,
    lists: () => ["employees", "list"] as const,
    roles: () => ["employees", "roles"] as const,
  },
  catalog: {
    all: ["catalog"] as const,
    services: () => ["catalog", "services"] as const,
    products: () => ["catalog", "products"] as const,
    brands: () => ["catalog", "brands"] as const,
    categories: () => ["catalog", "categories"] as const,
  },
  orderSituations: {
    all: ["order-situations"] as const,
    lists: () => ["order-situations", "list"] as const,
  },
  orderStatuses: {
    all: ["order-statuses"] as const,
    lists: () => ["order-statuses", "list"] as const,
  },
  orders: {
    all: ["orders"] as const,
    workspace: () => ["orders", "workspace"] as const,
    lists: () => ["orders", "list"] as const,
    list: (filters: Record<string, unknown>) => ["orders", "list", filters] as const,
    details: () => ["orders", "detail"] as const,
    detail: (orderId: string) => ["orders", "detail", orderId] as const,
    partRequests: (orderId: string) => ["orders", "part-requests", orderId] as const,
    media: (orderId: string) => ["orders", "media", orderId] as const,
  },
} as const;
