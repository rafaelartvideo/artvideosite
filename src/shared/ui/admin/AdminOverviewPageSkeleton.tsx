import { Skeleton } from "@/shared/ui/primitives/skeleton";

type PageVariant = "home" | "dashboard" | "finance";
type FinanceSurface = "overview" | "table" | "accounts" | "reports";

type Props = {
  variant: PageVariant;
  tabs?: number;
  shortcuts?: number;
  rows?: number;
  financeSurface?: FinanceSurface;
};

function SectionHeadingSkeleton() {
  return <div className="space-y-2">
    <Skeleton className="h-4 w-40 max-w-full" />
    <Skeleton className="h-3 w-64 max-w-full" />
  </div>;
}

function MetricSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className="min-w-0 space-y-3 rounded-xl bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-3 w-24 max-w-[70%]" />
      <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
    </div>
    <Skeleton className={compact ? "h-6 w-14" : "h-7 w-32 max-w-full"} />
    <Skeleton className="h-3 w-4/5" />
  </div>;
}

function PanelSkeleton({ chart = false }: { chart?: boolean }) {
  return <div className="min-w-0 space-y-4 rounded-xl bg-card p-4">
    <SectionHeadingSkeleton />
    {chart
      ? <div className="flex h-48 items-end gap-2 border-t border-border/30 pt-6 sm:h-56">
          {Array.from({ length: 10 }, (_, index) =>
            <Skeleton key={index} className="min-w-0 flex-1 rounded-t-md" style={{ height: `${25 + ((index * 17) % 65)}%` }} />)}
        </div>
      : <div className="space-y-4">
          {Array.from({ length: 6 }, (_, index) =>
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-2.5 w-3/5" />
              </div>
            </div>)}
        </div>}
  </div>;
}

function FinanceTableSkeleton({ rows }: { rows: number }) {
  const indices = Array.from({ length: rows }, (_, index) => index);
  return <div className="min-w-0 overflow-hidden rounded-xl bg-card" aria-hidden="true">
    <Skeleton className="h-11 w-full rounded-none" />
    <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) =>
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-24 max-w-full" />
          <Skeleton className="h-9 w-full" />
        </div>)}
    </div>
    <div className="hidden overflow-x-auto md:block">
      <div className="grid min-w-[940px] grid-cols-8 gap-3 px-4 py-3">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-3 w-4/5" />)}
      </div>
      <div className="min-w-[940px] divide-y divide-border/35">
        {indices.map(row => <div key={row} className="grid min-h-[57px] grid-cols-8 items-center gap-3 px-4 py-2">
          {Array.from({ length: 8 }, (_, column) =>
            <Skeleton key={column} className={column === 7 ? "ml-auto h-8 w-8" : "h-3.5 w-4/5"} />)}
        </div>)}
      </div>
    </div>
    <div className="divide-y divide-border/35 md:hidden">
      {indices.map(row => <div key={row} className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-7 w-16" /></div>
        <Skeleton className="h-3.5 w-4/5" />
        <div className="grid grid-cols-2 gap-3"><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div>
      </div>)}
    </div>
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <Skeleton className="h-8 w-28" />
      <div className="flex gap-2"><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-20" /></div>
    </div>
  </div>;
}

/** Carregamento inicial único, sem títulos, abas, saudação ou contagens reais vazando para a página. */
export function AdminOverviewPageSkeleton({ variant, tabs = 6, shortcuts = 8, rows = 5, financeSurface = "overview" }: Props) {
  const tabCount = Math.max(1, Math.min(tabs, 12));
  const rowCount = Math.max(1, Math.min(rows, 100));
  return <section role="status" aria-label="Carregando página e indicadores" aria-busy="true"
    className="min-w-0 space-y-4 pb-3">
    <span className="sr-only">Preparando todos os dados da página...</span>
    {variant === "home" ? <>
      <div className="space-y-5 rounded-2xl bg-card p-5 sm:p-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-8 w-64 max-w-[90%]" />
          <Skeleton className="h-3.5 w-48 max-w-[80%]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <MetricSkeleton key={i} compact />)}
        </div>
      </div>
      <div className="space-y-3"><SectionHeadingSkeleton /><div className="grid gap-3 xl:grid-cols-2"><PanelSkeleton /><PanelSkeleton /></div></div>
      <div className="space-y-3">
        <SectionHeadingSkeleton />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: Math.max(1, Math.min(shortcuts, 12)) }, (_, index) =>
            <div key={index} className="space-y-3 rounded-xl bg-card p-4">
              <div className="flex justify-between"><Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="h-6 w-9" /></div>
              <Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" />
            </div>)}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2"><PanelSkeleton /><PanelSkeleton /></div>
    </> : <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-3 w-72 max-w-full" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-24" /></div>
      </div>
      <div className="flex w-full max-w-full gap-3 overflow-hidden rounded-xl bg-card px-3 py-3">
        {Array.from({ length: tabCount }, (_, index) => <div key={index} className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-md" /><Skeleton className="h-3.5 w-16 sm:w-20" />
          {variant === "finance" && index > 0 && index < 4 && <Skeleton className="h-5 w-7 rounded-full" />}
        </div>)}
      </div>
      {variant === "finance" && financeSurface === "table"
        ? <FinanceTableSkeleton rows={rowCount} />
        : variant === "finance" && financeSurface === "reports"
          ? <><div className="flex flex-wrap items-end gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-36 max-w-[45%]" />)}</div><PanelSkeleton chart /><PanelSkeleton /></>
          : <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: variant === "dashboard" ? 6 : 4 }, (_, index) => <MetricSkeleton key={index} />)}
            </div>
            {variant === "finance" && financeSurface === "accounts"
              ? <FinanceTableSkeleton rows={rowCount} />
              : <div className="grid gap-4 xl:grid-cols-2"><PanelSkeleton chart /><PanelSkeleton /></div>}
          </>}
    </>}
  </section>;
}
