export type PermissionRecord = {
  id: string;
  key: string;
  label?: string | null;
  description?: string | null;
  module_name?: string | null;
  sort_order?: number | null;
};

export type PermissionSectionGroup = {
  name: string;
  permissions: PermissionRecord[];
};

export type PermissionModuleGroup = {
  name: string;
  sections: PermissionSectionGroup[];
  permissions: PermissionRecord[];
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  site: "Site",
  operation: "Operação",
  quotes: "Orçamentos",
  orders: "Ordens de Serviço",
  customers: "Clientes",
  agenda: "Agenda",
  inventory: "Estoque",
  products: "Produtos",
  categories: "Categorias",
  brands: "Marcas",
  services: "Serviços do Site",
  site_settings: "Configurações do Site",
  settings: "Dados da Empresa",
  contact: "Contato",
  equipment: "Equipamentos",
  general_services: "Serviços Gerais",
  service_types: "Tipos de Atendimento",
  situations: "Situações da OS",
  order_statuses: "Status da OS",
  employees: "Usuários",
  roles: "Funções e Permissões",
  documents: "Documentos",
};

const MODULE_ORDER = [
  "Dashboard",
  "Site",
  "Produtos",
  "Categorias",
  "Marcas",
  "Serviços do Site",
  "Configurações do Site",
  "Operação",
  "Ordens de Serviço",
  "Clientes",
  "Orçamentos",
  "Agenda",
  "Estoque",
  "Equipamentos",
  "Serviços Gerais",
  "Tipos de Atendimento",
  "Situações da OS",
  "Status da OS",
  "Usuários",
  "Funções e Permissões",
  "Documentos",
  "Dados da Empresa",
  "Contato",
];

const SECTION_ORDER = [
  "Acesso",
  "Tabela",
  "Detalhes",
  "Ações",
  "Fluxo da OS",
  "Peças",
  "Histórico",
  "Documentos e Imagens",
  "SLA",
  "Movimentações",
  "Campos Técnicos",
  "Impressão / Modelos",
  "Tipos de Anexo",
  "Calendário",
  "Endereços",
  "Conteúdo",
  "Publicação",
  "Outros",
];

const ORDER_PART_KEYS = new Set([
  "orders.request_parts",
  "orders.manage_part_requests",
  "orders.dispatch_parts",
  "orders.confirm_part_delivery",
  "orders.register_part_return",
  "orders.receive_returned_parts",
  "orders.record_test_results",
]);

const ORDER_FLOW_KEYS = new Set([
  "orders.create",
  "orders.edit",
  "orders.update",
  "orders.delete",
  "orders.view_all",
  "orders.status",
  "orders.status.change",
  "orders.situation.change",
  "orders.solve",
  "orders.complete",
]);

const ACTION_SUFFIXES = [
  ".create",
  ".edit",
  ".update",
  ".delete",
  ".toggle_active",
  ".toggle_featured",
  ".status.change",
  ".refresh",
  ".convert_to_order",
];

export function permissionModuleName(permission: PermissionRecord) {
  const prefix = String(permission.key || "").split(".")[0];
  if (MODULE_LABELS[prefix]) return MODULE_LABELS[prefix];
  const stored = String(permission.module_name || "").split("—")[0].trim();
  return stored || "Outros";
}

export function permissionSectionName(permission: PermissionRecord) {
  const key = String(permission.key || "");
  const module = key.split(".")[0];

  if (key.includes(".table.")) return "Tabela";
  if (key.includes(".details.")) return "Detalhes";

  if (module === "orders") {
    if (key === "orders.view") return "Acesso";
    if (key.startsWith("orders.section.sla") || key === "orders.section.sla_cards") return "SLA";
    if (ORDER_PART_KEYS.has(key) || key === "orders.section.parts") return "Peças";
    if (key.startsWith("orders.history.") || key === "orders.section.history") return "Histórico";
    if (key.includes("image") || key.includes("media") || key.includes("document") || /^orders\.situation\..+\.upload$/.test(key)) return "Documentos e Imagens";
    if (key.startsWith("orders.section.")) return "Detalhes";
    if (ORDER_FLOW_KEYS.has(key)) return "Fluxo da OS";
    return key.endsWith(".view") ? "Acesso" : "Ações";
  }

  if (module === "documents") {
    if (key.startsWith("documents.attachment_types.")) return "Tipos de Anexo";
    return "Impressão / Modelos";
  }

  if (module === "inventory") {
    if (key.includes("movement")) return "Movimentações";
  }

  if (module === "equipment") {
    if (key.includes("technical_field")) return "Campos Técnicos";
  }

  if (module === "agenda") {
    if (key.includes("calendar")) return "Calendário";
    if (key.includes("details")) return "Detalhes";
  }

  if (module === "customers" && key.includes("address")) return "Endereços";

  if (module === "services") {
    if (key.includes("variant") || key.includes("faq") || key.includes("feature") || key.includes("section") || key.includes("factor") || key.includes("media")) return "Conteúdo";
    if (key.includes("publish") || key.includes("toggle_active")) return "Publicação";
  }

  if (key.endsWith(".view")) return "Acesso";
  if (ACTION_SUFFIXES.some(suffix => key.endsWith(suffix))) return "Ações";
  return "Outros";
}

