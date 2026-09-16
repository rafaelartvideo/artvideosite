import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = {
  clear: () => void;
  toPngDataUrl: () => string | null;
};

export const SignaturePad = forwardRef<SignaturePadHandle, {
  disabled?: boolean;
  onInkChange?: (hasInk: boolean) => void;
}>(function SignaturePad({ disabled = false, onInkChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const distanceRef = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const setInk = (next: boolean) => {
    setHasInk(next);
    onInkChange?.(next);
  };

  const syncCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return;

    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    if (copy.width && copy.height) copy.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = width;
    canvas.height = height;
    if (copy.width && copy.height) canvas.getContext("2d")?.drawImage(copy, 0, 0, copy.width, copy.height, 0, 0, width, height);
  };

  useEffect(() => {
    syncCanvasSize();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncCanvasSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    lastPointRef.current = null;
    distanceRef.current = 0;
    setInk(false);
  };

  const croppedPngDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return null;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels.data[(y * canvas.width + x) * 4 + 3] === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const padding = Math.max(10, Math.round((window.devicePixelRatio || 1) * 8));
    const sourceX = Math.max(0, minX - padding);
    const sourceY = Math.max(0, minY - padding);
    const sourceRight = Math.min(canvas.width, maxX + padding + 1);
    const sourceBottom = Math.min(canvas.height, maxY + padding + 1);
    const output = document.createElement("canvas");
    output.width = Math.max(1, sourceRight - sourceX);
    output.height = Math.max(1, sourceBottom - sourceY);
    output.getContext("2d")?.drawImage(canvas, sourceX, sourceY, output.width, output.height, 0, 0, output.width, output.height);
    return output.toDataURL("image/png");
  };

  useImperativeHandle(ref, () => ({ clear, toPngDataUrl: croppedPngDataUrl }), [hasInk]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1)),
      y: (event.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1)),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    syncCanvasSize();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    distanceRef.current = 0;
    lastPointRef.current = point(event);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current || !lastPointRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    const previous = lastPointRef.current;
    distanceRef.current += Math.hypot(next.x - previous.x, next.y - previous.y);
    context.strokeStyle = "#0d1b2e";
    context.lineWidth = Math.max(2, (window.devicePixelRatio || 1) * 2);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drawingRef.current = false;
    lastPointRef.current = null;
    if (distanceRef.current >= Math.max(12, (window.devicePixelRatio || 1) * 8)) setInk(true);
    distanceRef.current = 0;
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-[#cbd5e1] bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className="block h-44 w-full touch-none bg-white sm:h-52"
          aria-label="Área para desenhar assinatura"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#64748b]">Assine com o dedo, caneta ou mouse.</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-3 text-xs font-bold text-[#334155] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eraser size={14} /> Limpar
        </button>
      </div>
    </div>
  );
});
