import React, { useEffect } from "react";
import { ArrowLeft, X } from "lucide-react";
import { AdminBackContext, AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { cn } from "@/shared/domain/formatters";

export function AdminPage({ open, onClose, title, subtitle, breadcrumb, children, fullPage = false }: {
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
  useEffect(() => {
    if (!open) return;
    setPage?.({ breadcrumb, title, subtitle, onBack: onClose });
    const handleKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setPage?.(null);
    };
  }, [open, breadcrumb, title, subtitle, onClose, setPage]);

  if (!open) return null;
  return <div className="absolute inset-0 z-[35] bg-[#f8fafc]">
    {!fullPage && <button type="button" onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 z-10 p-2 text-[#5a6a82] bg-white border border-[#0d1b2e]/10 rounded-lg shadow-sm hover:text-[#0057e7] hover:bg-[#f5f7fa]"><X size={16} /></button>}
    <div className="max-w-6xl mx-auto w-full p-4 sm:p-8">{children}</div>
  </div>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-[#0d1b2e]/8 overflow-hidden">
    <div className="px-5 py-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">
      <h3 className="text-[10px] font-black text-[#0d1b2e] uppercase tracking-widest">{title}</h3>
    </div>
    <div className="p-5">{children}</div>
  </div>;
}

export function PageHeader({ actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const onBack = React.useContext(AdminBackContext);
  return <div className="flex items-start justify-between gap-4 mb-5">
    <div className="min-w-0" />
    {(actions || onBack) && <div className="flex items-center gap-2 flex-shrink-0">
      {onBack && <InternalBackButton onBack={onBack} inHeader />}{actions}
    </div>}
  </div>;
}

export function BtnPrimary({ children, onClick, disabled, type = "button", className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={cn("inline-flex items-center gap-2 whitespace-nowrap bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors disabled:opacity-50 cursor-pointer", className)}>{children}</button>;
}

export function BtnSecondary({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-2 whitespace-nowrap border border-[#0d1b2e]/15 text-[#0d1b2e] px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#f5f7fa] transition-colors cursor-pointer", className)}>{children}</button>;
}

export function InternalBackButton({ onBack, inHeader = false }: { onBack: () => void; inHeader?: boolean }) {
  const contextualBack = React.useContext(AdminBackContext);
  if (!inHeader && contextualBack === onBack) return null;
  return <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7] transition-colors"><ArrowLeft size={14} /> Voltar</button>;
}
