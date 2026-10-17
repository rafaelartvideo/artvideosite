import { getStatusTone, STATUS_TONE_HEX } from "@/shared/domain/status-tone";
type OrderStatusDotProps = {
  status?: string | null;
  color?: string | null;
  className?: string;
};

function dotPresentation(status?: string | null, color?: string | null) {
  const tone = getStatusTone(status);
  return {
    background: tone === "neutral" ? color || STATUS_TONE_HEX.neutral : STATUS_TONE_HEX[tone],
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
