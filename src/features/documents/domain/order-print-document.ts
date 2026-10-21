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
import type { OrderChecklist } from "@/features/checklists/domain/checklist";
import type { PrintTemplateEditorValue } from "./print-template";

export type PrintOrderContext = {
  order: any;
  quote?: { version?: number; status?: string; diagnosis?: string; proposed_solution?: string; valid_until?: string | null; items?: any[]; discount_type?: string; discount_value?: number } | null;
  checklist?: OrderChecklist | null;
  checklistPhotoUrls?: Record<string, string>;
  usedItems?: any[];
  partRequests?: any[];
  history?: any[];
  printedBy?: string | null;
  employeeCpf?: string | null;
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
const escapeCssContent = (value: unknown) => String(value ?? "")
  .replaceAll("\\", "\\\\")
  .replaceAll("'", "\\'");
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
  const quote = context.quote;
  const quoteItems: any[] = Array.isArray(quote?.items) ? quote.items : [];
  const quoteProductsTotal = quoteItems.filter(item=>item.item_type==="product").reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0);
  const quoteServicesTotal = quoteItems.filter(item=>item.item_type!=="product").reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0);
  const quoteSubtotal = quoteProductsTotal+quoteServicesTotal;
  const quoteDiscount = quote?.discount_type==="percentage" ? quoteSubtotal*Number(quote.discount_value||0)/100 : Number(quote?.discount_value||0);
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
    "quote.version": quote?.version,
    "quote.status": ({draft:"Rascunho",awaiting_approval:"Aguardando aprovação",approved:"Aprovado",rejected:"Reprovado",renegotiation:"Renegociação"} as Record<string,string>)[quote?.status||""] || quote?.status,
    "quote.problem_description": order.customer_notes,
    "quote.diagnosis": quote?.diagnosis,
    "quote.proposed_solution": quote?.proposed_solution,
    "quote.valid_until": quote?.valid_until ? formatDateOnly(quote.valid_until,"—") : null,
    "quote.products_total": quote ? money(quoteProductsTotal) : null,
    "quote.services_total": quote ? money(quoteServicesTotal) : null,
    "quote.subtotal": quote ? money(quoteSubtotal) : null,
    "quote.discount_amount": quote ? money(quoteDiscount) : null,
    "quote.total": quote ? money(Math.max(0,quoteSubtotal-quoteDiscount)) : null,
    "quote_items.title": quoteItems.map(item=>item.title_snapshot).join("\\n"),
    "quote_items.quantity": quoteItems.map(item=>text(item.quantity)).join("\\n"),
    "quote_items.unit_price": quoteItems.map(item=>money(item.unit_price)).join("\\n"),
    "quote_items.total": quoteItems.map(item=>money(Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0))).join("\\n"),
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

/** Conteúdo compartilhado pelos rodapés de impressão e PDF congelado. */
export function getOrderPrintFooterMetadata(template: PrintTemplateEditorValue, context: PrintOrderContext) {
  return {
    printedAt: template.show_printed_at
      ? "Impresso em " + resolveField("system.printed_at", context)
      : "",
    printedBy: template.selectedFields.has("system.printed_by")
      ? "Impresso por " + resolveField("system.printed_by", context)
      : "",
    pageNumber: template.show_page_number !== false,
  };
}

