import { formatZipCode } from "@/lib/address";
import {
  formatCnpj,
  formatCpf,
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  formatDurationHours,
  formatNumber,
  formatPhone,
  normalizeDigits,
} from "@/shared/domain/formatters";
import { PRINT_FIELD_REGISTRY, normalizePrintSelectedFields } from "./print-field-registry";
import type { PrintTemplateEditorValue } from "./print-template";
import type { PrintOrderContext } from "./order-print-document";
import { createDocumentSignatureSnapshot } from "./document-signature-snapshot.mjs";

export type DocumentSignatureStatus = "pending" | "viewed" | "signed" | "expired" | "cancelled";
export type DocumentExternalSignerType = "customer" | "contact";

export type DocumentSignatureSnapshotField = {
  key: string;
  label: string;
  kind?: string;
  value?: string | null;
};

export type DocumentSignatureSnapshotSection = {
  key: string;
  label: string;
  fields: DocumentSignatureSnapshotField[];
};

export type DocumentSignatureSnapshot = {
  schema_version: 1;
  template: Record<string, unknown>;
  company: Record<string, unknown>;
  order: Record<string, unknown>;
  sections: DocumentSignatureSnapshotSection[];
  checklists: Array<Record<string, unknown>>;
};

export type DocumentSignatureRequestSummary = {
  id: string;
  organization_id: string;
  service_order_id: string;
  print_template_id: string;
  status: DocumentSignatureStatus;
  verification_code: string;
  expires_at: string;
  created_at: string;
  first_viewed_at: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
  last_email_sent_at: string | null;
  require_external_signature: boolean;
  require_employee_signature: boolean;
  external_signer_type: DocumentExternalSignerType | null;
  external_signer_name: string | null;
  external_signer_email: string | null;
  external_signer_phone: string | null;
  external_document_masked: string | null;
  employee_entity_id: string | null;
  employee_name?: string | null;
  template_name_snapshot: string;
  order_number_snapshot: string;
};

export type DocumentSignatureAuditEvent = {
  id: string;
  event_type: string;
  actor_type: "admin" | "external" | "system";
  actor_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateDocumentSignatureRequestInput = {
  organization_id: string;
  service_order_id: string;
  print_template_id: string;
  snapshot: DocumentSignatureSnapshot;
  external_signer?: {
    type: DocumentExternalSignerType;
    name: string;
    document: string;
    email: string;
    phone?: string | null;
  } | null;
  manual_employee_entity_id?: string | null;
};

const text = (value: unknown) => value == null || value === "" ? "—" : String(value);
const date = (value: unknown) => formatDateTime(value ? String(value) : null, "—");
const money = (value: unknown) => formatCurrency(value as number | string | null | undefined, "—");
const nameOf = (value: any) => value?.full_name || value?.name || value?.title || "—";

function formatDocument(value: unknown) {
  const digits = normalizeDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return text(value);
}

function formatForecastDays(value: unknown) {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) return "—";
  const rounded = Math.trunc(days);
  return `${formatNumber(rounded, { maximumFractionDigits: 0 })} ${rounded === 1 ? "dia" : "dias"}`;
}

function addressOf(order: any) {
  if (order.order_type === "external" && (order.service_street || order.service_city)) {
    return {
      zip_code: order.service_zip_code,
      street: order.service_street,
      number: order.service_number,
      complement: order.service_complement,
      neighborhood: order.service_neighborhood,
      city: order.service_city,
      state: order.service_state,
      reference: order.service_reference,
      source: order.service_address_source === "customer" ? "Endereço do cliente" : "Endereço da OS",
    };
  }
  return (order.customer?.addresses || []).find((item: any) => item.is_default) || order.customer?.addresses?.[0] || {};
}

