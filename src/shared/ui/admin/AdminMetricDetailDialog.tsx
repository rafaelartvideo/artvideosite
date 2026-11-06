import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { AdminButton, AdminDialog } from "./AdminLayout";

export type AdminMetricDetailRow = {
  id: string;
  title: string;
  subtitle?: string;
  amount?: string;
  onClick?: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  value: ReactNode;
  description?: string;
  rows?: AdminMetricDetailRow[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  toolbar?: ReactNode;
  onViewAll?: () => void;
  viewAllLabel?: string;
  /** When provided, pagination is server-managed. Otherwise rows are paginated locally. */
  page?: number;
  pageSize?: number;
  totalRows?: number;
  onPageChange?: (page: number) => void;
};

/** Shared drilldown for financial and operational KPIs; never starts a request by itself. */
export function AdminMetricDetailDialog({
  open, onClose, title, value, description, rows = [], loading = false, error,
  emptyText = "Nenhum registro encontrado.", toolbar, onViewAll, viewAllLabel = "Abrir seção completa",
  page, pageSize = 10, totalRows, onPageChange,
}: Props) {
  const [localPage, setLocalPage] = useState(1);
  useEffect(() => { setLocalPage(1); }, [title, open]);
  const controlled = page !== undefined && !!onPageChange;
  const currentPage = controlled ? page : localPage;
  const count = totalRows ?? rows.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(currentPage, pages);
  const visibleRows = controlled ? rows : rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const changePage = (nextPage: number) => {
    const validPage = Math.max(1, Math.min(pages, nextPage));
    if (controlled) onPageChange?.(validPage);
    else setLocalPage(validPage);
  };
  const openFullSection = () => { onClose(); onViewAll?.(); };

  return <AdminDialog open={open} onClose={onClose} title={title} description={description}
    className="w-full max-w-[calc(100%-1.5rem)] sm:max-w-2xl"
    footer={onViewAll ? <div className="flex justify-end"><AdminButton size="sm" onClick={openFullSection}>{viewAllLabel}<ArrowUpRight size={15} /></AdminButton></div> : undefined}>
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
        <p className="text-xs font-semibold text-muted-foreground">Total do indicador</p>
        <p className="mt-1 break-words text-2xl font-black tabular-nums text-foreground">{value}</p>
      </div>
      {toolbar}
      {loading ? <div role="status" aria-label="Carregando detalhes" className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="animate-pulse space-y-2 rounded-lg border border-border p-3">
          <div className="h-3 w-2/3 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" />
        </div>)}
      </div> : error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        : !visibleRows.length ? <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        : <div className="divide-y divide-border rounded-xl border border-border">
          {visibleRows.map(row => {
            const contents = <>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold text-foreground">{row.title}</span>
                {row.subtitle && <span className="mt-1 block break-words text-xs text-muted-foreground">{row.subtitle}</span>}
              </span>
              {row.amount && <span className="shrink-0 text-right text-sm font-bold tabular-nums text-foreground">{row.amount}</span>}
              {row.onClick && <ArrowUpRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
            </>;
            return row.onClick
              ? <button type="button" key={row.id} onClick={() => { onClose(); row.onClick?.(); }}
                  className="flex min-h-14 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{contents}</button>
              : <div key={row.id} className="flex min-h-14 items-center gap-3 p-3">{contents}</div>;
          })}
        </div>}
      {!loading && !error && count > pageSize && <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{count} registros · página {safePage} de {pages}</p>
        <div className="flex gap-2">
          <AdminButton variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => changePage(safePage - 1)}>Anterior</AdminButton>
          <AdminButton variant="secondary" size="sm" disabled={safePage >= pages} onClick={() => changePage(safePage + 1)}>Próxima</AdminButton>
        </div>
      </div>}
    </div>
  </AdminDialog>;
}
