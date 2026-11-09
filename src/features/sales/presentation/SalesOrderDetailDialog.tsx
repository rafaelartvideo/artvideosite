import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { AlertCircle, Calendar, CheckCircle2, Clock3, FileText, History, MoreHorizontal, PackageCheck, RotateCcw, ShoppingBag, Truck, UserRound, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from "@/shared/ui/primitives/dropdown-menu";
import { SalesDeliveryDialog } from "./SalesDeliveryDialog";
import { SalesReturnsDialog } from "./SalesReturnsDialog";
import {
  cancelSalesOrder, getSalesOrderDetail, updateSalesOrderFulfillment,
  type SalesOrderHistoryEvent,
} from "../infrastructure/sales-orders.repository";
import {
  formatSalesDate, formatSalesDueDate, nextFulfillmentStep,
  orderFulfillmentLabels, orderPaymentLabels, orderStatusLabels,
} from "../domain/sales-order-display";

const progress = ["pending", "separating", "ready", "delivered"] as const;

function eventText(event: SalesOrderHistoryEvent): string {
  if (event.type === "created") return "Pedido comercial criado";
  if (event.type === "cancelled") return "Pedido cancelado e estoque devolvido";
  if (event.type === "delivery_configured") return "Retirada ou entrega configurada";
  if (event.type === "delivery_completed") return "Entrega ou retirada concluída";
  if (event.type === "return_requested") return "Solicitação de troca/devolução aberta";
  if (event.type === "return_approved") return "Troca/devolução aprovada";
  if (event.type === "return_rejected") return "Troca/devolução recusada";
  if (event.type === "return_received") return "Mercadoria devolvida recebida";
  if (event.type === "return_reconciled") return "Devolução conciliada com o Financeiro";
  if (event.type === "fulfillment_changed") {
    const value = String(event.data?.next || "");
    return "Separação/entrega: " + (Object.prototype.hasOwnProperty.call(orderFulfillmentLabels,value)
      ? orderFulfillmentLabels[value as keyof typeof orderFulfillmentLabels] : value);
  }
  return "Atualização do pedido";
}

function Pill({ children, tone }: {
  children: ReactNode;
  tone: "neutral" | "green" | "orange" | "red" | "blue";
}) {
  const style = {
    neutral: "border-border bg-muted/40 text-muted-foreground",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    orange: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    red: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
    blue: "border-primary/20 bg-primary/10 text-primary",
  };
  return <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold " + style[tone]}>{children}</span>;
}

export function SalesOrderDetailDialog({
  organizationId, orderId, onClose, onChanged,
}: {
  organizationId: string;
  orderId: string;
  onClose: () => void;
  onChanged?: (message: string) => void;
}) {
  const { hasPermission } = useAuth();
  const historyRef=useRef<HTMLElement|null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const openFinance = (entryId: string) => {
    const mode = new URLSearchParams(location.search).get("mode") === "crm" ? "?mode=crm" : "";
    onClose();
    navigate("/admin/finance/receivables/" + encodeURIComponent(entryId) + mode);
  };
  const canManage = hasPermission("sales.orders.manage");
  const canCancel = hasPermission("sales.cancel");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deliveryOpen,setDeliveryOpen]=useState(false);
  const [returnsOpen,setReturnsOpen]=useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: ["sales", organizationId, "order", orderId],
    queryFn: () => getSalesOrderDetail(organizationId, orderId),
    enabled: Boolean(organizationId && orderId),
    staleTime: 10_000,
  });
  const order = detailQuery.data;
  const nextStatus = order ? nextFulfillmentStep(order.fulfillment_status) : null;
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["finance"] });
  };

  const fulfillmentMutation = useMutation({
    mutationFn: async () => {
      if (!nextStatus) throw new Error("Pedido já foi entregue.");
      return updateSalesOrderFulfillment(organizationId, orderId, nextStatus);
    },
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
      onChanged?.("Situação de separação/entrega atualizada.");
    },
    onError: error => setErrorMessage(systemErrorMessage(error, "Não foi possível atualizar a situação.")),
  });

  const cancellationMutation = useMutation({
    mutationFn: () => cancelSalesOrder(organizationId, orderId, cancelReason),
    onSuccess: () => {
      setErrorMessage(null);
      setCancelOpen(false);
      invalidate();
      onChanged?.("Pedido cancelado. Estoque devolvido e lançamento pendente cancelado.");
    },
    onError: error => setErrorMessage(systemErrorMessage(error, "Não foi possível cancelar o pedido.")),
  });

  const canOfferCancellation = Boolean(
    order && order.status === "confirmed"
    && order.fulfillment_status === "pending"
    && order.received_amount === 0
    && order.settlements.length === 0 && canCancel,
  );
  const canOpenFinance=Boolean(order?.status==="confirmed"&&order.open_amount>0&&
    order.financial_entry_id&&hasPermission("finance.receivables.view"));
  const canDelivery=Boolean(order?.status==="confirmed"&&hasPermission("sales.delivery.manage"));
  // A visualização do histórico exige apenas sales.view; operações são protegidas no próprio modal.
  const canReturns=Boolean(order?.status==="confirmed"&&order.fulfillment_status!=="pending");

  return <>
    <AdminDialog open onClose={onClose}
      title={"Pedido comercial #" + (order?.order_number ?? "…")}
      description="Detalhes, pagamento, produtos, separação e histórico"
      className="w-[calc(100vw-1.25rem)] max-w-4xl"
      bodyClassName="max-h-[min(75dvh,800px)] overflow-y-auto"
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais ações do pedido"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary">
              <MoreHorizontal size={17}/> Ações
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="z-[360] min-w-[230px] max-h-[min(70dvh,420px)]">
            <DropdownMenuItem onSelect={()=>historyRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}>
              <History size={15} className="mr-2"/> Visualizar histórico
            </DropdownMenuItem>
            {canOpenFinance&&order?.financial_entry_id&&
              <DropdownMenuItem onSelect={()=>openFinance(order.financial_entry_id!)}>
                <Wallet size={15} className="mr-2"/> Receber no Financeiro
              </DropdownMenuItem>}
            {canDelivery&&<DropdownMenuItem onSelect={()=>setDeliveryOpen(true)}>
              <Truck size={15} className="mr-2"/> Entrega ou retirada
            </DropdownMenuItem>}
            {canReturns&&<DropdownMenuItem onSelect={()=>setReturnsOpen(true)}>
              <RotateCcw size={15} className="mr-2"/> Trocas e devoluções
            </DropdownMenuItem>}
            {canOfferCancellation&&<DropdownMenuItem
              onSelect={()=>{setErrorMessage(null);setCancelReason("");setCancelOpen(true);}}
              className="text-destructive focus:text-destructive">
              <AlertCircle size={15} className="mr-2"/> Cancelar pedido
            </DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        {order?.status==="confirmed"&&nextStatus&&nextStatus!=="delivered"&&canManage&&
          <AdminButton size="sm"
            disabled={fulfillmentMutation.isPending||cancellationMutation.isPending}
            loading={fulfillmentMutation.isPending} onClick={()=>fulfillmentMutation.mutate()}>
            <PackageCheck size={15}/>
            {nextStatus==="separating"?"Iniciar separação":"Marcar como pronto"}
          </AdminButton>}
        <AdminButton variant="secondary" size="sm" onClick={onClose}>Fechar</AdminButton>
      </div>}>
      {detailQuery.isPending ? <div className="py-10"><LoadingState text="Carregando pedido..." /></div>
        : detailQuery.isError || !order
          ? <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">
              {systemErrorMessage(detailQuery.error, "Não foi possível carregar o pedido.")}
            </p>
            <AdminButton variant="secondary" onClick={() => void detailQuery.refetch()}>Tentar novamente</AdminButton>
          </div>
          : <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Pill tone={order.status === "cancelled" ? "red" : "blue"}>{orderStatusLabels[order.status]}</Pill>
                <Pill tone={order.payment_status === "paid" ? "green"
                  : order.payment_status === "cancelled" ? "red" : "orange"}>
                  {orderPaymentLabels[order.payment_status]}
                </Pill>
                <Pill tone={order.fulfillment_status === "delivered" ? "green" :
                  order.fulfillment_status === "pending" ? "neutral" : "blue"}>
                  {orderFulfillmentLabels[order.fulfillment_status]}
                </Pill>
              </div>
              <span className="text-xs text-muted-foreground">{formatSalesDate(order.created_at)}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border p-3">
                <h3 className="flex items-center gap-2 text-sm font-bold"><UserRound size={16}/> Cliente</h3>
                <p className="text-sm font-semibold text-foreground">{order.customer_name || "Consumidor não identificado"}</p>
                {order.customer_document && <p className="text-xs text-muted-foreground">{order.customer_document}</p>}
                <p className="text-xs text-muted-foreground">Vendedor: {order.seller_name}</p>
              </div>
              <div className="space-y-2 rounded-xl border border-border p-3">
                <h3 className="flex items-center gap-2 text-sm font-bold"><Wallet size={16}/> Financeiro</h3>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Total do pedido</span>
                  <strong>{formatCurrency(order.total_amount)}</strong>
                </div>
                {Number(order.return_credit_amount||0)>0&&<>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Crédito de devolução conciliado</span>
                    <strong>{formatCurrency(order.return_credit_amount||0)}</strong>
                  </div>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Total líquido</span>
                    <strong>{formatCurrency(order.net_total_amount??order.total_amount)}</strong>
                  </div>
                </>}
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Total recebido</span>
                  <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(order.received_amount)}</strong>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-2 text-xs">
                  <span className="text-muted-foreground">Saldo em aberto</span>
                  <strong className="text-orange-700 dark:text-orange-300">{formatCurrency(order.status==="cancelled" ? 0 : order.open_amount)}</strong>
                </div>
                {order.payment_status !== "paid" && order.status !== "cancelled" && order.due_date &&
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar size={13}/> Vencimento: {formatSalesDueDate(order.due_date)}
                  </p>}
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ShoppingBag size={16}/> Produtos <span className="text-xs font-normal text-muted-foreground">({order.items.length})</span>
              </h3>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {order.items.map(item => <div key={item.id} className="flex min-w-0 justify-between gap-3 px-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-foreground">{item.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.sku ? "SKU " + item.sku + " · " : ""}
                      {formatNumber(item.quantity)} {item.unit || "un"} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <strong className="shrink-0 tabular-nums">{formatCurrency(item.line_total)}</strong>
                </div>)}
              </div>
              <div className="space-y-1.5 rounded-lg bg-muted/25 px-3 py-3 text-xs">
                <div className="flex justify-between gap-2"><span>Subtotal</span><strong>{formatCurrency(order.subtotal)}</strong></div>
                <div className="flex justify-between gap-2"><span>Desconto</span><strong className="text-red-600">{order.discount_amount ? "− " : ""}{formatCurrency(order.discount_amount)}</strong></div>
                <div className="flex justify-between gap-2 border-t border-border pt-2 text-sm"><strong>Total</strong><strong>{formatCurrency(order.total_amount)}</strong></div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold"><PackageCheck size={16}/> Separação e entrega</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {progress.map((step, index) => {
                  const activeIndex = progress.indexOf(order.fulfillment_status);
                  const active = index <= activeIndex && order.status !== "cancelled";
                  return <div key={step} className="min-w-0 space-y-1.5 text-center">
                    <div className={"h-2 rounded-full " + (active ? "bg-primary" : "bg-muted")} />
                    <p className={"text-[10px] leading-4 " + (active ? "font-bold text-foreground" : "text-muted-foreground")}>
                      {index === 0 ? "Pendente" : index === 1 ? "Separando" : index === 2 ? "Pronto" : "Entregue"}
                    </p>
                  </div>;
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                O estoque é baixado ao confirmar a venda. A separação registra o andamento da entrega, sem nova baixa.
              </p>
            </section>

            {order.installments?.length > 0 && <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Calendar size={16}/> Parcelas e vencimentos
              </h3>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {order.installments.map(installment => <div key={installment.id}
                  className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {installment.number}ª de {installment.total_installments} · {formatSalesDueDate(installment.due_date)}
                    </p>
                    <p className={installment.status === "paid"
                      ? "mt-1 text-emerald-700 dark:text-emerald-300"
                      : installment.status === "overdue" ? "mt-1 text-red-600"
                        : "mt-1 text-muted-foreground"}>
                      {installment.status === "paid" ? "Recebida"
                        : installment.status === "partial" ? "Parcialmente recebida"
                          : installment.status === "overdue" ? "Vencida"
                            : installment.status === "cancelled" ? "Cancelada" : "Pendente"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <strong className="tabular-nums">{formatCurrency(installment.amount)}</strong>
                    {installment.settled_amount > 0 && installment.settled_amount < installment.amount &&
                      <p className="mt-1 tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(installment.settled_amount)} recebido
                      </p>}
                  </div>
                </div>)}
              </div>
            </section>}
            {order.settlements.length>0 && <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 size={16}/> Recebimentos</h3>
              <div className="divide-y divide-border rounded-xl border border-border">
                {order.settlements.map(s => <div key={s.id} className="flex justify-between gap-3 p-3 text-xs">
                  <div><p className="font-semibold">{s.method}</p>
                    <p className="mt-1 text-muted-foreground">{formatSalesDate(s.at)} · {s.status === "posted" ? "Recebido" : s.status === "scheduled" ? "Previsto" : "Estornado"}</p>
                  </div>
                  <strong>{formatCurrency(s.amount)}</strong>
                </div>)}
              </div>
            </section>}

            {order.notes && <section className="space-y-1.5 rounded-xl border border-border p-3">
              <h3 className="flex items-center gap-2 text-sm font-bold"><FileText size={16}/> Observações</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{order.notes}</p>
            </section>}

            {order.status==="cancelled" && <div className="space-y-1 rounded-xl border border-red-500/25 bg-red-500/5 p-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Pedido cancelado</p>
              {order.cancellation_reason && <p className="text-xs text-muted-foreground">{order.cancellation_reason}</p>}
              <p className="text-xs text-muted-foreground">{formatSalesDate(order.cancelled_at)}</p>
            </div>}

            <section ref={historyRef} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold"><Clock3 size={16}/> Histórico</h3>
              <div className="divide-y divide-border rounded-xl border border-border">
                {order.events.map(event => <div key={event.id} className="flex gap-2.5 px-3 py-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{eventText(event)}</p>
                    {event.type==="cancelled" && typeof event.data.reason==="string" &&
                      <p className="mt-1 text-xs text-muted-foreground">Motivo: {event.data.reason}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{formatSalesDate(event.at)} · {event.by}</p>
                  </div>
                </div>)}
              </div>
            </section>
          </div>}
      {errorMessage && !cancelOpen && <p role="alert" className="mt-3 rounded-lg border border-destructive/20 p-3 text-xs text-destructive">
        {errorMessage}
      </p>}
    </AdminDialog>

    {order && deliveryOpen && <SalesDeliveryDialog
      organizationId={organizationId}
      orderId={orderId}
      ready={order.fulfillment_status==="ready"}
      onClose={()=>setDeliveryOpen(false)}
      onSaved={message=>{invalidate();onChanged?.(message);}}
    />}
    {order && returnsOpen && <SalesReturnsDialog
      organizationId={organizationId}
      order={order}
      onClose={()=>setReturnsOpen(false)}
      onChanged={message=>{invalidate();onChanged?.(message);}}
    />}
    {cancelOpen && <AdminDialog open onClose={() => !cancellationMutation.isPending && setCancelOpen(false)}
      title={"Cancelar pedido #" + (order?.order_number || "")}
      description="A operação exige confirmação e motivo. O cancelamento não pode ser desfeito automaticamente."
      className="max-w-lg"
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" disabled={cancellationMutation.isPending}
          onClick={() => setCancelOpen(false)}>Voltar</AdminButton>
        <AdminButton variant="danger" loading={cancellationMutation.isPending}
          disabled={cancelReason.trim().length < 10 || cancellationMutation.isPending}
          onClick={() => cancellationMutation.mutate()}>Confirmar cancelamento</AdminButton>
      </div>}>
      <div className="space-y-3">
        <div className="flex gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <AlertCircle size={18} className="shrink-0 text-orange-600" />
          <p className="text-xs leading-5 text-foreground">
            Somente pedidos sem qualquer recebimento e ainda não separados podem ser cancelados aqui.
            O sistema devolverá as unidades ao estoque e cancelará a conta a receber, preservando o histórico.
          </p>
        </div>
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="sales-order-cancel-reason">
          Motivo do cancelamento
        </label>
        <textarea id="sales-order-cancel-reason" value={cancelReason} rows={3} maxLength={500}
          placeholder="Descreva o motivo do cancelamento (mínimo 10 caracteres)"
          onChange={event => {setCancelReason(event.target.value);setErrorMessage(null);}}
          className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary" />
        {errorMessage && <p className="text-xs text-destructive" role="alert">{errorMessage}</p>}
        <p className="text-xs text-muted-foreground">{cancelReason.trim().length}/500 caracteres</p>
      </div>
    </AdminDialog>}
  </>;
}
