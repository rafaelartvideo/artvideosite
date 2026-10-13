import { useEffect, useState } from "react";
import { Download, ExternalLink, Printer } from "lucide-react";
import { AdminButton, AdminDialog, BtnSecondary } from "./AdminLayout";
import { PdfInlineViewer } from "./PdfInlineViewer";

type PdfPreviewSource = Blob | string;

type PdfPreviewDialogProps = {
  open: boolean;
  source: PdfPreviewSource | null;
  title?: string;
  fileName?: string;
  onClose: () => void;
};

function safePdfFileName(value?: string) {
  const normalized = String(value || "documento.pdf").trim() || "documento.pdf";
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
}

export function PdfPreviewDialog({
  open,
  source,
  title = "Pré-visualização do PDF",
  fileName = "documento.pdf",
  onClose,
}: PdfPreviewDialogProps) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const currentSource = open ? source : null;
  const usableUrl = localUrl || (typeof currentSource === "string" ? currentSource : "");

  useEffect(() => {
    if (!open) {
      setLocalUrl(null);
      setPageCount(0);
    }
  }, [open]);

  const download = () => {
    if (!usableUrl) return;
    const anchor = document.createElement("a");
    anchor.href = usableUrl;
    anchor.download = safePdfFileName(fileName);
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const openOriginal = () => {
    if (!usableUrl) return;
    window.open(usableUrl, "_blank", "noopener,noreferrer");
  };

  const print = () => {
    if (!usableUrl) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      right: "0",
      bottom: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    frame.src = usableUrl;

    let handled = false;
    const fallback = () => {
      if (handled) return;
      handled = true;
      frame.remove();
      window.open(usableUrl, "_blank", "noopener,noreferrer");
    };
    frame.addEventListener("load", () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        handled = true;
        window.setTimeout(() => frame.remove(), 30000);
      } catch {
        fallback();
      }
    }, { once: true });
    document.body.appendChild(frame);
    window.setTimeout(() => { if (!handled && document.body.contains(frame)) fallback(); }, 8000);
  };

  return <AdminDialog
    open={open}
    onClose={onClose}
    title={title}
    description={pageCount ? `${pageCount} página${pageCount === 1 ? "" : "s"}` : "Documento PDF"}
    className="h-[calc(100dvh-1.5rem)] max-w-[min(96vw,1180px)]"
    minimizedDescription="PDF pronto para continuar depois."
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-2">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AdminButton variant="secondary" onClick={download} disabled={!usableUrl}><Download size={15} /> Baixar</AdminButton>
        <AdminButton variant="secondary" onClick={openOriginal} disabled={!usableUrl}><ExternalLink size={15} /> Abrir</AdminButton>
        <AdminButton onClick={print} disabled={!usableUrl}><Printer size={15} /> Imprimir</AdminButton>
      </div>
    </div>}
  >
    <PdfInlineViewer
      source={currentSource}
      className="h-full min-h-[380px]"
      title={title}
      onResolvedUrl={setLocalUrl}
      onPageCount={setPageCount}
    />
  </AdminDialog>;
}
