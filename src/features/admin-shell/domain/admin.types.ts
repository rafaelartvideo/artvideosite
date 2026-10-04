export type AdminTab =
  | "dashboard" | "services" | "categories" | "products" | "brands" | "siteSettings"
  | "equipment" | "checklists" | "generalServices" | "serviceTypes" | "inventory" | "pdv" | "finance" | "situations" | "orderStatuses"
  | "crm" | "quotes" | "orders" | "agenda" | "fieldTracking" | "customers" | "documents" | "site" | "operation" | "tools" | "roles" | "partnerCompanies" | "audit" | "settings" | "terms" | "contact";

export type AdminPageState = {
  breadcrumb: string;
  title: string;
  subtitle?: string;
  titleVariant?: "default" | "order-number";
  onBack: () => void;
} | null;
