import React, { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Package, Plus, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";

const ADMIN_FEEDBACK_EVENT = "artvideo:admin-feedback";
const BUSY_ACTION_PATTERN = /\b(carregando|salvando|enviando|atualizando|processando|buscando|consultando|gerando|excluindo|removendo|concluindo|resolvendo|aprovando|rejeitando|convertendo|criando|cadastrando|entrando|anexando|entregando|devolvendo|registrando)\b/i;

type FeedbackType = "success" | "error";
type AdminFeedbackEvent =
  | { kind: "loading-start"; token: string; text: string }
  | { kind: "loading-end"; token: string }
  | { kind: "toast"; message: string; type: FeedbackType };

type LifecycleTone = "active" | "inactive" | "disabled";

const LIFECYCLE_STATUS_TONES: Record<string, LifecycleTone> = {
  ativo: "active",
  ativa: "active",
  active: "active",
  habilitado: "active",
  habilitada: "active",
  enabled: "active",
  desativado: "disabled",
  desativada: "disabled",
  deactivated: "disabled",
  inativo: "inactive",
  inativa: "inactive",
  inactive: "inactive",
  suspenso: "inactive",
  suspensa: "inactive",
  suspended: "inactive",
  desabilitado: "inactive",
  desabilitada: "inactive",
  disabled: "inactive",
};

function lifecycleStatusTone(status: string) {
  const normalized = (status || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return LIFECYCLE_STATUS_TONES[normalized] || null;
}

function lifecyclePresentation(tone: LifecycleTone) {
  if (tone === "active") return {
    badge: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800 shadow-[0_1px_3px_rgba(5,150,105,0.08)]",
    dot: "radial-gradient(circle at 32% 28%, #ecfdf5 0%, #6ee7b7 24%, #10b981 54%, #047857 78%, #064e3b 100%)",
    shadow: "inset 1px 1px 1.5px rgba(255,255,255,.9), inset -1px -1px 2px rgba(6,78,59,.45), 0 1px 3px rgba(5,150,105,.38)",
  };
  if (tone === "disabled") return {
    badge: "border-red-200/90 bg-red-50/80 text-red-800 shadow-[0_1px_3px_rgba(220,38,38,0.08)]",
    dot: "radial-gradient(circle at 32% 28%, #fff1f2 0%, #fda4af 24%, #ef4444 54%, #b91c1c 78%, #7f1d1d 100%)",
    shadow: "inset 1px 1px 1.5px rgba(255,255,255,.9), inset -1px -1px 2px rgba(127,29,29,.45), 0 1px 3px rgba(220,38,38,.38)",
  };
  return {
    badge: "border-amber-200/90 bg-amber-50/80 text-amber-800 shadow-[0_1px_3px_rgba(217,119,6,0.08)]",
    dot: "radial-gradient(circle at 32% 28%, #fffbeb 0%, #fde68a 24%, #f59e0b 54%, #b45309 78%, #78350f 100%)",
    shadow: "inset 1px 1px 1.5px rgba(255,255,255,.9), inset -1px -1px 2px rgba(120,53,15,.42), 0 1px 3px rgba(217,119,6,.34)",
  };
}

function dispatchAdminFeedback(detail: AdminFeedbackEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminFeedbackEvent>(ADMIN_FEEDBACK_EVENT, { detail }));
}

export function beginAdminLoading(text = "Carregando...") {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let finished = false;
  dispatchAdminFeedback({ kind: "loading-start", token, text });
  return () => {
    if (finished) return;
    finished = true;
    dispatchAdminFeedback({ kind: "loading-end", token });
  };
}

export function notifyAdmin(message: string, type: FeedbackType = "success") {
  dispatchAdminFeedback({ kind: "toast", message, type });
}

export function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function LifecycleStatusBadge({ status }: { status: string }) {
  const tone = lifecycleStatusTone(status) || "inactive";
  const presentation = lifecyclePresentation(tone);
  return <span className={cn(
    "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none tracking-normal",
    presentation.badge,
  )}>
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: presentation.dot, boxShadow: presentation.shadow }}
    />
    <span className="truncate">{status || "—"}</span>
  </span>;
}

