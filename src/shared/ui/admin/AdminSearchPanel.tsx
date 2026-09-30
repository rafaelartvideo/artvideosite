import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { AdminCard } from "./AdminLayout";

export function AdminSearchPanel({ title, children }: { title: string; children: ReactNode }) {
  return <AdminCard className="overflow-hidden p-0">
    <div className="flex h-12 items-center gap-2.5 border-b border-white/10 bg-[linear-gradient(105deg,#0057e7_0%,#0a66f0_52%,#2f80ed_100%)] px-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_20px_rgba(0,87,231,0.18)] md:h-11">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"><Search size={14} className="shrink-0 text-white/90" /></span>
      <span className="text-xs font-black uppercase tracking-[0.14em]">{title}</span>
    </div>
    <div className="min-w-0 p-4 md:p-3">{children}</div>
  </AdminCard>;
}
