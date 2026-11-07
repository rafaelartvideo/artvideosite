import type { ReactNode } from "react";
import { cn } from "@/shared/domain/formatters";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";

// Usa exatamente o card e os estilos de tabela compartilhados com a lista de OS.
export function FinanceTableSurface({ children, className, pagination }: { children: ReactNode; className?: string; pagination?: ReactNode }) {
  return <AdminCard square className={className}>
    <div className={cn("min-w-0 overflow-x-auto")}><TopTableScrollbar />{children}</div>
    {pagination}
  </AdminCard>;
}
