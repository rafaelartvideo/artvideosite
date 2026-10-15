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
  dashboard: "Dashboard", site: "Site", operation: "Operação", quotes: "Orçamentos", orders: "Ordens de Serviço", technician_panel: "Painel do Técnico",
  customers: "Cadastros", customer_requests: "Pedidos Avulsos", registrations: "Cadastros", agenda: "Agenda", field_tracking: "Mapa de Campo", inventory: "Estoque", products: "Estoque", pdv: "PDV", finance: "Financeiro", nfse: "Notas Fiscais de Serviço", tools: "Ferramentas", queue: "Union Fila", pbx: "PABX Union", marketplace: "Marketplace Union", ai: "Union IA", sac_digital: "SAC Digital", categories: "Categorias",
  brands: "Marcas", services: "Serviços do Site", site_settings: "Configurações do Site", settings: "Dados da Empresa",
  contact: "Contato", equipment: "Equipamentos", checklists: "Checklists", general_services: "Serviços Gerais", service_types: "Tipos de Atendimento",
  situations: "Situações da OS", terms: "Termos/Garantia", employees: "Cadastros — Acesso ao sistema", roles: "Funções e Permissões", documents: "Documentos", organizations: "Empresas Parceiras",
};

// Todos os recursos da central de Ferramentas usam o mesmo grupo visual,
// sem compartilhar autorização entre integrações diferentes.
const TOOL_MODULE_SECTIONS: Record<string, string> = {
  field_tracking: "Mapa de Campo",
  queue: "Union Fila",
  pbx: "PABX Union",
  marketplace: "Marketplace Union",
  ai: "Union IA",
  sac_digital: "SAC Digital",
};

const ORDER_PART_KEYS = new Set(["orders.request_parts", "orders.manage_part_requests", "orders.dispatch_parts", "orders.confirm_part_delivery", "orders.register_part_return", "orders.receive_returned_parts", "orders.record_test_results"]);
const ORDER_FLOW_KEYS = new Set(["orders.create", "orders.edit", "orders.delete", "orders.view_all", "orders.status", "orders.situation.change", "orders.solve", "orders.complete", "orders.cancel"]);
const ACTION_SUFFIXES = [".create", ".edit", ".update", ".delete", ".toggle_active", ".toggle_featured", ".status.change", ".refresh", ".convert_to_order", ".lookup_cnpj"];
const HIDDEN_LEGACY_PERMISSIONS = new Set([
  "tools.sac_digital.use",
  "customers.requests.view",
  "customers.requests.create",
  "customers.requests.update",
  "employees.delete",
  "employees.details.view",
  "employees.table.view",
  "employees.table.name",
  "employees.table.cpf",
  "employees.table.phone",
  "employees.table.role",
  "employees.table.status",
  "employees.table.actions",
  "inventory.delete",
  "products.view",
  "products.create",
  "products.update",
  "products.delete",
  "products.details.view",
  "products.table.view",
  "products.table.product",
  "products.table.price",
  "products.table.status",
  "products.table.actions",
  "products.toggle_active",
  // Chaves de compatibilidade: continuam no banco e nos papéis existentes,
  // mas não devem aparecer como ações duplicadas de edição.
  "orders.update",
  "customers.update",
  "quotes.update",
  // A tabela atual de Funções usa colunas fixas. Estes controles legados
  // não alteram a UI; mantidos no banco por compatibilidade, mas ocultos do editor.
  "roles.table.name",
  "roles.table.description",
  "roles.table.users",
  "roles.table.type",
  "roles.table.permissions",
  "roles.table.actions",
]);

export function permissionModuleName(permission: PermissionRecord) {
  const key = String(permission.key || "");
  if (key === "organizations.audit.view") return "Auditoria";
  if (key.startsWith("orders.monitor.")) return "Monitoramento de OS";
  if (key.startsWith("customer_requests.")) return "Pedidos Avulsos";
  if (key.startsWith("platform.announcements.")) return "Avisos";
  if (key.startsWith("platform.billing.")) return "Financeiro";
  if (key.startsWith("platform.catalog.")) return "Ferramentas";
  const prefix = key.split(".")[0];
  if (prefix === "tools" || TOOL_MODULE_SECTIONS[prefix]) return "Ferramentas";
  if (MODULE_LABELS[prefix]) return MODULE_LABELS[prefix];
  const stored = String(permission.module_name || "").split("—")[0].trim();
  return stored || "Outros";
}

