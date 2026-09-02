import { PRINT_FIELD_REGISTRY } from "./print-field-registry";
import type { PrintTemplateEditorValue } from "./print-template";

type PrintOrderContext = {
  order: any;
  usedItems?: any[];
  partRequests?: any[];
  history?: any[];
  printedBy?: string | null;
};

const text = (value: unknown) => value == null || value === "" ? "—" : String(value);
const escapeHtml = (value: unknown) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString("pt-BR") : "—";
const money = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const formatDocument = (value: unknown) => {
  const number = digits(value);
  if (number.length === 11) return number.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (number.length === 14) return number.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return text(value);
};
const nameOf = (value: any) => value?.full_name || value?.name || value?.title || "—";

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

function resolveField(key: string, context: PrintOrderContext): string {
  const order = context.order || {};
  const customer = order.customer || {};
  const address = addressOf(order);
  const usedItems = context.usedItems || [];
  const requests = context.partRequests || [];
  const history = context.history || [];
  const values: Record<string, unknown> = {
    "customer.full_name": customer.full_name,
    "customer.customer_type": customer.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física",
    "customer.document": formatDocument(customer.document),
    "customer.cnpj": formatDocument(customer.cnpj),
    "customer.legal_name": customer.legal_name,
    "customer.trade_name": customer.trade_name,
    "customer.state_registration": customer.state_registration,
    "customer.birth_date": customer.birth_date ? new Date(customer.birth_date + "T00:00:00").toLocaleDateString("pt-BR") : null,
    "customer.foundation_date": customer.foundation_date,
    "customer.phone": customer.phone,
    "customer.whatsapp": customer.whatsapp,
    "customer.email": customer.email,
    "address.full": [address.street, address.number, address.complement, address.neighborhood, address.city, address.state, address.zip_code].filter(Boolean).join(", "),
    "address.zip_code": address.zip_code,
    "address.street": address.street,
    "address.number": address.number,
    "address.complement": address.complement,
    "address.neighborhood": address.neighborhood,
    "address.city": address.city,
    "address.state": address.state,
    "address.reference": address.reference,
    "address.source": address.source,
    "order.os_number": order.os_number,
    "order.external_os_number": order.external_os_number,
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
    "service.general_services": nameOf(order.general_service),
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
    "sla.situation_hours": order.situation_sla_hours,
    "sla.service_type_forecast_days": order.service_type?.forecast_days,
    "sla.solved_at": date(order.solved_at),
    "sla.completed_at": date(order.completed_at),
    "resolution.diagnosis": order.diagnosis,
    "resolution.solution": order.solution,
    "resolution.solved_at": date(order.solved_at),
    "resolution.solution_images": order.solution_images?.length ? order.solution_images.length + " imagem(ns)" : "—",
    "used_parts.items": usedItems.map((item: any) => nameOf(item.inventory_item || item.item)).join("\\n"),
    "used_parts.quantity": usedItems.map((item: any) => text(item.quantity)).join("\\n"),
    "used_parts.unit_price": usedItems.map((item: any) => money(item.unit_sale_price)).join("\\n"),
    "used_parts.total_price": usedItems.map((item: any) => money(item.total_sale_price || Number(item.unit_sale_price || 0) * Number(item.quantity || 0))).join("\\n"),
    "part_requests.requests": requests.map((item: any, index: number) => "Solicitação " + (index + 1)).join("\\n"),
    "part_requests.status": requests.map((item: any) => text(item.status)).join("\\n"),
    "part_requests.purpose": requests.map((item: any) => text(item.purpose)).join("\\n"),
    "part_requests.notes": requests.map((item: any) => text(item.notes)).join("\\n"),
    "financial.service_price": money(order.service_price),
    "financial.parts_total": money(order.parts_total),
    "financial.subtotal": money(order.subtotal),
    "financial.discount_percentage": text(order.discount_percentage) + "%",
    "financial.discount_amount": money(order.discount_amount),
    "financial.final_total": money(order.final_total),
    "financial.estimated_price": money(order.estimated_price),
    "financial.final_price": money(order.final_price),
    "history.status_changes": history.map((item: any) => [date(item.created_at), item.old_status?.name, item.new_status?.name].filter(Boolean).join(" — ")).join("\\n"),
    "signatures.customer": "________________________________",
    "signatures.technician": "________________________________",
    "signatures.customer_name": customer.full_name,
    "signatures.customer_document": formatDocument(customer.cnpj || customer.document),
    "signatures.date": new Date().toLocaleDateString("pt-BR"),
    "system.printed_at": date(new Date().toISOString()),
    "system.printed_by": context.printedBy,
    "system.page_number": "1",
  };
  return text(values[key]);
}

