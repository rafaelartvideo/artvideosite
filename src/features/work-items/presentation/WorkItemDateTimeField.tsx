import { useRef } from "react";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A single date + time field. Its external calendar action opens the native
 * datetime-local picker, so the date and time are selected in one place. */
export function WorkItemDateTimeField({
  label, value, onChange, disabled = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input || disabled) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return <div className="min-w-0 space-y-1.5">
    <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={inputRef}
        type="datetime-local"
        step={60}
        value={localDateTime(value)}
        disabled={disabled}
        aria-label={`Data e hora de ${label.toLowerCase()}`}
        onChange={event => onChange(toIso(event.target.value))}
        className={cn(INPUT, "min-w-0 flex-1 text-sm tabular-nums [&::-webkit-calendar-picker-indicator]:hidden")}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        title={`Selecionar data e hora de ${label.toLowerCase()}`}
        aria-label={`Selecionar data e hora de ${label.toLowerCase()}`}
        className="admin-action-blue-outline flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      {value && !disabled && <button
        type="button"
        onClick={() => onChange(null)}
        title={`Limpar ${label.toLowerCase()}`}
        aria-label={`Limpar ${label.toLowerCase()}`}
        className="flex h-[42px] w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
      ><X size={15} /></button>}
    </div>
  </div>;
}
