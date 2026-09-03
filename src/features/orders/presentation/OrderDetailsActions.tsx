import { useEffect, useState } from "react";
import type React from "react";
import { CheckCircle, Edit2, PackagePlus, X } from "lucide-react";
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
  const [browserBottomInset, setBrowserBottomInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateBottomInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBrowserBottomInset(Math.min(110, Math.round(inset)));
    };

    updateBottomInset();
    viewport.addEventListener("resize", updateBottomInset);
    viewport.addEventListener("scroll", updateBottomInset);
    window.addEventListener("resize", updateBottomInset);

    return () => {
      viewport.removeEventListener("resize", updateBottomInset);
      viewport.removeEventListener("scroll", updateBottomInset);
      window.removeEventListener("resize", updateBottomInset);
    };
  }, []);

  const canChangeStatus = hasPermission("orders.status");
  const canEdit = hasPermission("orders.edit");
  const canRequestParts = hasPermission("orders.request_parts") && detail.is_solved !== true;
  const canResolve = hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved;
  const canComplete = hasPermission("orders.complete") && detail.is_solved && !detail.completed_at;
  const canEditOrder = canEdit && !detail.is_solved;

  return (
    <>
      <div aria-hidden="true" className="h-[9.5rem] md:hidden" />

      <div
        className="fixed inset-x-0 z-[70] border-t border-[#0d1b2e]/10 bg-white/95 px-3 pt-3 shadow-[0_-10px_30px_rgba(13,27,46,0.10)] backdrop-blur md:sticky md:bottom-0 md:z-auto md:bg-white md:px-5 md:py-4 md:shadow-none md:backdrop-blur-none"
        style={{
          bottom: browserBottomInset ? `${browserBottomInset}px` : 0,
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-3">
          <div className="flex min-w-0 items-center gap-2 md:flex-wrap">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes da OS"
              title="Fechar"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] transition-colors hover:bg-[#f5f7fa] hover:text-[#0d1b2e] md:hidden"
            >
              <X size={17} />
            </button>
            <div className="hidden md:block">
              <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
            </div>

            {canChangeStatus && (
              <div className="min-w-0 flex-1 md:min-w-32 md:flex-none">
                <AdminSelect
                  value={detail.status_id || ""}
                  onValueChange={onStatusChange}
                  options={[{ value: "", label: "Status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]}
                  className="min-h-10 w-full min-w-0 py-1.5 text-xs font-bold"
                  ariaLabel="Alterar status da OS"
                />
              </div>
            )}

            {canEdit && (
              <div className="min-w-0 flex-1 md:min-w-32 md:flex-none">
                <AdminSelect
                  value={detail.situation_id || ""}
                  onValueChange={onSituationChange}
                  options={[{ value: "", label: "Situação" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]}
                  className="min-h-10 w-full min-w-0 py-1.5 text-xs font-bold"
                  ariaLabel="Alterar situação da OS"
                />
              </div>
            )}
          </div>

          {(canRequestParts || canResolve || canComplete || canEditOrder) && (
            <div className="grid min-w-0 auto-cols-fr grid-flow-col gap-2 md:flex md:flex-wrap md:justify-end">
              {canRequestParts && (
                <AdminButton
                  variant="secondary"
                  onClick={onRequestParts}
                  aria-label="Pedir peças"
                  title="Pedir peças"
                  className="h-10 min-w-0 px-2 md:px-4"
                >
                  <PackagePlus size={15} />
                  <span className="hidden md:inline">Pedir peças</span>
                </AdminButton>
              )}

              {canResolve && (
                <BtnPrimary onClick={onResolve} className="h-10 min-w-0 px-2.5 md:px-4">
                  <CheckCircle size={15} />
                  <span className="md:hidden">Resolver</span>
                  <span className="hidden md:inline">Resolver OS</span>
                </BtnPrimary>
              )}

              {canComplete && (
                <BtnPrimary onClick={onComplete} className="h-10 min-w-0 px-2.5 md:px-4">
                  <CheckCircle size={15} />
                  <span className="md:hidden">Concluir</span>
                  <span className="hidden md:inline">Concluir OS</span>
                </BtnPrimary>
              )}

              {canEditOrder && (
                <BtnPrimary
                  onClick={onEdit}
                  className="h-10 min-w-0 px-2 md:px-4"
                  aria-label="Editar OS"
                  title="Editar"
                >
                  <Edit2 size={15} />
                  <span className="hidden md:inline">Editar</span>
                </BtnPrimary>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
