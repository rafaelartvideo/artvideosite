import { LayoutDashboard, List, Plus, RefreshCw } from "lucide-react";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";

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
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <div className="flex items-center rounded-lg border border-[#0d1b2e]/15 bg-white p-1">
            <button
              type="button"
              onClick={() => onDisplayModeChange("list")}
              aria-label="Visualizar em lista"
              title="Lista"
              className={`flex h-10 min-w-10 items-center justify-center rounded-md px-3 transition-colors ${displayMode === "list" ? "bg-[#0057e7] text-white" : "text-[#5a6a82] hover:bg-[#f5f7fa]"}`}
            >
              <List size={17} />
              <span className="ml-2 hidden sm:inline text-xs font-bold">Lista</span>
            </button>
            <button
              type="button"
              onClick={() => onDisplayModeChange("kanban")}
              aria-label="Visualizar em Kanban"
              title="Kanban"
              className={`flex h-10 min-w-10 items-center justify-center rounded-md px-3 transition-colors ${displayMode === "kanban" ? "bg-[#0057e7] text-white" : "text-[#5a6a82] hover:bg-[#f5f7fa]"}`}
            >
              <LayoutDashboard size={17} />
              <span className="ml-2 hidden sm:inline text-xs font-bold">Kanban</span>
            </button>
          </div>

          {canCreate && (
            <AdminButton onClick={onCreate} aria-label="Nova OS" title="Nova OS" className="h-11 min-w-11 px-3 sm:px-4">
              <Plus size={17} />
              <span className="hidden sm:inline">Nova OS</span>
            </AdminButton>
          )}

          <AdminButton
            variant="secondary"
            onClick={onRefresh}
            aria-label="Atualizar ordens de serviço"
            title="Atualizar"
            className="h-11 min-w-11 border-[#0057e7]/30 px-3 text-[#0057e7] hover:bg-[#0057e7]/5 sm:px-4"
          >
            <RefreshCw size={17} />
            <span className="hidden sm:inline">Atualizar</span>
          </AdminButton>
        </div>
      }
    />
  );
}