function resolveSnapshotField(key: string, context: PrintOrderContext): string {
  const order = context.order || {};
  const customer = order.customer || {};
  const address = addressOf(order);
  const usedItems = context.usedItems || [];
  const requests = context.partRequests || [];
  const history = context.history || [];
  const formattedZip = address.zip_code ? formatZipCode(String(address.zip_code)) : null;
  const values: Record<string, unknown> = {
    "customer.full_name": customer.full_name,
    "customer.customer_type": customer.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física",
    "customer.document": formatDocument(customer.cnpj || customer.document),
    "customer.legal_name": customer.legal_name,
    "customer.trade_name": customer.trade_name,
    "customer.state_registration": customer.state_registration,
    "customer.birth_date": customer.birth_date ? formatDateOnly(customer.birth_date, "—") : null,
    "customer.foundation_date": customer.foundation_date ? formatDateOnly(customer.foundation_date, "—") : null,
    "customer.phone": customer.phone ? formatPhone(customer.phone) : null,
    "customer.whatsapp": customer.whatsapp ? formatPhone(customer.whatsapp) : null,
    "customer.email": customer.email,
    "address.full": [address.street, address.number, address.complement, address.neighborhood, address.city, address.state, formattedZip].filter(Boolean).join(", "),
    "address.zip_code": formattedZip,
    "address.street": address.street,
    "address.number": address.number,
    "address.complement": address.complement,
    "address.neighborhood": address.neighborhood,
    "address.city": address.city,
    "address.state": address.state,
    "address.reference": address.reference,
    "address.source": address.source,
    "order.order_type": order.order_type === "external" ? "Externa" : "Interna",
    "order.origin": order.origin,
    "order.priority": order.priority,
    "order.status": order.order_status?.name,
    "order.situation": order.situation?.name,
    "order.internal_notes": order.internal_notes,
    "order.customer_notes": order.customer_notes,
    "order.created_at": date(order.created_at),
    "order.updated_at": date(order.updated_at),
    "service.name": nameOf(order.general_service || order.service),
    "service.type": nameOf(order.service_type),
    "service.scheduled_at": date(order.scheduled_at),
    "service.started_at": date(order.started_at || order.created_at),
    "equipment.type": nameOf(order.equipment_type),
    "equipment.brand": nameOf(order.equipment_brand),
    "equipment.model": nameOf(order.equipment_model) !== "—" ? nameOf(order.equipment_model) : order.model,
    "equipment.serial_number": order.serial_number,
    "equipment.accessories": order.accessories,
    "equipment.condition": order.equipment_condition,
    "responsibility.assigned_to": order.assigned_to_profile?.full_name,
    "responsibility.technician": (order.technician_links || []).map((item: any) => nameOf(item.employee)).join(", ") || nameOf(order.technician),
    "responsibility.completed_by": order.completed_by_profile?.full_name,
    "sla.situation_started_at": date(order.situation_started_at),
    "sla.situation_hours": order.situation_sla_hours == null ? null : formatDurationHours(order.situation_sla_hours),
    "sla.service_type_forecast_days": order.service_type?.forecast_days == null ? null : formatForecastDays(order.service_type.forecast_days),
    "sla.completed_at": date(order.completed_at),
    "resolution.diagnosis": order.diagnosis,
    "resolution.solution": order.solution,
    "resolution.solved_at": date(order.solved_at),
    "used_parts.items": usedItems.map((item: any) => nameOf(item.inventory_item || item.item)).join("\\n"),
    "used_parts.quantity": usedItems.map((item: any) => formatNumber(item.quantity, { maximumFractionDigits: 2 })).join("\\n"),
    "used_parts.unit_price": usedItems.map((item: any) => money(item.unit_sale_price)).join("\\n"),
    "used_parts.total_price": usedItems.map((item: any) => money(item.total_sale_price || Number(item.unit_sale_price || 0) * Number(item.quantity || 0))).join("\\n"),
    "part_requests.requests": requests.map((item: any, index: number) => `Solicitação ${index + 1}`).join("\\n"),
    "part_requests.status": requests.map((item: any) => text(item.status)).join("\\n"),
    "part_requests.purpose": requests.map((item: any) => text(item.purpose)).join("\\n"),
    "part_requests.notes": requests.map((item: any) => text(item.notes)).join("\\n"),
    "financial.service_price": money(order.service_price),
    "financial.parts_total": money(order.parts_total),
    "financial.subtotal": money(order.subtotal),
    "financial.discount_percentage": order.discount_percentage == null ? null : `${formatNumber(order.discount_percentage, { maximumFractionDigits: 2 })}%`,
    "financial.discount_amount": money(order.discount_amount),
    "financial.final_total": money(order.final_total ?? order.final_price),
    "financial.estimated_price": money(order.estimated_price),
    "history.status_changes": history.map((item: any) => [date(item.created_at), item.old_status?.name, item.new_status?.name].filter(Boolean).join(" — ")).join("\\n"),
    "system.printed_by": context.printedBy,
  };
  return text(values[key]);
}

