import type { ReactNode } from "react";
import { cn } from "@/shared/domain/formatters";

// Mesmo padrão de tabela utilizado na lista de OS, mas sem um card/caixa externo.
export function FinanceTableSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(
    "min-w-0 max-w-full overflow-x-auto",
    "[&_table]:w-full [&_table]:text-sm",
    "[&_thead]:border-b [&_thead]:border-border [&_thead]:bg-muted/70 [&_thead]:text-[10px] [&_thead]:font-bold [&_thead]:uppercase [&_thead]:text-muted-foreground",
    "[&_th]:px-4 [&_th]:py-3",
    "[&_tbody]:divide-y [&_tbody]:divide-border",
    "[&_tbody>tr]:cursor-default [&_tbody>tr]:transition-colors [&_tbody>tr:hover]:bg-muted/60",
    "[&_td]:px-4 [&_td]:py-3.5",
    className
  )}>{children}</div>;
}
