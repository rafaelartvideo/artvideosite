import { AdminPage } from "@/shared/ui/admin/AdminLayout";
import { Skeleton } from "@/shared/ui/primitives/skeleton";

const ROWS = [0, 1, 2, 3, 4, 5];
const COLUMNS = [0, 1, 2];

function Line({ className = "" }: { className?: string }) {
  return <Skeleton className={`h-3.5 motion-reduce:animate-none ${className}`} />;
}

/** Espelha a tabela no desktop e os cards compactos no celular, sem expor dados fictícios. */
export function OrdersTableSkeleton({ hasPermission, hasActiveFilters }: {
  hasPermission: (permission: string) => boolean;
  hasActiveFilters: boolean;
}) {
  return <div role="status" aria-label="Carregando ordens de serviço" aria-busy="true">
    <span className="sr-only">Carregando ordens de serviço...</span>
    <div className="divide-y divide-border md:hidden" aria-hidden="true">
      {ROWS.map(index => <div key={index} className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Skeleton className="h-9 w-1.5 shrink-0 rounded-full motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <Line className="h-5 w-24" />
              <Line className="w-3/4 max-w-56" />
            </div>
          </div>
          {hasPermission("orders.table.actions") && <Skeleton className="h-9 w-9 rounded-lg motion-reduce:animate-none" />}
        </div>
        <Line className="h-6 w-28 rounded-full" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {COLUMNS.concat(3).map(item => <div key={item} className="space-y-2">
            <Line className="h-2.5 w-20" />
            <Line className={item % 2 ? "w-4/5" : "w-2/3"} />
          </div>)}
        </div>
      </div>)}
    </div>
    <div className="hidden overflow-x-auto md:block" aria-hidden="true">
      <table className="min-w-[1120px]">
        <thead><tr>
          {hasActiveFilters && <th className="w-14 text-left">#</th>}
          {hasPermission("orders.table.os") && <th className="w-36 text-left">OS</th>}
          {hasPermission("orders.table.external_os") && <th className="w-32 text-left">OS Externa</th>}
          {hasPermission("orders.table.customer") && <th className="text-left">Cliente</th>}
          {hasPermission("orders.table.service_type") && <th className="w-40 text-left">Tipo de atendimento</th>}
          {hasPermission("orders.table.equipment") && <th className="w-40 text-left">Equipamento</th>}
          <th className="w-36 text-left">Data de abertura</th>
          {hasPermission("orders.table.scheduled_at") && <th className="w-36 text-left">Data de agendamento</th>}
          {hasPermission("orders.table.situation") && <th className="w-44 text-left">Situação</th>}
          {hasPermission("orders.table.actions") && <th className="w-28 text-right">Ações</th>}
        </tr></thead>
        <tbody>{ROWS.map(index => <tr key={index}>
          {hasActiveFilters && <td><Line className="w-6" /></td>}
          {hasPermission("orders.table.os") && <td><div className="flex items-center gap-2"><Skeleton className="h-8 w-1.5 rounded-full" /><Line className="h-5 w-16" /></div></td>}
          {hasPermission("orders.table.external_os") && <td><Line className="w-20" /></td>}
          {hasPermission("orders.table.customer") && <td><div className="space-y-2"><Line className="w-36" /><Line className="h-2.5 w-24" /></div></td>}
          {hasPermission("orders.table.service_type") && <td><Line className="w-28" /></td>}
          {hasPermission("orders.table.equipment") && <td><Line className="w-28" /></td>}
          <td><Line className="w-28" /></td>
          {hasPermission("orders.table.scheduled_at") && <td><Line className="w-28" /></td>}
          {hasPermission("orders.table.situation") && <td><Line className="h-6 w-24 rounded-full" /></td>}
          {hasPermission("orders.table.actions") && <td><div className="flex justify-end"><Skeleton className="h-9 w-9 rounded-lg" /></div></td>}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

/** Simula colunas e cartões do Kanban, sem criar situações ou OS artificiais. */
export function OrdersKanbanSkeleton() {
  return <div role="status" aria-label="Carregando quadro de ordens" className="space-y-4" aria-busy="true">
    <span className="sr-only">Carregando quadro de ordens...</span>
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