export function openPrintWindow() {
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) return null;
  popup.opener = null;
  popup.document.write("<!doctype html><html><head><title>Preparando impressão...</title></head><body style='font-family:Arial;padding:32px'>Preparando documento...</body></html>");
  popup.document.close();
  return popup;
}

export function renderOrderPrintDocument(popup: Window, template: PrintTemplateEditorValue, context: PrintOrderContext) {
  const sections = PRINT_FIELD_REGISTRY.map((section) => ({
    ...section,
    fields: section.fields.filter((field) => template.selectedFields.has(field.key)),
  })).filter((section) => section.fields.length > 0);

  const sectionHtml = sections.map((section) => {
    const fields = section.fields.map((field) => {
      const value = escapeHtml(resolveField(field.key, context)).replaceAll("\\n", "<br>");
      return "<div class='field'><span>" + escapeHtml(field.label) + "</span><strong>" + value + "</strong></div>";
    }).join("");
    return "<section><h2>" + escapeHtml(section.label) + "</h2><div class='grid columns-" + section.defaultColumns + "'>" + fields + "</div></section>";
  }).join("");

  const orientation = template.orientation === "landscape" ? "landscape" : "portrait";
  const layout = template.layout;
  const html = "<!doctype html><html><head><meta charset='utf-8'><title>" + escapeHtml(template.name) + "</title><style>" +
    "@page{size:A4 " + orientation + ";margin:" + template.margin_top + "mm " + template.margin_right + "mm " + template.margin_bottom + "mm " + template.margin_left + "mm}" +
    "*{box-sizing:border-box}body{margin:0;color:#0f172a;font-family:" + layout.font_family + ",sans-serif;font-size:" + layout.body_font_size + "pt;line-height:" + layout.line_height + "}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0d1b2e;padding-bottom:12px;margin-bottom:16px}.brand{font-size:20px;font-weight:900}.muted{color:#64748b}.document{text-align:right}.document h1{margin:0;font-size:19px}.document p{margin:4px 0 0}section{margin:0 0 " + layout.section_spacing + "px;break-inside:avoid;border:" + (layout.show_section_borders ? "1px solid #cbd5e1" : "0") + ";border-radius:" + (layout.section_style === "boxed" ? "8px" : "0") + ";padding:" + (layout.section_style === "boxed" ? "9px" : "8px 0") + "}h2{margin:0 0 7px;padding-bottom:5px;border-bottom:" + (layout.show_section_borders ? "1px solid #cbd5e1" : "0") + ";font-size:" + layout.section_title_font_size + "pt;text-transform:uppercase;letter-spacing:.08em}.grid{display:grid;gap:" + layout.field_spacing + "px 14px}.columns-1{grid-template-columns:1fr}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.field{min-width:0;padding:" + (layout.section_style === "table" ? "6px 4px" : "5px 7px") + ";border:" + (layout.show_field_borders ? "1px solid #cbd5e1" : "0") + ";border-bottom:" + (layout.section_style === "table" && !layout.show_field_borders ? "1px solid #cbd5e1" : "0") + ";border-radius:" + (layout.section_style === "boxed" ? "5px" : "0") + "}.field span{display:block;color:#64748b;font-size:" + layout.label_font_size + "pt;font-weight:700;text-transform:uppercase;margin-bottom:2px}.field strong{display:block;white-space:normal;overflow-wrap:anywhere;font-size:" + layout.body_font_size + "pt}.footer{display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:8px;margin-top:16px;color:#64748b;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}" +
    "</style></head><body><header class='header'><div>" +
    (template.show_logo ? "<div class='brand'>ArtVideo</div>" : "") +
    (template.show_company_info ? "<div class='muted'>Assistência Técnica</div>" : "") +
    "</div><div class='document'><h1>" + escapeHtml(template.name) + "</h1><p>" + escapeHtml(template.header_text || "") + "</p><p>OS " + escapeHtml(context.order?.os_number) + "</p></div></header>" +
    sectionHtml +
    "<footer class='footer'><span>" + escapeHtml(template.footer_text || "") + "</span><span>" + (template.show_printed_at ? "Impresso em " + escapeHtml(date(new Date().toISOString())) : "") + "</span></footer>" +
    "<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},250)})</script></body></html>";

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
