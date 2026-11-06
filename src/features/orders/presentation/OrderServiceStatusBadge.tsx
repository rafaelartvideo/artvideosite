import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import type { OrderServiceTaskStatus } from "../infrastructure/order-service-tasks.repository";

/** Situação operacional da OS: badge arredondado com indicador pulsante nos estados ativos. */
export function OrderServiceStatusBadge({ status = "pending" }: { status?: OrderServiceTaskStatus | null }) {
  const current = status || "pending";
  const styles = {
    pending: STATUS_TONE_CLASSES.pending,
    in_progress: STATUS_TONE_CLASSES.progress,
    completed: STATUS_TONE_CLASSES.success,
    cancelled: STATUS_TONE_CLASSES.danger,
  };
  const labels: Record<OrderServiceTaskStatus, string> = {
    pending: "Pendente",
    in_progress: "Em andamento",
    completed: "Concluído",
    cancelled: "Cancelado",
  };
  const active = current === "pending" || current === "in_progress";
  return <span role="status" className={cn(
    "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold",
    styles[current].badge,
  )}>
    {active
      ? <span aria-hidden="true" className="relative inline-flex h-2 w-2 shrink-0">
          <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", styles[current].dot)}/>
          <span className={cn("relative h-2 w-2 rounded-full", styles[current].dot)}/>
        </span>
      : current === "completed"
        ? <CheckCircle2 aria-hidden="true" size={12} className="shrink-0"/>
        : <XCircle aria-hidden="true" size={12} className="shrink-0"/>}
    {labels[current]}
  </span>;
}
