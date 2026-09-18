export type AdminTab =
  | "dashboard" | "services" | "categories" | "products" | "brands" | "siteSettings"
  | "equipment" | "checklists" | "generalServices" | "serviceTypes" | "inventory" | "finance" | "situations" | "orderStatuses"
  | "quotes" | "orders" | "agenda" | "customers" | "documents" | "site" | "operation" | "roles" | "partnerCompanies" | "settings" | "contact";

export type AdminPageState = {
  breadcrumb: string;
  title: string;
  subtitle?: string;
  titleVariant?: "default" | "order-number";
  onBack: () => void;
} | null;
