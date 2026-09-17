import type { PrintTemplateEditorValue } from "./print-template";
import type { PrintOrderContext } from "./order-print-document";
import { buildOrderDocumentSignatureSnapshot } from "./document-signature";
import { createCanonicalPrintPreview } from "../infrastructure/document-print-preview.repository";

export { buildOrderPrintDocumentHtml, openPrintWindow } from "./order-print-document";
export type { PrintOrderContext } from "./order-print-document";

function renderPopupMessage(popup: Window, title: string, message: string, isError = false) {
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;margin:0;background:#f3f6fa;color:#172536"><main style="max-width:620px;margin:48px auto;padding:24px"><div style="border:1px solid ${isError ? "#fecaca" : "#dbe2ea"};border-radius:16px;background:#fff;padding:28px;text-align:center"><h1 style="font-size:18px;margin:0 0 10px">${title}</h1><p style="font-size:14px;line-height:1.55;color:#64748b;margin:0">${message}</p></div></main></body></html>`);
  popup.document.close();
}

export function renderOrderPrintDocument(
  popup: Window,
  template: PrintTemplateEditorValue,
  context: PrintOrderContext,
) {
  renderPopupMessage(popup, "Preparando PDF", "Gerando a versão canônica do documento para impressão...");
  void (async () => {
    try {
      const organizationId = String(context.order?.organization_id || "");
      const serviceOrderId = String(context.order?.id || "");
      const printTemplateId = String(template.id || "");
      if (!organizationId || !serviceOrderId || !printTemplateId) {
        throw new Error("Não foi possível identificar a OS ou o modelo de impressão.");
      }
      const snapshot = buildOrderDocumentSignatureSnapshot(template, context);
      const result = await createCanonicalPrintPreview({
        organizationId,
        serviceOrderId,
        printTemplateId,
        snapshot,
      });
      popup.location.replace(result.preview_url);
    } catch (error) {
      renderPopupMessage(
        popup,
        "Não foi possível gerar o PDF",
        error instanceof Error ? error.message : "Ocorreu um erro ao preparar o documento.",
        true,
      );
    }
  })();
}
