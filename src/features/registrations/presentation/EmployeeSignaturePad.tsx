import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { BtnSecondary } from "@/shared/ui/admin/AdminLayout";

export type EmployeeSignaturePadHandle = {
  clear: () => void;
  toPngBlob: () => Promise<Blob | null>;
};

export const EmployeeSignaturePad = forwardRef<EmployeeSignaturePadHandle, {
  disabled?: boolean;
  onInkChange?: (hasInk: boolean) => void;
}>(function EmployeeSignaturePad({ disabled = false, onInkChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const distanceRef = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const syncCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return;

    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const snapshotContext = snapshot.getContext("2d");
    if (snapshotContext && canvas.width && canvas.height) snapshotContext.drawImage(canvas, 0, 0);

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context && snapshot.width && snapshot.height) context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width, height);
  };

  useEffect(() => {
    syncCanvasSize();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncCanvasSize());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const setInkState = (next: boolean) => {
    setHasInk(next);
    onInkChange?.(next);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    lastPointRef.current = null;
    distanceRef.current = 0;
    setInkState(false);
  };

  const toPngBlob = async () => {
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
    const sourceRight = Math.min(canvas.width, maxX + padding);
    const sourceBottom = Math.min(canvas.height, maxY + padding);
    const output = document.createElement("canvas");
    output.width = Math.max(1, sourceRight - sourceX);
    output.height = Math.max(1, sourceBottom - sourceY);
    output.getContext("2d")?.drawImage(canvas, sourceX, sourceY, output.width, output.height, 0, 0, output.width, output.height);

    return await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/png"));
  };

  useImperativeHandle(ref, () => ({ clear, toPngBlob }), [hasInk]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
    lastPointRef.current = pointFromEvent(event);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current || !lastPointRef.current) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const next = pointFromEvent(event);
    const previous = lastPointRef.current;
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
    distanceRef.current += distance;

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
    if (distanceRef.current >= Math.max(12, (window.devicePixelRatio || 1) * 8)) setInkState(true);
    distanceRef.current = 0;
  };

  return <div className="space-y-2">
    <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/15 bg-white">
      <canvas
        ref={canvasRef}
        className="block h-44 w-full touch-none bg-white"
        aria-label="Área para desenhar assinatura"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[#5a6a82]">Assine com mouse, toque ou caneta.</p>
      <BtnSecondary className="h-8 px-3 text-xs" onClick={clear} disabled={disabled || !hasInk}><Eraser size={14} /> Limpar</BtnSecondary>
    </div>
  </div>;
});
