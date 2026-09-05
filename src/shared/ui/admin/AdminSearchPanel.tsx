import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { AdminCard } from "./AdminLayout";

export function AdminSearchPanel({ title, children }: { title: string; children: ReactNode }) {
  return <AdminCard className="overflow-hidden p-0">
    <div className="flex items-center gap-2 bg-[#0057e7] px-4 py-3 text-white">
      <Search size={16} className="shrink-0" />
      <span className="text-xs font-black uppercase tracking-[0.14em]">{title}</span>
    </div>
    <div className="min-w-0 p-4">{children}</div>
  </AdminCard>;
}
