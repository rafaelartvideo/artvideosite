import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { AdminCard } from "./AdminLayout";

export function AdminSearchPanel({ title, children }: { title: string; children: ReactNode }) {
  return <AdminCard className="overflow-hidden p-0">
    <div className="flex h-12 items-center gap-2.5 border-b border-primary-active/35 admin-primary-bar px-4 text-white md:h-11">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.08]"><Search size={14} className="shrink-0 text-white/90" /></span>
      <span className="text-xs font-black uppercase tracking-[0.14em]">{title}</span>
    </div>
    <div className="min-w-0 p-4 md:p-3">{children}</div>
  </AdminCard>;
}
