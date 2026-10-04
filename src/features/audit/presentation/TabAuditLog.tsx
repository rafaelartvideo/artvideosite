import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, History, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminMobileSearchSwitch } from "@/shared/ui/admin/AdminMobileSearchSwitch";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  getAuditLogDetail,
  listAuditActors,
  listAuditLogs,
  type AuditLogEntry,
} from "../infrastructure/audit-log.repository";

const MODULE_LABELS: Record<string, string> = {
  orders: "Ordens de Serviço",
  customers: "Cadastros",
  registrations: "Cadastros",
  agenda: "Agenda",
  inventory: "Estoque",
  finance: "Financeiro",
  field_tracking: "Mapa de Campo",
  equipment: "Equipamentos",
  employees: "Funções e Permissões",
  service_types: "Tipos de Atendimento",
  order_situations: "Situações da OS",
  order_statuses: "Status da OS",
  documents: "Documentos",
  quotes: "Orçamentos",
  services: "Serviços Gerais",
  site_services: "Serviços do Site",
  products: "Estoque",
  site_products: "Produtos (legado)",
  site_brands: "Marcas",
  site_settings: "Site",
  company_settings: "Dados da Empresa",
  organizations: "Empresas",
  terms: "Termos/Garantia",
  system: "Sistema",
};

