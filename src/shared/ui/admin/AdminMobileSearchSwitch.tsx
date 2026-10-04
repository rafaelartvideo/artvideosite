import type { ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";

export type AdminMobileSearchOption<T extends string> = {
  value: T;
  label: string;
};

export function AdminMobileSearchSwitch<T extends string>({
  value,
  options,
  onChange,
  children,
  actions,
}: {
  value: T;
  options: AdminMobileSearchOption<T>[];
  onChange: (value: T) => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const selected = options.find(option => option.value === value) || options[0];

  return <div className="space-y-3 md:hidden">
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Buscar por: ${selected?.label || ""}`}
            className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm transition-colors hover:border-[#0057e7]/40 focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"
          >
            <span className="min-w-0 truncate">
              <span className="font-medium text-[#5a6a82]">Buscar por:</span> {selected?.label}
            </span>
            <ChevronDown size={15} className="shrink-0 text-[#5a6a82]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[240px]">
          {options.map(option => <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={cn(
              "cursor-pointer",
              value === option.value && "bg-[#eef5ff] font-bold text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]",
            )}
          >
            <Search size={14} className={value === option.value ? "text-[#0057e7]" : "text-[#5a6a82]"} />
            <span>{option.label}</span>
            {value === option.value && <Check size={14} className="ml-auto text-[#0057e7]" />}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      {actions}
    </div>
    <div className="min-w-0">{children}</div>
  </div>;
}
