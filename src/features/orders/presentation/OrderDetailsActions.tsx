import type React from "react";
import { CheckCircle, Edit2, PackagePlus } from "lucide-react";
import { AdminButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";

export function OrderDetailsActions({
  detail,
  statuses,
  situations,
  hasPermission,
  onClose,
  onStatusChange,
  onSituationChange,
  onRequestParts,
  onResolve,
  onComplete,
  onEdit,
}: {
  detail: any;
  statuses: any[];
  situations: any[];
  hasPermission: (permission: string) => boolean;
  onClose: () => void;
  onStatusChange: (statusId: string) => void;
  onSituationChange: (situationId: string) => void;
  onRequestParts: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onResolve: () => void;
  onComplete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-between gap-3">
      <div className="flex gap-2 flex-wrap">
        <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
        {hasPermission("orders.status") && <div className="min-w-32"><AdminSelect value={detail.status_id || ""} onValueChange={onStatusChange} options={[{ value: "", label: "Status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="min-h-10 py-1.5 text-xs font-bold" ariaLabel="Alterar status da OS" /></div>}
        {hasPermission("orders.edit") && <div className="min-w-32"><AdminSelect value={detail.situation_id || ""} onValueChange={onSituationChange} options={[{ value: "", label: "Situação" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="min-h-10 py-1.5 text-xs font-bold" ariaLabel="Alterar situação da OS" /></div>}
        {hasPermission("orders.request_parts") && detail.is_solved !== true && <AdminButton variant="secondary" onClick={onRequestParts}><PackagePlus size={14} /> Pedir peças</AdminButton>}
        {hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved && <BtnPrimary onClick={onResolve}><CheckCircle size={14} /> Resolver OS</BtnPrimary>}
        {hasPermission("orders.complete") && detail.is_solved && !detail.completed_at && <BtnPrimary onClick={onComplete}><CheckCircle size={14} /> Concluir OS</BtnPrimary>}
        {hasPermission("orders.edit") && !detail.is_solved && <BtnPrimary onClick={onEdit}><Edit2 size={14} /> Editar</BtnPrimary>}
      </div>
    </div>
  );
}