const ENTITY_LABELS: Record<string, string> = {
  appointment_situations: "Situação da agenda",
  appointment_technicians: "Técnico do agendamento",
  appointments: "Agendamento",
  attachment_types: "Tipo de anexo",
  brands: "Marca",
  checklist_profile_items: "Item do checklist",
  checklist_profile_stages: "Etapa do checklist",
  checklist_profiles: "Perfil de checklist",
  contact_fields: "Campo de contato",
  customer_addresses: "Endereço do cadastro",
  customer_equipments: "Equipamento do cadastro",
  customers: "Cadastro",
  document_signature_events: "Evento de assinatura",
  document_signature_requests: "Solicitação de assinatura",
  document_signatures: "Assinatura",
  employee_signatures: "Assinatura do funcionário",
  employees: "Funcionário",
  entities: "Cadastro",
  entity_addresses: "Endereço do cadastro",
  entity_contacts: "Contato do cadastro",
  entity_record_media: "Anexo do cadastro",
  entity_records: "Registro do cadastro",
  entity_supplier_items: "Item do fornecedor",
  equipment_brands: "Marca de equipamento",
  equipment_checklist_items: "Item de checklist do equipamento",
  equipment_models: "Modelo de equipamento",
  equipment_type_technical_fields: "Campo técnico do equipamento",
  equipment_types: "Tipo de equipamento",
  filter_options: "Opção de filtro",
  filters: "Filtro",
  financial_accounts: "Conta financeira",
  financial_allocations: "Rateio financeiro",
  financial_approvals: "Aprovação financeira",
  financial_attachments: "Anexo financeiro",
  financial_cash_sessions: "Sessão de caixa",
  financial_categories: "Categoria financeira",
  financial_collection_logs: "Registro de cobrança",
  financial_cost_centers: "Centro de custo",
  financial_entries: "Lançamento financeiro",
  financial_events: "Evento financeiro",
  financial_installments: "Parcela financeira",
  financial_movements: "Movimentação financeira",
  financial_payment_methods: "Forma de pagamento",
  financial_recurring_rules: "Regra de recorrência",
  financial_settings: "Configuração financeira",
  financial_settlements: "Baixa financeira",
  financial_transfers: "Transferência financeira",
  field_tracking_units: "Rastreador de campo",
  field_tracking_integrations: "Integração de rastreamento",
  general_services: "Serviço",
  inventory_items: "Item do estoque",
  inventory_movements: "Movimentação de estoque",
  media: "Arquivo",
  navigation_items: "Item de navegação",
  order_statuses: "Status da OS",
  organization_company_settings: "Dados da empresa",
  organization_members: "Usuário da empresa",
  organization_modules: "Módulo da empresa",
  organization_terms: "Termo da empresa",
  organization_term_acceptances: "Aceite de termo",
  os_situations: "Situação da OS",
  print_template_sections: "Seção do modelo de impressão",
  print_templates: "Modelo de impressão",
  product_categories: "Categoria do estoque",
  product_media: "Foto do item",
  products: "Item do estoque",
  pdv_settings: "Configuração do PDV",
  pdv_sales: "Venda do PDV",
  pdv_sale_items: "Item da venda do PDV",
  pdv_sale_payments: "Pagamento da venda do PDV",
  quote_request_items: "Item do orçamento",
  quote_requests: "Orçamento",
  quote_status_history: "Histórico do orçamento",
  request_statuses: "Status do orçamento",
  roles: "Função",
  role_permissions: "Permissão da função",
  service_categories: "Categoria de serviço",
  service_exclusions: "Item não incluso",
  service_faqs: "Pergunta frequente",
  service_filter_options: "Filtro do serviço",
  service_inclusions: "Item incluso",
  service_order_checklist_events: "Evento do checklist da OS",
  service_order_checklist_item_media: "Foto do checklist",
  service_order_checklist_items: "Item do checklist",
  service_order_checklist_stages: "Etapa do checklist",
  service_order_checklists: "Checklist da OS",
  service_order_history_notes: "Histórico da OS",
  service_order_items: "Item da OS",
  service_order_media: "Imagem da OS",
  service_order_notes: "Observação da OS",
  service_order_part_custody_events: "Movimentação de peça",
  service_order_part_request_items: "Item do pedido de peças",
  service_order_part_requests: "Pedido de peças",
  service_order_part_test_events: "Teste de peça",
  service_order_sellers: "Vendedor da OS",
  service_order_situation_media: "Anexo da situação",
  service_order_situation_visits: "Histórico de situação",
  service_order_solution_attempts: "Solução da OS",
  service_order_status_history: "Histórico de status",
  service_order_technical_values: "Campo técnico da OS",
  service_order_technicians: "Técnico da OS",
  service_order_used_items: "Peça utilizada",
  service_orders: "Ordem de Serviço",
  service_price_factors: "Fator de preço",
  service_sections: "Seção do serviço",
  service_type_situations: "SLA do tipo de atendimento",
  service_types: "Tipo de atendimento",
  service_warranty_terms: "Garantia do serviço",
  service_variants: "Variação do serviço",
  services: "Serviço do site",
  site_page_sections: "Seção da página",
  site_pages: "Página do site",
  site_settings: "Configuração do site",
  technical_fields: "Campo técnico",
  user_permission_overrides: "Permissão individual",
};

