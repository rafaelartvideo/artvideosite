import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderTree,
  LayoutDashboard,
  List,
  Package,
  Phone,
  Settings,
  ShieldCheck,
  Tag,
  Users,
  Wrench,
} from "lucide-react";
import type { AdminTab } from "./domain/admin.types";
import type { AdminHubItem, AdminNavigationItem } from "./presentation/AdminNavigation";

type PermissionAwareHubItem = AdminHubItem & { permissionKey: string };

export const mainItems: AdminNavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quotes", label: "Orçamentos", icon: FileText },
  { id: "orders", label: "Ordens de Serviço", icon: ClipboardList },
  { id: "customers", label: "Cadastros", icon: Users },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "inventory", label: "Estoque", icon: Package },
  { id: "partnerCompanies", label: "Empresas Parceiras", icon: Building2 },
];

export const siteItems: PermissionAwareHubItem[] = [
  { id: "products", label: "Produtos", icon: Package, description: "Cadastre e gerencie os produtos exibidos na loja online.", permissionKey: "products.view" },
  { id: "categories", label: "Categorias", icon: FolderTree, description: "Organize as categorias utilizadas pelos produtos do site.", permissionKey: "categories.view" },
  { id: "brands", label: "Marcas", icon: Tag, description: "Gerencie as marcas utilizadas no catálogo da loja.", permissionKey: "brands.view" },
  { id: "services", label: "Serviços do Site", icon: Wrench, description: "Cadastre e gerencie os serviços apresentados no site público.", permissionKey: "services.view" },
  { id: "siteSettings", label: "Configurações do Site", icon: Settings, description: "Gerencie identidade visual e conteúdo do site público.", permissionKey: "site_settings.view" },
  { id: "contact", label: "Contato", icon: Phone, description: "Configure telefones, WhatsApp, e-mail, endereço, redes sociais e horário exibidos no site.", permissionKey: "contact.view" },
];

export const operationItems: PermissionAwareHubItem[] = [
  { id: "equipment", label: "Equipamentos", icon: Wrench, description: "Cadastre equipamentos, marcas e modelos técnicos.", permissionKey: "equipment.view" },
  { id: "generalServices", label: "Serviços Gerais", icon: ClipboardList, description: "Cadastre os serviços internos da assistência técnica.", permissionKey: "general_services.view" },
  { id: "serviceTypes", label: "Tipos de Atendimento", icon: List, description: "Configure tipos e previsão de atendimento das OS.", permissionKey: "service_types.view" },
  { id: "situations", label: "Situações da OS", icon: Activity, description: "Gerencie as situações disponíveis para as OS.", permissionKey: "situations.view" },
  { id: "roles", label: "Funções e Permissões", icon: ShieldCheck, description: "Configure funções e os acessos herdados pelos usuários da empresa.", permissionKey: "roles.view" },
  { id: "documents", label: "Documentos", icon: FileText, description: "Configure modelos de impressão e tipos de anexos das ordens de serviço.", permissionKey: "documents.view" },
];

export const utilityItems: AdminNavigationItem[] = [
  { id: "settings", label: "Configurações", icon: Settings },
];

export const permissionForTab: Record<AdminTab, string> = {
  dashboard: "dashboard.view",
  quotes: "quotes.view",
  orders: "orders.view",
  customers: "customers.view",
  agenda: "agenda.view",
  products: "products.view",
  categories: "categories.view",
  brands: "brands.view",
  services: "services.view",
  equipment: "equipment.view",
  generalServices: "general_services.view",
  serviceTypes: "service_types.view",
  inventory: "inventory.view",
  documents: "documents.view",
  situations: "situations.view",
  orderStatuses: "order_statuses.view",
  roles: "roles.view",
  partnerCompanies: "organizations.view",
  settings: "settings.view",
  siteSettings: "site_settings.view",
  contact: "contact.view",
  site: "site.view",
  operation: "operation.view",
};

export const moduleForTab: Record<AdminTab, string | null> = {
  dashboard: "dashboard",
  quotes: "quotes",
  orders: "orders",
  customers: "customers",
  agenda: "agenda",
  inventory: "inventory",
  equipment: "equipment",
  generalServices: "services",
  serviceTypes: "service_types",
  situations: "order_situations",
  orderStatuses: "order_statuses",
  roles: "employees",
  documents: "documents",
  partnerCompanies: null,
  settings: "company_settings",
  contact: "site_settings",
  products: "site_products",
  categories: "site_categories",
  brands: "site_brands",
  services: "site_services",
  siteSettings: "site_settings",
  site: null,
  operation: null,
};

export const siteModuleKeys = [
  "site_products",
  "site_categories",
  "site_brands",
  "site_services",
  "site_settings",
] as const;

export const operationModuleKeys = [
  "customers",
  "orders",
  "agenda",
  "inventory",
  "equipment",
  "services",
  "service_types",
  "order_situations",
  "documents",
  "quotes",
  "employees",
] as const;

export function isAdminModuleEnabled(
  tab: AdminTab,
  hasModule: (moduleKey: string) => boolean,
) {
  if (tab === "site") return siteModuleKeys.some(hasModule);
  if (tab === "operation") return operationModuleKeys.some(hasModule);
  if (tab === "customers") return hasModule("customers") || hasModule("employees");
  const moduleKey = moduleForTab[tab];
  return moduleKey ? hasModule(moduleKey) : true;
}
