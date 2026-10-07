import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize2,
  Printer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { AdminButton, AdminDialog, AdminIconButton, BtnSecondary } from "./AdminLayout";
import { LoadingSpinner } from "./AdminFeedback";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || !source) {
      setPreviewUrl("");
      return;
    }

    if (typeof source === "string") {
      setPreviewUrl(source);
      return;
    }

    const objectUrl = URL.createObjectURL(source);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [open, source]);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container || !open) return;

    const update = () => setAvailableWidth(Math.max(280, container.clientWidth - 32));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !source || !previewUrl) return;

    let cancelled = false;
    let loadingTask: any = null;
    let loadedDocument: any = null;

    setLoading(true);
    setLoadError("");
    setPdfDocument(null);
    setPageCount(0);
    setPageNumber(1);
    setZoom(1);

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        if (source instanceof Blob) {
          const data = new Uint8Array(await source.arrayBuffer());
          loadingTask = pdfjs.getDocument({ data });
        } else {
          loadingTask = pdfjs.getDocument({ url: previewUrl });
        }

        loadedDocument = await loadingTask.promise;
        if (cancelled) {
          await loadedDocument.destroy?.();
          return;
        }

        setPdfDocument(loadedDocument);
        setPageCount(Number(loadedDocument.numPages || 0));
      } catch (error) {
        if (cancelled) return;
        console.error("[PDF_PREVIEW] load failed", error);
        setLoadError("Não foi possível renderizar este PDF no visualizador interno.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      try { loadingTask?.destroy?.(); } catch { /* ignore cleanup failures */ }
      try { loadedDocument?.destroy?.(); } catch { /* ignore cleanup failures */ }
    };
  }, [open, source, previewUrl]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || !availableWidth || !pageCount) return;

    let cancelled = false;
    let renderTask: any = null;
    setRendering(true);

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.2, Math.min(2.4, availableWidth / Math.max(1, baseViewport.width)));
        const viewport = page.getViewport({ scale: fitScale * zoom });
        const outputScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas indisponível.");

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
      } catch (error: any) {
        if (cancelled || error?.name === "RenderingCancelledException") return;
        console.error("[PDF_PREVIEW] render failed", error);
        setLoadError("Não foi possível renderizar esta página do PDF.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      try { renderTask?.cancel?.(); } catch { /* ignore cleanup failures */ }
    };
  }, [pdfDocument, pageNumber, pageCount, zoom, availableWidth]);

  useEffect(() => {
    if (!open) return;
    setPageNumber(current => Math.min(Math.max(1, current), Math.max(1, pageCount)));
  }, [open, pageCount]);

  const download = () => {
    if (!previewUrl) return;
    const anchor = document.createElement("a");
    anchor.href = previewUrl;
    anchor.download = safePdfFileName(fileName);
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const openOriginal = () => {
    if (!previewUrl) return;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  const print = () => {
    if (!previewUrl) return;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.src = previewUrl;

    const fallback = () => {
      frame.remove();
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    };

    frame.addEventListener("load", () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 30_000);
      } catch {
        fallback();
      }
    }, { once: true });

    document.body.appendChild(frame);
    window.setTimeout(() => {
      if (document.body.contains(frame)) fallback();
    }, 8_000);
  };

  const decreaseZoom = () => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10));
  const increaseZoom = () => setZoom(value => Math.min(2.5, Math.round((value + 0.1) * 10) / 10));

  return <AdminDialog
    open={open}
    onClose={onClose}
    title={title}
    description={pageCount > 0 ? `${pageCount} página${pageCount === 1 ? "" : "s"}` : "Documento PDF"}
    className="h-[calc(100dvh-1.5rem)] max-w-[min(96vw,1180px)]"
    minimizedDescription="PDF pronto para continuar depois."
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-2">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AdminButton variant="secondary" onClick={download} disabled={!previewUrl}>
          <Download size={15} /> Baixar
        </AdminButton>
        <AdminButton variant="secondary" onClick={openOriginal} disabled={!previewUrl}>
          <ExternalLink size={15} /> Abrir
        </AdminButton>
        <AdminButton onClick={print} disabled={!previewUrl}>
          <Printer size={15} /> Imprimir
        </AdminButton>
      </div>
    </div>}
  >
    <div className="flex h-full min-h-[420px] min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-2 py-2">
        <div className="flex items-center gap-1">
          <AdminIconButton
            ariaLabel="Página anterior"
            title="Página anterior"
            disabled={pageNumber <= 1 || loading}
            onClick={() => setPageNumber(value => Math.max(1, value - 1))}
          >
            <ChevronLeft size={15} />
          </AdminIconButton>
          <span className="min-w-[92px] text-center text-xs font-bold text-foreground">
            {pageCount > 0 ? `${pageNumber} / ${pageCount}` : "—"}
          </span>
          <AdminIconButton
            ariaLabel="Próxima página"
            title="Próxima página"
            disabled={pageNumber >= pageCount || loading}
            onClick={() => setPageNumber(value => Math.min(pageCount, value + 1))}
          >
            <ChevronRight size={15} />
          </AdminIconButton>
        </div>

        <div className="flex items-center gap-1">
          <AdminIconButton ariaLabel="Diminuir zoom" title="Diminuir zoom" disabled={zoom <= 0.5 || loading} onClick={decreaseZoom}>
            <ZoomOut size={15} />
          </AdminIconButton>
          <span className="min-w-[54px] text-center text-xs font-bold text-foreground">{Math.round(zoom * 100)}%</span>
          <AdminIconButton ariaLabel="Aumentar zoom" title="Aumentar zoom" disabled={zoom >= 2.5 || loading} onClick={increaseZoom}>
            <ZoomIn size={15} />
          </AdminIconButton>
          <AdminIconButton ariaLabel="Ajustar à largura" title="Ajustar à largura" disabled={loading} onClick={() => setZoom(1)}>
            <Maximize2 size={15} />
          </AdminIconButton>
        </div>
      </div>

      <div ref={viewportRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-slate-200/70 p-4 dark:bg-slate-950/70">
        {loading ? <div className="flex min-h-[360px] flex-col items-center justify-center gap-3">
          <LoadingSpinner size="lg" />
          <p className="text-sm font-semibold text-muted-foreground">Carregando PDF...</p>
        </div> : loadError ? <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
          <p className="max-w-md text-sm font-semibold text-muted-foreground">{loadError}</p>
          {previewUrl && <div className="h-[55vh] min-h-[320px] w-full overflow-hidden rounded-lg border border-border bg-white">
            <iframe title="PDF" src={previewUrl} className="h-full w-full border-0" />
          </div>}
        </div> : <div className="flex min-h-full min-w-max justify-center">
          <div className="relative bg-white shadow-md">
            <canvas ref={canvasRef} className="block bg-white" />
            {rendering && <div className="absolute inset-0 flex items-center justify-center bg-white/45"><LoadingSpinner /></div>}
          </div>
        </div>}
      </div>
    </div>
  </AdminDialog>;
}
