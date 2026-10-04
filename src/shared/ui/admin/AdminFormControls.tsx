import React, { useEffect, useRef, useState } from "react";
import type { CustomerType } from "@/features/customers/domain/customer-form";
import {
  cn,
  formatBrazilianDateInput,
  formatCnpj,
  formatCpf,
  formatCurrency,
  formatPhone,
  formatPhoneInput,
  normalizeDecimalInput,
  normalizeIntegerInput,
} from "@/shared/domain/formatters";
import { Switch } from "@/shared/ui/primitives/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/primitives/select";

export const INPUT = "admin-input w-full min-w-0 rounded-lg border border-border bg-muted/55 px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/65 hover:border-border focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/25";
const EMPTY_SELECT_VALUE = "__admin_select_empty__";

export function AdminSelect({ value, defaultValue, onValueChange, options, disabled, required, name, className, ariaLabel }: { value?: string | number; defaultValue?: string | number; onValueChange: (value: string) => void; options: { value: string | number; label: string }[]; disabled?: boolean; required?: boolean; name?: string; className?: string; ariaLabel?: string }) {
  const toSelectValue = (optionValue: unknown) => optionValue === "" || optionValue == null ? EMPTY_SELECT_VALUE : String(optionValue);
  return <Select value={value !== undefined ? toSelectValue(value) : undefined} defaultValue={defaultValue !== undefined ? toSelectValue(defaultValue) : undefined} onValueChange={nextValue => onValueChange(nextValue === EMPTY_SELECT_VALUE ? "" : nextValue)} disabled={disabled} required={required} name={name}>
    <SelectTrigger className={cn(INPUT, "h-auto min-h-[42px] cursor-default text-left", className)} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
    <SelectContent position="popper" side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-[300] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] border-border bg-popover text-popover-foreground shadow-xl">{options.map(option => <SelectItem key={String(option.value) || EMPTY_SELECT_VALUE} value={toSelectValue(option.value)} className="cursor-default focus:bg-primary-soft focus:text-primary">{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function FInput({ label, required, hint, error, disabled = false, ...props }: { label?: string; required?: boolean; hint?: string; error?: string; disabled?: boolean; [key: string]: any }) {
  const isColorInput = props.type === "color";
  const { className, type, onChange, value, ...restProps } = props;
  const commonClassName = cn(INPUT, disabled && "disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground disabled:opacity-65 disabled:hover:bg-muted disabled:focus:ring-0", error && "border-red-500 focus:border-red-500 focus:ring-red-500/40", className);
  const colorText = String(value ?? "");
  const pickerColor = /^#[0-9A-Fa-f]{6}$/.test(colorText.trim()) ? colorText.trim() : "#1032DC";

  return <div className="min-w-0">
    {label && <label className="mb-1.5 flex min-w-0 items-baseline gap-1 break-words text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-red-400">*</span>}</label>}
    {isColorInput ? <div className="flex min-w-0 items-stretch gap-2">
      <input
        aria-invalid={Boolean(error) || undefined}
        className={commonClassName}
        disabled={disabled}
        {...restProps}
        type="text"
        maxLength={7}
        placeholder="#2563EB"
        value={colorText}
        onChange={onChange}
      />
      <input
        type="color"
        aria-label={label ? `Selecionar ${label.toLowerCase()}` : "Selecionar cor"}
        title="Selecionar cor"
        disabled={disabled}
        value={pickerColor}
        onChange={(event) => onChange?.({ target: { value: event.target.value.toUpperCase() } })}
        className="h-[42px] w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1 disabled:cursor-default disabled:opacity-60"
      />
    </div> : <input aria-invalid={Boolean(error) || undefined} className={commonClassName} disabled={disabled} {...restProps} type={type} value={value} onChange={onChange} />}
    {error ? <p className="mt-1 break-words text-[10px] font-semibold leading-relaxed text-red-600">{error}</p> : (hint || isColorInput) && <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">{hint || "Digite o HEX ou clique no seletor de cor."}</p>}
  </div>;
}