function snapshotChecklists(template: PrintTemplateEditorValue, context: PrintOrderContext) {
  const checklist = context.checklist;
  if (!checklist) return [];
  return checklist.stages
    .filter(stage => template.selectedFields.has(`checklists.${stage.stage_type_snapshot}`))
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(stage => ({
      id: stage.id,
      stage_code: stage.stage_code_snapshot,
      stage_type: stage.stage_type_snapshot,
      name: stage.name_snapshot,
      situation_name: stage.situation_name_snapshot,
      status: stage.status,
      completed_at: stage.completed_at,
      completed_by_name: stage.completed_by_name,
      items: [...stage.items].sort((left, right) => left.sort_order - right.sort_order).map(item => ({
        id: item.id,
        title: item.title_snapshot,
        description: item.description_snapshot,
        response_type: item.response_type_snapshot,
        response_code: item.response_code,
        response_text: item.response_text,
        response_number: item.response_number,
        observation: item.observation,
        answered_at: item.answered_at,
        answered_by_name: item.answered_by_name,
        media: (item.media || []).map(link => ({
          media_id: link.media_id,
          bucket_id: link.media?.bucket_id,
          storage_path: link.media?.storage_path,
          file_name: link.media?.file_name,
        })),
      })),
    }));
}

export function buildOrderDocumentSignatureSnapshot(
  sourceTemplate: PrintTemplateEditorValue,
  context: PrintOrderContext,
): DocumentSignatureSnapshot {
  const template = { ...sourceTemplate, selectedFields: normalizePrintSelectedFields(sourceTemplate.selectedFields) };
  const selectedFields = PRINT_FIELD_REGISTRY
    .flatMap(section => section.fields.map(field => field.key))
    .filter(key => template.selectedFields.has(key));
  const sections = PRINT_FIELD_REGISTRY
    .filter(section => section.key !== "system" && section.key !== "checklists")
    .map(section => ({
      key: section.key,
      label: section.label,
      fields: section.fields
        .filter(field => template.selectedFields.has(field.key))
        .map(field => ({
          key: field.key,
          label: field.label,
          kind: field.kind,
          value: field.kind === "signature" ? null : resolveSnapshotField(field.key, context),
        })),
    }))
    .filter(section => section.fields.length > 0);

  return createDocumentSignatureSnapshot({
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      document_type: template.document_type,
      paper_size: template.paper_size,
      orientation: template.orientation,
      margin_top: template.margin_top,
      margin_right: template.margin_right,
      margin_bottom: template.margin_bottom,
      margin_left: template.margin_left,
      show_logo: template.show_logo,
      show_company_info: template.show_company_info,
      show_page_number: template.show_page_number,
      show_printed_at: template.show_printed_at,
      header_text: template.header_text,
      footer_text: template.footer_text,
      layout: template.layout,
      selected_fields: selectedFields,
    },
    company: context.company || {},
    order: {
      id: context.order?.id,
      organization_id: context.order?.organization_id,
      os_number: context.order?.os_number,
      external_os_number: context.order?.external_os_number,
    },
    sections,
    checklists: snapshotChecklists(template, context),
  }) as DocumentSignatureSnapshot;
}

export const DOCUMENT_SIGNATURE_STATUS_LABELS: Record<DocumentSignatureStatus, string> = {
  pending: "Pendente",
  viewed: "Visualizado",
  signed: "Assinado",
  expired: "Expirado",
  cancelled: "Cancelado",
};
