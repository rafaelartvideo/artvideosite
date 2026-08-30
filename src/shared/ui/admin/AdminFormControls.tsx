import React from "react";
import type { CustomerType } from "@/features/customers/domain/customer-form";
import { cn } from "@/shared/domain/formatters";

export const INPUT = "w-full bg-[#f8fafc] border border-[#0d1b2e]/15 rounded-lg px-3 py-2.5 text-sm text-[#0d1b2e] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/50 focus:border-[#0057e7] focus:bg-white transition-all placeholder-[#5a6a82]/50";

export function FInput({ label, required, hint, disabled = false, ...props }: { label?: string; required?: boolean; hint?: string; disabled?: boolean; [key: string]: any }) {
  const isColorInput = props.type === "color";
  const { className, ...restProps } = props;
  const inputProps = { ...restProps, type: isColorInput ? "text" : props.type, maxLength: isColorInput ? 7 : props.maxLength, placeholder: isColorInput ? "#2563EB" : props.placeholder };
  return (
    <div>
      {label && <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400">*</span>}
      </label>}
      <input className={cn(INPUT, disabled && "disabled:cursor-not-allowed disabled:bg-slate-100/60 disabled:text-slate-500 disabled:opacity-70 disabled:hover:bg-slate-100/60 disabled:focus:ring-0", className)} disabled={disabled} {...inputProps} />
      {(hint || isColorInput) && <p className="text-[10px] text-[#5a6a82] mt-1">{hint || "Use o formato #RRGGBB."}</p>}
    </div>
  );
}

export function CustomerTypeToggle({ value, onChange, disabled = false }: { value: CustomerType; onChange: (value: CustomerType) => void; disabled?: boolean }) {
  return (
    <div className="sm:col-span-2">
      <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Tipo de cliente</label>
      <div className="grid grid-cols-2 rounded-lg border border-[#0d1b2e]/15 overflow-hidden">
        {[{ value: "PF" as const, label: "PESSOA FÍSICA" }, { value: "PJ" as const, label: "PESSOA JURÍDICA" }].map(option => (
          <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)} className={`px-3 py-2.5 text-xs font-black tracking-wide transition-colors ${value === option.value ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]"} ${disabled ? "cursor-not-allowed opacity-70" : ""}`} aria-pressed={value === option.value}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

export function FTextarea({ label, rows = 3, ...props }: { label?: string; rows?: number; [key: string]: any }) {
  return <div>
    {label && <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>}
    <textarea rows={rows} className={cn(INPUT, "resize-none")} {...props} />
  </div>;
}

export function FSelect({ label, options, ...props }: { label?: string; options: { value: string; label: string }[]; [key: string]: any }) {
  return <div>
    {label && <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>}
    <select className={cn(INPUT, "cursor-pointer")} {...props}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>;
}

export function FToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
    <div className={cn("relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200", checked ? "bg-[#0057e7]" : "bg-[#0d1b2e]/20")}>
      <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200", checked ? "translate-x-6" : "translate-x-1")} />
    </div>
    <div>
      <span className="text-sm font-semibold text-[#0d1b2e]">{label}</span>
      {description && <p className="text-xs text-[#5a6a82]">{description}</p>}
    </div>
  </button>;
}
