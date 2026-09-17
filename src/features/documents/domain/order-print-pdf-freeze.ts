import html2pdf from "html2pdf.js";
import { buildOrderPrintDocumentHtml, type PrintOrderContext } from "./order-print-document";
import {
  copyComputedStyle,
  freezeRasterOptions,
  html2pdfMarginOrder,
  signatureSlotFromGeometry,
} from "./order-print-freeze-style.mjs";
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

function inlineComputedStyles(doc: Document, root: HTMLElement) {
  const view = doc.defaultView;
  if (!view) throw new Error("Não foi possível ler os estilos do documento de impressão.");
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const element of elements) {
    copyComputedStyle(view.getComputedStyle(element), element.style);
  }
}

function unlockCaptureRoot(root: HTMLElement) {
  // Computed styles include the body's current pixel height. Keeping that value
  // fixed makes html2pdf clip content after its page-break plugin adjusts layout.
  root.style.height = "auto";
  root.style.minHeight = "0";
  root.style.maxHeight = "none";
  root.style.overflow = "visible";
  root.style.overflowX = "visible";
  root.style.overflowY = "visible";
}

function signatureKinds(template: PrintTemplateEditorValue) {
  const result: Array<"external" | "employee"> = [];
  if (template.selectedFields.has("signatures.customer")) result.push("external");
  if (template.selectedFields.has("signatures.employee") || template.selectedFields.has("signatures.technician")) result.push("employee");
  return result;
}

function collectSignatureSlots(
  captureRoot: HTMLElement,
  template: PrintTemplateEditorValue,
  pageWidthMm: number,
  pageHeightMm: number,
): FrozenSignatureSlot[] {
  const rootRect = captureRoot.getBoundingClientRect();
  const margins = [template.margin_top, template.margin_right, template.margin_bottom, template.margin_left]
    .map(value => Math.max(6, Number(value) || 6));
  const [marginTop, marginRight, marginBottom, marginLeft] = margins;
  const innerWidthMm = Math.max(1, pageWidthMm - marginLeft - marginRight);
  const innerHeightMm = Math.max(1, pageHeightMm - marginTop - marginBottom);
  const pxPerMm = rootRect.width > 0 ? rootRect.width / innerWidthMm : 96 / 25.4;
  const pageHeightPx = innerHeightMm * pxPerMm;
  const kinds = signatureKinds(template);
  const lines = Array.from(captureRoot.querySelectorAll<HTMLElement>(".signature-line"));

  return lines.slice(0, kinds.length).map((line, index) => {
    const lineRect = line.getBoundingClientRect();
    const signature = line.closest<HTMLElement>(".signature");
    const signatureRect = signature?.getBoundingClientRect() || lineRect;
    const geometry = signatureSlotFromGeometry({
      lineLeftPx: lineRect.left - rootRect.left,
      lineTopPx: lineRect.top - rootRect.top,
      lineWidthPx: lineRect.width,
      signatureTopPx: signatureRect.top - rootRect.top,
      pxPerMm,
      pageHeightPx,
      marginLeftMm: marginLeft,
      marginTopMm: marginTop,
    });
    return {
      signer_type: kinds[index],
      ...geometry,
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
  const raster = freezeRasterOptions();

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

    // Reproduce only the geometry that the existing renderer applies under @media print.
    // The renderer itself remains untouched and is still the single source of HTML/CSS.
    doc.documentElement.style.background = "#fff";
    doc.documentElement.style.height = "auto";
    doc.documentElement.style.overflow = "visible";
    doc.body.style.width = `${innerWidthMm}mm`;
    doc.body.style.maxWidth = "none";
    doc.body.style.margin = "0";
    doc.body.style.padding = "0";
    doc.body.style.background = "#fff";
    doc.body.style.setProperty("-webkit-print-color-adjust", "exact");
    doc.body.style.setProperty("print-color-adjust", "exact");
    void doc.body.offsetHeight;

    // html2pdf clones only the supplied node into the main document. Persist every
    // computed rule inline first so grid, logo sizing, typography and break rules
    // survive that clone exactly as rendered in the print iframe.
    inlineComputedStyles(doc, doc.body);
    unlockCaptureRoot(doc.body);
    void doc.body.offsetHeight;

    const worker: any = (html2pdf as any)()
      .set({
        margin: html2pdfMarginOrder(margins),
        filename: `${template.name || "documento"}.pdf`,
        image: { type: raster.imageType, quality: 1 },
        html2canvas: {
          scale: raster.scale,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: Math.ceil(doc.body.scrollWidth),
          windowHeight: Math.ceil(doc.body.scrollHeight + 64),
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { unit: "mm", format: "a4", orientation, compress: true },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(doc.body)
      .toContainer();

    // Wait for html2pdf's clone and page-break plugin. Signature coordinates must be
    // measured from this exact paginated container, not from the pre-pagination iframe.
    const container = await worker.get("container");
    if (!(container instanceof HTMLElement)) throw new Error("Não foi possível paginar o documento para assinatura.");
    unlockCaptureRoot(container);
    void container.offsetHeight;
    const signatureSlots = collectSignatureSlots(container, template, pageWidthMm, pageHeightMm);

    await worker.toCanvas().toPdf();
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
