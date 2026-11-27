import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import type React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, PackageCheck, PackagePlus, Pencil, Recycle, Wrench, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { isAwaitingUnrepairedReturn, type OrderTerminalOutcome } from "../infrastructure/order-terminal-exit.repository";
import { AdminButton, AdminIconButton, AdminStickyToolbar, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cancelServiceOrder } from "../infrastructure/order-cancellation.repository";
import { isOrderSituationLocked } from "../domain/order-situation-lock";
import { OrderCancelDialog } from "./OrderCancelDialog";
import { OrderConclusionButton } from "./OrderConclusionButton";

export function OrderDetailsActions({ detail, situations, hasPermission, onClose, onSituationChange, onRequestParts, onResolve, onComplete, onTerminalExit, onEdit, onCancel, cancelling = false, quoteMode = false, quoteExecutionAllowed = true, quoteFooterHostId }: {
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
  onTerminalExit: (outcome: OrderTerminalOutcome) => void;
  onEdit: () => void;
  onCancel?: (reason: string) => Promise<boolean>;
  cancelling?: boolean;
  quoteMode?: boolean;
  quoteExecutionAllowed?: boolean;
  quoteFooterHostId?: string;
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
  const returnAwaitingDiagnosis = Boolean(detail.return_root_id && detail.return_classification === "analysis");
  const isDisposal = detail.service_type?.is_disposal === true;
  const awaitingReturn = isAwaitingUnrepairedReturn(detail);
  const canChangeSituation = !awaitingReturn && !quoteMode && !returnAwaitingDiagnosis && hasPermission("orders.situation.change") && !isOrderSituationLocked(detail);
  const canEdit = hasPermission("orders.edit");
  const canRequestParts = !awaitingReturn && !isDisposal && !quoteMode && !returnAwaitingDiagnosis && quoteExecutionAllowed && hasPermission("orders.request_parts") && detail.is_solved !== true && !cancelled;
  const canResolve = !awaitingReturn && !isDisposal && !quoteMode && quoteExecutionAllowed && !returnAwaitingDiagnosis && hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved && !cancelled;
  const returnReady = !detail.return_root_id || (detail.return_classification && detail.return_classification !== "analysis");
  const canComplete = !awaitingReturn && !quoteMode && hasPermission("orders.complete") && quoteExecutionAllowed && !returnAwaitingDiagnosis && (isDisposal || detail.is_solved) && returnReady && !detail.completed_at && !cancelled;
  const canTerminalExit = hasPermission("orders.complete") && !detail.completed_at && !cancelled;
  const canEditOrder = !awaitingReturn && !quoteMode && !detail.return_root_id && !returnAwaitingDiagnosis && canEdit && !detail.is_solved && !detail.completed_at && !cancelled;
  const canCancel = !awaitingReturn && !quoteMode && hasPermission("orders.cancel") && !detail.completed_at && !cancelled;
  const busyCancelling = cancelling || localCancelling;

  const confirmCancellation = async (reason: string) => {
    if (onCancel) return onCancel(reason);
    setLocalCancelling(true);
    try {
      const { error } = await cancelServiceOrder(detail.id, reason);
      if (error) throw error;
      setCancelledLocally(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      notifyAdmin(`OS ${detail.os_number || ""} cancelada.`, "success");
      setCancelOpen(false);
      onClose();
      return true;
    } catch (error) {
      notifyAdmin(`Não foi possível cancelar a OS: ${systemErrorMessage(error)}`, "error");
      return false;
    } finally {
      setLocalCancelling(false);
    }
  };

  return <>
    <div aria-hidden="true" className="h-[5.5rem] md:hidden" />
    <AdminStickyToolbar className="fixed inset-x-0 z-[70] block px-3 pt-3 md:sticky md:bottom-0 md:z-auto md:px-5 md:py-4" style={{ bottom: browserBottomInset ? `${browserBottomInset}px` : 0, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-row items-center gap-1.5 md:justify-between md:gap-3">
        <div className={quoteMode ? "flex min-w-0 shrink-0 items-center gap-1.5 md:flex-initial md:flex-wrap md:gap-2" : "flex min-w-0 flex-1 items-center gap-1.5 md:flex-initial md:flex-wrap md:gap-2"}>
          <AdminIconButton onClick={onClose} ariaLabel="Fechar detalhes da OS" title="Fechar" className="h-10 w-10 shrink-0 md:hidden"><X size={17} /></AdminIconButton>
          <div className="hidden md:block"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary></div>
          {canChangeSituation && <div className="min-w-0 flex-1 md:min-w-40 md:flex-none"><AdminSelect value={detail.situation_id || ""} onValueChange={value => { if (value) onSituationChange(value); }} options={[...(!detail.situation_id ? [{ value: "", label: "Selecionar situação" }] : []), ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="min-h-10 w-full min-w-0 py-1.5 text-xs font-bold" ariaLabel="Alterar situação da OS" /></div>}
        </div>
        {(canRequestParts || canResolve || canComplete || canTerminalExit || canEditOrder || canCancel || (quoteMode && quoteFooterHostId) || returnAwaitingDiagnosis) && <div className={quoteMode ? "flex min-w-0 flex-1 items-center justify-end gap-1.5 md:flex-initial md:flex-wrap md:gap-2" : "flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1.5 md:flex-wrap md:gap-2"}>
          {quoteMode && quoteFooterHostId && <div id={quoteFooterHostId} className="flex w-full min-w-0 flex-nowrap items-center justify-end gap-1.5 md:w-auto md:flex-wrap md:gap-2" />}
          {canRequestParts && <AdminButton variant="tertiary" onClick={onRequestParts} aria-label="Pedir peças" title="Pedir peças" className="h-10 w-10 min-w-0 !px-0 md:h-10 md:w-auto md:!px-4"><PackagePlus className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Pedir peças</span></AdminButton>}
          {canResolve && <BtnPrimary onClick={onResolve} aria-label="Solucionar OS" title="Solucionar OS" className="h-10 w-10 min-w-0 shrink-0 !px-0 md:w-auto md:!px-4 md:text-sm"><Wrench className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Solucionar</span></BtnPrimary>}
          {canComplete && (isDisposal ? <BtnPrimary onClick={onComplete} className="h-10 px-3 text-xs sm:text-sm">Finalizar descarte</BtnPrimary> : <OrderConclusionButton onClick={() => onComplete()} mobileIconOnly aria-label="Concluir OS" />)}
          {canTerminalExit && awaitingReturn && <BtnPrimary onClick={()=>onTerminalExit("returned_unrepaired")} className="h-10 px-3 text-xs sm:text-sm"><PackageCheck size={16}/> Confirmar devolução</BtnPrimary>}
          {canTerminalExit && !awaitingReturn && <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              {/* O Radix precisa da referência do elemento DOM para posicionar e abrir o menu.
                  AdminButton é um componente funcional sem forwardRef no React 18. */}
              <button
                type="button"
                className="inline-flex h-10 min-w-0 max-w-full shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-bold text-card-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                aria-label="Encerrar sem reparo"
                title="Descarte ou devolução sem reparo"
              >
                <PackageCheck size={16}/><span className="hidden md:inline">Encerrar sem reparo</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" sideOffset={8} className="z-[160] min-w-[230px]">
              <DropdownMenuItem onSelect={()=>{
                // Radix precisa concluir o fechamento do menu antes de abrir outro diálogo.
                window.requestAnimationFrame(()=>onTerminalExit("returned_unrepaired"));
              }} className="flex items-center gap-2">
                <PackageCheck size={15}/> Iniciar devolução sem reparo
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>{
                window.requestAnimationFrame(()=>onTerminalExit("disposal_confirmed"));
              }} className="flex items-center gap-2">
                <Recycle size={15}/> Confirmar descarte
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
          {canEditOrder && <BtnPrimary onClick={onEdit} className="h-11 w-11 min-w-0 !px-0 md:h-10 md:w-auto md:!px-4"><Pencil className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Editar OS</span></BtnPrimary>}
          {canCancel && <AdminButton variant="quaternary" onClick={() => setCancelOpen(true)} className="h-10 w-10 min-w-0 shrink-0 !px-0 md:h-10 md:w-auto md:!px-4" aria-label="Cancelar OS" title="Cancelar OS"><Ban className="h-5 w-5 shrink-0 md:h-4 md:w-4" /><span className="sr-only md:not-sr-only">Cancelar</span></AdminButton>}
          {returnAwaitingDiagnosis && <div id={"os-return-diagnosis-toolbar-" + detail.id}
            className="flex min-w-0 shrink-0 items-center justify-end gap-2" />}
        </div>}
      </div>
    </AdminStickyToolbar>
    <OrderCancelDialog
      order={detail}
      open={cancelOpen}
      loading={busyCancelling}
      onClose={() => setCancelOpen(false)}
      onConfirm={async reason => { if (await confirmCancellation(reason)) setCancelOpen(false); }}
    />
  </>;
}
