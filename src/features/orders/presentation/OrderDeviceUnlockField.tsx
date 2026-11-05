import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CircleHelp, Eye, EyeOff, LockKeyhole, RotateCcw } from "lucide-react";
import { getOrderDeviceUnlockMeta, revealOrderDeviceUnlock, type DeviceUnlockType } from "../infrastructure/order-device-unlock.repository";

export function isMobileDeviceType(name: string | null | undefined): boolean {
  return /celular|tablet|smartphone|iphone|ipad/i.test(name || "");
}

const labels: Record<DeviceUnlockType, string> = {
  none: "Não informado / sem bloqueio",
  pin: "PIN numérico",
  password: "Senha (letras e números)",
  pattern: "Padrão de desenho (3 × 3)",
};

function appendPatternNode(current: string, node: string) {
  if (!/^[1-9]$/.test(node) || current.includes(node)) return current;
  const last = Number(current[current.length - 1] || 0);
  if (!last) return current + node;
  const from = { x: (last - 1) % 3, y: Math.floor((last - 1) / 3) };
  const to = { x: (Number(node) - 1) % 3, y: Math.floor((Number(node) - 1) / 3) };
  const dx = to.x - from.x, dy = to.y - from.y;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const steps = gcd(Math.abs(dx), Math.abs(dy));
  let result = current;
  for (let step = 1; step < steps; step += 1) {
    const x = from.x + dx * step / steps;
    const y = from.y + dy * step / steps;
    const middle = String(y * 3 + x + 1);
    if (!result.includes(middle)) result += middle;
  }
  return result + node;
}

