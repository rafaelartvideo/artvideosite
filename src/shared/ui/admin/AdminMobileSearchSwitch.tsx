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
  mobileOnly = true,
}: {
  value: T;
  options: AdminMobileSearchOption<T>[];
  onChange: (value: T) => void;
  children: ReactNode;
  actions?: ReactNode;
  mobileOnly?: boolean;
}) {
  const selected = options.find(option => option.value === value) || options[0];

  return <div className={mobileOnly ? "admin-mobile-search-switch space-y-3 md:hidden" : "admin-mobile-search-switch space-y-3"}>
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Buscar por: ${selected?.label || ""}`}
            className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-left text-xs font-bold text-foreground shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <span className="min-w-0 truncate">
              <span className="font-medium text-muted-foreground">Buscar por:</span> {selected?.label}
            </span>
            <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[240px]">
          {options.map(option => <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={cn(
              "cursor-pointer",
              value === option.value && "bg-primary/10 font-bold text-primary focus:bg-primary/10 focus:text-primary",
            )}
          >
            <Search size={14} className="text-muted-foreground" />
            <span>{option.label}</span>
            {value === option.value && <Check size={14} className="ml-auto text-primary" />}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      {actions}
    </div>
    <div className="min-w-0">{children}</div>
  </div>;
}
