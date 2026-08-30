export const queryKeys = {
  publicSite: {
    all: ["public-site"] as const,
    settings: () => ["public-site", "settings"] as const,
    services: () => ["public-site", "services"] as const,
    service: (slug: string) => ["public-site", "services", slug] as const,
    categories: () => ["public-site", "categories"] as const,
    products: () => ["public-site", "products"] as const,
    product: (slug: string) => ["public-site", "products", slug] as const,
    brands: () => ["public-site", "brands"] as const,
  },
  admin: {
    all: ["admin"] as const,
    dashboard: () => ["admin", "dashboard"] as const,
  },
  customers: {
    all: ["customers"] as const,
    lists: () => ["customers", "list"] as const,
    history: (customerId: string) => ["customers", "history", customerId] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    lists: () => ["inventory", "list"] as const,
    movements: (itemId: string) => ["inventory", "movements", itemId] as const,
  },
  appointments: {
    all: ["appointments"] as const,
    lists: () => ["appointments", "list"] as const,
  },
  orders: {
    all: ["orders"] as const,
    workspace: () => ["orders", "workspace"] as const,
    lists: () => ["orders", "list"] as const,
    list: (filters: Record<string, unknown>) => ["orders", "list", filters] as const,
    details: () => ["orders", "detail"] as const,
    detail: (orderId: string) => ["orders", "detail", orderId] as const,
  },
} as const;
