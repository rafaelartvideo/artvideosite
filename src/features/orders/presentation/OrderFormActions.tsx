import { CheckCircle, Clock } from "lucide-react";
import { BtnPrimary, BtnSecondary } from "@/shared/admin/AdminPrimitives";

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
      <BtnSecondary onClick={onCancel}>Cancelar</BtnSecondary>
      {canSave && <BtnPrimary onClick={onSave} disabled={saving}>{saving ? <Clock size={14} className="animate-spin" /> : <CheckCircle size={14} />}{saving ? "Salvando..." : "Salvar OS"}</BtnPrimary>}
    </div>
  );
}
