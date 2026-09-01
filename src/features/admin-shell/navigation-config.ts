import {
  Activity,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  FileText,
  FolderTree,
  LayoutDashboard,
  List,
  Package,
  Phone,
  Settings,
  Tag,
  Users,
  Wrench,
} from "lucide-react";
import type { AdminTab } from "./domain/admin.types";
import type { AdminHubItem, AdminNavigationItem } from "./presentation/AdminNavigation";

type PermissionAwareHubItem = AdminHubItem & {
  permissionKey: string;
};

export const mainItems: AdminNavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quotes", label: "Orçamentos", icon: FileText },
  { id: "orders", label: "Ordens de Serviço", icon: ClipboardList },
  { id: "customers", label: "Clientes", icon: Users },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "inventory", label: "Estoque", icon: Package },
  { id: "documents", label: "Documentos", icon: FileText },
];

export const siteItems: PermissionAwareHubItem[] = [
  { id: "products", label: "Produtos", icon: Package, description: "Cadastre e gerencie os produtos exibidos na loja online.", permissionKey: "products.view" },
  { id: "categories", label: "Categorias", icon: FolderTree, description: "Organize as categorias utilizadas pelos produtos do site.", permissionKey: "categories.view" },
  { id: "brands", label: "Marcas", icon: Tag, description: "Gerencie as marcas utilizadas no catálogo da loja.", permissionKey: "brands.view" },
  { id: "services", label: "Serviços do Site", icon: Wrench, description: "Cadastre e gerencie os serviços apresentados no site público.", permissionKey: "services.view" },
];

export const operationItems: PermissionAwareHubItem[] = [
  { id: "equipment", label: "Equipamentos", icon: Wrench, description: "Cadastre equipamentos, marcas e modelos técnicos.", permissionKey: "equipment.view" },
  { id: "generalServices", label: "Serviços Gerais", icon: ClipboardList, description: "Cadastre os serviços internos da assistência técnica.", permissionKey: "general_services.view" },
  { id: "serviceTypes", label: "Tipos de Atendimento", icon: List, description: "Configure tipos e previsão de atendimento das OS.", permissionKey: "service_types.view" },
  { id: "situations", label: "Situações da OS", icon: Activity, description: "Gerencie as situações disponíveis para as OS.", permissionKey: "orders.view" },
  { id: "orderStatuses", label: "Status da OS", icon: CheckCircle, description: "Gerencie os status do fluxo das ordens de serviço.", permissionKey: "orders.view" },
  { id: "employees", label: "Equipes / Funcionários", icon: Users, description: "Cadastre funcionários, técnicos e gestores da equipe.", permissionKey: "employees.view" },
];

export const utilityItems: AdminNavigationItem[] = [
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "contact", label: "Contato", icon: Phone },
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
  situations: "orders.view",
  orderStatuses: "orders.view",
  employees: "employees.view",
  settings: "settings.view",
  contact: "contact.view",
  site: "site.view",
  operation: "orders.view",
};
