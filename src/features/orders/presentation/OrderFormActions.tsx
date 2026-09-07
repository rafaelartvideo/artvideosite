import { CheckCircle } from "lucide-react";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

export function OrderFormActions({
  saving,
  canSave,
  onCancel,
  onSave,
}: {
  saving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
      <BtnSecondary onClick={onCancel} disabled={saving}>Cancelar</BtnSecondary>
      {canSave && <BtnPrimary onClick={onSave} loading={saving} loadingText="Salvando..."><CheckCircle size={14} /> Salvar OS</BtnPrimary>}
    </div>
  );
}
