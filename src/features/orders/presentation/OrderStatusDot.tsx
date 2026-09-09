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
    background: "radial-gradient(circle at 32% 28%, #ecfdf5 0%, #6ee7b7 24%, #10b981 54%, #047857 78%, #064e3b 100%)",
    boxShadow: "inset 1px 1px 1.5px rgba(255,255,255,.9), inset -1px -1px 2px rgba(6,78,59,.45), 0 1px 3px rgba(5,150,105,.38)",
  };
  if (normalized === "fechada") return {
    background: "radial-gradient(circle at 32% 28%, #eff6ff 0%, #93c5fd 24%, #3b82f6 54%, #1d4ed8 78%, #1e3a8a 100%)",
    boxShadow: "inset 1px 1px 1.5px rgba(255,255,255,.9), inset -1px -1px 2px rgba(30,58,138,.45), 0 1px 3px rgba(37,99,235,.38)",
  };
  if (normalized === "cancelada") return {
    background: "radial-gradient(circle at 32% 28%, #fff1f2 0%, #fda4af 24%, #ef4444 54%, #b91c1c 78%, #7f1d1d 100%)",
    boxShadow: "inset 1px 1px 1.5px rgba(255,255,255,.9), inset -1px -1px 2px rgba(127,29,29,.45), 0 1px 3px rgba(220,38,38,.38)",
  };
  return {
    background: color || "#94a3b8",
    boxShadow: "inset 1px 1px 1.5px rgba(255,255,255,.75), inset -1px -1px 2px rgba(15,23,42,.25), 0 1px 3px rgba(15,23,42,.2)",
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