export function StatusBadge({ status, color }: { status: string; color?: string | null }) {
  const lifecycleTone = lifecycleStatusTone(status);
  if (lifecycleTone) return <LifecycleStatusBadge status={status} />;

  const normalized = (status || "").toLowerCase();
  let classes = "bg-blue-100 text-blue-800";
  if (/conclu|pronto|finaliz|entregue|aprovad/.test(normalized)) classes = "bg-emerald-100 text-emerald-800";
  else if (/pendent|aguard|anál|analise/.test(normalized)) classes = "bg-amber-100 text-amber-800";
  else if (/cancel|recusad/.test(normalized)) classes = "bg-red-100 text-red-800";

  const customColor = Boolean(color && isHexColor(color));
  return (
    <span
      className={cn("inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", customColor ? "border" : classes)}
      style={customColor ? { color: color!, backgroundColor: `${color}20`, borderColor: `${color}55` } : undefined}
    >
      {status || "—"}
    </span>
  );
}

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return <span
    aria-hidden="true"
    className={cn(
      "inline-block animate-spin rounded-full border-solid border-[#0057e7]/20 border-t-[#0057e7]",
      size === "sm" && "h-4 w-4 border-2",
      size === "md" && "h-7 w-7 border-[3px]",
      size === "lg" && "h-9 w-9 border-[3px]",
    )}
  />;
}

export function LoadingOverlay({ show = true, text = "Carregando..." }: { show?: boolean; text?: string }) {
  if (!show) return null;
  return <div
    className="fixed inset-0 z-[260] flex items-center justify-center bg-[#0d1b2e]/40 px-4 backdrop-blur-[3px]"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex min-w-[190px] flex-col items-center gap-3 px-6 py-5 text-center">
      <LoadingSpinner size="lg" />
      <p className="text-sm font-semibold text-white drop-shadow-sm">{text}</p>
    </div>
  </div>;
}

export function LoadingState({ text = "Carregando..." }: { text?: string }) {
  useEffect(() => beginAdminLoading(text), [text]);
  return null;
}

export function EmptyState({ icon: Icon = Package, title, message, onAdd, addLabel = "Adicionar" }: {
  icon?: React.ElementType;
  title: string;
  message?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-16 h-16 bg-[#0057e7]/8 rounded-2xl flex items-center justify-center">
      <Icon size={28} className="text-[#0057e7]/50" />
    </div>
    <div className="text-center max-w-xs">
      <p className="font-bold text-[#0d1b2e] mb-1">{title}</p>
      {message && <p className="text-sm text-[#5a6a82]">{message}</p>}
    </div>
    {onAdd && <AdminButton onClick={onAdd}>
      <Plus size={16} /> {addLabel}
    </AdminButton>}
  </div>;
}

export function Toast({ message, type = "success", onClose }: { message: string; type?: FeedbackType; onClose: () => void }) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 3500);
    return () => clearTimeout(timeout);
  }, [message, type]);

  return <div className={cn(
    "fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[300] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-semibold shadow-[0_16px_40px_rgba(13,27,46,0.18)] md:bottom-auto md:left-auto md:right-6 md:top-6 md:w-auto md:min-w-[320px] md:max-w-md md:translate-x-0",
    type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800",
  )} role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"}>
    {type === "success" ? <CheckCircle size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
    <span className="min-w-0 flex-1 leading-relaxed">{message}</span>
    <button type="button" onClick={onClose} className="shrink-0 rounded-md p-0.5 opacity-70 transition hover:opacity-100" aria-label="Fechar mensagem"><X size={15} /></button>
  </div>;
}

