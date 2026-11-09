import { ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { financeServiceOrderLabel } from "../domain/finance-origin-label.mjs";

type Props = {
  orderId?: string | null;
  number?: unknown;
  label?: string;
  className?: string;
};

/** Abre o detalhe da OS em outra aba, sem perder o contexto financeiro atual. */
export function FinanceServiceOrderLink({ orderId, number, label, className = "" }: Props) {
  const { hasPermission } = useAuth();
  const text = label ?? financeServiceOrderLabel(number);
  const id = typeof orderId === "string" ? orderId.trim() : "";
  const canOpen = hasPermission("orders.view") &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  if (!canOpen) return <span className={className}>{text}</span>;

  return <a
    href={adminPath("orders", id)}
    target="_blank"
    rel="noopener noreferrer"
    onClick={event => event.stopPropagation()}
    aria-label={`Abrir ${text} em nova aba`}
    title="Abrir ordem de serviço em nova aba"
    className={`inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
  >
    {text}<ExternalLink size={12} className="shrink-0" aria-hidden="true" />
  </a>;
}
