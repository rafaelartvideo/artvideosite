import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, Eraser, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import { AdminCard } from "./AdminLayout";
import { AdminFieldLabel, INPUT } from "./AdminFormControls";

export function AdminSearchPanel({ title, children, headerActions, allowOverflow = false }: { title: string; children: ReactNode; headerActions?: ReactNode; allowOverflow?: boolean }) {
  return <AdminCard className={allowOverflow ? "overflow-visible p-0" : "overflow-hidden p-0"}>
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-t-xl border-b border-border bg-card px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/7 dark:bg-primary/20"><Search size={15} aria-hidden="true" className="shrink-0 text-primary dark:text-primary-light" /></span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {headerActions && <div className="ml-auto flex min-w-0 items-center justify-end gap-2">{headerActions}</div>}
    </div>
    <div className="min-w-0 p-4 sm:p-5">{children}</div>
  </AdminCard>;
}

/** Campo de busca compacto padronizado para painéis administrativos. */
export function AdminSearchTextField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return <div className="min-w-0">
    <AdminFieldLabel label={label} />
    <div className="relative min-w-0">
      <Search size={15} aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary dark:text-primary-light" />
      <input type="search" value={value} onChange={event => onChange(event.target.value)}
        placeholder={placeholder} aria-label={`Buscar por ${label.toLowerCase()}`}
        className={cn(INPUT, "h-[42px] min-h-[42px] pl-9 pr-2")} />
    </div>
  </div>;
}

/** Ações de filtro com contraste em painéis claros e escuros. */
export function AdminSearchClearButton({ onClick, label = "Limpar filtros" }: { onClick: () => void; label?: string }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label}
    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
    <Eraser size={13} /><span className="hidden sm:inline">{label}</span>
  </button>;
}

export type AdminSearchSortOption<T extends string> = { value: T; label: string };

export function AdminSearchSortMenu<T extends string>({
  value, onChange, options, label = "Ordenação",
}: {
  value: T;
  onChange: (value: T) => void;
  options: AdminSearchSortOption<T>[];
  label?: string;
}) {
  const current = options.find(option => option.value === value);
  const getSortIcon = (sortValue: string) =>
    sortValue === "asc" || sortValue === "oldest" || sortValue.endsWith("_asc") ? ArrowUpNarrowWide
    : sortValue === "desc" || sortValue === "newest" || sortValue.endsWith("_desc") ? ArrowDownWideNarrow : ArrowUpDown;
  const SortIcon = getSortIcon(value);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" title={`${label}: ${current?.label || "Padrão"}`}
        aria-label={`${label} atual: ${current?.label || "Padrão"}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        <SortIcon size={15} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[190px]">
      {options.map(option => {
        const Icon = getSortIcon(option.value);
        const selected = option.value === value;
        return <DropdownMenuItem key={option.value || "default"} onSelect={() => onChange(option.value)}
          className={cn("cursor-pointer", selected && "bg-primary/10 font-semibold text-primary dark:text-primary-light")}>
          <Icon size={15} /><span>{option.label}</span>{selected && <Check size={15} className="ml-auto text-primary dark:text-primary-light" />}
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
