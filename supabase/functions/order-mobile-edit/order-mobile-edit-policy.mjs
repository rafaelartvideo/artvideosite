const UUID_FIELDS = new Set([
  "general_service_id",
  "service_type_id",
  "status_id",
  "situation_id",
  "equipment_type_id",
  "equipment_brand_id",
  "equipment_model_id",
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

function numeric(value) {
  const raw = text(value, 80).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sanitizeMobileOrderPatch(value) {
  const source = value && typeof value === "object" ? value : {};
  const output = {};

  for (const [key, raw] of Object.entries(source)) {
    if (UUID_FIELDS.has(key)) {
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
      output[key] = numeric(raw);
      continue;
    }
    if (key === "order_type") {
      output[key] = raw === "external" ? "external" : "internal";
      continue;
    }
    if (key === "service_state") {
      output[key] = nullableText(raw, 2)?.toUpperCase() || null;
    }
  }

  return output;
}

export function normalizeEmployeeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, 64)).filter(Boolean))].slice(0, 50);
}

export function normalizeTechnicalValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([fieldId, raw]) => [text(fieldId, 64), text(raw, 2000)])
      .filter(([fieldId]) => Boolean(fieldId)),
  );
}
