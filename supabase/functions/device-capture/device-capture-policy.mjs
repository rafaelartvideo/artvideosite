const UUID_OR_NULL_FIELDS = new Set([
  "service_id",
  "general_service_id",
  "service_type_id",
  "seller_id",
  "status_id",
  "situation_id",
  "technician_id",
  "brand_id",
  "product_id",
  "equipment_type_id",
  "equipment_brand_id",
  "equipment_model_id",
  "service_customer_address_id",
]);

const TEXT_FIELDS = new Set([
  "model",
  "accessories",
  "equipment_condition",
  "priority",
  "internal_notes",
  "customer_notes",
  "service_city",
  "service_street",
  "service_zip_code",
  "service_neighborhood",
  "service_number",
  "service_complement",
  "external_os_number",
]);

const DATE_FIELDS = new Set(["scheduled_at", "started_at"]);

function text(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function nullableText(value, max = 4000) {
  const normalized = text(value, max);
  return normalized || null;
}

function money(value) {
  const raw = text(value, 80)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSessionPurpose(value) {
  return value === "order_edit" ? "order_edit" : "capture";
}

export function sanitizeOrderEditPatch(value) {
  const source = value && typeof value === "object" ? value : {};
  const output = {};
  for (const [key, raw] of Object.entries(source)) {
    if (UUID_OR_NULL_FIELDS.has(key)) {
      output[key] = nullableText(raw, 64);
      continue;
    }
    if (TEXT_FIELDS.has(key)) {
      output[key] = nullableText(raw);
      continue;
    }
    if (DATE_FIELDS.has(key)) {
      output[key] = nullableText(raw, 64);
      continue;
    }
    if (key === "estimated_price") {
      output[key] = money(raw);
      continue;
    }
    if (key === "order_type") {
      output[key] = raw === "external" ? "external" : "internal";
      continue;
    }
    if (key === "service_state") {
      const normalized = text(raw, 2).toUpperCase();
      output[key] = normalized || null;
    }
  }
  return output;
}
