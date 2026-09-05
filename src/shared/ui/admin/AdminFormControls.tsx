import React from "react";
import type { CustomerType } from "@/features/customers/domain/customer-form";
import { cn } from "@/shared/domain/formatters";
import { Switch } from "@/shared/ui/primitives/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/primitives/select";

export const INPUT = "w-full min-w-0 bg-[#f8fafc] border border-[#0d1b2e]/15 rounded-lg px-3 py-2.5 text-sm text-[#0d1b2e] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/50 focus:border-[#0057e7] focus:bg-white transition-all placeholder-[#5a6a82]/50";
const EMPTY_SELECT_VALUE = "__admin_select_empty__";

export function AdminSelect({ value, defaultValue, onValueChange, options, disabled, required, name, className, ariaLabel }: { value?: string | number; defaultValue?: string | number; onValueChange: (value: string) => void; options: { value: string | number; label: string }[]; disabled?: boolean; required?: boolean; name?: string; className?: string; ariaLabel?: string }) {
  const toSelectValue = (optionValue: unknown) => optionValue === "" || optionValue == null ? EMPTY_SELECT_VALUE : String(optionValue);
  return <Select value={value !== undefined ? toSelectValue(value) : undefined} defaultValue={defaultValue !== undefined ? toSelectValue(defaultValue) : undefined} onValueChange={nextValue => onValueChange(nextValue === EMPTY_SELECT_VALUE ? "" : nextValue)} disabled={disabled} required={required} name={name}>
    <SelectTrigger className={cn(INPUT, "h-auto min-h-[42px] cursor-default text-left", className)} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
    <SelectContent className="border-[#0d1b2e]/10 bg-white text-[#0d1b2e] shadow-xl">{options.map(option => <SelectItem key={String(option.value) || EMPTY_SELECT_VALUE} value={toSelectValue(option.value)} className="cursor-default focus:bg-[#eef5ff] focus:text-[#0057e7]">{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function FInput({ label, required, hint, disabled = false, ...props }: { label?: string; required?: boolean; hint?: string; disabled?: boolean; [key: string]: any }) {
  const isColorInput = props.type === "color";
  const { className, ...restProps } = props;
  const inputProps = { ...restProps, type: isColorInput ? "text" : props.type, maxLength: isColorInput ? 7 : props.maxLength, placeholder: isColorInput ? "#2563EB" : props.placeholder };
  return <div className="min-w-0">{label && <label className="mb-1.5 flex min-w-0 items-baseline gap-1 break-words text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}{required && <span className="text-red-400">*</span>}</label>}<input className={cn(INPUT, disabled && "disabled:cursor-default disabled:bg-slate-100/60 disabled:text-slate-500 disabled:opacity-70 disabled:hover:bg-slate-100/60 disabled:focus:ring-0", className)} disabled={disabled} {...inputProps} />{(hint || isColorInput) && <p className="mt-1 break-words text-[10px] leading-relaxed text-[#5a6a82]">{hint || "Use o formato #RRGGBB."}</p>}</div>;
}

function currencyInputDisplay(value: unknown) { if (value == null || value === "") return ""; const raw = String(value); const numericValue = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number(raw.replace(/[^\d]/g, "")) / 100; if (!Number.isFinite(numericValue)) return ""; return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numericValue); }
function currencyInputValue(value: string) { const digits = value.replace(/\D/g, ""); if (!digits) return ""; return (Number(digits) / 100).toFixed(2); }
export function FCurrencyInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) { return <FInput {...props} type="text" inputMode="numeric" value={currencyInputDisplay(value)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: currencyInputValue(event.target.value) } })} />; }

function hoursInputDisplay(value: unknown) { if (value == null || value === "") return ""; const totalMinutes = Math.max(0, Math.round(Number(value) * 60)); if (!Number.isFinite(totalMinutes)) return ""; const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`; }
function hoursInputValue(value: string) { const rawDigits = value.replace(/\D/g, ""); if (!rawDigits) return ""; const digits = rawDigits.slice(-4).padStart(4, "0"); const hours = Number(digits.slice(0, 2)); const minutes = Math.min(59, Number(digits.slice(2))); return String(hours + minutes / 60); }
export function FHoursInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) { return <FInput {...props} type="text" inputMode="numeric" value={hoursInputDisplay(value)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: hoursInputValue(event.target.value) } })} />; }

export function CustomerTypeToggle({ value, onChange, disabled = false }: { value: CustomerType; onChange: (value: CustomerType) => void; disabled?: boolean }) {
  return <div className="min-w-0 sm:col-span-2"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de cliente</label><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[#0d1b2e]/15">{[{ value: "PF" as const, label: "PESSOA FÍSICA" }, { value: "PJ" as const, label: "PESSOA JURÍDICA" }].map(option => <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)} className={`cursor-default px-3 py-2.5 text-xs font-black tracking-wide transition-colors ${value === option.value ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]"} ${disabled ? "opacity-70" : ""}`} aria-pressed={value === option.value}>{option.label}</button>)}</div></div>;
}

export function FTextarea({ label, rows = 3, ...props }: { label?: string; rows?: number; [key: string]: any }) { return <div className="min-w-0">{label && <label className="mb-1.5 block break-words text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label>}<textarea rows={rows} className={cn(INPUT, "resize-none")} {...props} /></div>; }

export function FSelect({ label, options, ...props }: { label?: string; options: { value: string; label: string }[]; [key: string]: any }) { const { value, defaultValue, onChange, disabled, required, name, className } = props; return <div className="min-w-0">{label && <label className="mb-1.5 block break-words text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}{required && <span className="text-red-400">*</span>}</label>}<AdminSelect value={value} defaultValue={defaultValue} onValueChange={nextValue => onChange?.({ target: { value: nextValue } })} options={options} disabled={disabled} required={required} name={name} className={className} ariaLabel={label} /></div>; }

export function FToggle({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={cn("flex min-w-0 items-center gap-3 text-left", disabled ? "cursor-default opacity-65" : "cursor-default")}><Switch disabled={disabled} checked={checked} onCheckedChange={onChange} className="h-6 w-11 shrink-0 data-[state=checked]:bg-[#0057e7] data-[state=unchecked]:bg-[#0d1b2e]/20" /><div className="min-w-0"><span className="break-words text-sm font-semibold text-[#0d1b2e]">{label}</span>{description && <p className="mt-0.5 break-words text-xs leading-relaxed text-[#5a6a82]">{description}</p>}</div></label>;
}
