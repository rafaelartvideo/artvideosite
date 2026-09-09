type OrderStatusDotProps = {
  status?: string | null;
  color?: string | null;
  className?: string;
};

const normalizeStatus = (value?: string | null) => String(value || "")
  .trim()
  .toLocaleLowerCase("pt-BR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

function dotPresentation(status?: string | null, color?: string | null) {
  const normalized = normalizeStatus(status);

  if (normalized === "aberta") return {
    background: "linear-gradient(180deg, #22a861 0%, #16824c 100%)",
    boxShadow: "inset 0 0 0 1px rgba(6,78,59,.18), 0 1px 2px rgba(6,78,59,.16)",
  };

  if (normalized === "fechada") return {
    background: "linear-gradient(180deg, #3b82f6 0%, #2563c7 100%)",
    boxShadow: "inset 0 0 0 1px rgba(30,58,138,.16), 0 1px 2px rgba(37,99,235,.15)",
  };

  if (normalized === "cancelada") return {
    background: "linear-gradient(180deg, #e05252 0%, #c93636 100%)",
    boxShadow: "inset 0 0 0 1px rgba(127,29,29,.16), 0 1px 2px rgba(185,28,28,.14)",
  };

  return {
    background: color || "#94a3b8",
    boxShadow: "inset 0 0 0 1px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.10)",
  };
}

export function OrderStatusDot({ status, color, className = "" }: OrderStatusDotProps) {
  const presentation = dotPresentation(status, color);
  return <span
    aria-label={`Status ${status || "não definido"}`}
    title={status || "Status não definido"}
    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
    style={presentation}
  />;
}
