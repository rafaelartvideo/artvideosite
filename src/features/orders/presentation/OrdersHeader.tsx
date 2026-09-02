import { LayoutDashboard, List, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminButton, AdminSegmentedControl, PageHeader } from "@/shared/ui/admin/AdminLayout";

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
          <AdminSegmentedControl
            value={displayMode}
            onChange={(mode) => onDisplayModeChange(mode)}
            options={[
              { value: "list", label: "Lista" },
              { value: "kanban", label: "Kanban" },
            ]}
            className="grid-cols-2"
          />
          {canCreate && (
            <AdminButton onClick={onCreate} className="text-xs">
              <Plus size={13} /> Nova OS
            </AdminButton>
          )}
          <AdminButton variant="secondary" onClick={onRefresh} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5 text-xs">
            <RefreshCw size={13} /> Atualizar
          </AdminButton>
        </div>
      }
    />
  );
}
