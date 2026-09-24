import { useEffect, useState } from "react";
import type React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle, PackagePlus, Pencil, Wrench, X } from "lucide-react";
import { AdminButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cancelServiceOrder } from "../infrastructure/order-cancellation.repository";
import { OrderCancelDialog } from "./OrderCancelDialog";

export function OrderDetailsActions({ detail, situations, hasPermission, onClose, onSituationChange, onRequestParts, onResolve, onComplete, onEdit, onCancel, cancelling = false }: {
  detail: any;
  statuses?: any[];
  situations: any[];
  hasPermission: (permission: string) => boolean;
  onClose: () => void;
  onStatusChange?: (statusId: string) => void;
  onSituationChange: (situationId: string) => void;
  onRequestParts: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onResolve: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onCancel?: (reason: string) => Promise<boolean>;
  cancelling?: boolean;
}) {
  const queryClient = useQueryClient();
  const [browserBottomInset, setBrowserBottomInset] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [localCancelling, setLocalCancelling] = useState(false);
  const [cancelledLocally, setCancelledLocally] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport; if (!viewport) return;
    const updateBottomInset = () => { const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop); setBrowserBottomInset(Math.min(110, Math.round(inset))); };
    updateBottomInset(); viewport.addEventListener("resize", updateBottomInset); viewport.addEventListener("scroll", updateBottomInset); window.addEventListener("resize", updateBottomInset);
    return () => { viewport.removeEventListener("resize", updateBottomInset); viewport.removeEventListener("scroll", updateBottomInset); window.removeEventListener("resize", updateBottomInset); };
  }, []);

  const cancelled = cancelledLocally || Boolean(detail.cancelled_at) || String(detail.order_status?.name || "").toLowerCase() === "cancelada";
  const canChangeSituation = hasPermission("orders.situation.change") && !cancelled;
  const canEdit = hasPermission("orders.edit");
  const canRequestParts = hasPermission("orders.request_parts") && detail.is_solved !== true && !cancelled;
  const canResolve = hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved && !cancelled;
  const canComplete = hasPermission("orders.complete") && detail.is_solved && !detail.completed_at && !cancelled;
  const canEditOrder = canEdit && !detail.is_solved && !cancelled;
  const canCancel = hasPermission("orders.cancel") && !detail.completed_at && !cancelled;
  const busyCancelling = cancelling || localCancelling;

  const confirmCancellation = async (reason: string) => {
    if (onCancel) return onCancel(reason);
    setLocalCancelling(true);
    try {
      const { error } = await cancelServiceOrder(detail.id, reason);
      if (error) throw error;
      setCancelledLocally(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
      ]);
      notifyAdmin(`OS ${detail.os_number || ""} cancelada.`, "success");
      setCancelOpen(false);
      onClose();
      return true;
    } catch (error) {
      notifyAdmin(`Não foi possível cancelar a OS: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    } finally {
      setLocalCancelling(false);
    }
  };

  return <>
    <div aria-hidden="true" className="h-[9.5rem] md:hidden" />
    <div className="fixed inset-x-0 z-[70] border-t border-[#0d1b2e]/10 bg-white/95 px-3 pt-3 shadow-[0_-10px_30px_rgba(13,27,46,0.10)] backdrop-blur md:sticky md:bottom-0 md:z-auto md:bg-white md:px-5 md:py-4 md:shadow-none md:backdrop-blur-none" style={{ bottom: browserBottomInset ? `${browserBottomInset}px` : 0, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-3">
        <div className="flex min-w-0 items-center gap-2 md:flex-wrap">
          <button type="button" onClick={onClose} aria-label="Fechar detalhes da OS" title="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] transition-colors hover:bg-[#f5f7fa] hover:text-[#0d1b2e] md:hidden"><X size={17} /></button>
          <div className="hidden md:block"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary></div>
          {canChangeSituation && <div className="min-w-0 flex-1 md:min-w-40 md:flex-none"><AdminSelect value={detail.situation_id || ""} onValueChange={onSituationChange} options={[{ value: "", label: "Situação: selecionar" }, ...situations.map(situation => ({ value: situation.id, label: `Situação: ${situation.name}` }))]} className="min-h-10 w-full min-w-0 py-1.5 text-xs font-bold" ariaLabel="Alterar situação da OS" /></div>}
        </div>
        {(canRequestParts || canResolve || canComplete || canEditOrder || canCancel) && <div className="flex min-w-0 flex-wrap justify-end gap-1.5 md:gap-2">
          {canRequestParts && <AdminButton variant="secondary" onClick={onRequestParts} aria-label="Pedir peças" title="Pedir peças" className="h-11 w-11 min-w-0 !px-0 md:h-10 md:w-auto md:!px-4"><PackagePlus className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Pedir peças</span></AdminButton>}
          {canResolve && <BtnPrimary onClick={onResolve} className="h-11 w-11 min-w-0 !px-0 md:h-10 md:w-auto md:!px-4"><Wrench className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Solucionar</span></BtnPrimary>}
          {canComplete && <BtnPrimary onClick={() => onComplete()} className="h-11 w-11 min-w-0 !px-0 md:h-10 md:w-auto md:!px-4"><CheckCircle className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Concluir OS</span></BtnPrimary>}
          {canEditOrder && <BtnPrimary onClick={onEdit} className="h-11 w-11 min-w-0 !px-0 md:h-10 md:w-auto md:!px-4"><Pencil className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Editar OS</span></BtnPrimary>}
          {canCancel && <AdminButton variant="secondary" onClick={() => setCancelOpen(true)} className="h-11 w-11 min-w-0 border-red-200 !px-0 text-red-600 hover:bg-red-50 md:h-10 md:w-auto md:!px-4" aria-label="Cancelar OS" title="Cancelar OS"><Ban className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Cancelar</span></AdminButton>}
        </div>}
      </div>
    </div>
    <OrderCancelDialog
      order={detail}
      open={cancelOpen}
      loading={busyCancelling}
      onClose={() => setCancelOpen(false)}
      onConfirm={async reason => { if (await confirmCancellation(reason)) setCancelOpen(false); }}
    />
  </>;
}