export function AdminFeedbackHost({ busy = false, busyText = "Carregando..." }: { busy?: boolean; busyText?: string }) {
  const [loaders, setLoaders] = useState<Array<{ token: string; text: string }>>([]);
  const [toast, setToast] = useState<{ message: string; type: FeedbackType } | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<AdminFeedbackEvent>).detail;
      if (!detail) return;
      if (detail.kind === "loading-start") {
        setLoaders(current => [...current.filter(item => item.token !== detail.token), { token: detail.token, text: detail.text }]);
        return;
      }
      if (detail.kind === "loading-end") {
        setLoaders(current => current.filter(item => item.token !== detail.token));
        return;
      }
      setToast({ message: detail.message, type: detail.type });
    };
    window.addEventListener(ADMIN_FEEDBACK_EVENT, listener);
    return () => window.removeEventListener(ADMIN_FEEDBACK_EVENT, listener);
  }, []);

  useEffect(() => {
    const root = document.querySelector(".admin-crm");
    if (!root) return;

    const syncButtonLoading = () => {
      root.querySelectorAll("button").forEach(button => {
        const text = button.textContent || "";
        const hasExistingSpinner = Boolean(button.querySelector(".animate-spin"));
        const busyButton = button.disabled && (
          button.getAttribute("aria-busy") === "true" ||
          BUSY_ACTION_PATTERN.test(text) ||
          hasExistingSpinner
        );
        if (busyButton) {
          button.setAttribute("data-admin-loading", "true");
          button.setAttribute("data-admin-has-spinner", hasExistingSpinner ? "true" : "false");
        } else {
          button.removeAttribute("data-admin-loading");
          button.removeAttribute("data-admin-has-spinner");
        }
      });
    };

    syncButtonLoading();
    const observer = new MutationObserver(syncButtonLoading);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-busy", "class"],
    });
    return () => observer.disconnect();
  }, []);

  const activeLoader = loaders[loaders.length - 1];
  return <>
    <style>{`
      @keyframes admin-button-loading-spin { to { transform: rotate(360deg); } }
      .admin-crm button[data-admin-loading="true"] {
        pointer-events: none;
      }
      .admin-crm button[data-admin-loading="true"][data-admin-has-spinner="false"]::before {
        content: "";
        width: 1em;
        height: 1em;
        flex: 0 0 auto;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 9999px;
        animation: admin-button-loading-spin .65s linear infinite;
      }
      .admin-crm button[data-admin-loading="true"] > svg:not(.animate-spin):first-child {
        display: none !important;
      }
    `}</style>
    <LoadingOverlay show={busy || loaders.length > 0} text={activeLoader?.text || busyText} />
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
  </>;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void | Promise<unknown>; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false);

  const confirm = () => {
    if (confirming) return;
    const result = onConfirm();
    if (!result || typeof (result as PromiseLike<unknown>).then !== "function") return;
    setConfirming(true);
    result.then(
      () => setConfirming(false),
      () => setConfirming(false),
    );
  };

  return <AlertDialog open onOpenChange={(open) => { if (!open && !confirming) onCancel(); }}>
    <AlertDialogContent className="max-w-sm rounded-2xl border-[#0d1b2e]/10 bg-white">
      <AlertDialogHeader className="flex-row items-start gap-3 text-left">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle size={18} className="text-red-600" />
        </div>
        <div>
          <AlertDialogTitle className="mb-1 text-base font-bold text-[#0d1b2e]">Confirmar exclusão</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-[#5a6a82]">{message}</AlertDialogDescription>
        </div>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={confirming} className="border-[#0d1b2e]/15 text-[#0d1b2e] hover:bg-[#f5f7fa]">Cancelar</AlertDialogCancel>
        <AlertDialogAction disabled={confirming} aria-busy={confirming || undefined} onClick={confirm} className="inline-flex items-center gap-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">{confirming && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}{confirming ? "Excluindo..." : "Excluir"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
