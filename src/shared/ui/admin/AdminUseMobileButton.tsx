import type { ButtonHTMLAttributes } from "react";
import { Smartphone } from "lucide-react";

/** Ação visual compartilhada das conexões temporárias com celular no CRM. */
export function AdminUseMobileButton({
  connected = false,
  showOnMobile = false,
  className = "",
  disabled,
  title,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & {
  connected?: boolean;
  showOnMobile?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      title={title ?? "Conectar celular"}
      aria-label={props["aria-label"] ?? (connected ? "Celular conectado" : "Usar celular")}
      data-admin-use-mobile="true"
      className={[
        showOnMobile ? "inline-flex" : "hidden md:inline-flex",
        "h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-primary/30",
        "bg-card px-3 text-xs font-bold text-primary shadow-none transition-colors",
        "hover:border-primary/50 hover:bg-primary-soft active:bg-primary-soft-strong",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].filter(Boolean).join(" ")}
    >
      <Smartphone size={16} className="shrink-0" aria-hidden="true" />
      <span>{connected ? "Celular conectado" : "Usar celular"}</span>
      {connected && (
        <span aria-hidden="true" className="relative ml-0.5 inline-flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-1 ring-card" />
        </span>
      )}
    </button>
  );
}
