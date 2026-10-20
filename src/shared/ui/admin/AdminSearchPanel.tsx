import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, Eraser, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import { AdminCard } from "./AdminLayout";

export function AdminSearchPanel({ title, children, headerActions }: { title: string; children: ReactNode; headerActions?: ReactNode }) {
  return <AdminCard square className="overflow-hidden p-0">
    <div className="flex h-12 items-center justify-between gap-3 border-b border-primary-active/35 admin-primary-bar px-4 text-white md:h-11">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.08]"><Search size={14} className="shrink-0 text-white/90" /></span>
        <span className="text-xs font-black uppercase tracking-[0.14em]">{title}</span>
      </div>
      {headerActions && <div className="ml-auto flex min-w-0 items-center justify-end gap-2">{headerActions}</div>}
    </div>
    <div className="min-w-0 p-4 md:p-3">{children}</div>
  </AdminCard>;
}

/** Ações padrão da barra azul das buscas: mesma altura, cor e foco da OS. */
export function AdminSearchClearButton({ onClick, label = "Limpar filtros" }: { onClick: () => void; label?: string }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label}
    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
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
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.10] text-white transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
        <SortIcon size={15} className="text-white/90" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[190px]">
      {options.map(option => {
        const Icon = getSortIcon(option.value);
        const selected = option.value === value;
        return <DropdownMenuItem key={option.value || "default"} onSelect={() => onChange(option.value)}
          className={cn("cursor-pointer", selected && "bg-primary/10 font-bold text-primary")}>
          <Icon size={15} /><span>{option.label}</span>{selected && <Check size={15} className="ml-auto text-primary" />}
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
