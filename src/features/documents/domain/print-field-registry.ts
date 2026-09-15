export type PrintFieldDefinition = {
  key: string;
  label: string;
  description?: string;
  kind?: "text" | "date" | "datetime" | "currency" | "boolean" | "list" | "image" | "signature";
};

export type PrintSectionDefinition = {
  key: string;
  label: string;
  description: string;
  defaultColumns: 1 | 2 | 3;
  fields: PrintFieldDefinition[];
};

/**
 * Catálogo estável do configurador de documentos.
 *
 * As chaves abaixo são identificadores de domínio, não nomes livres de colunas SQL.
 * O futuro renderer resolve cada chave a partir de um PrintOrderContext seguro.
 */
export const PRINT_FIELD_REGISTRY: PrintSectionDefinition[] = [
  {
    key: "customer",
    label: "Cliente",
    description: "Dados cadastrais e de contato do cliente vinculado à OS.",
    defaultColumns: 3,
    fields: [
      { key: "customer.full_name", label: "Nome / Nome completo" },
      { key: "customer.customer_type", label: "Tipo de cliente (PF/PJ)" },
      { key: "customer.document", label: "CPF / CNPJ" },
      { key: "customer.legal_name", label: "Razão social" },
      { key: "customer.trade_name", label: "Nome fantasia" },
      { key: "customer.state_registration", label: "Inscrição estadual" },
      { key: "customer.birth_date", label: "Data de nascimento", kind: "date" },
      { key: "customer.foundation_date", label: "Data de fundação", kind: "date" },
      { key: "customer.phone", label: "Telefone" },
      { key: "customer.whatsapp", label: "WhatsApp" },
      { key: "customer.email", label: "E-mail" },
    ],
  },
  {
    key: "address",
    label: "Endereço",
    description: "Endereço de atendimento registrado na OS e dados do endereço do cliente.",
    defaultColumns: 3,
    fields: [
      { key: "address.full", label: "Endereço completo" },
      { key: "address.zip_code", label: "CEP" },
      { key: "address.street", label: "Rua / Logradouro" },
      { key: "address.number", label: "Número" },
      { key: "address.complement", label: "Complemento" },
      { key: "address.neighborhood", label: "Bairro" },
      { key: "address.city", label: "Cidade" },
      { key: "address.state", label: "Estado / UF" },
      { key: "address.reference", label: "Referência" },
      { key: "address.source", label: "Origem do endereço" },
    ],
  },
  {
    key: "order",
    label: "Informações da OS",
    description: "Identificação, classificação e observações da Ordem de Serviço.",
    defaultColumns: 3,
    fields: [
      { key: "order.order_type", label: "Tipo da OS" },
      { key: "order.origin", label: "Origem" },
      { key: "order.priority", label: "Prioridade" },
      { key: "order.status", label: "Status" },
      { key: "order.situation", label: "Situação" },
      { key: "order.internal_notes", label: "Observações internas" },
      { key: "order.customer_notes", label: "Observações do cliente" },
      { key: "order.created_at", label: "Data de abertura", kind: "datetime" },
      { key: "order.updated_at", label: "Última atualização", kind: "datetime" },
    ],
  },
  {
    key: "service",
    label: "Atendimento / Serviço",
    description: "Serviço, tipo de atendimento e informações relacionadas ao atendimento.",
    defaultColumns: 3,
    fields: [
      { key: "service.name", label: "Serviço" },
      { key: "service.type", label: "Tipo de atendimento" },
      { key: "service.scheduled_at", label: "Data agendada", kind: "datetime" },
      { key: "service.started_at", label: "Data de início", kind: "datetime" },
    ],
  },
  {
    key: "equipment",
    label: "Equipamento",
    description: "Identificação e condição do equipamento recebido para atendimento.",
    defaultColumns: 3,
    fields: [
      { key: "equipment.type", label: "Tipo de equipamento" },
      { key: "equipment.brand", label: "Marca" },
      { key: "equipment.model", label: "Modelo" },
      { key: "equipment.serial_number", label: "Número de série" },
      { key: "equipment.accessories", label: "Acessórios" },
      { key: "equipment.condition", label: "Condição do equipamento" },
    ],
  },
  {
    key: "responsibility",
    label: "Responsáveis / Equipe",
    description: "Pessoas responsáveis pelo atendimento e execução da OS.",
    defaultColumns: 3,
    fields: [
      { key: "responsibility.assigned_to", label: "Responsável" },
      { key: "responsibility.technician", label: "Técnico" },
      { key: "responsibility.completed_by", label: "Responsável pela conclusão" },
    ],
  },
  {
    key: "sla",
    label: "SLA / Prazos",
    description: "Datas, prazos e informações temporais do fluxo da OS.",
    defaultColumns: 3,
    fields: [
      { key: "sla.situation_started_at", label: "Início da situação atual", kind: "datetime" },
      { key: "sla.situation_hours", label: "Prazo da situação (horas)" },
      { key: "sla.service_type_forecast_days", label: "Previsão do atendimento (dias)" },
      { key: "sla.completed_at", label: "Data da conclusão", kind: "datetime" },
    ],
  },
  {
    key: "resolution",
    label: "Solução",
    description: "Diagnóstico e solução técnica registrados ao resolver a OS.",
    defaultColumns: 1,
    fields: [
      { key: "resolution.diagnosis", label: "Diagnóstico" },
      { key: "resolution.solution", label: "Solução executada" },
      { key: "resolution.solved_at", label: "Data/hora da solução", kind: "datetime" },
    ],
  },
  {
    key: "used_parts",
    label: "Produtos utilizados",
    description: "Itens efetivamente utilizados na resolução da OS.",
    defaultColumns: 1,
    fields: [
      { key: "used_parts.items", label: "Lista de produtos utilizados", kind: "list" },
      { key: "used_parts.quantity", label: "Quantidades", kind: "list" },
      { key: "used_parts.unit_price", label: "Valor unitário", kind: "list" },
      { key: "used_parts.total_price", label: "Total por produto", kind: "list" },
    ],
  },
  {
    key: "part_requests",
    label: "Solicitações de peças",
    description: "Pedidos de peças e informações do fluxo de solicitação da OS.",
    defaultColumns: 1,
    fields: [
      { key: "part_requests.requests", label: "Solicitações", kind: "list" },
      { key: "part_requests.status", label: "Situação das solicitações", kind: "list" },
      { key: "part_requests.purpose", label: "Finalidade", kind: "list" },
      { key: "part_requests.notes", label: "Observações", kind: "list" },
    ],
  },
  {
    key: "financial",
    label: "Financeiro",
    description: "Valores consolidados e descontos da conclusão financeira.",
    defaultColumns: 3,
    fields: [
      { key: "financial.service_price", label: "Valor do serviço", kind: "currency" },
      { key: "financial.parts_total", label: "Total de peças", kind: "currency" },
      { key: "financial.subtotal", label: "Subtotal", kind: "currency" },
      { key: "financial.discount_percentage", label: "Desconto (%)" },
      { key: "financial.discount_amount", label: "Valor do desconto", kind: "currency" },
      { key: "financial.final_total", label: "Valor total", kind: "currency" },
      { key: "financial.estimated_price", label: "Valor estimado", kind: "currency" },
    ],
  },
  {
    key: "history",
    label: "Histórico",
    description: "Registros manuais e alterações de fluxo relacionadas à OS.",
    defaultColumns: 1,
    fields: [
      { key: "history.status_changes", label: "Histórico de status", kind: "list" },
    ],
  },
  {
    key: "checklists",
    label: "Checklists do equipamento",
    description: "Etapas registradas nesta OS, com itens, respostas e observações.",
    defaultColumns: 1,
    fields: [
      { key: "checklists.entry", label: "Checklist de entrada" },
      { key: "checklists.diagnosis", label: "Checklist de diagnóstico" },
      { key: "checklists.qc", label: "Checklist de qualidade / saída" },
      { key: "checklists.custom", label: "Checklists de etapas personalizadas" },
    ],
  },
  {
    key: "signatures",
    label: "Assinaturas",
    description: "Linha de assinatura com identificação e data abaixo, sem caixas.",
    defaultColumns: 2,
    fields: [
      { key: "signatures.customer", label: "Assinatura do cliente", kind: "signature" },
      { key: "signatures.technician", label: "Assinatura do técnico", kind: "signature" },
    ],
  },
  {
    key: "system",
    label: "Sistema / Impressão",
    description: "Metadados gerados no momento da impressão.",
    defaultColumns: 3,
    fields: [
      { key: "system.printed_by", label: "Impresso por" },
    ],
  },
];

export const PRINT_FIELD_BY_KEY = new Map(
  PRINT_FIELD_REGISTRY.flatMap(section => section.fields.map(field => [field.key, field] as const)),
);

export const PRINT_SECTION_BY_KEY = new Map(
  PRINT_FIELD_REGISTRY.map(section => [section.key, section] as const),
);


/** Map saved legacy selections to the current catalog without duplicate output. */
export function normalizePrintSelectedFields(keys: Iterable<string>): Set<string> {
  const source = new Set(keys);
  const aliases: Record<string, string> = {
    "customer.cnpj": "customer.document",
    "service.general_services": "service.name",
    "sla.solved_at": "resolution.solved_at",
    "financial.final_price": "financial.final_total",
  };
  const result = new Set([...source].map(key => aliases[key] || key).filter(key => PRINT_FIELD_BY_KEY.has(key)));
  if (!result.has("signatures.customer") && !result.has("signatures.technician") &&
      ["signatures.customer_name", "signatures.customer_document", "signatures.date"].some(key => source.has(key))) {
    result.add("signatures.customer");
  }
  return result;
}
