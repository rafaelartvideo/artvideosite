import { CheckCircle, ChevronDown } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "./AdminFormControls";
import { LoadingSpinner } from "./AdminFeedback";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/primitives/popover";

export type AdminFilterOption = { value: string; label: string };

export function AdminFilterMultiSelect({
  label,
  options,
  selectedValues,
  onToggle,
  placeholder,
  disabled = false,
  loading = false,
}: {
  label: string;
  options: AdminFilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const selectedLabel = selectedValues.length === 1
    ? options.find(option => option.value === selectedValues[0])?.label || selectedValues[0]
    : selectedValues.length > 1
      ? `${selectedValues.length} selecionados`
      : "";

  return <div className="min-w-0">
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label>
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(INPUT, "flex h-[42px] w-full min-w-0 items-center justify-between gap-2 text-left text-xs font-normal", disabled && "cursor-not-allowed opacity-60")}
        >
          <span className={cn("flex min-w-0 flex-1 items-center gap-2 truncate", selectedValues.length ? "text-[#0d1b2e]" : "text-[#5a6a82]/70")}>
            {loading && <LoadingSpinner size="sm" />}
            <span className="truncate">{loading ? "Carregando..." : selectedValues.length ? selectedLabel : placeholder}</span>
          </span>
          <ChevronDown size={14} className="shrink-0 text-[#5a6a82]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={5}
        collisionPadding={12}
        className="z-[120] w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-[#0d1b2e]/15 bg-white p-1 shadow-xl"
      >
        <div className="max-h-64 overflow-y-auto p-1">
          {loading ? <div className="flex items-center gap-2 p-3 text-xs text-[#5a6a82]"><LoadingSpinner size="sm" /><span>Carregando...</span></div> : options.length === 0 ? <p className="p-3 text-xs text-[#5a6a82]">Nenhuma opção encontrada.</p> : options.map(option => {
            const selected = selectedValues.includes(option.value);
            return <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#eef5ff]", selected && "bg-[#eef5ff] font-bold text-[#0057e7]")}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {selected && <CheckCircle size={14} className="shrink-0 text-[#0057e7]" />}
            </button>;
          })}
        </div>
      </PopoverContent>
    </Popover>
  </div>;
}
