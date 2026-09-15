import React, { useEffect } from "react";
import { ArrowLeft, Pause, Play, X } from "lucide-react";
import { AdminBackContext, AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { cn } from "@/shared/domain/formatters";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";

export type AdminButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "icon";
export type AdminButtonSize = "sm" | "md" | "lg";

type AdminButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
  ariaLabel?: string;
  loading?: boolean;
  loadingText?: React.ReactNode;
};

function ButtonLoadingSpinner() {
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof (value as PromiseLike<unknown>).then === "function");
}

export function AdminButton({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ariaLabel,
  loading = false,
  loadingText,
  disabled,
  onClick,
  ...buttonProps
}: AdminButtonProps) {
  const [actionLoading, setActionLoading] = React.useState(false);
  const resolvedLoading = loading || actionLoading;
  const variants: Record<AdminButtonVariant, string> = {
    primary: "border border-transparent bg-[#0057e7] text-white hover:bg-[#0046c0]",
    secondary: "border border-[#0d1b2e]/15 bg-white text-[#0d1b2e] hover:bg-[#f5f7fa]",
    danger: "border border-red-200 bg-red-600 text-white hover:bg-red-700",
    ghost: "border border-transparent bg-transparent text-[#5a6a82] hover:bg-[#f5f7fa] hover:text-[#0057e7]",
    icon: "border border-[#0d1b2e]/15 bg-white text-[#5a6a82] hover:bg-[#f5f7fa] hover:text-[#0057e7]",
  };

  const sizes: Record<AdminButtonSize, string> = {
    sm: "gap-1.5 px-3 py-2 text-xs",
    md: "gap-2 px-4 py-2.5 text-sm",
    lg: "gap-2 px-5 py-3 text-sm",
  };

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
    if (!onClick || resolvedLoading) return;
    const result = (onClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
    if (!isPromiseLike(result)) return;
    setActionLoading(true);
    result.then(
      () => setActionLoading(false),
      () => setActionLoading(false),
    );
  };

  return <button
    {...buttonProps}
    type={type}
    onClick={handleClick}
    disabled={disabled || resolvedLoading}
    aria-busy={resolvedLoading || buttonProps["aria-busy"] === true ? true : undefined}
    aria-label={buttonProps["aria-label"] ?? ariaLabel}
    data-admin-loading={resolvedLoading ? "true" : undefined}
    data-admin-has-spinner={resolvedLoading ? "true" : undefined}
    className={cn(
      "inline-flex min-w-0 max-w-full cursor-default items-center justify-center whitespace-nowrap rounded-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50",
      variants[variant],
      sizes[size],
      className,
    )}
  >
    {resolvedLoading ? <><ButtonLoadingSpinner />{loadingText ?? children}</> : children}
  </button>;
}

type AdminIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  variant?: "secondary" | "danger" | "ghost";
  ariaLabel?: string;
  loading?: boolean;
};

export function AdminIconButton({
  children,
  variant = "secondary",
  type = "button",
  ariaLabel,
  title,
  className = "",
  loading = false,
  disabled,
  onClick,
  ...buttonProps
}: AdminIconButtonProps) {
  const [actionLoading, setActionLoading] = React.useState(false);
  const resolvedLoading = loading || actionLoading;
  const variants = {
    secondary: "border border-[#0d1b2e]/15 bg-white text-[#5a6a82] hover:bg-[#f5f7fa] hover:text-[#0057e7]",
    danger: "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "border border-transparent bg-transparent text-[#5a6a82] hover:bg-[#f5f7fa] hover:text-[#0057e7]",
  };
  const rawLabel = String(buttonProps["aria-label"] ?? ariaLabel ?? title ?? "").trim();
  const normalizedLabel = rawLabel.toLocaleLowerCase("pt-BR");
  const activeStateAction = normalizedLabel.startsWith("inativar") || normalizedLabel.startsWith("desativar")
    ? "deactivate"
    : normalizedLabel.startsWith("ativar")
      ? "activate"
      : null;
  const resolvedLabel = activeStateAction === "deactivate"
    ? rawLabel.replace(/^(desativar|inativar)/i, "Inativar")
    : activeStateAction === "activate"
      ? rawLabel.replace(/^ativar/i, "Ativar")
      : rawLabel;
  const activeStateClass = activeStateAction === "deactivate"
    ? "border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
    : activeStateAction === "activate"
      ? "border-emerald-200 bg-white text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
      : "";

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
    if (!onClick || resolvedLoading) return;
    const result = (onClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
    if (!isPromiseLike(result)) return;
    setActionLoading(true);
    result.then(
      () => setActionLoading(false),
      () => setActionLoading(false),
    );
  };

  return <button
    {...buttonProps}
    type={type}
    onClick={handleClick}
    disabled={disabled || resolvedLoading}
    aria-busy={resolvedLoading || buttonProps["aria-busy"] === true ? true : undefined}
    aria-label={activeStateAction ? resolvedLabel : (buttonProps["aria-label"] ?? ariaLabel)}
    title={activeStateAction ? resolvedLabel : (title ?? buttonProps["aria-label"] ?? ariaLabel)}
    data-admin-loading={resolvedLoading ? "true" : undefined}
    data-admin-has-spinner={resolvedLoading ? "true" : undefined}
    className={cn(
      "inline-flex h-8 w-8 cursor-default items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-40",
      activeStateAction ? activeStateClass : variants[variant],
      className,
    )}
  >
    {resolvedLoading
      ? <ButtonLoadingSpinner />
      : activeStateAction === "deactivate"
        ? <Pause size={15} />
        : activeStateAction === "activate"
          ? <Play size={15} />
          : children}
  </button>;
}

export function AdminCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn(
    "min-w-0 max-w-full overflow-hidden break-words rounded-xl border border-[#0d1b2e]/8 bg-white shadow-sm",
    "[&_table]:w-full [&_table]:text-sm",
    "[&_thead]:border-b [&_thead]:border-[#0d1b2e]/8 [&_thead]:bg-[#f8fafc] [&_thead]:text-[10px] [&_thead]:font-bold [&_thead]:uppercase [&_thead]:text-[#5a6a82]",
    "[&_th]:px-4 [&_th]:py-3",
    "[&_tbody]:divide-y [&_tbody]:divide-[#0d1b2e]/5",
    "[&_tbody>tr]:cursor-default [&_tbody>tr]:transition-colors [&_tbody>tr:hover]:bg-[#f8fafc]/80",
    "[&_td]:px-4 [&_td]:py-3.5",
    className,
  )}>{children}</div>;
}

