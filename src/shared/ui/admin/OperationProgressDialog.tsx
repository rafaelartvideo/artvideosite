import { useEffect, useRef } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { AdminDialog } from "@/shared/ui/admin/AdminLayout";

type ProgressState = "loading" | "success";

/** Feedback de ações longas: carrega, confirma no próprio modal e fecha após 2 segundos. */
export function OperationProgressDialog({
  open, state, loadingTitle, successTitle, onFinished,
}: {
  open: boolean;
  state: ProgressState;
  loadingTitle: string;
  successTitle: string;
  onFinished: () => void;
}) {
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  useEffect(() => {
    if (!open || state !== "success") return;
    const timer = window.setTimeout(() => onFinishedRef.current(), 2000);
    return () => window.clearTimeout(timer);
  }, [open, state]);

  return <AdminDialog open={open} onClose={() => {}} title={state === "loading" ? loadingTitle : successTitle} className="max-w-sm" minimizable={false} closable={false}>
    <div role="status" aria-live="polite" aria-busy={state === "loading"}
      className="flex min-h-40 flex-col items-center justify-center gap-5 px-4 py-7 text-center">
      {state === "loading"
        ? <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LoaderCircle size={38} className="animate-spin motion-reduce:animate-none" />
          </span>
        : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <Check size={42} strokeWidth={3} className="animate-in zoom-in duration-300" />
          </span>}
      <p className="text-sm font-medium text-muted-foreground">
        {state === "loading" ? "Aguarde a confirmação da operação." : "Operação concluída com sucesso."}
      </p>
    </div>
  </AdminDialog>;
}
