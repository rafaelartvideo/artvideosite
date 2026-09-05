import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { AdminCard } from "./AdminLayout";

export function AdminSearchPanel({ title, children }: { title: string; children: ReactNode }) {
  return <AdminCard className="overflow-hidden p-0">
    <div className="flex items-center gap-2 bg-[#0057e7] px-3.5 py-2.5 text-white sm:px-4 sm:py-3">
      <Search size={15} className="shrink-0 sm:h-4 sm:w-4" />
      <span className="text-[11px] font-black uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]">{title}</span>
    </div>
    <div className="min-w-0 p-3 sm:p-4">{children}</div>
  </AdminCard>;
}
