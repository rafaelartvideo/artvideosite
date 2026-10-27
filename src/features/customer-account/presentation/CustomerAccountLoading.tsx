import { LoaderCircle } from "lucide-react";

// O mesmo carregamento é exibido enquanto o módulo e os dados da conta iniciam.
export function CustomerAccountLoading() {
  return <div role="status" aria-live="polite" aria-busy="true" className="flex min-h-[55vh] flex-col items-center justify-center gap-4 bg-[#f6f8fc] px-4 text-center text-sm font-semibold text-[#53647b]">
    <LoaderCircle size={34} strokeWidth={2} className="animate-spin text-[var(--art-primary)]" aria-hidden="true"/>
    <span>Preparando sua conta...</span>
  </div>;
}
