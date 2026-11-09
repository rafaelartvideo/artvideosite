import { Skeleton } from "@/shared/ui/primitives/skeleton";

export type AdminWorkspaceSkeletonVariant = "table" | "cards" | "grid" | "details";

type AdminWorkspaceSkeletonProps = {
  /** Quantidade de campos visíveis no painel Buscar; zero em telas sem filtros. */
  searchFields?: number;
  /** Quantidade de colunas da tabela/grade. */
  columns?: number;
  /** Mesmo pageSize já escolhido pelo usuário; não força uma consulta de cinco linhas. */
  rows?: number;
  variant?: AdminWorkspaceSkeletonVariant;
  /** Exibe também o título/subtítulo da página como skeleton. */
  pageHeader?: boolean;
  /** Campo de busca inline na mesma linha do título. */
  inlineSearch?: boolean;
  /** Ações inferiores da listagem, sem exibir botões reais durante a primeira carga. */
  stickyToolbar?: boolean;
  /** Mantém componentes em cache visíveis durante refetch: só montar na carga inicial. */
  className?: string;
};

/**
 * Estado inicial padronizado do CRM. Não mistura headers, labels, inputs ou
 * colunas reais com placeholders. O título pode ser incluído pelo pageHeader.
 * Utilize apenas quando a lista ainda não dispõe de dados: não bloquear
 * filtros nem substituir conteúdo em atualizações em segundo plano.
 */
export function AdminWorkspaceSkeleton({
  searchFields = 0,
  columns = 7,
  rows = 5,
  variant = "table",
  pageHeader = false,
  inlineSearch = false,
  stickyToolbar = false,
  className = "",
}: AdminWorkspaceSkeletonProps) {
  const fieldCount = Math.max(0, Math.min(18, Math.floor(searchFields)));
  const rowCount = Math.max(1, Math.min(100, Math.floor(rows)));
  const columnCount = Math.max(1, Math.min(14, Math.floor(columns)));
  const fieldIndices = Array.from({ length: fieldCount }, (_, index) => index);
  const columnIndices = Array.from({ length: columnCount }, (_, index) => index);
  const rowIndices = Array.from({ length: rowCount }, (_, index) => index);
  const gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;

  return <section role="status" aria-label="Carregando conteúdo" aria-busy="true" className={`min-w-0 space-y-5 ${className}`}>
    <span className="sr-only">Carregando conteúdo do módulo...</span>
    {pageHeader && <div className="flex min-w-0 flex-wrap items-center justify-between gap-3" aria-hidden="true">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-6 w-52 max-w-full" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      {inlineSearch && <Skeleton className="h-10 w-full rounded-lg sm:w-64" />}
    </div>}

    {fieldCount > 0 && <div className="min-w-0 overflow-hidden bg-card" aria-hidden="true">
      {/* O cabeçalho Buscar inteiro é um único bloco neutro, sem texto por fora. */}
      <Skeleton className="h-11 w-full rounded-none" />
      <div className="p-3 sm:p-4 md:p-3">
        <div className="space-y-2 md:hidden">
          <Skeleton className="h-[42px] w-full rounded-lg" />
          <Skeleton className="h-[42px] w-full rounded-lg" />
        </div>
        <div className={`hidden items-start gap-x-2 gap-y-3 md:grid ${fieldCount <= 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {fieldIndices.map(index => <div key={index} className="min-w-0 space-y-2">
            <Skeleton className={`h-2.5 rounded-sm ${index % 3 === 1 ? "w-32" : "w-24"}`} />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>)}
        </div>
      </div>
    </div>}

    {variant === "table" && <div className="min-w-0 overflow-hidden bg-card" aria-hidden="true">
      <div className="divide-y divide-border md:hidden">
        {rowIndices.map(index => <div key={index} className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-8 w-9 rounded-lg" />
          </div>
          <Skeleton className="h-3.5 w-4/5" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[960px] bg-muted/20 px-4 py-3">
          <div className="grid items-center gap-3" style={{ gridTemplateColumns }}>
            {columnIndices.map(index => <Skeleton key={index} className={`h-3 rounded-sm ${index % 3 === 0 ? "w-3/5" : "w-4/5"}`} />)}
          </div>
        </div>
        <div className="min-w-[960px] divide-y divide-border">
          {rowIndices.map(index => <div key={index} className="grid min-h-[57px] items-center gap-3 px-4 py-2" style={{ gridTemplateColumns }}>
            {columnIndices.map(column => column === 1
              ? <div key={column} className="space-y-2">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-2.5 w-3/5" />
                </div>
              : column === columnCount - 1
                ? <div key={column} className="flex justify-end"><Skeleton className="h-9 w-9 rounded-lg" /></div>
                : <Skeleton key={column} className={`h-3.5 ${(index + column) % 3 ? "w-4/5" : "w-2/3"}`} />
            )}
          </div>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/15 px-4 py-3">
        <Skeleton className="h-8 w-28" />
        <div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-24" /></div>
      </div>
    </div>}

    {(variant === "cards" || variant === "grid") && <div aria-hidden="true"
      className={`grid min-w-0 gap-3 ${variant === "grid" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
      {rowIndices.map(index => <div key={index} className="space-y-3 bg-card p-4">
        {variant === "grid" && <Skeleton className="h-28 w-full rounded-lg" />}
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
        <div className="flex justify-between gap-3"><Skeleton className="h-6 w-24 rounded-full" /><Skeleton className="h-6 w-16 rounded-full" /></div>
      </div>)}
    </div>}

    {variant === "details" && <div aria-hidden="true" className="grid min-w-0 gap-4 lg:grid-cols-2">
      {rowIndices.map(index => <div key={index} className="space-y-4 bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-4">
          {columnIndices.slice(0, 4).map(column => <div key={column} className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>)}
        </div>
      </div>)}
    </div>}
    {stickyToolbar && <div className="flex flex-wrap items-center justify-end gap-2" aria-hidden="true">
      <Skeleton className="h-10 w-24 rounded-lg" />
      <Skeleton className="h-10 w-20 rounded-lg" />
    </div>}
  </section>;
}
