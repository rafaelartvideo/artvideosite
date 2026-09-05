export type PermissionRecord = {
  id: string;
  key: string;
  label?: string | null;
  description?: string | null;
  module_name?: string | null;
  sort_order?: number | null;
};

export type PermissionSectionGroup = { name: string; permissions: PermissionRecord[] };
export type PermissionModuleGroup = { name: string; sections: PermissionSectionGroup[]; permissions: PermissionRecord[] };

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", site: "Site", operation: "Operação", quotes: "Orçamentos", orders: "Ordens de Serviço",
  customers: "Clientes", agenda: "Agenda", inventory: "Estoque", products: "Produtos", categories: "Categorias",
  brands: "Marcas", services: "Serviços do Site", site_settings: "Configurações do Site", settings: "Dados da Empresa",
  contact: "Contato", equipment: "Equipamentos", general_services: "Serviços Gerais", service_types: "Tipos de Atendimento",
  situations: "Situações da OS", order_statuses: "Status da OS", employees: "Usuários", roles: "Funções e Permissões", documents: "Documentos",
};

const MODULE_ORDER = ["Dashboard", "Site", "Produtos", "Categorias", "Marcas", "Serviços do Site", "Configurações do Site", "Operação", "Ordens de Serviço", "Clientes", "Orçamentos", "Agenda", "Estoque", "Equipamentos", "Serviços Gerais", "Tipos de Atendimento", "Situações da OS", "Status da OS", "Usuários", "Funções e Permissões", "Documentos", "Dados da Empresa", "Contato"];
const SECTION_ORDER = ["Acesso", "Tabela", "Kanban", "Detalhes", "Informações", "Preço", "Ações", "Fluxo da OS", "Peças", "Histórico", "Documentos e Imagens", "SLA", "Movimentações", "Campos Técnicos", "Permissões", "Impressão / Modelos", "Tipos de Anexo", "Calendário", "Endereços", "Conteúdo", "Publicação", "Outros"];

const ORDER_PART_KEYS = new Set(["orders.request_parts", "orders.manage_part_requests", "orders.dispatch_parts", "orders.confirm_part_delivery", "orders.register_part_return", "orders.receive_returned_parts", "orders.record_test_results"]);
const ORDER_FLOW_KEYS = new Set(["orders.create", "orders.edit", "orders.update", "orders.delete", "orders.view_all", "orders.status", "orders.status.change", "orders.situation.change", "orders.solve", "orders.complete"]);
const ACTION_SUFFIXES = [".create", ".edit", ".update", ".delete", ".toggle_active", ".toggle_featured", ".status.change", ".refresh", ".convert_to_order", ".lookup_cnpj"];

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
    if (key.includes(".kanban.")) return "Kanban";
    if (key.startsWith("orders.section.sla") || key === "orders.section.sla_cards") return "SLA";
    if (ORDER_PART_KEYS.has(key) || key === "orders.section.parts") return "Peças";
    if (key.startsWith("orders.history.") || key === "orders.section.history") return "Histórico";
    if (key.includes("image") || key.includes("media") || key.includes("document") || /^orders\.situation\..+\.upload$/.test(key)) return "Documentos e Imagens";
    if (key.startsWith("orders.section.")) return "Detalhes";
    if (ORDER_FLOW_KEYS.has(key)) return "Fluxo da OS";
    return key.endsWith(".view") ? "Acesso" : "Ações";
  }
  if (module === "documents") return key.startsWith("documents.attachment_types.") ? "Tipos de Anexo" : "Impressão / Modelos";
  if (module === "inventory" && key.includes("movement")) return "Movimentações";
  if (module === "equipment" && key.includes("technical_field")) return "Campos Técnicos";
  if (module === "agenda") { if (key.includes("calendar")) return "Calendário"; if (key.includes("details")) return "Detalhes"; }
  if (module === "customers" && key.includes("address")) return "Endereços";
  if (module === "roles" && key.includes("permissions.manage")) return "Permissões";
  if (module === "services") {
    if (key === "services.info.manage") return "Informações";
    if (key === "services.price.manage" || key.includes("variant")) return "Preço";
    if (key.includes("faq") || key.includes("feature") || key.includes("exclusion") || key.includes("section") || key.includes("factor") || key.includes("media")) return "Conteúdo";
    if (key.includes("publication") || key.includes("publish") || key.includes("toggle_active")) return "Publicação";
  }
  if (key.endsWith(".view")) return "Acesso";
  if (ACTION_SUFFIXES.some(suffix => key.endsWith(suffix))) return "Ações";
  return "Outros";
}

export function buildPermissionGroups(permissions: PermissionRecord[]) {
  const modules = new Map<string, PermissionRecord[]>();
  permissions.forEach(permission => { const moduleName = permissionModuleName(permission); modules.set(moduleName, [...(modules.get(moduleName) || []), permission]); });
  return Array.from(modules.entries()).map(([name, modulePermissions]): PermissionModuleGroup => {
    const sections = new Map<string, PermissionRecord[]>();
    modulePermissions.forEach(permission => { const sectionName = permissionSectionName(permission); sections.set(sectionName, [...(sections.get(sectionName) || []), permission]); });
    return { name, permissions: modulePermissions, sections: Array.from(sections.entries()).map(([sectionName, sectionPermissions]) => ({ name: sectionName, permissions: [...sectionPermissions].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.label || a.key).localeCompare(String(b.label || b.key), "pt-BR")) })).sort((a, b) => { const ai = SECTION_ORDER.indexOf(a.name); const bi = SECTION_ORDER.indexOf(b.name); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, "pt-BR"); }) };
  }).sort((a, b) => { const ai = MODULE_ORDER.indexOf(a.name); const bi = MODULE_ORDER.indexOf(b.name); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, "pt-BR"); });
}

