function text(value) { return String(value ?? "").trim(); }

export const MAX_BASE_PDF_BYTES = 20 * 1024 * 1024;

export function basePdfPath(row) {
  const organizationId = text(row?.organization_id);
  const serviceOrderId = text(row?.service_order_id);
  const requestId = text(row?.id);
  if (!organizationId || !serviceOrderId || !requestId) throw new Error("Solicitação inválida para PDF-base.");
  return `${organizationId}/${serviceOrderId}/${requestId}/original.pdf`;
}

export function isPdfBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > MAX_BASE_PDF_BYTES) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export function normalizeSignatureSlots(value, pageCount) {
  const pages = Number(pageCount);
  if (!Number.isInteger(pages) || pages < 1 || pages > 100) throw new Error("PDF-base inválido.");
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows.map((slot) => {
    const signerType = slot?.signer_type === "external" || slot?.signer_type === "employee" ? slot.signer_type : null;
    const pageIndex = Number(slot?.page_index);
    const x = Number(slot?.x_mm);
    const y = Number(slot?.y_mm);
    const width = Number(slot?.width_mm);
    const height = Number(slot?.height_mm);
    if (!signerType || seen.has(signerType)) throw new Error("Espaços de assinatura inválidos.");
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pages) throw new Error("Página de assinatura inválida.");
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || width > 250 || height > 100) {
      throw new Error("Coordenadas de assinatura inválidas.");
    }
    seen.add(signerType);
    return { signer_type: signerType, page_index: pageIndex, x_mm: x, y_mm: y, width_mm: width, height_mm: height };
  });
}