export function FPhoneInput({ value, onChange, mobile = false, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; mobile?: boolean; [key: string]: any }) {
  return <FInput {...props} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} placeholder={props.placeholder || (mobile ? "(79) 9 9999-9999" : "(79) 3333-3333")} value={formatPhone(value as any)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: formatPhoneInput(event.target.value, value as any, event.target.selectionStart) } })} />;
}

export function FCpfInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) {
  return <FInput {...props} type="text" inputMode="numeric" autoComplete="off" maxLength={14} placeholder={props.placeholder || "000.000.000-00"} value={formatCpf(String(value ?? ""))} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: formatCpf(event.target.value) } })} />;
}

export function FCnpjInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) {
  return <FInput {...props} type="text" inputMode="numeric" autoComplete="off" maxLength={18} placeholder={props.placeholder || "00.000.000/0000-00"} value={formatCnpj(String(value ?? ""))} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: formatCnpj(event.target.value) } })} />;
}

export function FEmailInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) {
  return <FInput {...props} type="email" inputMode="email" autoComplete="email" value={String(value ?? "")} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: event.target.value.replace(/\s/g, "") } })} />;
}

export function FBrazilianDateInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) {
  return <FInput {...props} type="text" inputMode="numeric" maxLength={10} placeholder={props.placeholder || "dd/mm/aaaa"} value={formatBrazilianDateInput(String(value ?? ""))} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: formatBrazilianDateInput(event.target.value) } })} />;
}

export function FIntegerInput({ value, onChange, allowNegative = false, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; allowNegative?: boolean; [key: string]: any }) {
  return <FInput {...props} type="text" inputMode="numeric" value={String(value ?? "")} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: normalizeIntegerInput(event.target.value, { allowNegative }) } })} />;
}

export function FDecimalInput({ value, onChange, allowNegative = false, decimalPlaces = 2, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; allowNegative?: boolean; decimalPlaces?: number; [key: string]: any }) {
  const displayValue = String(value ?? "").replace(".", ",");
  return <FInput {...props} type="text" inputMode="decimal" value={displayValue} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: normalizeDecimalInput(event.target.value, { allowNegative, decimalPlaces }) } })} />;
}

function currencyInputDisplay(value: unknown) {
  if (value == null || value === "") return "R$ ";
  const raw = String(value);
  const numericValue = /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number(raw.replace(/[^\d-]/g, "")) / 100;
  return Number.isFinite(numericValue) ? formatCurrency(numericValue, "R$ ") : "R$ ";
}
function currencyInputValue(value: string, allowNegative = false) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = (Number(digits) / 100).toFixed(2);
  return allowNegative && value.includes("-") ? `-${normalized}` : normalized;
}
export function FCurrencyInput({ value, onChange, allowNegative = false, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; allowNegative?: boolean; [key: string]: any }) {
  return <FInput
    {...props}
    type="text"
    inputMode={allowNegative ? "decimal" : "numeric"}
    value={currencyInputDisplay(value)}
    onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: currencyInputValue(event.target.value, allowNegative) } })}
  />;
}

