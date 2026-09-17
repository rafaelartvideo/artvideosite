import html2pdf from "html2pdf.js";
import { buildOrderPrintDocumentHtml, type PrintOrderContext } from "./order-print-document";
import type { PrintTemplateEditorValue } from "./print-template";

export type FrozenSignatureSlot = {
  signer_type: "external" | "employee";
  page_index: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

export type FrozenOrderPrintPdf = {
  blob: Blob;
  page_count: number;
  signature_slots: FrozenSignatureSlot[];
};

const A4 = { portrait: [210, 297] as const, landscape: [297, 210] as const };
const SLOT_HEIGHT_MM = 18;

function waitForFrameLoad(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Tempo excedido ao preparar o documento para assinatura.")), 15000);
    frame.addEventListener("load", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function waitForAssets(doc: Document) {
  try { await doc.fonts?.ready; } catch { /* browser may not expose FontFaceSet */ }
  const images = Array.from(doc.images);
  await Promise.all(images.map(async image => {
    if (image.complete) {
      try { await image.decode?.(); } catch { /* keep browser-rendered fallback */ }
      return;
    }
    await new Promise<void>(resolve => {
      const done = () => resolve();
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
      window.setTimeout(done, 8000);
    });
  }));
}

function signatureKinds(template: PrintTemplateEditorValue) {
  const result: Array<"external" | "employee"> = [];
  if (template.selectedFields.has("signatures.customer")) result.push("external");
  if (template.selectedFields.has("signatures.employee") || template.selectedFields.has("signatures.technician")) result.push("employee");
  return result;
}

function collectSignatureSlots(
  doc: Document,
  template: PrintTemplateEditorValue,
  pageWidthMm: number,
  pageHeightMm: number,
): FrozenSignatureSlot[] {
  const body = doc.body;
  const bodyRect = body.getBoundingClientRect();
  const margins = [template.margin_top, template.margin_right, template.margin_bottom, template.margin_left]
    .map(value => Math.max(6, Number(value) || 6));
  const [marginTop, marginRight, marginBottom, marginLeft] = margins;
  const innerWidthMm = Math.max(1, pageWidthMm - marginLeft - marginRight);
  const innerHeightMm = Math.max(1, pageHeightMm - marginTop - marginBottom);
  const pxPerMm = bodyRect.width > 0 ? bodyRect.width / innerWidthMm : 96 / 25.4;
  const pageHeightPx = innerHeightMm * pxPerMm;
  const slotHeightPx = SLOT_HEIGHT_MM * pxPerMm;
  const kinds = signatureKinds(template);
  const lines = Array.from(doc.querySelectorAll<HTMLElement>(".signature-line"));
  const section = doc.querySelector<HTMLElement>(".signature-section");
  const sectionRect = section?.getBoundingClientRect() || null;
  let sectionShiftPx = 0;

  // The existing renderer marks the signature section break-inside:avoid. Mirror that
  // page break when deriving overlay coordinates without changing the renderer itself.
  if (sectionRect && pageHeightPx > 0) {
    const sectionTop = sectionRect.top - bodyRect.top;
    const sectionHeight = sectionRect.height;
    const positionInPage = ((sectionTop % pageHeightPx) + pageHeightPx) % pageHeightPx;
    if (positionInPage + sectionHeight > pageHeightPx) sectionShiftPx = pageHeightPx - positionInPage;
  }

  return lines.slice(0, kinds.length).map((line, index) => {
    const rect = line.getBoundingClientRect();
    const leftPx = rect.left - bodyRect.left;
    const lineTopPx = rect.top - bodyRect.top + sectionShiftPx;
    const slotTopPx = Math.max(0, lineTopPx - slotHeightPx - 2 * pxPerMm);
    const pageIndex = Math.max(0, Math.floor(slotTopPx / pageHeightPx));
    const localTopPx = slotTopPx - pageIndex * pageHeightPx;
    return {
      signer_type: kinds[index],
      page_index: pageIndex,
      x_mm: Number((marginLeft + leftPx / pxPerMm).toFixed(3)),
      y_mm: Number((marginTop + localTopPx / pxPerMm).toFixed(3)),
      width_mm: Number((rect.width / pxPerMm).toFixed(3)),
      height_mm: SLOT_HEIGHT_MM,
    };
  });
}

export async function freezeOrderPrintPdf(
  template: PrintTemplateEditorValue,
  context: PrintOrderContext,
): Promise<FrozenOrderPrintPdf> {
  const orientation = template.orientation === "landscape" ? "landscape" : "portrait";
  const [pageWidthMm, pageHeightMm] = A4[orientation];
  const margins = [template.margin_top, template.margin_right, template.margin_bottom, template.margin_left]
    .map(value => Math.max(6, Number(value) || 6));
  const [marginTop, marginRight, marginBottom, marginLeft] = margins;
  const innerWidthMm = Math.max(1, pageWidthMm - marginLeft - marginRight);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-100000px";
  frame.style.top = "0";
  frame.style.width = `${innerWidthMm}mm`;
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  try {
    const loaded = waitForFrameLoad(frame);
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Não foi possível preparar o documento para assinatura.");
    doc.open();
    doc.write(buildOrderPrintDocumentHtml(template, context, false));
    doc.close();
    await loaded;
    await waitForAssets(doc);

    // Emulate the renderer's @media print body geometry. The HTML/CSS and content are
    // still exactly the same; html2pdf is only freezing the browser-rendered result.
    doc.documentElement.style.background = "#fff";
    doc.body.style.width = `${innerWidthMm}mm`;
    doc.body.style.maxWidth = "none";
    doc.body.style.margin = "0";
    doc.body.style.padding = "0";
    doc.body.style.background = "#fff";
    doc.body.style.setProperty("-webkit-print-color-adjust", "exact");
    doc.body.style.setProperty("print-color-adjust", "exact");

    // Force layout before measuring the immutable signature locations.
    void doc.body.offsetHeight;
    const signatureSlots = collectSignatureSlots(doc, template, pageWidthMm, pageHeightMm);

    const worker: any = (html2pdf as any)()
      .set({
        margin: [marginTop, marginRight, marginBottom, marginLeft],
        filename: `${template.name || "documento"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: Math.ceil(doc.body.scrollWidth),
        },
        jsPDF: { unit: "mm", format: "a4", orientation },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(doc.body)
      .toPdf();

    const pdf: any = await worker.get("pdf");
    const pageCount = Number(pdf?.internal?.getNumberOfPages?.() || 0);
    if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("Não foi possível congelar o PDF de impressão.");

    if (template.show_page_number !== false) {
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(82, 97, 116);
        pdf.text(`Página ${page} de ${pageCount}`, pageWidthMm / 2, pageHeightMm - Math.max(2.5, marginBottom * 0.35), { align: "center" });
      }
    }

    const blob = await worker.outputPdf("blob");
    if (!(blob instanceof Blob) || blob.size < 5) throw new Error("Não foi possível congelar o PDF de impressão.");
    return { blob, page_count: pageCount, signature_slots: signatureSlots };
  } finally {
    frame.remove();
  }
}