export function buildPermissionGroups(permissions: PermissionRecord[]) {
  const modules = new Map<string, PermissionRecord[]>();
  permissions.forEach(permission => {
    const moduleName = permissionModuleName(permission);
    const list = modules.get(moduleName) || [];
    list.push(permission);
    modules.set(moduleName, list);
  });

  return Array.from(modules.entries())
    .map(([name, modulePermissions]): PermissionModuleGroup => {
      const sections = new Map<string, PermissionRecord[]>();
      modulePermissions.forEach(permission => {
        const sectionName = permissionSectionName(permission);
        const list = sections.get(sectionName) || [];
        list.push(permission);
        sections.set(sectionName, list);
      });
      return {
        name,
        permissions: modulePermissions,
        sections: Array.from(sections.entries())
          .map(([sectionName, sectionPermissions]) => ({
            name: sectionName,
            permissions: [...sectionPermissions].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || String(left.label || left.key).localeCompare(String(right.label || right.key), "pt-BR")),
          }))
          .sort((left, right) => {
            const li = SECTION_ORDER.indexOf(left.name);
            const ri = SECTION_ORDER.indexOf(right.name);
            return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri) || left.name.localeCompare(right.name, "pt-BR");
          }),
      };
    })
    .sort((left, right) => {
      const li = MODULE_ORDER.indexOf(left.name);
      const ri = MODULE_ORDER.indexOf(right.name);
      return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri) || left.name.localeCompare(right.name, "pt-BR");
    });
}

const EXPLICIT_DEPENDENCIES: Record<string, string[]> = {
  "orders.view_all": ["orders.view"],
  "orders.table.view": ["orders.view"],
  "orders.details.view": ["orders.view"],
  "orders.status.change": ["orders.edit", "orders.view"],
  "orders.situation.change": ["orders.edit", "orders.view"],
  "orders.request_parts": ["orders.section.parts", "orders.view"],
  "orders.manage_part_requests": ["orders.section.parts", "orders.view_all", "orders.view"],
  "orders.dispatch_parts": ["orders.section.parts", "orders.view"],
  "orders.confirm_part_delivery": ["orders.section.parts", "orders.view"],
  "orders.register_part_return": ["orders.section.parts", "orders.view"],
  "orders.receive_returned_parts": ["orders.section.parts", "orders.view"],
  "orders.record_test_results": ["orders.section.parts", "orders.view"],
  "orders.history.create": ["orders.section.history", "orders.details.view", "orders.view"],
  "inventory.movements.view": ["inventory.view"],
  "inventory.movements.create": ["inventory.update", "inventory.view"],
  "inventory.toggle_active": ["inventory.update", "inventory.view"],
  "products.toggle_active": ["products.update", "products.view"],
  "products.toggle_featured": ["products.update", "products.view"],
  "categories.toggle_active": ["categories.update", "categories.view"],
  "brands.toggle_active": ["brands.update", "brands.view"],
  "general_services.toggle_active": ["general_services.edit", "general_services.view"],
  "service_types.toggle_active": ["service_types.edit", "service_types.view"],
  "service_types.sla.manage": ["service_types.edit", "service_types.view"],
  "employees.toggle_active": ["employees.edit", "employees.view"],
  "quotes.status.change": ["quotes.edit", "quotes.view"],
  "quotes.convert_to_order": ["quotes.view", "orders.create"],
  "agenda.create": ["agenda.view"],
  "agenda.edit": ["agenda.view"],
  "agenda.reschedule": ["agenda.edit", "agenda.view"],
  "situations.table.view": ["situations.view"],
  "situations.create": ["situations.view"],
  "situations.edit": ["situations.view"],
  "situations.delete": ["situations.view"],
  "order_statuses.table.view": ["order_statuses.view"],
  "order_statuses.create": ["order_statuses.view"],
  "order_statuses.edit": ["order_statuses.view"],
  "order_statuses.delete": ["order_statuses.view"],
  "site_settings.update": ["site_settings.view"],
};

export function permissionDependencies(key: string) {
  const dependencies = new Set(EXPLICIT_DEPENDENCIES[key] || []);
  const module = key.split(".")[0];

  if (key.includes(".table.") && key !== `${module}.table.view`) {
    dependencies.add(`${module}.table.view`);
    dependencies.add(`${module}.view`);
  }
  if (key.includes(".details.") && key !== `${module}.details.view`) {
    dependencies.add(`${module}.details.view`);
    dependencies.add(`${module}.view`);
  }
  if (key.startsWith("orders.section.")) {
    dependencies.add("orders.details.view");
    dependencies.add("orders.view");
  }

  return Array.from(dependencies);
}

export function permissionLabel(permission: PermissionRecord) {
  return String(permission.label || permission.description || permission.key);
}
