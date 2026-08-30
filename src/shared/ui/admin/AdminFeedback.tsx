import React, { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Package, Plus, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";

export function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function StatusBadge({ status, color }: { status: string; color?: string | null }) {
  const normalized = (status || "").toLowerCase();
  let classes = "bg-blue-100 text-blue-800";
  if (/conclu|pronto|finaliz|entregue|aprovad/.test(normalized)) classes = "bg-emerald-100 text-emerald-800";
  else if (/pendent|aguard|anál|analise/.test(normalized)) classes = "bg-amber-100 text-amber-800";
  else if (/cancel|recusad/.test(normalized)) classes = "bg-red-100 text-red-800";
  else if (/ativo|ativa/.test(normalized)) classes = "bg-emerald-100 text-emerald-800";
  else if (/inativo|inativa/.test(normalized)) classes = "bg-red-100 text-red-800";

  const customColor = Boolean(color && isHexColor(color));
  return (
    <span
      className={cn("inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", customColor ? "border" : classes)}
      style={customColor ? { color: color!, backgroundColor: `${color}20`, borderColor: `${color}55` } : undefined}
    >
      {status || "—"}
    </span>
  );
}

export function LoadingState({ text = "Carregando..." }: { text?: string }) {
  return <div className="flex flex-col items-center justify-center py-20 gap-3">
    <Clock size={28} className="animate-spin text-[#0057e7]" />
    <p className="text-sm text-[#5a6a82]">{text}</p>
  </div>;
}

export function EmptyState({ icon: Icon = Package, title, message, onAdd, addLabel = "Adicionar" }: {
  icon?: React.ElementType;
  title: string;
  message?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-16 h-16 bg-[#0057e7]/8 rounded-2xl flex items-center justify-center">
      <Icon size={28} className="text-[#0057e7]/50" />
    </div>
    <div className="text-center max-w-xs">
      <p className="font-bold text-[#0d1b2e] mb-1">{title}</p>
      {message && <p className="text-sm text-[#5a6a82]">{message}</p>}
    </div>
    {onAdd && <button onClick={onAdd} className="flex items-center gap-2 bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors">
      <Plus size={16} /> {addLabel}
    </button>}
  </div>;
}

export function Toast({ message, type = "success", onClose }: { message: string; type?: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 3500);
    return () => clearTimeout(timeout);
  }, [onClose]);

  return <div className={cn(
    "fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border text-sm font-semibold max-w-sm",
    type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800",
  )}>
    {type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
    <span className="flex-1">{message}</span>
    <button onClick={onClose}><X size={15} /></button>
  </div>;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[150]">
    <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#0d1b2e]/10">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertTriangle size={18} className="text-red-600" />
        </div>
        <div>
          <p className="font-bold text-[#0d1b2e] mb-1">Confirmar exclusão</p>
          <p className="text-sm text-[#5a6a82] leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 border border-[#0d1b2e]/15 rounded-lg text-sm font-bold text-[#0d1b2e] hover:bg-[#f5f7fa] transition-colors">Cancelar</button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">Excluir</button>
      </div>
    </div>
  </div>;
}