export function AdminCardHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-14 min-w-0 items-center justify-between gap-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-3.5 sm:px-5", className)}>{children}</div>;
}

export function AdminCardToolbar({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-14 min-w-0 flex-col gap-3 border-b border-[#0d1b2e]/8 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:px-5", className)}>{children}</div>;
}

export function AdminCardContent({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-w-0 p-4 sm:p-5", className)}>{children}</div>;
}

export function AdminSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (nextValue: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return <div className={cn("grid min-w-0 overflow-hidden rounded-lg border border-[#0d1b2e]/15 bg-white", className)}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        disabled={disabled}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          "cursor-default px-3 py-2.5 text-xs font-black tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-inset",
          value === option.value ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]",
          disabled && "cursor-default opacity-70",
        )}
      >
        {option.label}
      </button>
    ))}
  </div>;
}

export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
    <DialogContent showClose={false} className={cn("z-[150] max-h-[90vh] max-w-lg gap-0 overflow-hidden rounded-2xl border-[#0d1b2e]/10 bg-white p-0 shadow-2xl", className)}>
      {(title || description || onClose) && <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#0d1b2e]/8 px-5 py-4">
        <div className="min-w-0 flex-1">
          {title ? <DialogTitle className="break-words text-base font-bold text-[#0d1b2e]">{title}</DialogTitle> : <DialogTitle className="sr-only">Janela administrativa</DialogTitle>}
          {description && <DialogDescription className="mt-1 break-words text-sm leading-relaxed text-[#5a6a82]">{description}</DialogDescription>}
        </div>
        <AdminIconButton ariaLabel="Fechar" onClick={onClose} className="shrink-0" variant="ghost"><X size={15} /></AdminIconButton>
      </div>}
      <div className="max-h-[calc(90vh-140px)] min-w-0 overflow-y-auto p-5">{children}</div>
      {footer && <div className="border-t border-[#0d1b2e]/8 bg-[#f8fafc] px-5 py-4">{footer}</div>}
    </DialogContent>
  </Dialog>;
}

