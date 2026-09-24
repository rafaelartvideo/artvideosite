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
  todayDateOnly,
} from "@/shared/domain/formatters";
import { PRINT_FIELD_REGISTRY, normalizePrintSelectedFields } from "./print-field-registry";
import type { OrderChecklist } from "@/features/checklists/domain/checklist";
import type { PrintTemplateEditorValue } from "./print-template";

export type PrintOrderContext = {
  order: any;
  checklist?: OrderChecklist | null;
  checklistPhotoUrls?: Record<string, string>;
  usedItems?: any[];
  partRequests?: any[];
  history?: any[];
  printedBy?: string | null;
  company?: {
    name?: string | null;
    subtitle?: string | null;
    logoUrl?: string | null;
    document?: string | null;
    stateRegistration?: string | null;
    municipalRegistration?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
};

const text = (value: unknown) => value == null || value === "" ? "—" : String(value);
const escapeHtml = (value: unknown) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const date = (value: unknown) => formatDateTime(value ? String(value) : null, "—");
const money = (value: unknown) => formatCurrency(value as number | string | null | undefined, "—");
const formatDocument = (value: unknown) => {
  const digits = normalizeDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return text(value);
};
const formatForecastDays = (value: unknown) => {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) return "—";
  const rounded = Math.trunc(days);
  return `${formatNumber(rounded, { maximumFractionDigits: 0 })} ${rounded === 1 ? "dia" : "dias"}`;
};
const nameOf = (value: any) => value?.full_name || value?.name || value?.title || "—";

