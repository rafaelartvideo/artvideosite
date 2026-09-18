import type { ReactNode } from "react";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

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
    <div className="sticky bottom-0 flex flex-col gap-3 border-t border-[#0d1b2e]/8 bg-white px-5 py-4 sm:flex-row sm:items-center">
      {leftActions && <div className="flex min-w-0 items-center sm:mr-auto">{leftActions}</div>}
      <div className="flex items-center justify-end gap-3">
        <BtnSecondary onClick={onCancel} disabled={saving}>Cancelar</BtnSecondary>
        {canSave && <BtnPrimary onClick={() => onSave()} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </div>
    </div>
  );
}
