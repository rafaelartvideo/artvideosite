import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";

type AdminListSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  count?: number;
  countSingular?: string;
  countPlural?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchDisabled?: boolean;
  searchAutoFocus?: boolean;
  loading?: boolean;
  loadingText?: ReactNode;
  error?: ReactNode;
  empty?: boolean;
  emptyText?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function AdminListSection({
  title,
  description,
  count,
  countSingular = "item",
  countPlural = "itens",
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar",
  searchDisabled = false,
  searchAutoFocus = false,
  loading = false,
  loadingText = "Carregando...",
  error,
  empty = false,
  emptyText = "Nenhum item encontrado",
  children,
  footer,
  className,
}: AdminListSectionProps) {
  const hasSearch = typeof onSearchChange === "function" && typeof searchValue === "string";
  const countLabel = count === 1 ? countSingular : countPlural;

  return <section className={cn("overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white", className)}>
    <div className="border-b border-[#0d1b2e]/8 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-[#0d1b2e]">{title}</p>
          {description && <p className="mt-0.5 text-[11px] text-[#5a6a82]">{description}</p>}
        </div>
        {typeof count === "number" && <span className="shrink-0 text-[10px] font-bold text-[#7c899c]">{count} {countLabel}</span>}
      </div>

      {hasSearch && <div className="relative mt-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7c899c]" />
        <input
          autoFocus={searchAutoFocus}
          disabled={searchDisabled}
          value={searchValue}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className={cn(INPUT, "h-10 w-full pl-9 pr-3 text-sm")}
        />
      </div>}
    </div>

    {loading
      ? <div className="flex min-h-40 items-center justify-center px-4 text-center text-xs text-[#5a6a82]">{loadingText}</div>
      : error
        ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>
        : empty
          ? <div className="flex min-h-40 flex-col items-center justify-center px-4 text-center"><Search size={20} className="mb-2 text-[#a0acba]" /><p className="text-xs font-bold text-[#5a6a82]">{emptyText}</p></div>
          : <div className="divide-y divide-[#0d1b2e]/8 px-4">{children}</div>}

    {footer}
  </section>;
}

export function AdminListSectionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 py-3.5", className)}>{children}</div>;
}
