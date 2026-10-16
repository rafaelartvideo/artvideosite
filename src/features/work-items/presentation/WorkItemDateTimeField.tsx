import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/ui/primitives/popover";

const TIMES = Array.from({ length: 96 }, (_, index) => {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  return `${hour}:${minute}`;
});
const validTime = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
};
const localParts = (value: string | null) => {
  if (!value) return { date: "", time: "" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return { date: local.slice(0, 10), time: local.slice(11) };
};
const todayDate = () => localParts(new Date().toISOString()).date;
const buildDate = (date: string, time: string) => {
  const result = new Date(`${date}T${time}:00`);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
};

export function WorkItemDateTimeField({
  label, value, onChange, disabled = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
 }) {
  const parts = localParts(value);
  const [timeText, setTimeText] = useState(parts.time);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeText(parts.time); }, [value]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    const current = listRef.current.querySelector<HTMLElement>('[aria-selected="true"]');
    if (current) listRef.current.scrollTop = Math.max(0, current.offsetTop - listRef.current.offsetTop - 60);
  }, [open]);

  const changeTime = (time: string) => {
    setTimeText(time);
    if (validTime(time)) onChange(buildDate(parts.date || todayDate(), time));
  };
  const chooseTime = (time: string) => { changeTime(time); setOpen(false); };
  return <div className="relative min-w-0 space-y-1.5">
    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {label}
    </label>
    <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
      <div className="flex min-w-0 gap-1.5">
      <input ref={dateRef} type="date" className={cn(INPUT, "min-w-0 flex-1 text-sm [&::-webkit-calendar-picker-indicator]:hidden")} value={parts.date} disabled={disabled}
        aria-label={`Data de ${label.toLocaleLowerCase("pt-BR")}`}
        onChange={event => {
          const nextDate = event.target.value;
          if (!nextDate) { onChange(null); setTimeText(""); setOpen(false); return; }
          const time = validTime(timeText) ? timeText : "09:00";
          setTimeText(time);
          onChange(buildDate(nextDate, time));
        }} />
      <button type="button" disabled={disabled} title={`Abrir calendário de ${label.toLowerCase()}`} aria-label={`Selecionar data de ${label.toLowerCase()}`}
        onClick={() => { if (!dateRef.current) return; try { dateRef.current.showPicker(); } catch { dateRef.current.focus(); } }}
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50">
        <CalendarDays size={18} />
      </button>
      </div>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverAnchor asChild><div className="relative min-w-0">
        <Clock3 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={timeText} disabled={disabled} inputMode="numeric" autoComplete="off"
          aria-label={`Hora de ${label.toLocaleLowerCase("pt-BR")}`}
          placeholder="HH:mm" maxLength={5} className={cn(INPUT, "min-w-0 pl-8 pr-7 text-center text-sm tabular-nums")}
          onFocus={() => setOpen(true)}
          onChange={event => {
            const raw = event.target.value.replace(/[^\d:]/g, "").slice(0, 5);
            const digits = raw.replace(/\D/g, "");
            const next = !raw.includes(":") && digits.length > 2
              ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
              : raw;
            setTimeText(next);
            if (validTime(next)) onChange(buildDate(parts.date || todayDate(), next));
          }}
          onBlur={() => {
            if (!validTime(timeText)) setTimeText(localParts(value).time);
          }} />
        <button type="button" disabled={disabled} aria-label={`Selecionar hora de ${label.toLocaleLowerCase("pt-BR")}`}
          aria-expanded={open} onClick={() => setOpen(current => !current)}
          className="absolute right-0 top-0 flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-primary disabled:opacity-40">
          <ChevronDown size={14} />
        </button>
        </div></PopoverAnchor>
        {!disabled && <PopoverContent align="end" side="bottom" sideOffset={5} collisionPadding={12}
          onOpenAutoFocus={event => event.preventDefault()}
          className="z-[220] w-[124px] border-border bg-popover p-0.5 text-popover-foreground shadow-xl">
          <div ref={listRef} role="listbox" aria-label="Horários em intervalos de 15 minutos"
            className="max-h-[160px] overflow-y-auto overscroll-contain">
          {TIMES.map(time => <button key={time} type="button" role="option"
            aria-selected={timeText === time} onMouseDown={event => event.preventDefault()}
            onClick={() => chooseTime(time)}
            className={cn("flex h-10 w-full items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors hover:bg-primary/10 hover:text-primary",
              timeText === time && "bg-primary/10 text-primary")}>{time}</button>)}
          </div>
        </PopoverContent>}
      </Popover>
    </div>
    <div className="flex min-h-4 items-center justify-end gap-2">
      {value && !disabled && <button type="button" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-destructive"
        onClick={() => { setTimeText(""); setOpen(false); onChange(null); }}><X size={11} /> Limpar</button>}
    </div>
  </div>;
}
