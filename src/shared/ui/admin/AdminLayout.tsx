import React, { useEffect } from "react";
import { ArrowLeft, X } from "lucide-react";
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
};

export function AdminButton({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ariaLabel,
  ...buttonProps
}: AdminButtonProps) {
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

  return <button
    {...buttonProps}
    type={type}
    aria-label={buttonProps["aria-label"] ?? ariaLabel}
    className={cn(
      "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      variants[variant],
      sizes[size],
      className,
    )}
  >
    {children}
  </button>;
}

type AdminIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  variant?: "secondary" | "danger" | "ghost";
  ariaLabel?: string;
};

export function AdminIconButton({
  children,
  variant = "secondary",
  type = "button",
  ariaLabel,
  title,
  className = "",
  ...buttonProps
}: AdminIconButtonProps) {
  const variants = {
    secondary: "border border-[#0d1b2e]/15 bg-white text-[#5a6a82] hover:bg-[#f5f7fa] hover:text-[#0057e7]",
    danger: "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "border border-transparent bg-transparent text-[#5a6a82] hover:bg-[#f5f7fa] hover:text-[#0057e7]",
  };

  return <button
    {...buttonProps}
    type={type}
    aria-label={buttonProps["aria-label"] ?? ariaLabel}
    title={title ?? buttonProps["aria-label"] ?? ariaLabel}
    className={cn(
      "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
      variants[variant],
      className,
    )}
  >
    {children}
  </button>;
}

export function AdminCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-hidden rounded-xl border border-[#0d1b2e]/8 bg-white shadow-sm", className)}>{children}</div>;
}

export function AdminCardHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-5 py-2.5", className)}>{children}</div>;
}

export function AdminCardContent({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
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
  return <div className={cn("grid overflow-hidden rounded-lg border border-[#0d1b2e]/15 bg-white", className)}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        disabled={disabled}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          "px-3 py-2.5 text-xs font-black tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-inset",
          value === option.value ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]",
          disabled && "cursor-not-allowed opacity-70",
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
      {(title || description || onClose) && <div className="flex items-start justify-between gap-3 border-b border-[#0d1b2e]/8 px-5 py-4">
        <div className="min-w-0">
          {title ? <DialogTitle className="text-base font-bold text-[#0d1b2e]">{title}</DialogTitle> : <DialogTitle className="sr-only">Janela administrativa</DialogTitle>}
          {description && <DialogDescription className="mt-1 text-sm leading-relaxed text-[#5a6a82]">{description}</DialogDescription>}
        </div>
        <AdminIconButton ariaLabel="Fechar" onClick={onClose} className="shrink-0" variant="ghost"><X size={15} /></AdminIconButton>
      </div>}
      <div className="max-h-[calc(90vh-140px)] overflow-y-auto p-5">{children}</div>
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
    {!fullPage && <button type="button" onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 z-10 p-2 text-[#5a6a82] bg-white border border-[#0d1b2e]/10 rounded-lg shadow-sm hover:text-[#0057e7] hover:bg-[#f5f7fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2"><X size={16} /></button>}
    <div className={cn("mx-auto w-full p-4 sm:p-6 lg:p-8", resolvedMaxW)}>{children}</div>
  </div>;
}

export function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <AdminCard>
    <AdminCardHeader>
      <h3 className="min-w-0 text-[10px] font-black text-[#0d1b2e] uppercase tracking-widest">{title}</h3>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </AdminCardHeader>
    <AdminCardContent>{children}</AdminCardContent>
  </AdminCard>;
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: string; eyebrow?: string; actions?: React.ReactNode }) {
  const onBack = React.useContext(AdminBackContext);
  return (
    <header className="flex flex-col gap-4 border-b border-[#0d1b2e]/8 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0057e7]">{eyebrow}</p>}
        <h1 className="text-2xl font-black leading-tight text-[#0d1b2e]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#5a6a82]">{subtitle}</p>}
      </div>
      {(actions || onBack) && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {onBack && <InternalBackButton onBack={onBack} inHeader />}
          {actions}
        </div>
      )}
    </header>
  );
}

export function BtnPrimary({ children, onClick, disabled, type = "button", className = "" }: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return <AdminButton type={type} onClick={onClick} disabled={disabled} className={className}>{children}</AdminButton>;
}

export function BtnSecondary({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLButtonElement>; className?: string }) {
  return <AdminButton variant="secondary" onClick={onClick} className={className}>{children}</AdminButton>;
}

export function InternalBackButton({ onBack, inHeader = false }: { onBack: () => void; inHeader?: boolean }) {
  const contextualBack = React.useContext(AdminBackContext);
  if (!inHeader && contextualBack === onBack) return null;
  return <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2"><ArrowLeft size={14} /> Voltar</button>;
}
