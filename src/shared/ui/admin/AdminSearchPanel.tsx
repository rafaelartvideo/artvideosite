import { useId, type HTMLInputTypeAttribute, type ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, Eraser, Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import { AdminCard } from "./AdminLayout";
import { AdminFieldLabel, INPUT } from "./AdminFormControls";

export function AdminSearchPanel({ title, children, headerActions, allowOverflow = false }: { title: string; children: ReactNode; headerActions?: ReactNode; allowOverflow?: boolean }) {
  return <AdminCard square className={cn("admin-search-panel p-0", allowOverflow ? "overflow-visible" : "overflow-hidden")}>
    <div className="flex h-12 items-center justify-between gap-3 border-b border-primary-active/35 admin-primary-bar px-4 text-white md:h-11">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.08]"><Search size={14} className="shrink-0 text-white/90" /></span>
        <span className="text-xs font-bold uppercase tracking-[0.08em]">{title}</span>
      </div>
      {headerActions && <div className="ml-auto flex min-w-0 items-center justify-end gap-2">{headerActions}</div>}
    </div>
    <div className="admin-search-panel-content min-w-0 p-4 md:p-3">{children}</div>
  </AdminCard>;
}

/** Campo de busca compacto padronizado para painéis administrativos. */
export function AdminSearchTextField({ label, value, onChange, placeholder, inputMode, id, className, inputClassName, type = "search", ariaLabel }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric" | "text" | "tel" | "email" | "search";
  id?: string;
  className?: string;
  inputClassName?: string;
  type?: HTMLInputTypeAttribute;
  ariaLabel?: string;
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <div className={cn("min-w-0", className)}>
    {label && <AdminFieldLabel label={label} htmlFor={inputId} />}
    <div className="relative min-w-0">
      <Search size={15} aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input id={inputId} type={type} inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)}
        placeholder={placeholder} aria-label={ariaLabel || (label ? `Buscar por ${label.toLowerCase()}` : "Pesquisar")}
        className={cn(INPUT, "h-[42px] min-h-[42px] w-full min-w-0 pl-9 pr-2 text-sm md:h-9 md:min-h-9 md:py-1.5 md:text-xs", inputClassName)} />
    </div>
  </div>;
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