/** A área do rodapé não pode invadir tabelas nem assinaturas, mesmo em modelos antigos. */
export function orderPrintSafeMargins(template: PrintTemplateEditorValue) {
  // Keep the user's configured margins, including zero and fractional millimeters.
  // The operating system/printer can still impose its own physical non-printable area.
  const margin = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 12;
  };
  return [margin(template.margin_top), margin(template.margin_right),
    margin(template.margin_bottom), margin(template.margin_left)] as const;
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
  const sectionSequence = template.document_type === "ORCAMENTO"
    ? ["customer", "order", "equipment", "quote_items", "quote", "signatures"]
    : null;
  const sections = PRINT_FIELD_REGISTRY
    .filter((section) => section.key !== "system")
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => template.selectedFields.has(field.key)),
    }))
    .filter((section) => section.fields.length > 0)
    .sort((a,b)=> sectionSequence
      ? (sectionSequence.indexOf(a.key) < 0 ? 100 : sectionSequence.indexOf(a.key))
        - (sectionSequence.indexOf(b.key) < 0 ? 100 : sectionSequence.indexOf(b.key))
      : 0);

  // Os metadados do rodapé pertencem à margem física de CADA página,
  // nunca à última seção do corpo (onde podiam ser cortados pelas assinaturas).
  const footerMeta = getOrderPrintFooterMetadata(template, context);
  const customFooterText = template.footer_text?.trim() || "";

  const fullWidthFields = new Set([
    "address.full",
    "order.internal_notes",
    "order.customer_notes",
    "equipment.accessories",
    "equipment.condition",
    "resolution.diagnosis",
    "resolution.solution",
    "quote.diagnosis",
    "quote.proposed_solution",
    "used_parts.items",
    "part_requests.notes",
    "history.status_changes",
  ]);
  const sectionHtml = sections.map((section) => {
    if (section.key === "signatures") {
      const signatures = section.fields.map(field => {
        const cpf = field.key === "signatures.customer"
          ? context.order?.customer?.document || context.order?.customer?.cpf || null
          : context.employeeCpf || null;
        return "<div class='signature'><div class='signature-line'></div>" +
          "<div class='signature-label'>" + escapeHtml(field.label) + "</div>" +
          (cpf && normalizeDigits(cpf).length===11
            ? "<div class='signature-document'>CPF: " + escapeHtml(formatDocument(cpf)) + "</div>"
            : "") + "</div>";
      }).join("");
      return "<section class='signature-section'><div class='signatures'>" + signatures + "</div></section>";
    }
    if (section.key === "equipment") {
      const order = context.order || {};
      const extras = Array.isArray(order.technical_values) ? order.technical_values : [];
      const fields: Array<{label:string;value:unknown}> = [];
      if (section.fields.some(field=>field.key==="equipment.general")) {
        const add = (label:string,value:unknown) => {
          if (value!==null && value!==undefined && String(value).trim()!=="" && String(value)!=="—")
            fields.push({label,value});
        };
        add("Equipamento",nameOf(order.equipment_type));
        add("Marca",nameOf(order.equipment_brand));
        add("Modelo",nameOf(order.equipment_model)!=="—" ? nameOf(order.equipment_model) : order.model);
        add("Número de série",order.serial_number);
        for (const extra of extras) {
          const label=String(extra.label_snapshot || extra.field_key_snapshot || "").trim();
          const value=extra.field_type_snapshot==="number" ? extra.value_number : extra.value_text;
          if(label && value!==null && value!==undefined && String(value).trim()!=="" &&
            !fields.some(field=>field.label.toLocaleLowerCase("pt-BR")===label.toLocaleLowerCase("pt-BR")))
            add(label,value);
        }
      }
      for(const field of section.fields) {
        if(field.key==="equipment.general")continue;
        const value=resolveField(field.key,context);
        if(value && value!=="—")fields.push({label:field.label,value});
      }
      if(!fields.length)fields.push({label:"Equipamento",value:"Não informado"});
      const equipmentColumns = Math.max(2,Math.min(3,template.layout.section_columns?.equipment ?? 2));
      return "<section class='equipment-section'><h2>"+escapeHtml(section.label)+
        "</h2><div class='grid columns-"+equipmentColumns+"'>" +
        fields.map(field=>"<div class='field'><span>"+escapeHtml(field.label)+"</span><strong>"+
          escapeHtml(field.value)+"</strong></div>").join("")+"</div></section>";
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
    const requestedColumns = template.layout.section_columns?.[section.key] ?? section.defaultColumns;
    const columnCount = Math.max(2,Math.min(3,requestedColumns));
    if (section.key === "quote") {
      const quoteFields = new Map(section.fields.map(field=>[field.key,field]));
      const renderField=(key:string) => {
        const field=quoteFields.get(key);
        if(!field)return "";
        const value=resolveField(key,context);
        return "<div class='field'><span>"+escapeHtml(field.label)+"</span><strong>"+
          escapeHtml(value)+"</strong></div>";
      };
      const row=(keys:string[],columns:number,kind:string) => {
        const html=keys.filter(key=>quoteFields.has(key)).map(renderField).join("");
        if(!html)return "";
        const count=keys.filter(key=>quoteFields.has(key)).length;
        return "<div class='quote-row quote-row-"+kind+" columns-"+Math.min(columns,Math.max(2,count))+"'>"+html+"</div>";
      };
      const rows=[
        row(["quote.problem_description"],2,"problem"),
        row(["quote.diagnosis","quote.proposed_solution"],2,"technical"),
        row(["quote.valid_until"],2,"validity"),
        row(["quote.products_total","quote.services_total","quote.subtotal"],3,"totals"),
        row(["quote.discount_amount","quote.total"],2,"final"),
      ].join("");
      return "<section class='quote-section'><h2>"+escapeHtml(section.label)+"</h2>"+rows+"</section>";
    }
    if (section.key === "quote_items") {
      const numeric = (key: string) => key !== "quote_items.title" ? " class='numeric'" : "";
      const rows = (context.quote?.items || []).map(item => "<tr>" + section.fields.map(field => {
        const value = field.key==="quote_items.title" ? item.title_snapshot :
          field.key==="quote_items.quantity" ? String(item.quantity||0) :
          field.key==="quote_items.unit_price" ? money(item.unit_price) :
          field.key==="quote_items.total" ? money(Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0)) : "";
        return "<td"+numeric(field.key)+">"+escapeHtml(value)+"</td>";
      }).join("")+"</tr>").join("");
      return "<section class='section-list'><h2>"+escapeHtml(section.label)+"</h2><table class='items-table'><thead><tr>"+
        section.fields.map(field=>"<th scope='col'"+numeric(field.key)+">"+escapeHtml(field.label)+"</th>").join("")+
        "</tr></thead><tbody>"+(rows || "<tr><td colspan='"+section.fields.length+"'>Nenhum item incluído.</td></tr>")+
        "</tbody>"+(context.quote
          ? "<tfoot><tr class='subtotal-row'><th scope='row' colspan='"+Math.max(1,section.fields.length-1)+
            "'>Subtotal</th><td class='numeric'>"+
            escapeHtml(money((context.quote.items||[]).reduce((sum,item)=>
              sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0)))+
            "</td></tr></tfoot>"
          : "")+"</table></section>";
    }
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
  const margins = orderPrintSafeMargins(template);
  const pagePadding = margins.map((value) => value + "mm").join(" ");
  const pageWidth = orientation === "landscape" ? 297 : 210;
  const pageFooterLeft = footerMeta.printedAt
    ? "'" + escapeCssContent(footerMeta.printedAt) + "'"
    : "none";
  const pageFooterCenter = footerMeta.pageNumber
    ? "'Página ' counter(page) ' de ' counter(pages)"
    : "none";
  const pageFooterRight = footerMeta.printedBy
    ? "'" + escapeCssContent(footerMeta.printedBy) + "'"
    : "none";
  const printScript = autoPrint
    ? "<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},250)});window.addEventListener('afterprint',function(){window.close()})</script>"
    : "";
  const documentTitle = autoPrint ? "" : template.name;
  const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>" + escapeHtml(documentTitle) + "</title><style>" +
    "@page{size:A4 " + orientation + ";margin:" + pagePadding + ";@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:" + pageFooterLeft + ";font-family:Arial,sans-serif;font-size:7.5pt;color:#526174;text-align:left}@bottom-center{content:" + pageFooterCenter + ";font-family:Arial,sans-serif;font-size:8pt;color:#526174;text-align:center}@bottom-right{content:" + pageFooterRight + ";font-family:Arial,sans-serif;font-size:7.5pt;color:#526174;text-align:right}}" +
    "*{box-sizing:border-box}html{background:#eef2f6}body{width:" + pageWidth + "mm;max-width:100%;margin:0 auto;padding:" + pagePadding + ";background:#fff;color:#172536;font-family:" + layout.font_family + ",sans-serif;font-size:" + layout.body_font_size + "pt;line-height:" + Math.max(1.2, layout.line_height) + ";overflow-wrap:anywhere}" +
    ".header{display:grid;grid-template-columns:minmax(0,1fr) minmax(90px,27%);align-items:start;gap:5px 12px;padding-bottom:6px;margin-bottom:8px;break-inside:avoid-page;page-break-inside:avoid}.company{display:flex;align-items:flex-start;gap:10px;min-width:0}.company-logo{display:block;flex-shrink:0;width:64px;height:64px;object-fit:contain}.brand-mark{display:grid;place-items:center;flex-shrink:0;width:48px;height:48px;border-radius:8px;background:#0057e7;color:#fff;font-size:16px;font-weight:800}.company-copy{min-width:0}.brand{font-size:14pt;font-weight:800;line-height:1.2}.company-subtitle{margin-top:3px;font-size:9pt;color:#475569}.company-details{margin-top:5px;font-size:8pt;line-height:1.45;color:#475569}.document{grid-column:1/-1;grid-row:2;padding-top:6px;border-top:1px solid #dbe2ea}.document h1{margin:0;font-size:15pt;line-height:1.25;font-weight:800}.document p{margin:4px 0 0;font-size:9pt;color:#475569;white-space:pre-wrap}.document p:empty{display:none}.order-number{grid-column:2;grid-row:1;text-align:right;min-width:0}.order-number span{display:block;font-size:8pt;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.order-number strong{display:block;margin-top:4px;font-size:21pt;line-height:1.15;color:#0057e7}.order-number small{display:block;margin-top:6px;font-size:8pt;color:#475569}" +
    "section{margin:0 0 " + layout.section_spacing + "px;max-width:100%;min-width:0;border:" + (layout.show_section_borders ? "1px solid #cbd5e1" : "0") + ";border-radius:" + (layout.section_style === "boxed" ? "6px" : "0") + ";padding:" + (layout.section_style === "boxed" ? "8px" : "0") + ";break-inside:auto;page-break-inside:auto}section>h2{break-after:avoid-page;page-break-after:avoid;display:block;margin:0;min-height:18px;padding:4px 7px;background:#eef3f9;color:#24364b;border-bottom:" + (layout.show_section_borders ? "1px solid #cbd5e1" : "0") + ";font-size:" + layout.section_title_font_size + "pt;line-height:1.25;font-weight:700;text-transform:uppercase;letter-spacing:.035em;break-after:avoid-page;page-break-after:avoid}" +
    ".grid{display:grid;gap:" + layout.field_spacing + "px;align-items:stretch;min-width:0;border-left:" + (layout.show_field_borders ? "1px solid #cbd5e1" : "0") + ";}.columns-1{grid-template-columns:minmax(0,1fr)}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.field{min-width:0;padding:6px 8px 9px;break-inside:avoid;border:0;" + (layout.show_field_borders ? "box-shadow:inset -1px -1px #cbd5e1;" : "") + "}.field span{display:block;margin-bottom:1px;color:#526174;font-size:" + layout.label_font_size + "pt;line-height:1.3;font-weight:700;text-transform:uppercase}.field strong{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:" + layout.body_font_size + "pt;font-weight:500;line-height:inherit}.field-wide{grid-column:1/-1}.field-total{background:#eef3f9}.field-total strong{font-size:1.15em;font-weight:800;color:#0057e7}" +
    ".signature-section{border:0;padding:0;margin:12px 0 4px;break-inside:avoid-page;page-break-inside:avoid}.signatures{display:flex;justify-content:space-between;align-items:stretch;gap:24px}.signature{flex:1;min-width:0;text-align:center;font-size:9pt;line-height:1.3;display:flex;flex-direction:column}.signature-line{border-top:1px solid #64748b;margin:22px 0 5px}.signature-label{font-size:8pt;color:#526174}.signature-document{margin-top:4px;font-weight:600;font-size:8.5pt}" +
    ".quote-row{display:grid;min-width:0;break-inside:avoid-page;page-break-inside:avoid;grid-template-columns:repeat(2,minmax(0,1fr))}.quote-row.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.quote-row-problem .field,.quote-row-validity .field{grid-column:1/-1}.quote-row .field{border-bottom:1px solid #dbe2ea;min-height:41px}.quote-row .field:not(:last-child){border-right:1px solid #dbe2ea}.quote-row-final .field:last-child{background:#f0f4f8}.quote-row-final .field:last-child strong{font-size:1.17em;font-weight:800}.items-table,.checklist-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:inherit}.items-table th,.items-table td,.checklist-table th,.checklist-table td{padding:6px 8px 9px;line-height:1.4;border-bottom:" + (layout.show_field_borders ? "1px solid #cbd5e1" : "0") + ";vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.items-table th,.checklist-table th{text-align:left;font-size:" + layout.label_font_size + "pt;color:#526174;font-weight:700;line-height:1.3}.items-table .numeric{text-align:right;font-variant-numeric:tabular-nums}.items-table th:not(.numeric){width:47%}.items-table tr,.checklist-table tr{break-inside:avoid-page;page-break-inside:avoid}.items-table tfoot{display:table-row-group;break-inside:avoid-page}.items-table .subtotal-row{background:#f1f5fa;font-weight:800;border-top:1px solid #94a3b8}.items-table .subtotal-row th{text-align:right;color:#24364b;font-size:inherit}.items-table .subtotal-row td{font-weight:800;font-size:1.05em}.items-table thead,.checklist-table thead{display:table-header-group}.footer{position:static;display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin-top:8px;border-top:1px solid #cbd5e1;padding-top:5px;color:#526174;font-size:8pt;line-height:1.4;break-inside:avoid}.footer-item{white-space:pre-wrap}" +
    ".checklist-photos{display:flex;gap:8px;white-space:normal}.checklist-photos figure{margin:0;width:calc((100% - 16px)/3);min-width:0;break-inside:avoid}.checklist-photos img{display:block;width:100%;height:38mm;object-fit:contain;background:#f8fafc}.checklist-photos figcaption{margin-top:3px;font-size:7pt;line-height:1.25;color:#526174}.checklist-photo-row{break-inside:avoid}" +
    "@media print{html{background:#fff}body{width:auto;max-width:none;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.header{break-inside:avoid-page}section>h2{break-after:avoid-page}table thead{display:table-header-group}table tfoot{display:table-row-group}tr{break-inside:avoid-page}p{orphans:3;widows:3}}" +
    "</style></head><body><header class='header'><div class='company'>" +
    (template.show_logo ? companyLogo : "") +
    (template.show_company_info ? "<div class='company-copy'><div class='brand'>" + escapeHtml(companyName) + "</div><div class='company-subtitle'>" + escapeHtml(companySubtitle) + "</div>" + (companyDetails.length ? "<div class='company-details'>" + companyDetails.map(escapeHtml).join("<br>") + "</div>" : "") + "</div>" : "") +
    "</div><div class='document'><h1>" + escapeHtml(template.name) + "</h1>" + (template.header_text?.trim() ? "<p>" + escapeHtml(template.header_text.trim()) + "</p>" : "") + "</div><div class='order-number'><span>Número da OS</span><strong>" + escapeHtml(context.order?.os_number) + "</strong>" + (context.order?.external_os_number ? "<small>OS externa " + escapeHtml(context.order.external_os_number) + "</small>" : "") + "</div></header>" +
    sectionHtml +
    (customFooterText ? "<footer class='footer'><span class='footer-item'>" + escapeHtml(customFooterText) + "</span></footer>" : "") +
    printScript + "</body></html>";

  return html;
}

export function renderOrderPrintDocument(popup: Window, template: PrintTemplateEditorValue, context: PrintOrderContext) {
  popup.document.open();
  popup.document.write(buildOrderPrintDocumentHtml(template, context, true));
  popup.document.close();
}
