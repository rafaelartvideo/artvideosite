import { LoaderCircle } from "lucide-react";

/** Loading único para consultas de OS e pedidos no acompanhamento público. */
export function TrackingLoading({ subject }: { subject: "serviço" | "pedido" }) {
  return <div role="status" aria-live="polite" aria-busy="true"
    className="mt-5 flex min-h-[184px] flex-col items-center justify-center gap-4 rounded-xl border border-[#dbe6f4] bg-white px-5 py-10 text-center text-sm font-semibold text-[#53647b]">
    <LoaderCircle size={34} strokeWidth={2} className="animate-spin text-[var(--art-primary)]" aria-hidden="true"/>
    <span>Consultando seu {subject}...</span>
  </div>;
}
