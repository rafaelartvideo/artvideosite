import { LoadingDots } from "@/shared/ui/admin/AdminFeedback";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

type PdfSource = Blob | string;

type Props = {
  source: PdfSource | null;
  className?: string;
  title?: string;
  onResolvedUrl?: (url: string | null) => void;
  onPageCount?: (count: number) => void;
};

/**
 * Pré-visualizador independente do plugin de PDF do navegador.
 * Trabalha com bytes do PDF, inclusive links assinados do Storage, e conserva
 * uma URL blob local para o fallback nativo, download e impressão.
 */
export function PdfInlineViewer({ source, className = "", title = "Documento PDF", onResolvedUrl, onPageCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(Boolean(source));
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [rendered, setRendered] = useState(false);
  const onResolvedUrlRef = useRef(onResolvedUrl);
  const onPageCountRef = useRef(onPageCount);
  onResolvedUrlRef.current = onResolvedUrl;
  onPageCountRef.current = onPageCount;

  // Ref callback -> state: funciona mesmo quando o elemento surge depois, em
  // um Dialog/Portal. O código anterior media apenas na primeira abertura.
  useEffect(() => {
    if (!viewportElement) return;
    const measure = () => {
      const width = Math.max(280, viewportElement.clientWidth - 32);
      setAvailableWidth(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [viewportElement]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: any;
    let loadedDocument: any;
    let createdUrl = "";
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 25000);

    setPdfDocument(null);
    setPageNumber(1);
    setPageCount(0);
    setZoom(1);
    setRendered(false);
    setLoadError("");
    setFallbackUrl("");
    setLoading(Boolean(source));
    onResolvedUrlRef.current?.(null);
    onPageCountRef.current?.(0);

    if (source) {
      void (async () => {
        try {
          // Não depender de iframe externo, de Content-Disposition inline,
          // nem de suporte a range requests no link assinado.
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

          let bytes: ArrayBuffer;
          if (source instanceof Blob) {
            bytes = await source.arrayBuffer();
          } else {
            const response = await fetch(source, { signal: abort.signal, cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status} ao obter PDF`);
            bytes = await response.arrayBuffer();
          }
          if (cancelled) return;
          if (bytes.byteLength < 5) throw new Error("Arquivo PDF vazio ou incompleto.");
          // PDF.js verifica a integridade do conteúdo; URLs de erros HTML não
          // devem resultar em uma tela branca silenciosa.
          const header = new TextDecoder().decode(bytes.slice(0, Math.min(1024, bytes.byteLength)));
          if (!header.includes("%PDF-")) throw new Error("O arquivo recebido não é um PDF válido ou o link expirou.");

          createdUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          setFallbackUrl(createdUrl);
          onResolvedUrlRef.current?.(createdUrl);

          loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
          loadedDocument = await loadingTask.promise;
          if (cancelled) return;

          const count = Number(loadedDocument.numPages || 0);
          if (count < 1) throw new Error("Este PDF não possui páginas.");
          setPdfDocument(loadedDocument);
          setPageCount(count);
          onPageCountRef.current?.(count);
        } catch (error) {
          if (cancelled) return;
          console.error("[PDF_PREVIEW] Erro ao carregar PDF:", error);
          setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o PDF.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      abort.abort();
      try { loadingTask?.destroy?.(); } catch { /* PDF já descarregado */ }
      try { loadedDocument?.destroy?.(); } catch { /* PDF já descarregado */ }
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [source]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || availableWidth < 1 || pageCount < 1) return;
    let cancelled = false;
    let renderTask: any;
    setRendering(true);
    setRendered(false);
    setLoadError("");

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const fit = Math.max(0.1, Math.min(3, availableWidth / Math.max(1, base.width)));
        const viewport = page.getViewport({ scale: fit * zoom });
        const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("O navegador não disponibilizou o Canvas.");
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch (error: any) {
        if (cancelled || error?.name === "RenderingCancelledException") return;
        console.error("[PDF_PREVIEW] Erro ao desenhar página:", error);
        setLoadError("Não foi possível desenhar esta página. Exibindo o PDF diretamente abaixo.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      try { renderTask?.cancel?.(); } catch { /* render já encerrado */ }
    };
  }, [pdfDocument, availableWidth, pageNumber, pageCount, zoom]);

  const inlineFallbackUrl = fallbackUrl || (typeof source === "string" ? source : "");

  return <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${className}`}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Página anterior" title="Página anterior" disabled={pageNumber <= 1 || loading}
          onClick={() => setPageNumber(value => Math.max(1, value - 1))}
          className="rounded-md p-2 text-foreground hover:bg-muted disabled:opacity-35"><ChevronLeft size={16} /></button>
        <span className="min-w-[72px] text-center text-xs font-semibold text-foreground">
          {pageCount ? `${pageNumber} / ${pageCount}` : "—"}
        </span>
        <button type="button" aria-label="Próxima página" title="Próxima página" disabled={pageNumber >= pageCount || loading}
          onClick={() => setPageNumber(value => Math.min(pageCount, value + 1))}
          className="rounded-md p-2 text-foreground hover:bg-muted disabled:opacity-35"><ChevronRight size={16} /></button>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Diminuir zoom" title="Diminuir zoom" disabled={zoom <= 0.5 || loading}
          onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}
          className="rounded-md p-2 text-foreground hover:bg-muted disabled:opacity-35"><ZoomOut size={16} /></button>
        <span className="min-w-[48px] text-center text-xs font-semibold text-foreground">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Aumentar zoom" title="Aumentar zoom" disabled={zoom >= 2.5 || loading}
          onClick={() => setZoom(value => Math.min(2.5, Math.round((value + 0.1) * 10) / 10))}
          className="rounded-md p-2 text-foreground hover:bg-muted disabled:opacity-35"><ZoomIn size={16} /></button>
        <button type="button" aria-label="Ajustar à largura" title="Ajustar à largura" disabled={loading}
          onClick={() => setZoom(1)}
          className="rounded-md p-2 text-foreground hover:bg-muted disabled:opacity-35"><Maximize2 size={16} /></button>
      </div>
    </div>

    <div ref={setViewportElement} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-slate-200/70 p-4 dark:bg-slate-950/70">
      {loadError && <div role="alert" className="mx-auto mb-3 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">{loadError}</div>}
      {loadError && inlineFallbackUrl ? (
        <iframe title={title} src={inlineFallbackUrl} className="mx-auto block h-full min-h-[380px] w-full max-w-[1000px] border border-border bg-white" />
      ) : <div className="flex min-h-full min-w-max justify-center">
        <div className="relative min-h-[280px] min-w-[240px] bg-white shadow-md">
          <canvas ref={canvasRef} aria-label={title} className={`block bg-white ${rendered && !loadError ? "" : "invisible"}`} />
          {(loading || rendering || (!loadError && !rendered)) && source && <div className="absolute inset-0 flex min-h-[280px] flex-col items-center justify-center gap-3 bg-white/90">
            <LoadingDots size="lg" />
            <p className="text-xs font-semibold text-muted-foreground">{loading ? "Carregando PDF..." : "Preparando pré-visualização..."}</p>
          </div>}
          {loadError && !fallbackUrl && <div className="flex min-h-[280px] min-w-[240px] items-center justify-center p-6 text-center text-sm text-muted-foreground">Pré-visualização indisponível.</div>}
        </div>
      </div>}
    </div>
  </div>;
}
