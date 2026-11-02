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
    <AdminStickyToolbar className="flex-row items-center justify-between gap-2 sm:gap-3">
      {leftActions && <div className="hidden min-w-0 items-center md:flex md:mr-auto">{leftActions}</div>}
      <BtnSecondary onClick={onCancel} disabled={saving} className="shrink-0">Voltar</BtnSecondary>
      {canSave && <BtnPrimary className="ml-auto shrink-0" onClick={() => onSave()} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  );
}
