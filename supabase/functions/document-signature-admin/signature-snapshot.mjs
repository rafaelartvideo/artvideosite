function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeScalar(value, max = 20_000) {
  if (value == null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).slice(0, max);
  return null;
}

function sanitizeSections(raw, allowedFields) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map(section => ({
    key: text(section?.key, 100),
    label: text(section?.label, 180),
    fields: (Array.isArray(section?.fields) ? section.fields : []).slice(0, 120)
      .filter(field => allowedFields.has(text(field?.key, 150)))
      .map(field => ({
        key: text(field?.key, 150),
        label: text(field?.label, 180),
        kind: text(field?.kind, 30) || undefined,
        value: safeScalar(field?.value),
      })),
  })).filter(section => section.key && section.fields.length > 0);
}

function sanitizeChecklists(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map(stage => ({
    id: text(stage?.id, 80) || undefined,
    stage_code: text(stage?.stage_code, 100) || undefined,
    stage_type: text(stage?.stage_type, 50) || undefined,
    name: text(stage?.name, 220),
    situation_name: text(stage?.situation_name, 220) || undefined,
    status: text(stage?.status, 50) || undefined,
    completed_at: text(stage?.completed_at, 80) || undefined,
    completed_by_name: text(stage?.completed_by_name, 220) || undefined,
    items: (Array.isArray(stage?.items) ? stage.items : []).slice(0, 300).map(item => ({
      id: text(item?.id, 80) || undefined,
      title: text(item?.title, 500),
      description: text(item?.description, 2000) || undefined,
      response_type: text(item?.response_type, 50) || undefined,
      response_code: text(item?.response_code, 80) || undefined,
      response_text: text(item?.response_text, 5000) || undefined,
      response_number: typeof item?.response_number === "number" ? item.response_number : undefined,
      observation: text(item?.observation, 5000) || undefined,
      answered_at: text(item?.answered_at, 80) || undefined,
      answered_by_name: text(item?.answered_by_name, 220) || undefined,
      media: (Array.isArray(item?.media) ? item.media : []).slice(0, 20).map(media => ({
        media_id: text(media?.media_id, 80),
        bucket_id: text(media?.bucket_id, 120) || undefined,
        storage_path: text(media?.storage_path, 1000) || undefined,
        file_name: text(media?.file_name, 500) || undefined,
      })).filter(media => media.media_id),
    })),
  })).filter(stage => stage.name);
}

export function sanitizeFrozenSnapshot(raw, allowedFields, serverMeta) {
  return {
    schema_version: 1,
    template: serverMeta.template,
    company: serverMeta.company,
    order: serverMeta.order,
    sections: sanitizeSections(raw?.sections, allowedFields),
    checklists: sanitizeChecklists(raw?.checklists),
  };
}

function checklistResponse(item) {
  if (item?.response_text != null && item.response_text !== "") return item.response_text;
  if (item?.response_code != null && item.response_code !== "") return item.response_code;
  if (item?.response_number != null) return item.response_number;
  return "";
}

export function renderFrozenSnapshotHtml(snapshot) {
  const company = snapshot?.company || {};
  const template = snapshot?.template || {};
  const order = snapshot?.order || {};
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : [];
  const checklists = Array.isArray(snapshot?.checklists) ? snapshot.checklists : [];
  const sectionHtml = sections.map(section => {
    const fields = (Array.isArray(section.fields) ? section.fields : []).map(field => {
      const value = field.value == null ? "" : String(field.value).replaceAll("\\n", "\n");
      return `<div class="field"><span>${escapeHtml(field.label || field.key)}</span><strong>${escapeHtml(value).replaceAll("\n", "<br>")}</strong></div>`;
    }).join("");
    return `<section><h2>${escapeHtml(section.label || section.key)}</h2><div class="grid">${fields}</div></section>`;
  }).join("");
  const checklistHtml = checklists.map(stage => {
    const rows = (Array.isArray(stage.items) ? stage.items : []).map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(checklistResponse(item))}</td><td>${escapeHtml(item.observation || "")}</td></tr>`).join("");
    return `<section><h2>Checklist · ${escapeHtml(stage.name || stage.stage_code)}</h2><table><thead><tr><th>Item</th><th>Resposta</th><th>Observação</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(template.name || "Documento")}</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#172536}header{border-bottom:1px solid #dbe2ea;margin-bottom:16px;padding-bottom:12px}h1{font-size:22px;margin:0}h2{font-size:13px;text-transform:uppercase;background:#eef3f9;padding:6px;margin:14px 0 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid #dbe2ea}.field{padding:8px;border-bottom:1px solid #e6ebf1}.field span{display:block;font-size:10px;text-transform:uppercase;color:#526174;font-weight:700}.field strong{display:block;margin-top:2px;font-size:13px;white-space:pre-wrap}table{width:100%;border-collapse:collapse}th,td{font-size:12px;text-align:left;border-bottom:1px solid #e6ebf1;padding:6px}@media(max-width:640px){body{padding:14px}.grid{grid-template-columns:1fr}}</style></head><body><header><div>${escapeHtml(company.name || "Empresa")}</div><h1>${escapeHtml(template.name || "Documento")}</h1><div>OS ${escapeHtml(order.os_number || "")}</div></header>${sectionHtml}${checklistHtml}</body></html>`;
}