const FIELD_LABELS: Record<string, string> = {
  access: "Acesso",
  accessories: "Acessórios",
  account_number: "Número da conta",
  account_type: "Tipo de conta",
  action: "Ação",
  actor_type: "Tipo de responsável",
  actor_user_id: "Usuário",
  address_source: "Origem do endereço",
  agency: "Agência",
  allocation_mode: "Forma de rateio",
  allow_na: "Permitir N/A",
  allow_na_snapshot: "Permitir N/A",
  allow_online_signature: "Permitir assinatura online",
  allow_negative_stock: "Permitir estoque negativo",
  allow_sale_without_customer: "Permitir venda sem cliente",
  approved_at: "Aprovado em",
  approved_quantity: "Quantidade aprovada",
  approval_order: "Ordem de aprovação",
  approval_status: "Status da aprovação",
  approver_name_snapshot: "Aprovador",
  assigned_to: "Responsável",
  attachment_type: "Tipo de anexo",
  attachment_type_id: "Tipo de anexo",
  author_id: "Autor",
  bank_name: "Banco",
  birth_date: "Data de nascimento",
  barcode: "Código de barras / GTIN",
  model: "Modelo",
  manufacturer_code: "Código do fabricante / MPN",
  base_quantity: "Quantidade base",
  brand_id: "Marca",
  cancelled_at: "Cancelado em",
  cancelled_by: "Cancelado por",
  cancellation_reason: "Motivo do cancelamento",
  cash_session_id: "Sessão de caixa",
  change_amount: "Troco",
  calculate_entry_difal: "Calcular diferencial de ICMS na entrada",
  category_id: "Categoria",
  gpc_code: "Código GPC / classificação externa",
  cest: "CEST",
  cfop_entry: "CFOP padrão (entrada)",
  cfop_exit: "CFOP padrão (saída)",
  commercial_unit: "Unidade comercial",
  cofins_rate: "Alíquota COFINS (%)",
  csosn: "CSOSN",
  cst_cofins: "CST COFINS",
  cst_icms: "CST ICMS",
  cst_ipi: "CST IPI",
  cst_pis: "CST PIS",
  changed_by: "Alterado por",
  checklist_id: "Checklist",
  checklist_profile_id: "Perfil de checklist",
  city: "Cidade",
  color: "Cor",
  complement: "Complemento",
  completed_at: "Concluído em",
  completed_by: "Concluído por",
  content: "Conteúdo",
  counterpart_entity_id: "Favorecido / fornecedor",
  counterpart_name_snapshot: "Favorecido / fornecedor",
  created_by: "Criado por",
  customer_address_id: "Endereço",
  customer_equipment_id: "Equipamento",
  customer_id: "Cadastro",
  customer_name_snapshot: "Cliente",
  customer_document_snapshot: "Documento do cliente",
  customer_notes: "Descrição do problema",
  default_cash_account_id: "Caixa padrão",
  delivered_by: "Entregue por",
  description: "Descrição",
  description_snapshot: "Descrição",
  diagnosis: "Diagnóstico",
  discount_amount: "Desconto",
  external_platform: "Fonte externa",
  external_product_id: "Identificador externo",
  external_url: "URL da fonte externa",
  external_reference_price: "Preço externo de referência",
  external_min_price: "Preço mínimo externo",
  external_max_price: "Preço máximo externo",
  external_currency: "Moeda externa",
  external_data_updated_at: "Dados externos atualizados em",
  fee_amount: "Taxa",
  discount_percentage: "Desconto (%)",
  document: "Documento",
  due_date: "Vencimento",
  email: "E-mail",
  employee_entity_id: "Funcionário",
  employee_id: "Funcionário",
  equipment_brand_id: "Marca do equipamento",
  equipment_condition: "Condição do equipamento",
  equipment_model_id: "Modelo do equipamento",
  equipment_type_id: "Tipo de equipamento",
  estimated_price: "Valor estimado",
  event_type: "Evento",
  external_os_number: "OS Externa",
  field_key: "Campo",
  field_type: "Tipo do campo",
  file_name: "Arquivo",
  final_total: "Total final",
  financial_account_id: "Conta financeira",
  financial_entry_id: "Lançamento financeiro",
  financial_account_name_snapshot: "Conta financeira",
  financial_installment_id: "Parcela",
  forecast_days: "Previsão",
  foundation_date: "Data de fundação",
  from_status_id: "Status anterior",
  full_name: "Nome",
  general_service_id: "Serviço",
  warranty_days: "Prazo da garantia (dias)",
  term_type: "Tipo de termo",
  version: "Versão",
  icon: "Ícone",
  input_quantity: "Quantidade informada",
  input_unit: "Unidade informada",
  internal_icms_rate: "Alíquota ICMS interna (%)",
  internal_notes: "Observações internas",
  inventory_item_id: "Item do estoque",
  ipi_rate: "Alíquota IPI (%)",
  is_active: "Ativo",
  merchandise_origin: "Origem da mercadoria",
  ncm: "NCM",
  is_enabled: "Habilitado",
  is_featured: "Destaque",
  is_final: "Final",
  is_primary: "Principal",
  is_required: "Obrigatório",
  label: "Nome",
  legal_name: "Razão social",
  line_subtotal: "Subtotal do item",
  line_total: "Total do item",
  loose_parts: "Peças avulsas",
  media_id: "Arquivo",
  min_quantity: "Estoque mínimo",
  municipal_registration: "Inscrição municipal",
  name: "Nome",
  neighborhood: "Bairro",
  note: "Observação",
  notes: "Observações",
  number: "Número",
  observation: "Observação",
  occurred_at: "Data da movimentação",
  opening_balance_configured_by: "Saldo inicial configurado por",
  order_type: "Tipo da OS",
  original_amount: "Valor original",
  parent_category_id: "Categoria superior",
  payment_method_id: "Forma de pagamento",
  payment_method_name_snapshot: "Forma de pagamento",
  percentage: "Percentual",
  percentage_fee: "Taxa percentual",
  phone: "Telefone",
  pis_rate: "Alíquota PIS (%)",
  photo_requirement: "Exigência de foto",
  priority: "Prioridade",
  product_id: "Produto vinculado",
  product_name_snapshot: "Produto",
  profile_id: "Usuário",
  purchase_price: "Valor de compra",
  quantity: "Quantidade",
  quote_request_id: "Orçamento",
  record_type: "Tipo de registro",
  reference: "Referência",
  request_id: "Solicitação",
  require_open_cash: "Exigir caixa aberto para vender",
  requested_by: "Solicitado por",
  response_code: "Resposta",
  response_number: "Resposta numérica",
  response_text: "Resposta",
  response_type: "Tipo de resposta",
  review_notes: "Observação da análise",
  reviewed_by: "Analisado por",
  reversed_at: "Estornado em",
  reversed_by: "Estornado por",
  reversal_reason: "Motivo do estorno",
  role_id: "Função",
  sale_price: "Valor de venda",
  sale_id: "Venda do PDV",
  sale_number: "Número da venda",
  scheduled_at: "Agendado para",
  section_id: "Seção",
  section_type: "Tipo de seção",
  seller_id: "Vendedores",
  serial_number: "Número de série",
  service_customer_address_id: "Endereço do atendimento",
  service_id: "Serviço",
  service_order_id: "Ordem de Serviço",
  service_price: "Valor do serviço",
  service_type_id: "Tipo de atendimento",
  short_description: "Descrição curta",
  situation_id: "Situação",
  situation_name_snapshot: "Situação",
  sku: "SKU",
  solution: "Solução",
  solved_at: "Solucionado em",
  solved_by: "Solucionado por",
  sort_order: "Ordem",
  stage_id: "Etapa",
  state: "Estado",
  state_registration: "Inscrição estadual",
  status: "Status",
  status_id: "Status",
  storage_path: "Arquivo",
  street: "Rua",
  subtotal: "Subtotal",
  surcharge_amount: "Acréscimo",
  tax_barcode: "GTIN tributável",
  tax_unit: "Unidade tributável",
  fiscal_benefit_code: "Código de benefício fiscal",
  fiscal_notes: "Observações fiscais",
  technical_field_id: "Campo técnico",
  technician_id: "Técnicos",
  title: "Título",
  title_snapshot: "Título",
  to_status_id: "Novo status",
  trade_name: "Nome fantasia",
  unit: "Unidade",
  unit_cost: "Custo unitário",
  unit_price: "Valor unitário",
  unit_snapshot: "Unidade",
  unit_sale_price: "Valor unitário",
  updated_by: "Alterado por",
  uploaded_by: "Enviado por",
  user_id: "Usuário",
  value_number: "Valor",
  value_text: "Valor",
  version: "Versão",
  visible_to_customer: "Visível para o cliente",
  tendered_amount: "Valor recebido",
  total_amount: "Total da venda",
  whatsapp: "WhatsApp",
  zip_code: "CEP",
};

