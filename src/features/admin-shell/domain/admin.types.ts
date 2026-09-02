export type AdminTab =
  | "dashboard" | "services" | "categories" | "products" | "brands" | "siteSettings"
  | "equipment" | "generalServices" | "serviceTypes" | "inventory" | "situations" | "orderStatuses"
  | "quotes" | "orders" | "agenda" | "customers" | "inventory" | "documents" | "site" | "operation" | "employees" | "settings" | "contact";

export type AdminPageState = {
  breadcrumb: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
} | null;
