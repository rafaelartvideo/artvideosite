export type AdminTab =
  | "dashboard" | "services" | "categories" | "products" | "brands" | "siteSettings"
  | "equipment" | "generalServices" | "serviceTypes" | "inventory" | "situations" | "orderStatuses"
  | "quotes" | "orders" | "agenda" | "customers" | "documents" | "site" | "operation" | "roles" | "partnerCompanies" | "settings" | "contact";

export type AdminPageState = {
  breadcrumb: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
} | null;
