import { cn } from "@/shared/domain/formatters";

type OrderLifecycleStatus = "solved" | "completed";

/** Etiquetas de ciclo de vida distintas das situações configuráveis da OS. */
export function OrderLifecycleTag({ status, className }: {
  status: OrderLifecycleStatus;
  className?: string;
}) {
  return <span className={cn(
    "inline-flex max-w-full items-center justify-center whitespace-nowrap border px-2.5 py-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.06em]",
    status === "completed"
      ? "rounded-md border-[#0131CD] bg-[#0131CD] text-white"
      : "rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/60 dark:bg-emerald-900/20 dark:text-emerald-300",
    className,
  )}>
    {status === "completed" ? "OS concluída" : "OS solucionada"}
  </span>;
}
