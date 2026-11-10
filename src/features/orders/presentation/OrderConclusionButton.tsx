import type { ButtonHTMLAttributes } from "react";

/** Ícone Payments (Material Symbols), sem círculo ou seta. */
function PaymentsIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5 shrink-0 text-[#059669]">
    <path d="M19 14V6c0-1.1-.9-2-2-2H3C1.9 4 1 4.9 1 6v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v10c0 1.1-.9 2-2 2H5v-2h16V7h2z" />
  </svg>;
}

type OrderConclusionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label?: string;
  loading?: boolean;
  compact?: boolean;
  mobileIconOnly?: boolean;
};

/** Ação de conclusão com ícone Payments verde, sem bolinha e sem seta. */
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
  return <button
    {...props}
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    aria-label={props["aria-label"] ?? label}
    title={props.title ?? label}
    className={[
      "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-0 bg-primary text-primary-foreground shadow-none",
      "font-semibold tracking-[0.02em] transition-colors hover:bg-primary-hover active:bg-primary-active",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
      "disabled:cursor-not-allowed disabled:opacity-50",
      compact ? "h-9 min-w-[120px] px-3 text-xs" : "h-11 min-w-[150px] px-4 text-sm",
      mobileIconOnly ? "max-sm:h-10 max-sm:w-10 max-sm:min-w-0 max-sm:!px-0" : "",
      className,
    ].filter(Boolean).join(" ")}
  >
    <span className={mobileIconOnly ? "whitespace-nowrap max-sm:sr-only" : "whitespace-nowrap"}>
      {loading ? "Concluindo..." : label}
    </span>
    {loading
      ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
      : <PaymentsIcon />}
  </button>;
}
