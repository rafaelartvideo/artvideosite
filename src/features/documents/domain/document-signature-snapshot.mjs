const isPlainObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) continue;
    result[key] = canonicalizeJson(item);
  }
  return result;
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") result[key] = value;
  }
  return result;
}

function sanitizeSections(sections) {
  return (Array.isArray(sections) ? sections : []).map(section => ({
    key: String(section?.key || ""),
    label: String(section?.label || ""),
    fields: (Array.isArray(section?.fields) ? section.fields : []).map(field => ({
      ...pick(field, ["key", "label", "kind", "value"]),
    })),
  })).filter(section => section.key && section.fields.length > 0);
}

function sanitizeChecklists(checklists) {
  return (Array.isArray(checklists) ? checklists : []).map(stage => ({
    ...pick(stage, ["id", "stage_code", "stage_type", "name", "situation_name", "status", "completed_at", "completed_by_name"]),
    items: (Array.isArray(stage?.items) ? stage.items : []).map(item => ({
      ...pick(item, ["id", "title", "description", "response_type", "response_code", "response_text", "response_number", "observation", "answered_at", "answered_by_name"]),
      media: (Array.isArray(item?.media) ? item.media : []).map(media => pick(media, ["media_id", "bucket_id", "storage_path", "file_name"])),
    })),
  }));
}

export function createDocumentSignatureSnapshot(input = {}) {
  const template = input.template || {};
  const snapshot = {
    schema_version: 1,
    template: {
      ...pick(template, [
        "id",
        "name",
        "description",
        "document_type",
        "paper_size",
        "orientation",
        "margin_top",
        "margin_right",
        "margin_bottom",
        "margin_left",
        "show_logo",
        "show_company_info",
        "show_page_number",
        "show_printed_at",
        "header_text",
        "footer_text",
        "layout",
        "selected_fields",
      ]),
    },
    company: pick(input.company || {}, ["name", "subtitle", "document", "phone", "email", "address"]),
    order: pick(input.order || {}, ["id", "organization_id", "os_number", "external_os_number"]),
    sections: sanitizeSections(input.sections),
    checklists: sanitizeChecklists(input.checklists),
  };
  return canonicalizeJson(snapshot);
}
