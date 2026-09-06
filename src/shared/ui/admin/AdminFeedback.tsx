import React, { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
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

type FeedbackType = "success" | "error";
type AdminFeedbackEvent =
  | { kind: "loading-start"; token: string; text: string }
  | { kind: "loading-end"; token: string }
  | { kind: "toast"; message: string; type: FeedbackType };

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

export function StatusBadge({ status, color }: { status: string; color?: string | null }) {
  const normalized = (status || "").toLowerCase();
  let classes = "bg-blue-100 text-blue-800";
  if (/conclu|pronto|finaliz|entregue|aprovad/.test(normalized)) classes = "bg-emerald-100 text-emerald-800";
  else if (/pendent|aguard|anál|analise/.test(normalized)) classes = "bg-amber-100 text-amber-800";
  else if (/cancel|recusad/.test(normalized)) classes = "bg-red-100 text-red-800";
  else if (/ativo|ativa/.test(normalized)) classes = "bg-emerald-100 text-emerald-800";
  else if (/inativo|inativa/.test(normalized)) classes = "bg-red-100 text-red-800";

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
    <div className="flex min-w-[190px] flex-col items-center gap-3 rounded-2xl border border-white/60 bg-white/95 px-6 py-5 text-center shadow-[0_20px_60px_rgba(13,27,46,0.24)]">
      <LoadingSpinner size="lg" />
      <p className="text-sm font-semibold text-[#26364d]">{text}</p>
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
  const activeQueries = useIsFetching();
  const activeMutations = useIsMutating();
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

  const activeLoader = loaders[loaders.length - 1];
  const queryBusy = activeQueries > 0 || activeMutations > 0;
  return <>
    <LoadingOverlay show={busy || queryBusy || loaders.length > 0} text={activeLoader?.text || busyText} />
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
  </>;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return <AlertDialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
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
        <AlertDialogCancel className="border-[#0d1b2e]/15 text-[#0d1b2e] hover:bg-[#f5f7fa]">Cancelar</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">Excluir</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