function employeeSignatureName(context: PrintOrderContext) {
  const order = context.order || {};
  const technicians = (order.technician_links || []).map((item: any) => nameOf(item.employee)).filter((name: string) => name && name !== "—");
  return order.assigned_to_profile?.full_name
    || technicians.join(", ")
    || (nameOf(order.technician) !== "—" ? nameOf(order.technician) : null)
    || order.completed_by_profile?.full_name
    || "—";
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

function resolveField(key: string, context: PrintOrderContext): string {
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
    "system.printed_at": date(new Date().toISOString()),
    "system.printed_by": context.printedBy,
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

export function buildOrderPrintDocumentHtml(template: PrintTemplateEditorValue, context: PrintOrderContext, autoPrint = false) {
  template = { ...template, selectedFields: normalizePrintSelectedFields(template.selectedFields) };
  const sections = PRINT_FIELD_REGISTRY
    .filter((section) => section.key !== "system")
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => template.selectedFields.has(field.key)),
    }))
    .filter((section) => section.fields.length > 0);

  const footerItems = [
    template.footer_text?.trim() || "",
    template.show_printed_at
      ? "Impresso em " + resolveField("system.printed_at", context)
      : "",
    template.selectedFields.has("system.printed_by")
      ? "Impresso por " + resolveField("system.printed_by", context)
      : "",
  ].filter(Boolean);

  const fullWidthFields = new Set([
    "address.full",
    "order.internal_notes",
    "order.customer_notes",
    "equipment.accessories",
    "equipment.condition",
    "resolution.diagnosis",
    "resolution.solution",
    "used_parts.items",
    "part_requests.notes",
    "history.status_changes",
  ]);
  const sectionHtml = sections.map((section) => {
    if (section.key === "signatures") {
      const signatures = section.fields.map((field) => {
        const customer = context.order?.customer || {};
        const isCustomer = field.key === "signatures.customer";
        const name = isCustomer ? customer.full_name || customer.legal_name || customer.trade_name : employeeSignatureName(context);
        const document = isCustomer ? customer.cnpj || customer.document : null;
        return "<div class='signature'><div class='signature-line'></div>" +
          "<div class='signature-label'>" + escapeHtml(field.label) + "</div>" +
          (name && name !== "—" ? "<div class='signature-name'>" + escapeHtml(name) + "</div>" : "") +
          (document ? "<div>" + escapeHtml(formatDocument(document)) + "</div>" : "") +
          "<div class='signature-date'>Data: " + escapeHtml(formatDateOnly(todayDateOnly(), "—")) + "</div></div>";
      }).join("");
      return "<section class='signature-section'><div class='signatures'>" + signatures + "</div></section>";
    }
    if (section.key === "checklists") {
      const stages = (context.checklist?.stages || []).filter(stage => template.selectedFields.has("checklists." + stage.stage_type_snapshot));
      if (!stages.length) return "<section><h2>Checklists do equipamento</h2><div class='field'>Nenhuma etapa selecionada registrada nesta OS.</div></section>";
      const labels: Record<string, string> = { ok: "Conforme", not_ok: "Não conforme", yes: "Sim", no: "Não", confirmed: "Confirmado", na: "Não se aplica" };
      return [...stages].sort((a, b) => a.sort_order - b.sort_order).map(stage => {
        const hasNotes = stage.items.some(item => item.observation?.trim());
        const rows = [...stage.items].sort((a, b) => a.sort_order - b.sort_order).map(item => {
          const answer = item.response_code === "na" ? labels.na
            : item.response_type_snapshot === "number" ? (item.response_number == null ? "Não respondido" : formatNumber(item.response_number))
            : item.response_type_snapshot === "text" ? item.response_text || "Não respondido"
            : labels[item.response_code || ""] || "Não respondido";
          const photos = (item.media || []).filter((link, index, links) =>
            Boolean(context.checklistPhotoUrls?.[link.media_id]) && links.findIndex(other => other.media_id === link.media_id) === index,
          );
          let photoRows = "";
          for (let offset = 0; offset < photos.length; offset += 3) {
            photoRows += "<tr class='checklist-photo-row'><td colspan='" + (hasNotes ? 3 : 2) + "'><div class='checklist-photos'>" +
              photos.slice(offset, offset + 3).map((link, index) => {
                const caption = item.title_snapshot + " · Foto " + (offset + index + 1);
                return "<figure><img src='" + escapeHtml(context.checklistPhotoUrls![link.media_id]) + "' alt='" + escapeHtml(caption) + "' loading='eager'><figcaption>" + escapeHtml(caption) + "</figcaption></figure>";
              }).join("") + "</div></td></tr>";
          }
          return "<tr><td>" + escapeHtml(item.title_snapshot) + "</td><td>" + escapeHtml(answer) + "</td>" +
            (hasNotes ? "<td>" + escapeHtml(item.observation) + "</td>" : "") + "</tr>" + photoRows;
        }).join("");
        return "<section class='section-list'><h2>Checklist · " + escapeHtml(stage.name_snapshot) + "</h2><table class='checklist-table'><thead><tr><th scope='col'>Item</th><th scope='col'>Resultado</th>" +
          (hasNotes ? "<th scope='col'>Observações</th>" : "") + "</tr></thead><tbody>" + (rows || "<tr><td colspan='2'>Nenhum item cadastrado.</td></tr>") + "</tbody></table></section>";
      }).join("");
    }
    const columnCount = Math.min(section.fields.length, section.defaultColumns);
    if (section.key === "used_parts") {
      const numeric = (key: string) => key !== "used_parts.items" ? " class='numeric'" : "";
      const rows = (context.usedItems || []).map((item) => "<tr>" + section.fields.map((field) =>
        "<td" + numeric(field.key) + ">" + escapeHtml(resolveField(field.key, { ...context, usedItems: [item] })) + "</td>",
      ).join("") + "</tr>").join("");
      return "<section class='section-list'><h2>" + escapeHtml(section.label) + "</h2><table class='items-table'><thead><tr>" + section.fields.map((field) =>
        "<th scope='col'" + numeric(field.key) + ">" + escapeHtml(field.label) + "</th>",
      ).join("") + "</tr></thead><tbody>" + (rows || "<tr><td colspan='" + section.fields.length + "'>Nenhum produto utilizado.</td></tr>") + "</tbody></table></section>";
    }
    const fields = section.fields.map((field) => {
      const value = escapeHtml(resolveField(field.key, context)).replaceAll("\\n", "<br>");
      const widthClass = (fullWidthFields.has(field.key) ? " field-wide" : "") + (field.key === "financial.final_total" ? " field-total" : "");
      return "<div class='field" + widthClass + "'><span>" + escapeHtml(field.label) + "</span><strong>" + value + "</strong></div>";
    }).join("");
    return "<section><h2>" + escapeHtml(section.label) + "</h2><div class='grid columns-" + columnCount + "'>" + fields + "</div></section>";
  }).join("");

  const orientation = template.orientation === "landscape" ? "landscape" : "portrait";
  const layout = template.layout;
  const company = context.company || {};
  const companyName = company.name || "Empresa";
  const companySubtitle = company.subtitle || "";
  const companyDocument = company.document ? formatDocument(company.document) : null;
  const companyStateRegistration = company.stateRegistration ? "IE " + text(company.stateRegistration) : null;
  const companyMunicipalRegistration = company.municipalRegistration ? "IM " + text(company.municipalRegistration) : null;
  const companyPhone = company.phone ? formatPhone(company.phone) : null;
  const companyDetails = [
    companyDocument,
    companyStateRegistration,
    companyMunicipalRegistration,
    companyPhone,
    company.email,
    company.address,
  ].filter(Boolean);
  const companyLogo = company.logoUrl
    ? "<img class='company-logo' src='" + escapeHtml(company.logoUrl) + "' alt='" + escapeHtml(companyName) + "'>"
    : "";
  // Keep enough printable area around the sheet even for older 2mm templates.
  const margins = [template.margin_top, template.margin_right, template.margin_bottom, template.margin_left]
    .map((value) => Math.max(6, Number(value) || 6));
  const pagePadding = margins.map((value) => value + "mm").join(" ");
  const pageWidth = orientation === "landscape" ? 297 : 210;
  const printScript = autoPrint
    ? "<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},250)});window.addEventListener('afterprint',function(){window.close()})</script>"
    : "";
  const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>" + escapeHtml(template.name) + "</title><style>" +
    "@page{size:A4 " + orientation + ";margin:" + pagePadding + ";" + (template.show_page_number ? "@bottom-center{content:'Página ' counter(page) ' de ' counter(pages);font-family:Arial,sans-serif;font-size:8pt;color:#526174}" : "") + "}" +
    "*{box-sizing:border-box}html{background:#eef2f6}body{width:" + pageWidth + "mm;max-width:100%;margin:0 auto;padding:" + pagePadding + ";background:#fff;color:#172536;font-family:" + layout.font_family + ",sans-serif;font-size:" + layout.body_font_size + "pt;line-height:" + Math.max(1.2, layout.line_height) + ";overflow-wrap:anywhere}" +
    ".header{display:grid;grid-template-columns:minmax(0,1fr) minmax(95px,.3fr);align-items:start;gap:6px 16px;padding-bottom:4px;margin-bottom:6px;break-inside:avoid}.company{display:flex;align-items:center;gap:12px;min-width:0}.company-logo{display:block;flex-shrink:0;width:64px;height:64px;object-fit:contain}.brand-mark{display:grid;place-items:center;flex-shrink:0;width:48px;height:48px;border-radius:8px;background:#0057e7;color:#fff;font-size:16px;font-weight:800}.company-copy{min-width:0}.brand{font-size:14pt;font-weight:800;line-height:1.2}.company-subtitle{margin-top:3px;font-size:9pt;color:#475569}.company-details{margin-top:5px;font-size:8pt;line-height:1.45;color:#475569}.document{grid-column:1/-1;grid-row:2;padding-top:6px;border-top:1px solid #dbe2ea}.document h1{margin:0;font-size:15pt;line-height:1.25;font-weight:800}.document p{margin:4px 0 0;font-size:9pt;color:#475569;white-space:pre-wrap}.document p:empty{display:none}.order-number{grid-column:2;grid-row:1;text-align:right;min-width:0}.order-number span{display:block;font-size:8pt;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.order-number strong{display:block;margin-top:4px;font-size:21pt;line-height:1.15;color:#0057e7}.order-number small{display:block;margin-top:6px;font-size:8pt;color:#475569}" +
    "section{margin:0 0 " + layout.section_spacing + "px;border:" + (layout.show_section_borders ? "1px solid #cbd5e1" : "0") + ";border-radius:" + (layout.section_style === "boxed" ? "6px" : "0") + ";padding:" + (layout.section_style === "boxed" ? "8px" : "0") + ";break-inside:auto}h2{margin:0;padding:3px 6px;background:#eef3f9;color:#24364b;border-bottom:" + (layout.show_section_borders ? "1px solid #cbd5e1" : "0") + ";font-size:" + layout.section_title_font_size + "pt;line-height:1.25;font-weight:700;text-transform:uppercase;letter-spacing:.035em;break-after:avoid}" +
    ".grid{display:grid;gap:" + layout.field_spacing + "px;align-items:stretch;border-left:" + (layout.show_field_borders ? "1px solid #cbd5e1" : "0") + ";}.columns-1{grid-template-columns:minmax(0,1fr)}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.field{min-width:0;padding:4px 6px;break-inside:avoid;border:0;" + (layout.show_field_borders ? "box-shadow:inset -1px -1px #cbd5e1;" : "") + "}.field span{display:block;margin-bottom:1px;color:#526174;font-size:" + layout.label_font_size + "pt;line-height:1.3;font-weight:700;text-transform:uppercase}.field strong{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:" + layout.body_font_size + "pt;font-weight:500;line-height:inherit}.field-wide{grid-column:1/-1}.field-total{background:#eef3f9}.field-total strong{font-size:1.15em;font-weight:800;color:#0057e7}" +
    ".signature-section{border:0;padding:0;margin:10px 0 4px;break-inside:avoid}.signatures{display:flex;justify-content:center;align-items:stretch;gap:24px}.signature{flex:1;max-width:46%;min-width:0;text-align:center;font-size:9pt;line-height:1.3;display:flex;flex-direction:column}.signature-line{border-top:1px solid #64748b;margin:24px 0 4px}.signature-label{font-size:8pt;color:#526174}.signature-name{font-weight:600}.signature-date{margin-top:auto;padding-top:3px}" +
    ".items-table,.checklist-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:inherit}.items-table th,.items-table td,.checklist-table th,.checklist-table td{padding:4px 6px;border-bottom:" + (layout.show_field_borders ? "1px solid #cbd5e1" : "0") + ";vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.items-table th,.checklist-table th{text-align:left;font-size:" + layout.label_font_size + "pt;color:#526174;font-weight:700;line-height:1.3}.items-table .numeric{text-align:right;font-variant-numeric:tabular-nums}.items-table th:not(.numeric){width:46%}.items-table tr,.checklist-table tr{break-inside:avoid}.items-table thead,.checklist-table thead{display:table-header-group}.footer{position:static;display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin-top:8px;border-top:1px solid #cbd5e1;padding-top:5px;color:#526174;font-size:8pt;line-height:1.4;break-inside:avoid}.footer-item{white-space:pre-wrap}" +
    ".checklist-photos{display:flex;gap:8px;white-space:normal}.checklist-photos figure{margin:0;width:calc((100% - 16px)/3);min-width:0;break-inside:avoid}.checklist-photos img{display:block;width:100%;height:38mm;object-fit:contain;background:#f8fafc}.checklist-photos figcaption{margin-top:3px;font-size:7pt;line-height:1.25;color:#526174}.checklist-photo-row{break-inside:avoid}" +
    "@media print{html{background:#fff}body{width:auto;max-width:none;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{break-after:avoid}p{orphans:3;widows:3}}" +
    "</style></head><body><header class='header'><div class='company'>" +
    (template.show_logo ? companyLogo : "") +
    (template.show_company_info ? "<div class='company-copy'><div class='brand'>" + escapeHtml(companyName) + "</div><div class='company-subtitle'>" + escapeHtml(companySubtitle) + "</div>" + (companyDetails.length ? "<div class='company-details'>" + companyDetails.map(escapeHtml).join("<br>") + "</div>" : "") + "</div>" : "") +
    "</div><div class='document'><h1>" + escapeHtml(template.name) + "</h1>" + (template.header_text?.trim() ? "<p>" + escapeHtml(template.header_text.trim()) + "</p>" : "") + "</div><div class='order-number'><span>Número da OS</span><strong>" + escapeHtml(context.order?.os_number) + "</strong>" + (context.order?.external_os_number ? "<small>OS externa " + escapeHtml(context.order.external_os_number) + "</small>" : "") + "</div></header>" +
    sectionHtml +
    (footerItems.length ? "<footer class='footer'>" + footerItems.map((item) => "<span class='footer-item'>" + escapeHtml(item) + "</span>").join("") + "</footer>" : "") +
    printScript + "</body></html>";

  return html;
}

export function renderOrderPrintDocument(popup: Window, template: PrintTemplateEditorValue, context: PrintOrderContext) {
  popup.document.open();
  popup.document.write(buildOrderPrintDocumentHtml(template, context, true));
  popup.document.close();
}
