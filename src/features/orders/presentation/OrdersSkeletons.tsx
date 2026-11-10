import { AdminPage } from "@/shared/ui/admin/AdminLayout";
import { Skeleton } from "@/shared/ui/primitives/skeleton";

// Quantidade de placeholders acompanha o tamanho real da página (5, 10, 20, 30, 50 ou 100).
const COLUMNS = [0, 1, 2];

function Line({ className = "" }: { className?: string }) {
  return <Skeleton className={`h-3.5 motion-reduce:animate-none ${className}`} />;
}

/**
 * Carregamento inicial único: só existem blocos neutros. Sem barra azul,
 * textos de labels, bordas de inputs ou títulos de tabela fora do skeleton.
 */
export function OrdersWorkspaceSkeleton({ displayMode, sharedView, hasPermission, hasActiveFilters, pageSize, totalItems }: {
  displayMode: "list" | "kanban";
  sharedView: boolean;
  hasPermission: (permission: string) => boolean;
  hasActiveFilters: boolean;
  pageSize: number;
  totalItems: number;
}) {
  const fieldCount = sharedView ? 2 : displayMode === "kanban" ? 11 : 12;
  const fields = Array.from({ length: fieldCount }, (_, index) => index);
  return <section role="status" aria-label="Carregando busca e ordens de serviço" aria-busy="true" className="space-y-5">
    <span className="sr-only">Carregando busca e ordens de serviço...</span>
    <div className="min-w-0 overflow-hidden bg-card" aria-hidden="true">
      {/* A barra inteira é um skeleton: o cabeçalho real não aparece por trás. */}
      <Skeleton className="h-11 w-full rounded-none" />
      <div className="p-3 sm:p-4 md:p-3">
        <div className="space-y-2 md:hidden">
          <Skeleton className="h-[42px] w-full rounded-lg" />
          <Skeleton className="h-[42px] w-full rounded-lg" />
        </div>
        <div className={`hidden items-start gap-x-2 gap-y-3 md:grid ${sharedView ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {fields.map(index => <div key={index} className="min-w-0 space-y-2">
            <Skeleton className={`h-2.5 rounded-sm ${index % 3 === 1 ? "w-32" : "w-24"}`} />
            {/* A área completa do input é preenchida; não sobra contorno real. */}
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>)}
        </div>
      </div>
    </div>
    {displayMode === "list"
      ? <div className="min-w-0 overflow-hidden bg-card">
          <OrdersTableSkeleton hasPermission={hasPermission} hasActiveFilters={hasActiveFilters} pageSize={pageSize} totalItems={totalItems} standalone={false} />
        </div>
      : <OrdersKanbanSkeleton standalone={false} />}
  </section>;
}

/** Colunas e linhas ficam inteiramente em skeleton, sem exibir a tabela real. */
export function OrdersTableSkeleton({ hasPermission, hasActiveFilters, pageSize, totalItems, standalone = true }: {
  hasPermission: (permission: string) => boolean;
  hasActiveFilters: boolean;
  pageSize: number;
  totalItems: number;
  standalone?: boolean;
}) {
  const count = Math.max(1, Math.min(100, totalItems > 0 ? Math.min(pageSize, totalItems) : pageSize));
  const rows = Array.from({ length: count }, (_, index) => index);
  const columns = [
    hasActiveFilters && { key: "index", width: "52px" },
    hasPermission("orders.table.os") && { key: "order", width: "130px" },
    hasPermission("orders.table.external_os") && { key: "external", width: "125px" },
    hasPermission("orders.table.customer") && { key: "customer", width: "minmax(175px, 1fr)" },
    hasPermission("orders.table.service_type") && { key: "service", width: "155px" },
    hasPermission("orders.table.equipment") && { key: "equipment", width: "155px" },
    { key: "created", width: "138px" },
    hasPermission("orders.table.scheduled_at") && { key: "scheduled", width: "140px" },
    hasPermission("orders.table.situation") && { key: "situation", width: "155px" },
    hasPermission("orders.table.actions") && { key: "actions", width: "90px" },
  ].filter((column): column is { key: string; width: string } => Boolean(column));
  const template = columns.map(column => column.width).join(" ");
  return <div role={standalone ? "status" : undefined} aria-label={standalone ? "Carregando ordens de serviço" : undefined} aria-busy={standalone ? "true" : undefined} className="overflow-hidden">
    {standalone && <span className="sr-only">Carregando ordens de serviço...</span>}
    {/* Cada card mobile recebe placeholders em todos os campos, sem espaços vazios. */}
    <div className="divide-y divide-border md:hidden" aria-hidden="true">
      {rows.map(index => <div key={index} className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <Skeleton className="h-9 w-1.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3.5 w-3/4 max-w-56" />
            </div>
          </div>
          {hasPermission("orders.table.actions") && <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />}
        </div>
        {hasPermission("orders.table.situation") && <Skeleton className="h-6 w-28 rounded-full" />}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Array.from({ length: 4 }, (_, field) => <div key={field} className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className={`h-3.5 ${field % 2 ? "w-4/5" : "w-2/3"}`} />
          </div>)}
        </div>
      </div>)}
    </div>
    <div className="hidden overflow-x-auto md:block" aria-hidden="true">
      {/* Os cabeçalhos e todas as células têm skeleton, sem texto real. */}
      <div className="min-w-[1120px] bg-muted/20 px-4 py-3">
        <div className="grid items-center gap-3" style={{ gridTemplateColumns: template }}>
          {columns.map((column, index) => <Skeleton key={column.key} className={`h-3 rounded-sm ${index % 3 === 0 ? "w-1/2" : "w-4/5"}`} />)}
        </div>
      </div>
      <div className="min-w-[1120px] divide-y divide-border">
        {rows.map(index => <div key={index} className="grid min-h-[57px] items-center gap-3 px-4 py-2" style={{ gridTemplateColumns: template }}>
          {columns.map(column => {
            if (column.key === "order") return <div key={column.key} className="flex items-center gap-2">
              <Skeleton className="h-8 w-1.5 shrink-0 rounded-full" />
              <Skeleton className="h-5 w-16" />
            </div>;
            if (column.key === "customer") return <div key={column.key} className="space-y-2">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-2.5 w-3/5" />
            </div>;
            if (column.key === "situation") return <Skeleton key={column.key} className="h-6 w-24 rounded-full" />;
            if (column.key === "actions") return <div key={column.key} className="flex justify-end"><Skeleton className="h-9 w-9 rounded-lg" /></div>;
            return <Skeleton key={column.key} className={`h-3.5 ${column.key === "index" ? "w-6" : column.key === "external" ? "w-20" : "w-4/5"}`} />;
          })}
        </div>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/15 px-4 py-3" aria-hidden="true">
      <Skeleton className="h-8 w-28" />
      <div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-24" /></div>
    </div>
  </div>;
}

/** Simula colunas e cartões do Kanban, sem criar situações ou OS artificiais. */
export function OrdersKanbanSkeleton({ standalone = true }: { standalone?: boolean } = {}) {
  return <div role={standalone ? "status" : undefined} aria-label={standalone ? "Carregando quadro de ordens" : undefined} className="space-y-4" aria-busy={standalone ? "true" : undefined}>
    {standalone && <span className="sr-only">Carregando quadro de ordens...</span>}
    <div className="space-y-2" aria-hidden="true">
      <Line className="w-36" />
      <div className="flex gap-2"><Skeleton className="h-10 w-32" /><Skeleton className="h-10 w-36" /><Skeleton className="h-10 w-28" /></div>
    </div>
    <div className="flex gap-3 overflow-hidden md:gap-4" aria-hidden="true">
      {COLUMNS.map(column => <div key={column} className="w-[280px] min-w-[280px] space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between"><Line className="h-5 w-28" /><Skeleton className="h-6 w-7 rounded-full" /></div>
        {COLUMNS.map(row => <div key={row} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex justify-between"><Line className="h-5 w-20" /><Line className="w-8" /></div>
          <Line className="w-4/5" /><Line className="w-3/5" /><Line className="h-6 w-24 rounded-full" />
        </div>)}
      </div>)}
    </div>
  </div>;
}

function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return <div className="space-y-4 rounded-xl border border-border bg-card p-4">
    <Line className="h-5 w-40" />
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: lines }, (_, index) => <div key={index} className="space-y-2">
        <Line className="h-2.5 w-24" />
        <Line className={index % 2 ? "h-9 w-full" : "h-9 w-4/5"} />
      </div>)}
    </div>
  </div>;
}

export function OrderDetailsSkeleton({ onClose }: { onClose: () => void }) {
  return <AdminPage open onClose={onClose} smoothMotion={false} breadcrumb="Ordens de Serviço"
    title="Carregando OS" maxW="max-w-[1440px]">
    <div role="status" aria-label="Carregando detalhes da OS" aria-busy="true" className="space-y-5 p-5">
      <span className="sr-only">Carregando detalhes da ordem de serviço...</span>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2"><Line className="h-6 w-24" /><Line className="h-6 w-20 rounded-full" /><Line className="h-6 w-28 rounded-full" /></div>
        <div className="flex flex-wrap gap-2">{COLUMNS.map(index => <Skeleton key={index} className="h-10 w-28 rounded-lg" />)}</div>
      </div>
      <div className="flex gap-2"><Skeleton className="h-10 w-28 rounded-lg" /><Skeleton className="h-10 w-40 rounded-lg" /></div>
      <div className="grid gap-4 lg:grid-cols-3" aria-hidden="true">
        <div className="space-y-4 lg:col-span-2">
          <SectionSkeleton lines={4} /><SectionSkeleton lines={4} />
        </div>
        <div className="space-y-4"><SectionSkeleton lines={2} /><SectionSkeleton lines={2} /></div>
      </div>
    </div>
  </AdminPage>;
}

export function OrderEditorSkeleton() {
  return <div role="status" aria-label="Carregando formulário da OS" aria-busy="true" className="space-y-5">
    <span className="sr-only">Carregando formulário da ordem de serviço...</span>
    <SectionSkeleton lines={2} /><SectionSkeleton lines={4} /><SectionSkeleton lines={4} />
  </div>;
}

export function OrderHistorySkeleton() {
  return <div role="status" aria-label="Carregando histórico da OS" aria-busy="true" className="space-y-3">
    <span className="sr-only">Carregando histórico da ordem de serviço...</span>
    {COLUMNS.map(index => <div key={index} className="space-y-2 rounded-xl border border-border bg-card p-4">
      <Line className="h-4 w-36" /><Line className="h-3 w-24" /><Line className="w-4/5" />
      <Line className="w-1/2" />
    </div>)}
  </div>;
}

/** Mantém a estrutura das seções enquanto os dados comerciais da OS são buscados. */
export function OrderQuoteSkeleton() {
  return <div role="status" aria-label="Carregando orçamento da OS" aria-busy="true" className="space-y-4">
    <span className="sr-only">Carregando orçamento da ordem de serviço...</span>
    <SectionSkeleton lines={4} />
    <SectionSkeleton lines={4} />
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SectionSkeleton lines={2} /><SectionSkeleton lines={2} />
    </div>
  </div>;
}

export function OrderItemsSkeleton() {
  return <div role="status" aria-label="Carregando produtos e serviços da OS" aria-busy="true" className="grid min-w-0 grid-cols-1 gap-3 p-3 sm:p-4 xl:grid-cols-2">
    <span className="sr-only">Carregando produtos e serviços...</span>
    {COLUMNS.concat(3).map(index => <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex justify-between gap-2"><Line className="w-24" /><Line className="h-5 w-20 rounded-full" /></div>
      <Line className="h-4 w-3/4" /><Line className="w-1/2" />
      <div className="flex items-center justify-between border-t border-border pt-3"><Line className="w-20" /><Line className="w-16" /></div>
    </div>)}
  </div>;
}

export function OrderDocumentsSkeleton() {
  return <div role="status" aria-label="Carregando documentos da OS" aria-busy="true" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <span className="sr-only">Carregando documentos da ordem de serviço...</span>
    {COLUMNS.map(index => <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-3">
      <Skeleton className="h-28 w-full rounded-lg motion-reduce:animate-none" />
      <Line className="w-4/5" /><Line className="w-1/2" />
    </div>)}
  </div>;
}

export function OrderPhotosSkeleton() {
  return <div role="status" aria-label="Carregando fotos do orçamento" aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
    <span className="sr-only">Carregando fotos do orçamento...</span>
    {COLUMNS.map(index => <div key={index} className="space-y-2 rounded-lg border border-border bg-card p-2">
      <Skeleton className="h-36 w-full rounded-md motion-reduce:animate-none" />
      <Line className="w-20" />
    </div>)}
  </div>;
}
