function rounded(value) {
  return Number(Number(value).toFixed(3));
}

export function copyComputedStyle(sourceStyle, targetStyle) {
  const length = Number(sourceStyle?.length) || 0;
  for (let index = 0; index < length; index += 1) {
    const name = sourceStyle.item(index);
    if (!name) continue;
    targetStyle.setProperty(
      name,
      sourceStyle.getPropertyValue(name),
      sourceStyle.getPropertyPriority(name),
    );
  }
}

export function html2pdfMarginOrder(margins) {
  const [top, right, bottom, left] = margins;
  return [top, left, bottom, right];
}

export function signatureSlotFromGeometry({
  lineLeftPx,
  lineTopPx,
  lineWidthPx,
  signatureTopPx,
  pxPerMm,
  pageHeightPx,
  marginLeftMm,
  marginTopMm,
}) {
  const mm = Number(pxPerMm);
  const pageHeight = Number(pageHeightPx);
  if (!Number.isFinite(mm) || mm <= 0 || !Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new Error("Geometria inválida para assinatura.");
  }

  const horizontalInsetPx = 2 * mm;
  const topInsetPx = 1 * mm;
  const bottomInsetPx = 0.5 * mm;
  const slotTopPx = Math.max(0, Number(signatureTopPx) + topInsetPx);
  const slotBottomPx = Math.max(slotTopPx + mm, Number(lineTopPx) - bottomInsetPx);
  const pageIndex = Math.max(0, Math.floor(slotTopPx / pageHeight));
  const localTopPx = slotTopPx - pageIndex * pageHeight;

  return {
    page_index: pageIndex,
    x_mm: rounded(Number(marginLeftMm) + (Number(lineLeftPx) + horizontalInsetPx) / mm),
    y_mm: rounded(Number(marginTopMm) + localTopPx / mm),
    width_mm: rounded(Math.max(1, (Number(lineWidthPx) - 2 * horizontalInsetPx) / mm)),
    height_mm: rounded(Math.max(1, (slotBottomPx - slotTopPx) / mm)),
  };
}
