import React, { useEffect } from "react";
import { ArrowLeft, Maximize2, Minimize2, Pause, Play, X } from "lucide-react";
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

const AdminPageCloseContext = React.createContext<{ onClose: () => void; requestClose: () => void } | null>(null);

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
  const pageClose = React.useContext(AdminPageCloseContext);
  const resolvedOnClick = pageClose && onClick && onClick === (pageClose.onClose as unknown as typeof onClick)
    ? (pageClose.requestClose as unknown as typeof onClick)
    : onClick;
  const [actionLoading, setActionLoading] = React.useState(false);
  const resolvedLoading = loading || actionLoading;
  const variants: Record<AdminButtonVariant, string> = {
    primary: "admin-primary-gradient border border-primary/30 text-white",
    secondary: "border border-border bg-card text-card-foreground hover:bg-muted",
    danger: "border border-red-200 bg-red-600 text-white hover:bg-red-700",
    ghost: "border border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-primary",
    icon: "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-primary",
  };

  const sizes: Record<AdminButtonSize, string> = {
    sm: "gap-1.5 px-3 py-2 text-xs",
    md: "gap-2 px-4 py-2.5 text-sm",
    lg: "gap-2 px-5 py-3 text-sm",
  };

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
    if (!resolvedOnClick || resolvedLoading) return;
    const result = (resolvedOnClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
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
      "inline-flex min-w-0 max-w-full cursor-default items-center justify-center overflow-hidden whitespace-nowrap rounded-lg bg-clip-padding font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50",
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
  const pageClose = React.useContext(AdminPageCloseContext);
  const resolvedOnClick = pageClose && onClick && onClick === (pageClose.onClose as unknown as typeof onClick)
    ? (pageClose.requestClose as unknown as typeof onClick)
    : onClick;
  const [actionLoading, setActionLoading] = React.useState(false);
  const resolvedLoading = loading || actionLoading;
  const variants = {
    secondary: "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-primary",
    danger: "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "border border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-primary",
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
    ? "border border-red-500/35 bg-card text-red-500 hover:border-red-500/55 hover:bg-red-500/10 hover:text-red-500"
    : activeStateAction === "activate"
      ? "border border-emerald-500/35 bg-card text-emerald-500 hover:border-emerald-500/55 hover:bg-emerald-500/10 hover:text-emerald-500"
      : "";

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
    if (!resolvedOnClick || resolvedLoading) return;
    const result = (resolvedOnClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
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
      "inline-flex h-8 w-8 cursor-default items-center justify-center overflow-hidden rounded-lg bg-clip-padding transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-40",
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

export function AdminCard({ className = "", children, square = false }: { className?: string; children: React.ReactNode; square?: boolean }) {
  return <div className={cn(
    "min-w-0 max-w-full overflow-hidden break-words border border-border bg-card text-card-foreground",
    square ? "rounded-none" : "rounded-xl has-[table]:rounded-none has-[.admin-card-header]:rounded-none",
    "[&_table]:w-full [&_table]:text-sm",
    "[&_thead]:border-b [&_thead]:border-border [&_thead]:bg-muted/70 [&_thead]:text-[10px] [&_thead]:font-bold [&_thead]:uppercase [&_thead]:text-muted-foreground",
    "[&_th]:px-4 [&_th]:py-3",
    "[&_tbody]:divide-y [&_tbody]:divide-border",
    "[&_tbody>tr]:cursor-default [&_tbody>tr]:transition-colors [&_tbody>tr:hover]:bg-muted/60",
    "[&_td]:px-4 [&_td]:py-3.5",
    className,
  )}>{children}</div>;
}

export function AdminCardHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("admin-card-header flex min-h-14 min-w-0 items-center justify-between gap-3 border-b border-border bg-muted/70 px-4 py-3.5 sm:px-5", className)}>{children}</div>;
}

export function AdminCardToolbar({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-14 min-w-0 flex-col gap-3 border-b border-border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:px-5", className)}>{children}</div>;
}

export function AdminCardContent({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-w-0 p-4 sm:p-5", className)}>{children}</div>;
}

export function AdminStickyToolbar({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div
    {...props}
    data-admin-sticky-toolbar="true"
    className={cn(
      "sticky bottom-0 z-20 flex min-w-0 items-center justify-start gap-3 border-t border-primary bg-card px-4 py-4 text-card-foreground sm:px-5",
      className,
    )}
  >{children}</div>;
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
  return <div className={cn("grid min-w-0 overflow-hidden rounded-lg border border-border bg-card", className)}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        disabled={disabled}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          "cursor-default border px-3 py-2.5 text-xs font-black tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset",
          value === option.value ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
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
  headerActions,
  className,
  minimizable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;
  minimizable?: boolean;
}) {
  const [minimized, setMinimized] = React.useState(false);

  React.useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);

  return <Dialog open={open} modal={!minimized} onOpenChange={(nextOpen) => { if (!nextOpen && !minimized) onClose(); }}>
    <DialogContent
      showClose={false}
      showOverlay={!minimized}
      minimizable={false}
      overlayClassName="admin-dialog-overlay"
      data-admin-dialog-content="true"
      data-admin-dialog-minimized={minimized ? "true" : "false"}
      className={cn(
        "admin-crm z-[150] flex max-h-[calc(100dvh-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 shadow-2xl",
        minimized && "!bottom-4 !left-auto !right-4 !top-auto !w-[min(420px,calc(100vw-2rem))] !max-w-none !translate-x-0 !translate-y-0",
        !minimized && className,
      )}
    >
      {(title || description || onClose) && <div className={cn(
        "flex min-w-0 shrink-0 items-start justify-between gap-3 border-border px-5 py-4",
        !minimized && "border-b",
      )}>
        <div className="min-w-0 flex-1">
          {title ? <DialogTitle className="break-words text-base font-bold text-foreground">{title}</DialogTitle> : <DialogTitle className="sr-only">Janela administrativa</DialogTitle>}
          {!minimized && description && <DialogDescription className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{description}</DialogDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!minimized && headerActions}
          {minimizable && <AdminIconButton
            ariaLabel={minimized ? "Restaurar modal" : "Minimizar modal"}
            title={minimized ? "Restaurar" : "Minimizar"}
            onClick={() => setMinimized(current => !current)}
            className="shrink-0"
            variant="ghost"
          >
            {minimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
          </AdminIconButton>}
          <AdminIconButton ariaLabel="Fechar" onClick={onClose} className="shrink-0" variant="ghost"><X size={15} /></AdminIconButton>
        </div>
      </div>}
      {!minimized && <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">{children}</div>}
      {!minimized && footer && <div className="shrink-0 border-t border-border bg-muted/60 px-5 py-4">{footer}</div>}
    </DialogContent>
  </Dialog>;
}

export function AdminPage({ open, onClose, title, subtitle, titleVariant = "default", breadcrumb, children, maxW = "max-w-6xl", fullPage = false, closing = false, smoothMotion = true }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  titleVariant?: "default" | "order-number";
  breadcrumb: string;
  children: React.ReactNode;
  maxW?: string;
  fullPage?: boolean;
  closing?: boolean;
  smoothMotion?: boolean;
}) {
  const setPage = React.useContext(AdminPageContext)?.setPage;
  const onCloseRef = React.useRef(onClose);
  const closeTimerRef = React.useRef<number | null>(null);
  const closingRef = React.useRef(false);
  const [internalClosing, setInternalClosing] = React.useState(false);
  const [browserBottomInset, setBrowserBottomInset] = React.useState(0);
  onCloseRef.current = onClose;
  const stableOnClose = React.useCallback(() => onCloseRef.current(), []);
  const requestClose = React.useCallback(() => {
    if (closingRef.current) return;
    if (!smoothMotion) {
      stableOnClose();
      return;
    }
    closingRef.current = true;
    setInternalClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      stableOnClose();
    }, 200);
  }, [smoothMotion, stableOnClose]);

  useEffect(() => {
    if (!open) {
      closingRef.current = false;
      setInternalClosing(false);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return;
    }
    setPage?.({ breadcrumb, title, subtitle, titleVariant, onBack: requestClose });
    const handleKeyDown = (event: KeyboardEvent) => event.key === "Escape" && requestClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setPage?.(null);
    };
  }, [open, breadcrumb, title, subtitle, titleVariant, requestClose, setPage]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

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
  const isClosing = closing || internalClosing;
  const legacyCompactWidths = new Set(["max-w-xl", "max-w-2xl", "max-w-3xl"]);
  const resolvedMaxW = legacyCompactWidths.has(maxW) ? "max-w-6xl" : maxW;
  return <AdminPageCloseContext.Provider value={{ onClose, requestClose }}><div
    className={cn(
      "admin-page-mobile-safe absolute inset-0 z-[35] bg-background text-foreground motion-reduce:animate-none",
      isClosing
        ? "pointer-events-none animate-out fade-out slide-out-to-right-4 duration-200 ease-in"
        : smoothMotion
          ? "animate-in fade-in slide-in-from-right-4 duration-300 ease-out"
          : "animate-in fade-in slide-in-from-right-2 duration-200",
    )}
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
    {!fullPage && <button type="button" onClick={requestClose} aria-label="Fechar" className="absolute right-4 top-4 z-10 cursor-default rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"><X size={16} /></button>}
    <div className={cn("mx-auto w-full min-w-0 p-4 sm:p-6 lg:p-8", resolvedMaxW)}>{children}</div>
  </div></AdminPageCloseContext.Provider>;
}

export function Section({
  title,
  description,
  actions,
  children,
  flush = false,
  className = "",
  contentClassName = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  return <AdminCard square className={className}>
    <AdminCardHeader>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-xs font-black uppercase leading-tight tracking-[0.12em] text-foreground">{title}</h3>
        {description && <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center justify-end gap-2 [&_button]:!h-9 [&_button]:!min-h-9 [&_button]:!w-9 [&_button]:!min-w-9 [&_button]:!justify-center [&_button]:!gap-0 [&_button]:!px-0 [&_button]:!text-[0px] md:[&_button]:!w-auto md:[&_button]:!min-w-0 md:[&_button]:!gap-1.5 md:[&_button]:!px-3 md:[&_button]:!text-xs">
          {actions}
        </div>
      )}
    </AdminCardHeader>
    <AdminCardContent className={cn(flush ? "p-0 sm:p-0" : "", contentClassName)}>{children}</AdminCardContent>
  </AdminCard>;
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: React.ReactNode; subtitle?: string; eyebrow?: string; actions?: React.ReactNode }) {
  const onBack = React.useContext(AdminBackContext);
  return (
    <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 break-words text-[10px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
        <h1 className="break-words text-2xl font-black leading-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl break-words text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
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
  const pageClose = React.useContext(AdminPageCloseContext);
  const resolvedBack = pageClose && onBack === pageClose.onClose ? pageClose.requestClose : onBack;
  if (!inHeader && contextualBack === onBack) return null;
  return <button type="button" onClick={resolvedBack} className="inline-flex cursor-default items-center gap-1.5 text-xs font-bold text-[#5a6a82] transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"><ArrowLeft size={14} /> Voltar</button>;
}