const TABLE_FIELD_LABELS: Record<string, Record<string, string>> = {
  service_orders: {
    customer_id: "Cliente",
    technician_id: "Técnicos",
    seller_id: "Vendedores",
    general_service_id: "Serviço",
    service_type_id: "Tipo de atendimento",
    situation_id: "Situação",
    status_id: "Status",
    customer_notes: "Descrição do problema",
    internal_notes: "Observações internas",
    external_os_number: "OS Externa",
    service_state: "Estado",
    service_city: "Cidade",
    service_street: "Rua",
    service_zip_code: "CEP",
    service_neighborhood: "Bairro",
    service_number: "Número",
    service_complement: "Complemento",
  },
  appointments: {
    customer_id: "Cliente",
    situation_id: "Situação",
    service_order_id: "Ordem de Serviço",
    description: "Descrição",
  },
  financial_entries: {
    counterpart_entity_id: "Favorecido / fornecedor",
    counterpart_name_snapshot: "Favorecido / fornecedor",
    original_amount: "Valor",
  },
  products: {
    show_in_catalog: "Exibir no catálogo da loja",
  },
  inventory_items: {
    min_quantity: "Estoque mínimo",
    quantity: "Quantidade em estoque",
  },
};

const HIDDEN_DETAIL_FIELDS = new Set([
  "id",
  "organization_id",
  "source_artvideo_id",
  "legacy_customer_id",
  "legacy_employee_id",
  "legacy_customer_address_id",
  "created_at",
  "updated_at",
]);

