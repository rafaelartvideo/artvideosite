import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import type { LinkedServiceOrder } from "@/features/orders/infrastructure/linked-orders.repository";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";

type LinkedOrdersDeleteDialogProps = {
  entityLabel: string;
  entityName: string;
  orders: LinkedServiceOrder[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void | Promise<unknown>;
  onDelete: () => void | Promise<unknown>;
  onCancel: () => void;
  onOpenOrder: (orderId: string) => void;
};

export function LinkedOrdersDeleteDialog({
  entityLabel,
  entityName,
  orders,
  loading,
  error,
  onRefresh,
  onDelete,
  onCancel,
  onOpenOrder,
}: LinkedOrdersDeleteDialogProps) {
  const blocked = loading || Boolean(error) || orders.length > 0;

  return <AlertDialog open onOpenChange={open => { if (!open) onCancel(); }}>
    <AlertDialogContent className="admin-crm max-w-2xl rounded-2xl border-border bg-card">
      <AlertDialogHeader className="text-left">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <AlertDialogTitle className="text-base font-bold text-foreground">Excluir {entityLabel}</AlertDialogTitle>
            <AlertDialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {entityName ? <>Você está tentando excluir <strong className="text-foreground">{entityName}</strong>.</> : null} A exclusão só é liberada quando nenhuma OS estiver vinculada.
            </AlertDialogDescription>
          </div>
        </div>
      </AlertDialogHeader>

      <div className="min-h-24">
        {loading ? <div className="flex items-center justify-center gap-3 py-8 text-sm font-semibold text-muted-foreground"><LoadingSpinner size="sm" /> Verificando OS vinculadas...</div> : error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : orders.length > 0 ? <>
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
            Existem <strong>{orders.length}</strong> {orders.length === 1 ? "OS vinculada" : "OS vinculadas"}. Abra cada OS e altere {entityLabel === "situação" ? "a situação" : "o tipo de atendimento"} antes de excluir.
          </div>
          <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-border">
            {orders.map(order => <div key={order.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">OS {order.os_number || "sem número"}</p>
                <p className="truncate text-xs text-muted-foreground">{order.customer_name || "Cliente não informado"}</p>
              </div>
              <AdminButton size="sm" variant="secondary" onClick={() => onOpenOrder(order.id)}><ExternalLink size={13} /> Abrir OS</AdminButton>
            </div>)}
          </div>
        </> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Nenhuma OS está vinculada. A exclusão está liberada.</div>}
      </div>

      <AlertDialogFooter className="sm:justify-between">
        <AdminButton variant="secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={14} /> Atualizar lista</AdminButton>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <AdminButton variant="secondary" onClick={onCancel}>Cancelar</AdminButton>
          <AdminButton variant="danger" onClick={onDelete} disabled={blocked} loadingText="Excluindo...">Excluir</AdminButton>
        </div>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