export function AdminPage({ open, onClose, title, subtitle, breadcrumb, children, maxW = "max-w-6xl", fullPage = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  breadcrumb: string;
  children: React.ReactNode;
  maxW?: string;
  fullPage?: boolean;
}) {
  const setPage = React.useContext(AdminPageContext)?.setPage;
  const onCloseRef = React.useRef(onClose);
  const [browserBottomInset, setBrowserBottomInset] = React.useState(0);
  onCloseRef.current = onClose;
  const stableOnClose = React.useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!open) return;
    setPage?.({ breadcrumb, title, subtitle, onBack: stableOnClose });
    const handleKeyDown = (event: KeyboardEvent) => event.key === "Escape" && stableOnClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setPage?.(null);
    };
  }, [open, breadcrumb, title, subtitle, stableOnClose, setPage]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) {
      setBrowserBottomInset(0);
      return;
    }

    const updateBottomInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBrowserBottomInset(Math.min(110, Math.round(inset)));
    };

    updateBottomInset();
    viewport.addEventListener("resize", updateBottomInset);
    viewport.addEventListener("scroll", updateBottomInset);
    window.addEventListener("resize", updateBottomInset);

    return () => {
      viewport.removeEventListener("resize", updateBottomInset);
      viewport.removeEventListener("scroll", updateBottomInset);
      window.removeEventListener("resize", updateBottomInset);
    };
  }, [open]);

  if (!open) return null;
  const legacyCompactWidths = new Set(["max-w-xl", "max-w-2xl", "max-w-3xl"]);
  const resolvedMaxW = legacyCompactWidths.has(maxW) ? "max-w-6xl" : maxW;
  return <div
    className="admin-page-mobile-safe absolute inset-0 z-[35] bg-[#f8fafc] animate-in fade-in slide-in-from-right-2 duration-200"
    role="main"
    aria-label={title}
    style={{ "--admin-browser-bottom-inset": `${browserBottomInset}px` } as React.CSSProperties}
  >
    <style>{`@media (max-width: 767px) {
      .admin-page-mobile-safe .sticky.bottom-0 {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: var(--admin-browser-bottom-inset, 0px) !important;
        z-index: 70 !important;
        padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)) !important;
        box-shadow: 0 -10px 30px rgba(13, 27, 46, 0.10);
        backdrop-filter: blur(10px);
      }
      .admin-page-mobile-safe:has(.sticky.bottom-0) > div {
        padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px)) !important;
      }
    }`}</style>
    {!fullPage && <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 z-10 cursor-default rounded-lg border border-[#0d1b2e]/10 bg-white p-2 text-[#5a6a82] shadow-sm hover:bg-[#f5f7fa] hover:text-[#0057e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2"><X size={16} /></button>}
    <div className={cn("mx-auto w-full min-w-0 p-4 sm:p-6 lg:p-8", resolvedMaxW)}>{children}</div>
  </div>;
}

export function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <AdminCard>
    <AdminCardHeader>
      <h3 className="min-w-0 flex-1 break-words text-xs font-black uppercase leading-tight tracking-[0.12em] text-[#0d1b2e]">{title}</h3>
      {actions && (
        <div className="flex shrink-0 items-center justify-end gap-2 [&>*]:!h-9 [&>*]:!min-h-9 [&>*]:!w-9 [&>*]:!min-w-9 [&>*]:!justify-center [&>*]:!gap-0 [&>*]:!px-0 [&>*]:!text-[0px] md:[&>*]:!w-auto md:[&>*]:!min-w-0 md:[&>*]:!gap-1.5 md:[&>*]:!px-3 md:[&>*]:!text-xs">
          {actions}
        </div>
      )}
    </AdminCardHeader>
    <AdminCardContent>{children}</AdminCardContent>
  </AdminCard>;
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: string; eyebrow?: string; actions?: React.ReactNode }) {
  const onBack = React.useContext(AdminBackContext);
  return (
    <header className="flex min-w-0 flex-col gap-4 border-b border-[#0d1b2e]/8 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 break-words text-[10px] font-black uppercase tracking-[0.16em] text-[#0057e7]">{eyebrow}</p>}
        <h1 className="break-words text-2xl font-black leading-tight text-[#0d1b2e]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl break-words text-sm leading-relaxed text-[#5a6a82]">{subtitle}</p>}
      </div>
      {(actions || onBack) && (
        <div className="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-2">
          {onBack && <InternalBackButton onBack={onBack} inHeader />}
          {actions && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 [&_button]:h-11 [&_button]:min-w-11 [&_button]:px-3 [&_button_svg]:h-[17px] [&_button_svg]:w-[17px] sm:[&_button]:px-4">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export function BtnPrimary({ children, onClick, disabled, loading = false, loadingText, type = "button", className = "" }: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: React.ReactNode;
  type?: "button" | "submit";
  className?: string;
}) {
  return <AdminButton type={type} onClick={onClick} disabled={disabled} loading={loading} loadingText={loadingText} className={className}>{children}</AdminButton>;
}

export function BtnSecondary({ children, onClick, disabled, loading = false, loadingText, className = "" }: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: React.ReactNode;
  className?: string;
}) {
  return <AdminButton variant="secondary" onClick={onClick} disabled={disabled} loading={loading} loadingText={loadingText} className={className}>{children}</AdminButton>;
}

export function InternalBackButton({ onBack, inHeader = false }: { onBack: () => void; inHeader?: boolean }) {
  const contextualBack = React.useContext(AdminBackContext);
  if (!inHeader && contextualBack === onBack) return null;
  return <button type="button" onClick={onBack} className="inline-flex cursor-default items-center gap-1.5 text-xs font-bold text-[#5a6a82] transition-colors hover:text-[#0057e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2"><ArrowLeft size={14} /> Voltar</button>;
}