const MODULE_OPTIONS = [
  { value: "", label: "Todos os módulos" },
  ...Object.entries(MODULE_LABELS)
    .filter(([key]) => key !== "system")
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([value, label]) => ({ value, label })),
];

const OPERATION_OPTIONS = [
  { value: "", label: "Todas as ações" },
  { value: "insert", label: "Criação" },
  { value: "update", label: "Edição" },
  { value: "delete", label: "Exclusão" },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

function operationLabel(operation: AuditLogEntry["operation"]) {
  if (operation === "insert") return "Criação";
  if (operation === "delete") return "Exclusão";
  return "Edição";
}

function operationTone(operation: AuditLogEntry["operation"]) {
  if (operation === "insert") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (operation === "delete") return "border-red-200 bg-red-50 text-red-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function humanizeKey(value: string, tableName?: string | null) {
  const tableLabel = tableName ? TABLE_FIELD_LABELS[tableName]?.[value] : undefined;
  return tableLabel || FIELD_LABELS[value] || value
    .replace(/_snapshot$/, "")
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^./, char => char.toUpperCase());
}

function formatAuditValue(value: unknown, field?: string) {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") {
    if (field && /(price|amount|total|balance|cost|fee)$/i.test(field)) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    }
    if (field && /(percentage|percentual)$/i.test(field)) return `${value}%`;
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value);
  }
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return "Registro relacionado";
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatDateTime(value);
    }
    const normalized = value.toLowerCase();
    const labels: Record<string, string> = {
      active: "Ativo",
      inactive: "Inativo",
      pending: "Pendente",
      approved: "Aprovado",
      rejected: "Rejeitado",
      cancelled: "Cancelado",
      completed: "Concluído",
      in_progress: "Em andamento",
      receivable: "A receber",
      payable: "A pagar",
      yes: "Sim",
      no: "Não",
      confirmed: "Confirmado",
      ok: "Conforme",
      not_ok: "Não conforme",
      na: "N/A",
    };
    return labels[normalized] || value;
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function changedFieldEntries(entry: AuditLogEntry) {
  return Object.entries(entry.resolved_changed_fields || entry.changed_fields || {}) as Array<[
    string,
    { before?: unknown; after?: unknown },
  ]>;
}

