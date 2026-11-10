import { getOrderStatusHex } from "../domain/order-status-palette";
type OrderStatusDotProps = {
  status?: string | null;
  color?: string | null;
  isReturn?: boolean;
  className?: string;
};

function dotPresentation(status?: string | null, color?: string | null, isReturn = false) {
  return {
    background: getOrderStatusHex(status, color, isReturn),
    boxShadow: "inset 0 0 0 1px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.10)",
  };
}

export function OrderStatusDot({ status, color, isReturn = false, className = "" }: OrderStatusDotProps) {
  const presentation = dotPresentation(status, color, isReturn);
  return <span
    aria-label={isReturn ? "Retorno" : `Status ${status || "não definido"}`}
    title={status || "Status não definido"}
    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
    style={presentation}
  />;
}
