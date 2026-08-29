import { LayoutDashboard, List, Plus, RefreshCw } from "lucide-react";
import { cn, PageHeader } from "@/app/admin/shared";

export function OrdersHeader({
  total,
  displayMode,
  canCreate,
  onDisplayModeChange,
  onCreate,
  onRefresh,
}: {
  total: number;
  displayMode: "list" | "kanban";
  canCreate: boolean;
  onDisplayModeChange: (mode: "list" | "kanban") => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  return (
    <PageHeader
      title="Ordens de Serviço"
      subtitle={`${total} OS encontrada${total !== 1 ? "s" : ""}`}
      actions={
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-lg border border-[#0d1b2e]/15 overflow-hidden">
            <button type="button" onClick={() => onDisplayModeChange("list")} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-bold", displayMode === "list" ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]")}><List size={13} /> Lista</button>
            <button type="button" onClick={() => onDisplayModeChange("kanban")} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-bold", displayMode === "kanban" ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]")}><LayoutDashboard size={13} /> Kanban</button>
          </div>
          {canCreate && <button onClick={onCreate} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0]"><Plus size={13} /> Nova OS</button>}
          <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5"><RefreshCw size={13} /> Atualizar</button>
        </div>
      }
    />
  );
}