const EXPLICIT_DEPENDENCIES: Record<string, string[]> = {
  "orders.view_all": ["orders.view"], "orders.table.view": ["orders.view"], "orders.kanban.view": ["orders.view"], "orders.details.view": ["orders.view"],
  "orders.status.change": ["orders.edit", "orders.view"], "orders.situation.change": ["orders.edit", "orders.view"],
  "orders.request_parts": ["orders.section.parts", "orders.view"], "orders.manage_part_requests": ["orders.section.parts", "orders.view_all", "orders.view"],
  "orders.dispatch_parts": ["orders.section.parts", "orders.view"], "orders.confirm_part_delivery": ["orders.section.parts", "orders.view"],
  "orders.register_part_return": ["orders.section.parts", "orders.view"], "orders.receive_returned_parts": ["orders.section.parts", "orders.view"],
  "orders.record_test_results": ["orders.section.parts", "orders.view"], "orders.history.create": ["orders.section.history", "orders.details.view", "orders.view"],
  "inventory.movements.view": ["inventory.view"], "inventory.movements.create": ["inventory.update", "inventory.view"], "inventory.toggle_active": ["inventory.update", "inventory.view"],
  "products.toggle_active": ["products.update", "products.view"], "products.toggle_featured": ["products.update", "products.view"],
  "categories.toggle_active": ["categories.update", "categories.view"], "brands.toggle_active": ["brands.update", "brands.view"],
  "general_services.toggle_active": ["general_services.edit", "general_services.view"], "service_types.toggle_active": ["service_types.edit", "service_types.view"],
  "service_types.sla.manage": ["service_types.edit", "service_types.view"], "employees.toggle_active": ["employees.edit", "employees.details.view", "employees.view"],
  "quotes.status.change": ["quotes.edit", "quotes.view"], "quotes.convert_to_order": ["quotes.view", "orders.create"],
  "agenda.create": ["agenda.view"], "agenda.reschedule": ["agenda.view"], "agenda.view_others": ["agenda.view"],
  "situations.table.view": ["situations.view"], "situations.create": ["situations.view"], "situations.edit": ["situations.view"], "situations.delete": ["situations.view"],
  "order_statuses.table.view": ["order_statuses.view"], "order_statuses.create": ["order_statuses.view"], "order_statuses.edit": ["order_statuses.view"], "order_statuses.delete": ["order_statuses.view"],
  "site_settings.update": ["site_settings.view"],
  "services.info.manage": ["services.update", "services.details.view", "services.view"], "services.price.manage": ["services.update", "services.details.view", "services.view"],
  "services.media.manage": ["services.update", "services.details.view", "services.view"], "services.variants.manage": ["services.update", "services.details.view", "services.view"],
  "services.features.manage": ["services.update", "services.details.view", "services.view"], "services.exclusions.manage": ["services.update", "services.details.view", "services.view"],
  "services.factors.manage": ["services.update", "services.details.view", "services.view"], "services.faq.manage": ["services.update", "services.details.view", "services.view"],
  "services.sections.manage": ["services.update", "services.details.view", "services.view"], "services.publication.manage": ["services.update", "services.details.view", "services.view"],
  "services.toggle_active": ["services.update", "services.view"],
  "roles.view": ["employees.view"], "roles.permissions.manage": ["roles.edit", "roles.details.view", "roles.view", "employees.view"],
  "settings.lookup_cnpj": ["settings.update", "settings.details.view", "settings.view"],
};

export function permissionDependencies(key: string) {
  const dependencies = new Set(EXPLICIT_DEPENDENCIES[key] || []);
  const module = key.split(".")[0];
  const isModuleView = key === `${module}.view`;

  // Colunas não reativam a tabela. Assim é possível manter a configuração das
  // colunas e desligar apenas a visualização da tabela inteira.
  const isTableColumn = key.includes(".table.") && key !== `${module}.table.view`;
  if (key.includes(".details.") && key !== `${module}.details.view`) dependencies.add(`${module}.details.view`);
  if (!isModuleView && !isTableColumn && (key.endsWith(".create") || key.endsWith(".delete") || key.endsWith(".toggle_active") || key.endsWith(".toggle_featured") || key.endsWith(".refresh"))) { dependencies.add(`${module}.view`); dependencies.add(`${module}.table.view`); }
  if (!isModuleView && (key.endsWith(".edit") || key.endsWith(".update"))) { dependencies.add(`${module}.view`); dependencies.add(`${module}.details.view`); }
  if (key.startsWith("orders.section.")) { dependencies.add("orders.details.view"); dependencies.add("orders.view"); }
  if (!isModuleView) dependencies.add(`${module}.view`);
  return Array.from(dependencies);
}

export function permissionLabel(permission: PermissionRecord) { return String(permission.label || permission.description || permission.key); }