function visibleSnapshotEntries(entry: AuditLogEntry) {
  return Object.entries(entry.resolved_row_snapshot || entry.row_snapshot || {})
    .filter(([field, value]) => !HIDDEN_DETAIL_FIELDS.has(field) && value !== null && value !== undefined && value !== "");
}

function summary(entry: AuditLogEntry) {
  if (entry.operation === "insert") return "Registro criado";
  if (entry.operation === "delete") return "Registro excluído";

  const fallbackChanges = changedFieldEntries(entry);
  const count = entry.changed_field_count ?? fallbackChanges.length;
  if (!count) return "Registro alterado";

  const firstField = entry.first_changed_field || fallbackChanges[0]?.[0] || null;
  if (count === 1 && firstField) return humanizeKey(firstField, entry.table_name);
  if (count === 1) return "1 campo alterado";
  return `${count} campos alterados`;
}

function entityLabel(entry: AuditLogEntry) {
  return ENTITY_LABELS[entry.entity_type || ""] || humanizeKey(entry.entity_type || "Registro");
}

export function TabAuditLog() {
  const { activeOrganizationId } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actorUserId, setActorUserId] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [operation, setOperation] = useState("");
  const [contextId, setContextId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mobileSearchField, setMobileSearchField] = useState<"actor" | "module" | "operation" | "context" | "from" | "to">("actor");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const debouncedContextId = useDebouncedValue(contextId);

  const filters = useMemo(() => ({
    page,
    pageSize,
    actorUserId,
    moduleKey,
    operation,
    contextId: debouncedContextId,
    dateFrom,
    dateTo,
  }), [page, pageSize, actorUserId, moduleKey, operation, debouncedContextId, dateFrom, dateTo]);

  const logsQuery = useQuery({
    queryKey: ["audit-logs", activeOrganizationId, filters],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listAuditLogs(activeOrganizationId!, filters),
    placeholderData: previous => previous,
  });

  const actorsQuery = useQuery({
    queryKey: ["audit-actors", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listAuditActors(activeOrganizationId!),
    staleTime: 5 * 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ["audit-log-detail", activeOrganizationId, selectedId],
    enabled: Boolean(activeOrganizationId && selectedId),
    queryFn: () => getAuditLogDetail(activeOrganizationId!, selectedId!),
  });

  const actorOptions = [
    { value: "", label: "Todos os usuários" },
    ...(actorsQuery.data || []).map(actor => ({ value: actor.id, label: actor.name })),
  ];

  const resetFilters = () => {
    setActorUserId("");
    setModuleKey("");
    setOperation("");
    setContextId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasFilters = Boolean(actorUserId || moduleKey || operation || contextId || dateFrom || dateTo);
  const items = logsQuery.data?.items || [];
  const total = logsQuery.data?.total || 0;

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Auditoria"
        subtitle="Histórico de alterações realizadas nos dados do CRM."
      />

      <AdminSearchPanel title="Buscar na auditoria">
        <AdminMobileSearchSwitch
          value={mobileSearchField}
          options={[
            { value: "actor", label: "Usuário" },
            { value: "module", label: "Módulo" },
            { value: "operation", label: "Ação" },
            { value: "context", label: "Registro" },
            { value: "from", label: "Data inicial" },
            { value: "to", label: "Data final" },
          ]}
          onChange={setMobileSearchField}
        >
          {mobileSearchField === "actor" ? <AdminSelect value={actorUserId} onValueChange={value => { setActorUserId(value); setPage(1); }} options={actorOptions} ariaLabel="Filtrar por usuário" />
            : mobileSearchField === "module" ? <AdminSelect value={moduleKey} onValueChange={value => { setModuleKey(value); setPage(1); }} options={MODULE_OPTIONS} ariaLabel="Filtrar por módulo" />
              : mobileSearchField === "operation" ? <AdminSelect value={operation} onValueChange={value => { setOperation(value); setPage(1); }} options={OPERATION_OPTIONS} ariaLabel="Filtrar por ação" />
                : mobileSearchField === "context" ? <FInput value={contextId} onChange={(event: any) => { setContextId(event.target.value); setPage(1); }} placeholder="ID do registro" />
                  : mobileSearchField === "from" ? <FInput type="date" value={dateFrom} onChange={(event: any) => { setDateFrom(event.target.value); setPage(1); }} />
                    : <FInput type="date" value={dateTo} onChange={(event: any) => { setDateTo(event.target.value); setPage(1); }} />}
        </AdminMobileSearchSwitch>
        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Usuário</label>
            <AdminSelect
              value={actorUserId}
              onValueChange={value => { setActorUserId(value); setPage(1); }}
              options={actorOptions}
              ariaLabel="Filtrar por usuário"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Módulo</label>
            <AdminSelect
              value={moduleKey}
              onValueChange={value => { setModuleKey(value); setPage(1); }}
              options={MODULE_OPTIONS}
              ariaLabel="Filtrar por módulo"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Ação</label>
            <AdminSelect
              value={operation}
              onValueChange={value => { setOperation(value); setPage(1); }}
              options={OPERATION_OPTIONS}
              ariaLabel="Filtrar por ação"
            />
          </div>
          <FInput
            label="Registro"
            value={contextId}
            onChange={(event: any) => { setContextId(event.target.value); setPage(1); }}
            placeholder="ID do registro"
          />
          <FInput
            label="De"
            type="date"
            value={dateFrom}
            onChange={(event: any) => { setDateFrom(event.target.value); setPage(1); }}
          />
          <FInput
            label="Até"
            type="date"
            value={dateTo}
            onChange={(event: any) => { setDateTo(event.target.value); setPage(1); }}
          />
        </div>

        {hasFilters && (
          <div className="mt-3 flex justify-end border-t border-border pt-3">
            <AdminButton variant="secondary" size="sm" onClick={resetFilters}>
              <RotateCcw size={14} /> Limpar filtros
            </AdminButton>
          </div>
        )}
      </AdminSearchPanel>

      <Section title="Histórico de alterações" flush>
        {logsQuery.isPending ? (
          <LoadingState text="Carregando auditoria..." />
        ) : logsQuery.error ? (
          <div className="p-4 text-sm font-semibold text-red-700">
            Não foi possível carregar o histórico de auditoria.
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhum registro encontrado"
            message={hasFilters ? "Ajuste os filtros para ampliar a busca." : "As próximas alterações do CRM aparecerão aqui."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[920px]">
                <thead>
                  <tr>
                    <th className="text-left">Data e hora</th>
                    <th className="text-left">Usuário</th>
                    <th className="text-left">Módulo</th>
                    <th className="text-left">Ação</th>
                    <th className="text-left">Registro</th>
                    <th className="text-left">Alteração</th>
                    <th className="text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(entry => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-xs font-semibold text-[#52647c]">{formatDateTime(entry.created_at)}</td>
                      <td>
                        <p className="max-w-[210px] truncate text-sm font-bold text-[#0d1b2e]">
                          {entry.actor_name_snapshot || (entry.source === "system" ? "Sistema" : "Usuário")}
                        </p>
                        {entry.source === "server_on_behalf" && <p className="text-[10px] font-semibold text-[#7a8aa0]">via servidor</p>}
                      </td>
                      <td className="text-xs font-semibold text-[#52647c]">{MODULE_LABELS[entry.module_key || ""] || "Sistema"}</td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${operationTone(entry.operation)}`}>
                          {operationLabel(entry.operation)}
                        </span>
                      </td>
                      <td>
                        <p className="text-xs font-bold text-[#0d1b2e]">{entityLabel(entry)}</p>
                        {entry.context_type === "service_order" && <p className="mt-0.5 text-[10px] font-semibold text-[#0057e7]">Vinculado a uma OS</p>}
                      </td>
                      <td className="max-w-[260px] text-xs font-semibold text-[#52647c]">{summary(entry)}</td>
                      <td>
                        <div className="flex justify-end">
                          <AdminButton
                            variant="icon"
                            size="sm"
                            ariaLabel="Ver detalhes da alteração"
                            title="Ver detalhes"
                            onClick={() => setSelectedId(entry.id)}
                          >
                            <Eye size={15} />
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              pageSize={pageSize}
              totalItems={total}
              defaultPageSize={20}
              pageSizeOptions={[20, 50, 100]}
              onPageChange={setPage}
              onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            />
          </>
        )}
      </Section>

      <AuditDetailsDialog
        entry={detailQuery.data || null}
        loading={Boolean(selectedId && detailQuery.isPending)}
        error={detailQuery.error}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function AuditDetailsDialog({
  entry,
  loading,
  error,
  onClose,
}: {
  entry: AuditLogEntry | null;
  loading: boolean;
  error: unknown;
  onClose: () => void;
}) {
  if (!entry && !loading && !error) return null;

  const changes = entry ? changedFieldEntries(entry) : [];
  const snapshot = entry ? visibleSnapshotEntries(entry) : [];

  return (
    <AdminDialog
      open
      onClose={onClose}
      title="Detalhes da alteração"
      description={entry ? `${operationLabel(entry.operation)} • ${formatDateTime(entry.created_at)}` : "Carregando evento de auditoria"}
      className="max-w-2xl"
    >
      {loading ? (
        <LoadingState text="Carregando detalhes..." />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Não foi possível carregar os detalhes da alteração.
        </div>
      ) : entry ? (
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:grid-cols-2">
          <Detail label="Usuário" value={entry.actor_name_snapshot || (entry.source === "system" ? "Sistema" : "Usuário")} />
          <Detail label="Módulo" value={MODULE_LABELS[entry.module_key || ""] || "Sistema"} />
          <Detail label="Registro" value={entityLabel(entry)} />
          {entry.linked_service_order_number && <Detail label="OS vinculada" value={`OS ${entry.linked_service_order_number}`} />}
          <Detail label="Origem" value={entry.source === "authenticated_user" ? "Painel" : entry.source === "server_on_behalf" ? "Servidor em nome do usuário" : "Sistema"} />
        </div>

        {entry.operation === "update" && (
          <div>
            <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Campos alterados</h3>
            <div className="divide-y divide-[#0d1b2e]/8 overflow-hidden rounded-xl border border-[#0d1b2e]/8">
              {changes.map(([field, value]) => (
                <div key={field} className="grid gap-2 bg-white p-3 sm:grid-cols-[150px_1fr_1fr]">
                  <p className="text-xs font-black text-[#0d1b2e]">{humanizeKey(field, entry.table_name)}</p>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-[#8a96a8]">Antes</p>
                    <p className="mt-1 break-words text-xs font-semibold text-[#52647c]">{formatAuditValue(value?.before, field)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-[#8a96a8]">Depois</p>
                    <p className="mt-1 break-words text-xs font-semibold text-[#0d1b2e]">{formatAuditValue(value?.after, field)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {entry.operation !== "update" && snapshot.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">{entry.operation === "delete" ? "Dados excluídos" : "Dados criados"}</h3>
            <div className="grid gap-x-4 gap-y-3 rounded-xl border border-[#0d1b2e]/8 bg-white p-4 sm:grid-cols-2">
              {snapshot.map(([field, value]) => (
                <Detail key={field} label={humanizeKey(field, entry.table_name)} value={formatAuditValue(value, field)} />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#7a8aa0]">Identificador do evento</p>
          <p className="mt-1 font-mono text-xs font-bold text-[#34445b]">#{entry.id}</p>
        </div>
      </div>
      ) : null}
    </AdminDialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-wider text-[#8a96a8]">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-[#0d1b2e]">{value || "—"}</p>
    </div>
  );
}
