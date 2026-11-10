import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

export function OrderFormActions({
  saving,
  canSave,
  editing,
  onCancel,
  onSave,
  rightActions,
}: {
  saving: boolean;
  canSave: boolean;
  editing: boolean;
  onCancel: () => void;
  onSave: () => Promise<unknown>;
  rightActions?: ReactNode;
}) {
  return (
    <AdminStickyToolbar className="!justify-between gap-2 sm:gap-3">
      <BtnSecondary onClick={onCancel} disabled={saving} className="shrink-0">
        Voltar
      </BtnSecondary>
      <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2">
        {rightActions}
        {canSave && (
          <BtnPrimary
            className="shrink-0"
            onClick={() => onSave()}
            loading={saving}
            loadingText={editing ? "Salvando..." : "Criando..."}
          >
            <span>{editing ? "Salvar" : "Criar"}</span>
            {!editing && <Plus size={16} aria-hidden="true" className="shrink-0" />}
          </BtnPrimary>
        )}
      </div>
    </AdminStickyToolbar>
  );
}
