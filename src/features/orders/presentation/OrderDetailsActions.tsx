import type React from "react";
import { CheckCircle, Edit2, PackagePlus, Trash2 } from "lucide-react";
import { BtnPrimary, BtnSecondary } from "@/app/admin/shared";

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
  onEdit,
  onDelete,
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
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-between gap-3">
      <div className="flex gap-2 flex-wrap">
        <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
        {hasPermission("orders.status") && <select value={detail.status_id || ""} onChange={event => onStatusChange(event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Status</option>{statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}</select>}
        {hasPermission("orders.edit") && <select value={detail.situation_id || ""} onChange={event => onSituationChange(event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Situação</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select>}
        {hasPermission("orders.request_parts") && detail.is_solved !== true && <button type="button" onClick={onRequestParts} className="inline-flex items-center gap-2 whitespace-nowrap border border-[#0d1b2e]/15 text-[#0d1b2e] px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#f5f7fa] transition-colors cursor-pointer"><PackagePlus size={14} /> Pedir peças</button>}
        {hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved && <BtnPrimary onClick={onResolve}><CheckCircle size={14} /> Resolver OS</BtnPrimary>}
        {hasPermission("orders.edit") && !detail.is_solved && <BtnPrimary onClick={onEdit}><Edit2 size={14} /> Editar</BtnPrimary>}
        {hasPermission("orders.delete") && !detail.is_solved && <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"><Trash2 size={14} /> Excluir</button>}
      </div>
    </div>
  );
}