export function permissionSectionName(permission: PermissionRecord) {
  const key = String(permission.key || "");
  const module = key.split(".")[0];
  if (key.startsWith("platform.catalog.")) return "Catálogo Inteligente";
  if (key.startsWith("customer_requests.")) return key.endsWith(".view") ? "Acesso" : "Ações";
  if (module === "tools") {
    if (key === "tools.uniq.use") return "UNIQ";
    if (key === "tools.sac_digital.use") return "SAC Digital";
    return "Acesso geral";
  }
  if (TOOL_MODULE_SECTIONS[module]) return TOOL_MODULE_SECTIONS[module];
  if (key.includes(".table.")) return "Tabela";
  if (key.includes(".technical_fields.column.")) return "Tabela — Campos Técnicos";
  if (key.includes(".column.")) return "Tabela";
  if (key.includes(".details.")) return "Detalhes";
  if (module === "technician_panel") {
    if (key === "technician_panel.view") return "Acesso";
    if (key.startsWith("technician_panel.data.")) return "Dados";
    if (key.startsWith("technician_panel.actions.")) return "Ações";
  }
  if (module === "orders") {
    if (key === "orders.view") return "Acesso";
    if (key.includes(".kanban.")) return "Kanban";
    if (key.startsWith("orders.section.sla") || key === "orders.section.sla_cards") return "SLA";
    if (ORDER_PART_KEYS.has(key) || key === "orders.section.parts") return "Peças";
    if (key === "orders.section.checklists" || key.startsWith("orders.checklists.")) return "Checklists";
    if (key.startsWith("orders.history.") || key === "orders.section.history") return "Histórico";
    if (key.includes("image") || key.includes("media") || key.includes("document") || /^orders\.situation\..+\.upload$/.test(key)) return "Documentos e Imagens";
    if (key.startsWith("orders.section.")) return "Detalhes";
    if (ORDER_FLOW_KEYS.has(key)) return "Fluxo da OS";
    return key.endsWith(".view") ? "Acesso" : "Ações";
  }
  if (module === "finance") {
    const sections: Record<string, string> = {
      accounts: "Contas e Caixa",
      cash: "Caixa",
      categories: "Categorias",
      collections: "Cobranças",
      cost_centers: "Centros de Custo",
      dashboard: "Visão Geral",
      documents: "Documentos",
      payables: "Contas a Pagar",
      payment_methods: "Formas de Pagamento",
      receivables: "Contas a Receber",
      recurring: "Recorrências",
      reports: "Relatórios",
      settings: "Configurações",
      settlements: "Baixas",
      transfers: "Transferências",
    };
    return sections[key.split(".")[1]] || (key === "finance.view" ? "Acesso" : "Ações");
  }
  if (module === "site") {
    const sections: Record<string, string> = {
      brands: "Marcas",
      categories: "Categorias",
      products: "Produtos",
      services: "Serviços",
    };
    return sections[key.split(".")[1]] || (key === "site.view" ? "Acesso" : "Configurações");
  }
  if (module === "registrations") {
    if (key === "registrations.employee_signature.manage") return "Funcionários";
    if (key.startsWith("registrations.contacts.")) return "Contatos";
    if (key.startsWith("registrations.records.")) return "Registros";
  }
  if (module === "employees") return key === "employees.view" ? "Acesso" : "Ações";
  if (module === "queue") return key === "queue.view" ? "Acesso" : "Configurações";
  if (module === "nfse") {
    if (key === "nfse.view") return "Acesso";
    if (key.startsWith("nfse.drafts.")) return "Rascunhos";
    if (key.startsWith("nfse.services.")) return "Códigos Fiscais";
    return "Configurações";
  }
  if (module === "sac_digital") {
    if (key === "sac_digital.view") return "Acesso";
    if (key.startsWith("sac_digital.messages.")) return "Mensagens";
    if (key.startsWith("sac_digital.protocols.")) return "Atendimentos";
    if (key.startsWith("sac_digital.settings.")) return "Configurações";
  }
  if (module === "checklists") return key === "checklists.view" ? "Acesso" : "Ações";
  if (module === "documents") {
    if (key.startsWith("documents.signatures.")) return "Assinaturas";
    return key.startsWith("documents.attachment_types.") ? "Tipos de Anexo" : "Impressão / Modelos";
  }
  if (module === "pdv") {
    if (key.startsWith("pdv.sales.")) return "Vendas";
    if (key.startsWith("pdv.cash.")) return "Caixa";
    if (key.startsWith("pdv.settings.")) return "Configurações";
  }
  if (module === "inventory") {
    if (key.includes("categories") || key.includes("brands")) return "Cadastros";
    if (key.includes("movement")) return "Movimentações";
    if (key.includes("supplier")) return "Fornecedores";
    if (key.includes("cost")) return "Custos";
  }
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
  permissions
    .filter(permission => {
      const key = String(permission.key || "");
      return !key.startsWith("nfse.")
        && !key.startsWith("order_statuses.")
        && key !== "orders.status.change"
        && !HIDDEN_LEGACY_PERMISSIONS.has(key);
    })
    .forEach(permission => {
      const moduleName = permissionModuleName(permission);
      modules.set(moduleName, [...(modules.get(moduleName) || []), permission]);
    });
  return Array.from(modules.entries()).map(([name, modulePermissions]): PermissionModuleGroup => {
    const sections = new Map<string, PermissionRecord[]>();
    modulePermissions.forEach(permission => {
      const sectionName = permissionSectionName(permission);
      sections.set(sectionName, [...(sections.get(sectionName) || []), permission]);
    });
    return {
      name,
      permissions: modulePermissions,
      sections: Array.from(sections.entries())
        .map(([sectionName, sectionPermissions]) => ({
          name: sectionName,
          permissions: [...sectionPermissions].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.label || a.key).localeCompare(String(b.label || b.key), "pt-BR")),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

const EXPLICIT_DEPENDENCIES: Record<string, string[]> = {
  "customer_requests.create": ["customer_requests.view"],
  "customer_requests.update": ["customer_requests.view"],
  "orders.monitor.manage": ["orders.monitor.view"],
  "field_tracking.view": ["tools.view"],
  "technician_panel.data.customer": ["technician_panel.view"],
  "technician_panel.data.contact": ["technician_panel.view"],
  "technician_panel.data.equipment": ["technician_panel.view"],
  "technician_panel.data.diagnosis": ["technician_panel.view"],
  "technician_panel.data.schedule": ["technician_panel.view"],
  "technician_panel.data.location": ["technician_panel.view"],
  "technician_panel.data.photos": ["technician_panel.view"],
  "technician_panel.data.situation": ["technician_panel.view"],
  "technician_panel.data.order_items": ["technician_panel.view"],
  "technician_panel.data.internal_notes": ["technician_panel.view"],
  "technician_panel.data.history": ["technician_panel.view"],
  "technician_panel.actions.history.create": ["technician_panel.data.history", "technician_panel.view"],
  "technician_panel.actions.add_service": ["technician_panel.data.order_items", "technician_panel.view"],
  "technician_panel.actions.add_product": ["technician_panel.data.order_items", "technician_panel.view"],
  "technician_panel.actions.remove_product": ["technician_panel.data.order_items", "technician_panel.view"],
  "technician_panel.actions.edit_problem": ["technician_panel.data.problem", "technician_panel.view"],
  "technician_panel.actions.edit_internal_notes": ["technician_panel.data.internal_notes", "technician_panel.view"],
  "technician_panel.actions.edit_diagnosis": ["technician_panel.data.diagnosis", "technician_panel.view"],
  "technician_panel.actions.start": ["technician_panel.view"],
  "technician_panel.actions.complete": ["technician_panel.view"],
  "technician_panel.actions.photo": ["technician_panel.view"],
  "field_tracking.share": ["tools.view"],
  "queue.view": ["tools.view"],
  "pbx.view": ["tools.view"],
  "marketplace.view": ["tools.view"],
  "ai.view": ["tools.view"],
  "sac_digital.view": ["tools.view"],
  "queue.manage": ["queue.view"],
  "sac_digital.messages.view": ["sac_digital.view", "tools.view"],
  "sac_digital.messages.send": ["sac_digital.messages.view", "sac_digital.view", "tools.view"],
  "sac_digital.protocols.manage": ["sac_digital.messages.view", "sac_digital.view", "tools.view"],
  "sac_digital.settings.manage": ["sac_digital.view", "tools.view"],
  "tools.sac_digital.use": ["tools.view"],
  "tools.uniq.use": ["tools.view"],
  "orders.view_all": ["orders.view"], "orders.table.view": ["orders.view"], "orders.kanban.view": ["orders.view"], "orders.details.view": ["orders.view"],
  "orders.situation.change": ["orders.edit", "orders.view"], "orders.cancel": ["orders.edit", "orders.view"],
  "orders.request_parts": ["orders.section.parts", "orders.view"], "orders.manage_part_requests": ["orders.section.parts", "orders.view_all", "orders.view"],
  "orders.dispatch_parts": ["orders.section.parts", "orders.view"], "orders.confirm_part_delivery": ["orders.section.parts", "orders.view"],
  "orders.register_part_return": ["orders.section.parts", "orders.view"], "orders.receive_returned_parts": ["orders.section.parts", "orders.view"],
  "orders.record_test_results": ["orders.section.parts", "orders.view"], "orders.history.create": ["orders.section.history", "orders.details.view", "orders.view"],
  "orders.section.checklists": ["orders.details.view", "orders.view"],
  "orders.checklists.manage": ["orders.section.checklists", "orders.details.view", "orders.view"],
  "orders.checklists.reopen": ["orders.section.checklists", "orders.details.view", "orders.view"],
  "inventory.table.view": ["inventory.view"],
  "inventory.table.name": ["inventory.table.view"],
  "inventory.table.sale_price": ["inventory.table.view"],
  "inventory.table.status": ["inventory.table.view"],
  "inventory.table.actions": ["inventory.table.view"],
  "inventory.details.view": ["inventory.view"],
  "inventory.create": ["inventory.view"],
  "inventory.update": ["inventory.view", "inventory.details.view"],
  "inventory.movements.view": ["inventory.view"], "inventory.movements.create": ["inventory.update", "inventory.view"], "inventory.toggle_active": ["inventory.update", "inventory.view"],
  "inventory.suppliers.view": ["inventory.view"], "inventory.suppliers.manage": ["inventory.suppliers.view", "inventory.update", "inventory.view"], "inventory.costs.view": ["inventory.view"],
  "inventory.categories.view": ["inventory.view"], "inventory.categories.manage": ["inventory.categories.view", "inventory.update", "inventory.view"],
  "inventory.brands.view": ["inventory.view"], "inventory.brands.manage": ["inventory.brands.view", "inventory.update", "inventory.view"],
  "products.toggle_active": ["products.update", "products.view"], "products.toggle_featured": ["products.update", "products.view"],
  "pdv.sales.create": ["pdv.view"], "pdv.sales.cancel": ["pdv.view"], "pdv.settings.manage": ["pdv.view"],
  "pdv.cash.open": ["pdv.view"], "pdv.cash.close": ["pdv.view"], "pdv.cash.supply": ["pdv.view"], "pdv.cash.withdraw": ["pdv.view"], "pdv.cash.reports": ["pdv.view"],
  "categories.toggle_active": ["categories.update", "categories.view"], "brands.toggle_active": ["brands.update", "brands.view"],
  "general_services.toggle_active": ["general_services.edit", "general_services.view"], "service_types.toggle_active": ["service_types.edit", "service_types.view"],
  "service_types.sla.manage": ["service_types.edit", "service_types.view"],
  "employees.create": ["employees.view"], "employees.edit": ["employees.view"], "employees.toggle_active": ["employees.view"],
  "registrations.contacts.view": ["customers.view"], "registrations.contacts.manage": ["registrations.contacts.view", "customers.view"],
  "registrations.records.view": ["customers.view"], "registrations.records.create": ["registrations.records.view", "customers.view"],
  "registrations.employee_signature.manage": ["customers.view"],
  "documents.signatures.view": ["documents.view"],
  "documents.signatures.send": ["documents.signatures.view", "documents.print"],
  "documents.signatures.resend": ["documents.signatures.view"],
  "documents.signatures.cancel": ["documents.signatures.view"],
  "documents.signatures.audit": ["documents.signatures.view"],
  "quotes.status.change": ["quotes.edit", "quotes.view"], "quotes.convert_to_order": ["quotes.view", "orders.create"],
  "agenda.create": ["agenda.view"], "agenda.reschedule": ["agenda.view"], "agenda.view_others": ["agenda.view"],
  "situations.table.view": ["situations.view"], "situations.create": ["situations.view"], "situations.edit": ["situations.view"], "situations.delete": ["situations.view"],
  "site_settings.update": ["site_settings.view"],
  "services.info.manage": ["services.update", "services.details.view", "services.view"], "services.price.manage": ["services.update", "services.details.view", "services.view"],
  "services.media.manage": ["services.update", "services.details.view", "services.view"], "services.variants.manage": ["services.update", "services.details.view", "services.view"],
  "services.features.manage": ["services.update", "services.details.view", "services.view"], "services.exclusions.manage": ["services.update", "services.details.view", "services.view"],
  "services.factors.manage": ["services.update", "services.details.view", "services.view"], "services.faq.manage": ["services.update", "services.details.view", "services.view"],
  "services.sections.manage": ["services.update", "services.details.view", "services.view"], "services.publication.manage": ["services.update", "services.details.view", "services.view"],
  "services.toggle_active": ["services.update", "services.view"],
  "roles.permissions.manage": ["roles.edit", "roles.details.view", "roles.view"],
  "settings.lookup_cnpj": ["settings.update", "settings.details.view", "settings.view"],
};

export function permissionDependencies(key: string) {
  if (key === "platform.catalog.view") return ["tools.view"];
  if (key === "platform.catalog.manage") return ["platform.catalog.view", "tools.view"];
  if (key === "organizations.audit.view") return [];
  const dependencies = new Set(EXPLICIT_DEPENDENCIES[key] || []);
  const module = key.split(".")[0];
  const isModuleView = key === `${module}.view`;

  if (module === "employees" || module === "registrations") return Array.from(dependencies);

  // Direitos de ação dos submódulos financeiros não substituem a permissão
  // específica de visualizar a área. Desmarcar .view também retira as ações
  // dependentes; marcar uma ação restaura a leitura necessária.
  if (module === "finance" && key.split(".").length === 3 &&
      /\.(manage|create|edit|update|delete|approve|cancel)$/.test(key)) {
    dependencies.add(key.replace(/\.[^.]+$/, ".view"));
  }
  const isTableColumn = key.includes(".table.") && key !== `${module}.table.view`;
  if (key.includes(".details.") && key !== `${module}.details.view`) dependencies.add(`${module}.details.view`);
  if (!isModuleView && !isTableColumn && (key.endsWith(".create") || key.endsWith(".delete") || key.endsWith(".toggle_active") || key.endsWith(".toggle_featured") || key.endsWith(".refresh"))) {
    dependencies.add(`${module}.view`);
    dependencies.add(`${module}.table.view`);
  }
  if (!isModuleView && (key.endsWith(".edit") || key.endsWith(".update"))) {
    dependencies.add(`${module}.view`);
    dependencies.add(`${module}.details.view`);
  }
  if (key.startsWith("orders.section.")) {
    dependencies.add("orders.details.view");
    dependencies.add("orders.view");
  }
  if (!isModuleView) dependencies.add(`${module}.view`);
  return Array.from(dependencies);
}

export type PermissionPresentationKind = "visual" | "actions";

// Classificação EXCLUSIVAMENTE visual, sem unir permissões nem alterar RLS.
// "Ações" em .table.actions é o nome da coluna da tabela, não permissão de
// editar/excluir. TODAS as colunas pertencem a Visualização > [Módulo] > Tabela.
export function permissionPresentationKind(permission: PermissionRecord): PermissionPresentationKind {
  const key = String(permission.key || "");
  if (key.includes(".table.") || key.includes(".column.")) return "visual";
  if (key.endsWith(".view") || key.endsWith(".view_all") || key.endsWith(".view_others")
    || key.endsWith(".read") || key.startsWith("orders.section.")
    || key.startsWith("technician_panel.data.")
    || key.startsWith("finance.reports.")
    || key === "pdv.cash.reports"
    || key === "documents.signatures.audit") return "visual";
  return "actions";
}

// Nome desambiguado na tela: nunca confundir a coluna "Ações" com direito
// de realizar operações. A permissão conserva o ID original no backend.
export function permissionLabelForEditor(permission: PermissionRecord) {
  const key = String(permission.key || "");
  const label = permissionLabel(permission);
  if (key.endsWith(".table.actions") || key.endsWith(".column.actions")) return "Coluna Ações";
  if (key.includes(".table.") && !key.endsWith(".table.view")) return "Coluna " + label;
  if (key.includes(".column.")) return "Coluna " + label;
  return label;
}

export function permissionLabel(permission: PermissionRecord) {
  return String(permission.label || permission.description || permission.key);
}
