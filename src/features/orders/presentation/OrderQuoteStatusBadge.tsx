import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import type { OrderQuoteProposal } from "../infrastructure/order-quote.repository";

export type OrderQuoteStatus = OrderQuoteProposal["status"] | null;

const QUOTE_STATUSES: Record<NonNullable<OrderQuoteStatus>, { label: string; tone: keyof typeof STATUS_TONE_CLASSES }> = {
  draft: { label: "Em elaboração", tone: "neutral" },
  awaiting_approval: { label: "Aguardando aprovação", tone: "pending" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Rejeitado", tone: "danger" },
  renegotiation: { label: "Em renegociação", tone: "progress" },
};

export function OrderQuoteStatusBadge({ status, className = "" }: { status: OrderQuoteStatus; className?: string }) {
  const meta = QUOTE_STATUSES[status || "draft"];
  return <span
    aria-label={`Orçamento: ${meta.label}`}
    title={`Situação do orçamento: ${meta.label}`}
    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE_CLASSES[meta.tone].badge} ${className}`}>
    Orçamento: {meta.label}
  </span>;
}