function hoursInputDisplay(value: unknown) {
  if (value == null || value === "") return "";
  const numericHours = Number(value);
  if (!Number.isFinite(numericHours) || numericHours < 0) return "";
  const totalMinutes = Math.round(numericHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function normalizeHoursInputText(value: string) {
  const raw = String(value ?? "").replace(/[^\d:]/g, "");
  if (!raw.includes(":")) return raw.replace(/:/g, "");
  const [hoursPart = "", ...minuteParts] = raw.split(":");
  const hours = hoursPart.replace(/\D/g, "");
  const minutes = minuteParts.join("").replace(/\D/g, "").slice(0, 2);
  if (minutes && Number(minutes) > 59) return null;
  return `${hours}:${minutes}`;
}
function hoursInputValue(value: string) {
  const normalized = normalizeHoursInputText(value);
  if (normalized == null || normalized === "") return normalized === "" ? "" : null;
  if (!normalized.includes(":")) {
    const hours = Number(normalized);
    return Number.isFinite(hours) && hours >= 0 ? String(hours) : null;
  }
  const [hoursText = "", minutesText = ""] = normalized.split(":");
  const hours = Number(hoursText || 0);
  const minutes = Number(minutesText || 0);
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return String(hours + minutes / 60);
}
export function FHoursInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [key: string]: any }) {
  const [draft, setDraft] = useState(() => hoursInputDisplay(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(hoursInputDisplay(value));
  }, [value]);

  return <FInput
    {...props}
    type="text"
    inputMode="numeric"
    placeholder={props.placeholder || "00:00"}
    value={draft}
    onFocus={(event: React.FocusEvent<HTMLInputElement>) => {
      focused.current = true;
      props.onFocus?.(event);
    }}
    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
      const nextDraft = normalizeHoursInputText(event.target.value);
      if (nextDraft == null) return;
      setDraft(nextDraft);
      const nextValue = hoursInputValue(nextDraft);
      if (nextValue != null) onChange({ target: { value: nextValue } });
    }}
    onBlur={(event: React.FocusEvent<HTMLInputElement>) => {
      focused.current = false;
      const parsed = hoursInputValue(draft);
      const committed = parsed == null ? String(value ?? "") : parsed;
      setDraft(hoursInputDisplay(committed));
      if (parsed != null) onChange({ target: { value: parsed } });
      props.onBlur?.(event);
    }}
  />;
}

export function CustomerTypeToggle({ value, onChange, disabled = false }: { value: CustomerType; onChange: (value: CustomerType) => void; disabled?: boolean }) {
  return <div className="min-w-0 sm:col-span-2"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo de cliente</label><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">{[{ value: "PF" as const, label: "PESSOA FÍSICA" }, { value: "PJ" as const, label: "PESSOA JURÍDICA" }].map(option => <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)} className={`cursor-default border px-3 py-2.5 text-xs font-black tracking-wide transition-colors ${value === option.value ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"} ${disabled ? "opacity-70" : ""}`} aria-pressed={value === option.value}>{option.label}</button>)}</div></div>;
}

export function FTextarea({ label, rows = 3, error, ...props }: { label?: string; rows?: number; error?: string; [key: string]: any }) { return <div className="min-w-0">{label && <label className="mb-1.5 block break-words text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>}<textarea aria-invalid={Boolean(error) || undefined} rows={rows} className={cn(INPUT, "resize-none", error && "border-red-500 focus:border-red-500 focus:ring-red-500/40")} {...props} />{error && <p className="mt-1 break-words text-[10px] font-semibold leading-relaxed text-red-600">{error}</p>}</div>; }

export function FSelect({ label, options, error, ...props }: { label?: string; options: { value: string; label: string }[]; error?: string; [key: string]: any }) { const { value, defaultValue, onChange, disabled, required, name, className } = props; return <div className="min-w-0">{label && <label className="mb-1.5 block break-words text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-red-400">*</span>}</label>}<AdminSelect value={value} defaultValue={defaultValue} onValueChange={nextValue => onChange?.({ target: { value: nextValue } })} options={options} disabled={disabled} required={required} name={name} className={cn(error && "border-red-500 focus:ring-red-500/40", className)} ariaLabel={label} />{error && <p className="mt-1 break-words text-[10px] font-semibold leading-relaxed text-red-600">{error}</p>}</div>; }

export function FToggle({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={cn("flex min-w-0 items-center gap-3 text-left", disabled ? "cursor-default opacity-65" : "cursor-default")}><Switch disabled={disabled} checked={checked} onCheckedChange={onChange} className="h-6 w-11 shrink-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#0d1b2e]/20" /><div className="min-w-0"><span className="break-words text-sm font-semibold text-foreground">{label}</span>{description && <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{description}</p>}</div></label>;
}
