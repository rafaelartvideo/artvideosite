import { LoaderCircle } from "lucide-react";

/** Um único padrão de loading em todas as áreas autenticadas do site. */
export function CustomerSectionLoading({ label = "Carregando...", compact = false }: {
  label?: string;
  compact?: boolean;
}) {
  return <div role="status" aria-live="polite" aria-busy="true"
    className={"flex w-full flex-col items-center justify-center gap-3 text-center " +
      (compact ? "min-h-32 py-5" : "min-h-44 py-8")}>
    <LoaderCircle size={30} strokeWidth={2} className="animate-spin text-[#1032DC]" aria-hidden="true"/>
    <span className="text-[13px] font-medium text-[#60758e]">{label}</span>
  </div>;
}