function PatternGrid({
  value,
  onChange,
}: {
  value: string;
  onChange?: (value: string) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef(false);
  const currentValue = useRef(value);
  currentValue.current = value;
  const points = Array.from({ length: 9 }, (_, index) => ({
    id: String(index + 1),
    x: 50 + (index % 3) * 100,
    y: 50 + Math.floor(index / 3) * 100,
  }));
  const selected = points.filter(point => value.includes(point.id));
  const path = value.split("").map(id => points[Number(id) - 1]).filter(Boolean).map(point => `${point.x},${point.y}`).join(" ");

  const addFromPosition = (clientX: number, clientY: number) => {
    if (!onChange || !areaRef.current) return;
    const bounds = areaRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(2, Math.floor((clientX - bounds.left) * 3 / bounds.width)));
    const y = Math.max(0, Math.min(2, Math.floor((clientY - bounds.top) * 3 / bounds.height)));
    const next = appendPatternNode(currentValue.current, String(y * 3 + x + 1));
    if (next !== currentValue.current) {
      currentValue.current = next;
      onChange(next);
    }
  };
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onChange) return;
    event.preventDefault();
    activePointer.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    addFromPosition(event.clientX, event.clientY);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current) addFromPosition(event.clientX, event.clientY);
  };
  const stop = () => { activePointer.current = false; };

  return (
    <div className="w-full max-w-[250px]">
      <div
        ref={areaRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        className="relative aspect-square w-full select-none rounded-xl border border-border bg-slate-50 dark:bg-slate-900/60"
        style={{ touchAction: onChange ? "none" : "auto" }}
        role="group"
        aria-label="Padrão de desbloqueio de nove pontos"
      >
        <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <polyline points={path} fill="none" stroke="#0057e7" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(point => (
            <circle key={point.id} cx={point.x} cy={point.y} r={selected.some(item => item.id === point.id) ? 17 : 12} fill={value.includes(point.id) ? "#0057e7" : "#94a3b8"} opacity={value.includes(point.id) ? 1 : 0.65} />
          ))}
        </svg>
        {onChange && points.map(point => (
          <button key={point.id} type="button" aria-label={`Ponto ${point.id}`} onClick={() => onChange(appendPatternNode(currentValue.current, point.id))}
            style={{ left: `${(point.x / 300) * 100}%`, top: `${(point.y / 300) * 100}%`, transform: "translate(-50%, -50%)" }}
            className="absolute h-12 w-12 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        ))}
      </div>
    </div>
  );
}

function RevealedCredential({ type, value }: { type: DeviceUnlockType; value: string }) {
  return <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
    <p className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">Acesso temporariamente visível — não compartilhe</p>
    {type === "pattern" ? <PatternGrid value={value} /> : <p className="break-all font-mono text-lg font-semibold text-foreground">{value}</p>}
  </div>;
}

export function OrderDeviceUnlockEditor({
  type,
  value,
  authorized,
  existing,
  editing,
  orderId,
  canManage,
  canView,
  onUpdate,
}: {
  type: DeviceUnlockType;
  value: string;
  authorized: boolean;
  existing: boolean;
  editing: boolean;
  orderId?: string;
  canManage: boolean;
  canView: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [revealed, setRevealed] = useState<{ type: DeviceUnlockType; value: string } | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [revealError, setRevealError] = useState("");
  useEffect(() => {
    if (!revealed) return;
    const timeout = window.setTimeout(() => setRevealed(null), 20000);
    return () => window.clearTimeout(timeout);
  }, [revealed]);
  useEffect(() => { setRevealed(null); setRevealError(""); }, [orderId]);

  const reveal = async () => {
    if (!orderId || !canView) return;
    setLoadingReveal(true);
    setRevealError("");
    try {
      const result = await revealOrderDeviceUnlock(orderId);
      if (result.type && result.value) setRevealed({ type: result.type, value: result.value });
    } catch {
      setRevealError("Não foi possível visualizar. Verifique sua permissão.");
    } finally {
      setLoadingReveal(false);
    }
  };

  return <div className="min-w-0 w-full">
    <div className="mb-3 flex items-center gap-2">
      <LockKeyhole size={18} className="text-primary" />
      <div>
        <p className="text-sm font-bold text-foreground">Desbloqueio do aparelho</p>
        <p className="text-xs text-muted-foreground">Opcional. Registre somente com autorização do cliente.</p>
      </div>
    </div>
    {existing && <p className="mb-3 text-xs font-medium text-emerald-700">Código já registrado de forma protegida.</p>}
    {canManage ? <>
      <div className={`grid min-w-0 items-start gap-3 ${type === "none" ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="device-unlock-type">Tipo de bloqueio</label>
          <select id="device-unlock-type" className="h-[42px] w-full min-w-0 rounded-lg border border-border bg-background px-2 sm:px-3 text-sm text-foreground"
            value={type}
            onChange={event => onUpdate({ unlock_type: event.target.value, unlock_value: "", unlock_authorized: false, unlock_dirty: true })}>
            {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {type !== "none" && (
          <div className="min-w-0">
            {type === "pattern" ? (
              <>
                <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Desenhe o padrão de desbloqueio</p>
                    <details className="group relative shrink-0">
                      <summary className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label="Instruções para desenhar o padrão de desbloqueio" title="Como desenhar o padrão">
                        <CircleHelp size={15} />
                      </summary>
                      <div role="note" className="absolute right-0 top-full z-30 mt-1 w-56 max-w-[75vw] rounded-lg border border-border bg-background p-2 text-xs font-normal leading-relaxed text-foreground shadow-lg">
                        Deslize entre os pontos ou toque na sequência. Mínimo de 4 pontos.
                      </div>
                    </details>
                  </div>
                  <button type="button" onClick={() => onUpdate({ unlock_value: "", unlock_dirty: true })}
                    className="inline-flex h-6 shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    aria-label="Limpar desenho" title="Limpar desenho">
                    <RotateCcw size={14} /><span className="hidden lg:inline">Limpar desenho</span>
                  </button>
                </div>
                <PatternGrid value={value} onChange={next => onUpdate({ unlock_value: next, unlock_dirty: true })} />
              </>
            ) : (
              <>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="device-unlock-value">{type === "pin" ? "PIN (4 a 12 números)" : "Senha do aparelho"}</label>
                <input id="device-unlock-value" type="password" autoComplete="off" inputMode={type === "pin" ? "numeric" : "text"}
                  maxLength={type === "pin" ? 12 : 64}
                  value={value}
                  onChange={event => onUpdate({ unlock_value: type === "pin" ? event.target.value.replace(/\D/g, "") : event.target.value, unlock_dirty: true })}
                  placeholder={editing && existing ? "Deixe vazio para manter o código atual" : "Informe o código"}
                  className="h-[42px] w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
              </>
            )}
          </div>
        )}
      </div>
      {type !== "none" && (
        <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={authorized}
            onChange={event => onUpdate({ unlock_authorized: event.target.checked, unlock_dirty: true })} />
          Cliente autorizou o desbloqueio para testes.
        </label>
      )}
    </> : <p className="text-xs text-muted-foreground">A edição do desbloqueio exige uma permissão específica na Union.</p>}
    {editing && existing && canView && <div className="mt-3">
      <button type="button" disabled={loadingReveal} onClick={() => revealed ? setRevealed(null) : void reveal()}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
        {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        {loadingReveal ? "Consultando..." : revealed ? "Ocultar código" : "Visualizar código registrado"}
      </button>
      {revealed && <RevealedCredential type={revealed.type} value={revealed.value} />}
      {revealError && <p role="alert" className="mt-1 text-xs text-red-600">{revealError}</p>}
    </div>}
  </div>;
}

export function OrderDeviceUnlockReadOnly({ orderId }: { orderId: string }) {
  const [meta, setMeta] = useState<{ type: DeviceUnlockType; has_value: boolean } | null>(null);
  const [revealed, setRevealed] = useState<{ type: DeviceUnlockType; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setMeta(null); setRevealed(null); setError("");
    getOrderDeviceUnlockMeta(orderId)
      .then(result => { if (active) setMeta({ type: result.type || "none", has_value: result.has_value }); })
      .catch(() => { if (active) setError("Não foi possível consultar o acesso protegido."); });
    return () => { active = false; };
  }, [orderId]);
  useEffect(() => {
    if (!revealed) return;
    const timeout = window.setTimeout(() => setRevealed(null), 20000);
    return () => window.clearTimeout(timeout);
  }, [revealed]);
  if (!meta?.has_value && !error) return null;
  const reveal = async () => {
    setBusy(true); setError("");
    try {
      const result = await revealOrderDeviceUnlock(orderId);
      if (result.type && result.value) setRevealed({ type: result.type, value: result.value });
    } catch {
      setError("Acesso não autorizado ou consulta indisponível.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="sm:col-span-2 min-w-0 w-full">
    <p className="mb-1 text-xs font-bold text-foreground">Desbloqueio do aparelho</p>
    {meta?.has_value && <p className="mb-2 text-xs text-muted-foreground">Tipo: {labels[meta.type]} · Registro protegido</p>}
    {meta?.has_value && <button type="button" disabled={busy} onClick={() => revealed ? setRevealed(null) : void reveal()}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">
      {revealed ? <EyeOff size={15}/> : <Eye size={15}/>}
      {busy ? "Consultando..." : revealed ? "Ocultar código" : "Visualizar desbloqueio"}
    </button>}
    {revealed && <RevealedCredential type={revealed.type} value={revealed.value} />}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </div>;
}
