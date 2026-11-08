import type { ButtonHTMLAttributes } from "react";
import { ArrowRight } from "lucide-react";

type OrderConclusionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label?: string;
  loading?: boolean;
  compact?: boolean;
  mobileIconOnly?: boolean;
};

/** Pílula azul com círculo verde e seta estática para concluir uma OS. */
export function OrderConclusionButton({
  label = "Concluir OS",
  loading = false,
  compact = false,
  mobileIconOnly = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: OrderConclusionButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={props["aria-label"] ?? label}
      title={props.title ?? label}
      className={[
        "inline-flex shrink-0 items-center justify-between overflow-hidden rounded-full border-0 bg-primary text-primary-foreground shadow-none",
        "font-semibold tracking-[0.02em] transition-colors hover:bg-primary-hover active:bg-primary-active",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "h-9 w-[136px] pl-3 text-xs" : "h-11 w-[170px] pl-4 text-sm",
        mobileIconOnly ? "max-sm:h-10 max-sm:w-[52px] max-sm:pl-2" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className={["flex min-w-0 flex-1 items-center justify-center whitespace-nowrap", mobileIconOnly ? "max-sm:sr-only" : ""].filter(Boolean).join(" ")}>
        {loading ? "Concluindo..." : label}
      </span>
      <span
        aria-hidden="true"
        className={[
          "ml-auto flex shrink-0 items-center justify-center rounded-full border-[3px] border-primary bg-[#B9FC01] text-[#0D1B2E]",
          compact ? "h-9 w-9" : "h-11 w-11",
          mobileIconOnly ? "max-sm:h-10 max-sm:w-10" : "",
        ].filter(Boolean).join(" ")}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
        ) : (
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
}
