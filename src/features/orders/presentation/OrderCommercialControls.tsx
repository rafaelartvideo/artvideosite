import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import type { OrderCatalogOption } from "../infrastructure/order-commercial-items.repository";

function normalizeStepperText(value: string, integer: boolean) {
  if (integer) return value.replace(/\D/g, "");
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot < 0) return normalized;
  return normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
}

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  integer = false,
  disabled = false,
  placeholder,
  className,
  inputClassName,
  ariaLabel,
  onBlur,
  onStep,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
  onBlur?: () => void;
  onStep?: (value: string) => void;
}) {
  const adjust = (direction: 1 | -1) => {
    const parsed = Number(String(value || "").replace(",", "."));
    const base = Number.isFinite(parsed) ? parsed : min;
    let next = base + direction * step;
    next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    const nextText = integer
      ? String(Math.max(min, Math.trunc(next)))
      : String(Number(next.toFixed(2)));
    onChange(nextText);
    onStep?.(nextText);
  };

  return <div className={cn("min-w-0", className)}>
    {label && <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>}
    <div className={cn(
      "flex min-h-[42px] min-w-0 overflow-hidden rounded-lg border border-border bg-muted/55 transition-colors focus-within:border-primary focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/25",
      disabled && "opacity-65",
    )}>
      <input
        aria-label={ariaLabel || label}
        inputMode={integer ? "numeric" : "decimal"}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(normalizeStepperText(event.target.value, integer))}
        onBlur={() => onBlur?.()}
        className={cn("min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/65", inputClassName)}
      />
      <div className="flex w-8 shrink-0 flex-col border-l border-border">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (max != null && Number(value || 0) >= max)}
          onClick={() => adjust(1)}
          aria-label="Aumentar"
          className="flex flex-1 cursor-default items-center justify-center border-b border-border text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-35"
        ><ChevronUp size={13} /></button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || Number(value || min) <= min}
          onClick={() => adjust(-1)}
          aria-label="Diminuir"
          className="flex flex-1 cursor-default items-center justify-center text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-35"
        ><ChevronDown size={13} /></button>
      </div>
    </div>
  </div>;
}

export function CatalogResults({
  open,
  loading,
  options,
  emptyLabel,
  formatCurrency,
  onSelect,
  isUnavailable,
  unavailableLabel,
  onUnavailable,
  fourRows = false,
}: {
  open: boolean;
  loading: boolean;
  options: OrderCatalogOption[];
  emptyLabel: string;
  formatCurrency: (value: number) => string;
  onSelect: (option: OrderCatalogOption) => void;
  isUnavailable?: (option: OrderCatalogOption) => boolean;
  unavailableLabel?: (option: OrderCatalogOption) => string;
  onUnavailable?: (option: OrderCatalogOption) => void;
  fourRows?: boolean;
}) {
  if (!open) return null;

  return <div role="listbox" aria-busy={loading} className={cn(
    "absolute inset-x-0 top-[calc(100%+4px)] z-50 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover shadow-lg",
    fourRows ? "max-h-[224px]" : "max-h-56",
  )}>
    {loading && <div className="flex h-14 items-center justify-center" role="status" aria-label="Carregando resultados"><LoadingSpinner size="sm" /></div>}
    {!loading && options.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</div>}
    {!loading && options.map(option => {
      const unavailable = Boolean(isUnavailable?.(option));
      return <button
        key={option.id}
        type="button"
        aria-disabled={unavailable || undefined}
        onMouseDown={event => event.preventDefault()}
        onClick={() => unavailable ? onUnavailable?.(option) : onSelect(option)}
        className={cn(
          "flex w-full cursor-default justify-between gap-3 border-b border-border px-3 text-left transition-colors last:border-b-0",
          fourRows ? "h-14 items-center py-2" : "items-start py-3",
          unavailable ? "bg-muted/35 text-muted-foreground hover:bg-muted/55" : "hover:bg-primary-soft",
        )}
      >
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className={cn("block truncate text-sm font-semibold", unavailable ? "text-muted-foreground" : "text-foreground")}>{option.name}</span>
          {option.description && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.description}</span>}
          {option.stock != null && <span className={cn("mt-0.5 block text-[10px]", option.stock <= 0 ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground")}>Estoque: {option.stock} {option.unit}</span>}
        </span>
        <span className={cn("shrink-0 text-xs font-bold", unavailable ? "text-red-600 dark:text-red-400" : "text-primary")}>
          {unavailable
            ? unavailableLabel?.(option) || "Indisponível"
            : option.price_at_completion
              ? "Definir na conclusão"
              : option.price == null || (option.price === 0 && option.unit === "serviço")
                ? "Sem preço"
                : formatCurrency(option.price)}
        </span>
      </button>;
    })}
  </div>;
}

