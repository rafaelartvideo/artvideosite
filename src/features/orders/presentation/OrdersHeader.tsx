import { LayoutDashboard, List, Plus } from "lucide-react";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { filteredTotalLabel } from "../domain/order-list-display.mjs";

export function OrdersHeader({
  total,
  hasActiveFilters = false,
  displayMode,
  canCreate,
  onDisplayModeChange,
  onCreate,
  showViewToggle = true,
}: {
  total: number;
  hasActiveFilters?: boolean;
  displayMode: "list" | "kanban";
  canCreate: boolean;
  onDisplayModeChange: (mode: "list" | "kanban") => void;
  onCreate: () => void;
  showViewToggle?: boolean;
}) {
  const hasActions = showViewToggle || canCreate;
  return (
    <PageHeader
      title="Ordens de Serviço"
      subtitle={filteredTotalLabel(total, hasActiveFilters)}
      actions={hasActions ? (
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {showViewToggle && <div className="flex items-center rounded-lg border border-[#0d1b2e]/15 bg-white p-1">
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
          </div>}

          {canCreate && (
            <AdminButton onClick={onCreate} aria-label="Nova OS" title="Nova OS" className="h-11 min-w-11 px-3 sm:px-4">
              <Plus size={17} />
              <span className="hidden sm:inline">Nova OS</span>
            </AdminButton>
          )}
        </div>
      ) : undefined}
    />
  );
}
