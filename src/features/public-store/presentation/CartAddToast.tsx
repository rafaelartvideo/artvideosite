import { AlertCircle, CheckCircle2 } from "lucide-react";

/** Feedback compartilhado entre cards e detalhes do produto. */
export function CartAddToast({ message }: { message: string }) {
  if (!message) return null;
  const success = message === "Produto adicionado ao carrinho.";
  return <div role="status" aria-live="polite" aria-atomic="true"
    className="art-cart-confirmation pointer-events-none fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] left-1/2 z-[90] w-max max-w-[calc(100vw-24px)] -translate-x-1/2 md:bottom-6">
    <div className={`flex min-h-12 items-center gap-2.5 rounded-xl border bg-white px-4 py-3 text-[13px] font-semibold shadow-[0_8px_35px_rgba(10,35,60,.19)] ${success ? "border-emerald-200 text-emerald-800" : "border-red-200 text-red-700"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${success ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
        {success ? <CheckCircle2 size={22} strokeWidth={2.4}/> : <AlertCircle size={21}/>}
      </span>
      <span className="min-w-0">{message}</span>
    </div>
  </div>;
}
