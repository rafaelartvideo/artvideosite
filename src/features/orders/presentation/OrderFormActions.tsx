import type { ReactNode } from "react";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

export function OrderFormActions({
  saving,
  canSave,
  onCancel,
  onSave,
  leftActions,
}: {
  saving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => Promise<unknown>;
  leftActions?: ReactNode;
}) {
  return (
    <AdminStickyToolbar className="flex-col gap-3 sm:flex-row sm:items-center">
      {leftActions && <div className="hidden min-w-0 items-center md:flex md:mr-auto">{leftActions}</div>}
      <div className="ml-auto flex items-center justify-end gap-3">
        <BtnSecondary onClick={onCancel} disabled={saving}>Cancelar</BtnSecondary>
        {canSave && <BtnPrimary onClick={() => onSave()} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </div>
    </AdminStickyToolbar>
  );
}
