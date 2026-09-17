function text(value) { return String(value ?? "").trim(); }

export function signatureKindsFromSnapshot(snapshot) {
  const seen = new Set();
  const result = [];
  for (const section of Array.isArray(snapshot?.sections) ? snapshot.sections : []) {
    for (const field of Array.isArray(section?.fields) ? section.fields : []) {
      if (field?.kind !== "signature") continue;
      const key = text(field?.key);
      const kind = key === "signatures.customer"
        ? "external"
        : key === "signatures.employee" || key === "signatures.technician"
          ? "employee"
          : null;
      if (kind && !seen.has(kind)) {
        seen.add(kind);
        result.push(kind);
      }
    }
  }
  return result;
}

export function requestBasePdfPath(row) {
  const organizationId = text(row?.organization_id);
  const serviceOrderId = text(row?.service_order_id);
  const requestId = text(row?.id);
  if (!organizationId || !serviceOrderId || !requestId) throw new Error("Solicitação inválida para PDF-base.");
  return `${organizationId}/${serviceOrderId}/${requestId}/original.pdf`;
}

export function previewPdfPath(input) {
  const organizationId = text(input?.organizationId);
  const serviceOrderId = text(input?.serviceOrderId);
  const templateId = text(input?.templateId);
  const snapshotHash = text(input?.snapshotHash).toLowerCase();
  if (!organizationId || !serviceOrderId || !templateId || !/^[0-9a-f]{64}$/.test(snapshotHash)) {
    throw new Error("Dados inválidos para preview PDF.");
  }
  return `${organizationId}/${serviceOrderId}/print-previews/${templateId}/${snapshotHash}.pdf`;
}

export function signatureSlotLayout(kinds, marginLeft, contentWidth) {
  const normalized = (Array.isArray(kinds) ? kinds : [])
    .filter(kind => kind === "external" || kind === "employee")
    .slice(0, 2);
  if (!normalized.length) return [];
  if (normalized.length === 1) {
    const width = contentWidth * 0.55;
    return [{ signer_type: normalized[0], x: marginLeft + (contentWidth - width) / 2, width }];
  }
  const gap = 16;
  const width = (contentWidth - gap) / 2;
  return normalized.map((kind, index) => ({
    signer_type: kind,
    x: marginLeft + index * (width + gap),
    width,
  }));
}
