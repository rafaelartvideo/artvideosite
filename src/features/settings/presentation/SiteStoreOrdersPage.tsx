import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck,
  Clock3, PackageCheck, RefreshCw, RotateCcw, Search, ShoppingBag, Truck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section,
} from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { StoreAfterSalesStaff } from "./StoreAfterSalesStaff";

type StoreOrder = {
  id: string; created_at: string; status: string; quantity: number;
  product_name: string; unit_price: number; shipping_price: number;
  shipping_service_name: string; shipping_service_id: string; postal_code: string;
  buyer: Record<string, string>; preference_id: string | null;
  payment_id: string | null; paid_at: string | null; expires_at: string;
};
type StoreOrderLine = {
  id: string; order_id: string; product_name: string; quantity: number; unit_price: number;
};
type SupportCaseSummary = {order_id:string;status:string};
type FulfillmentStatus =
  "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "delivery_issue" | "picked_up";
type Fulfillment = {
  order_id: string; status: FulfillmentStatus; updated_at: string;
  recipient_name: string | null; delivered_at: string | null;
};
type FulfillmentEvent = {
  id: string; order_id: string; from_status: string; to_status: FulfillmentStatus;
  note: string | null; recipient_name: string | null; actor_name: string | null;
  created_at: string;
};

const paymentLabels: Record<string,string> = {
  creating: "Preparando pagamento", awaiting_payment: "Aguardando pagamento",
  paid: "Pago", cancelled: "Cancelado", expired: "Expirado",
  manual_review: "Revisão necessária",
};
const deliveryLabels: Record<FulfillmentStatus,string> = {
  pending: "Aguardando separação", preparing: "Em separação",
  ready: "Pronto para entrega", out_for_delivery: "Saiu para entrega",
  delivered: "Entregue", delivery_issue: "Ocorrência na entrega", picked_up: "Retirado na loja",
};
const deliverySequence: FulfillmentStatus[] = [
  "pending", "preparing", "ready", "out_for_delivery", "delivered",
];
const nextActions: Partial<Record<FulfillmentStatus, { status: FulfillmentStatus; label: string }>> = {
  pending: { status: "preparing", label: "Iniciar separação" },
  preparing: { status: "ready", label: "Pronto para entrega" },
  ready: { status: "out_for_delivery", label: "Saiu para entrega" },
  out_for_delivery: { status: "delivered", label: "Confirmar entrega" },
  delivery_issue: { status: "out_for_delivery", label: "Retomar entrega" },
};
const timeText = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function paymentColor(status: string) {
  if (status === "paid") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "manual_review") return "border-red-500/30 bg-red-500/10 text-red-600";
  if (status === "cancelled" || status === "expired") return "border-border bg-muted text-muted-foreground";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}
function fulfillmentColor(status: FulfillmentStatus) {
  if (status === "delivered" || status === "picked_up") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "delivery_issue") return "border-red-500/30 bg-red-500/10 text-red-600";
  if (status === "out_for_delivery") return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (status === "pending") return "border-border bg-muted text-muted-foreground";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}
function DeliveryBadge({ status }: { status: FulfillmentStatus }) {
  return <span className={"inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold " + fulfillmentColor(status)}>
    {deliveryLabels[status]}
  </span>;
}

export function SiteStoreOrdersPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const canManage = hasPermission("site_settings.update");
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [lines, setLines] = useState<StoreOrderLine[]>([]);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [events, setEvents] = useState<FulfillmentEvent[]>([]);
  const [supportCases,setSupportCases]=useState<SupportCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [supportFilter,setSupportFilter]=useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [actionMode, setActionMode] = useState<"advance" | "issue">("advance");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const fulfillmentByOrder = useMemo(
    () => new Map(fulfillments.map(row => [row.order_id, row])), [fulfillments],
  );
  const selected = orders.find(order => order.id === selectedId) ?? null;
  const currentStatus = selected ? fulfillmentByOrder.get(selected.id)?.status || "pending" : "pending";
  const isPickup = selected?.shipping_service_id === "pickup";
  const next = isPickup && currentStatus==="ready" ? {status:"picked_up" as FulfillmentStatus,label:"Confirmar retirada"} : nextActions[currentStatus];
  const selectedIsPaid = selected?.status === "paid" && Boolean(selected.paid_at);
  const nextStatus = actionMode === "issue" ? "delivery_issue" : next?.status;
  const actionLabel = actionMode === "issue" ? "Registrar ocorrência" : next?.label || "";
  const recipientRequired = nextStatus === "delivered" || nextStatus === "picked_up";
  const issueRequired = nextStatus === "delivery_issue";

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    const [orderResult, lineResult, fulfillmentResult, supportResult] = await Promise.all([
      supabase.from("artvideo_store_orders")
        .select("id,created_at,status,quantity,product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,postal_code,buyer,preference_id,payment_id,paid_at,expires_at")
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("artvideo_store_order_items")
        .select("id,order_id,product_name,quantity,unit_price")
        .order("created_at", { ascending: true }).limit(2000),
      supabase.from("artvideo_store_fulfillments")
        .select("order_id,status,updated_at,recipient_name,delivered_at"),
      supabase.from("artvideo_store_support_cases")
        .select("order_id,status").order("created_at",{ascending:false}).limit(2000),
    ]);
    const issue = orderResult.error || lineResult.error || fulfillmentResult.error || supportResult.error;
    if (issue) setError(systemErrorMessage(issue));
    else {
      setOrders((orderResult.data || []) as StoreOrder[]);
      setLines((lineResult.data || []) as StoreOrderLine[]);
      setFulfillments((fulfillmentResult.data || []) as Fulfillment[]);
      setSupportCases((supportResult.data || []) as SupportCaseSummary[]);
    }
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async (orderId: string) => {
    setHistoryLoading(true);
    const { data, error: historyError } = await supabase.from("artvideo_store_fulfillment_events")
      .select("id,order_id,from_status,to_status,note,recipient_name,actor_name,created_at")
      .eq("order_id", orderId).order("created_at", { ascending: false }).limit(100);
    if (historyError) setToast({ msg: "Não foi possível carregar o histórico: " + systemErrorMessage(historyError), type: "error" });
    else setEvents((data || []) as FulfillmentEvent[]);
    setHistoryLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 60000);
    return () => window.clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    setActionMode("advance"); setNote(""); setRecipient("");
    void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const orderLines = (order: StoreOrder) => {
    const found = lines.filter(line => line.order_id === order.id);
    return found.length ? found : [{
      id: order.id, order_id: order.id, product_name: order.product_name,
      quantity: order.quantity, unit_price: order.unit_price,
    }];
  };
  const subtotal = (order: StoreOrder) => orderLines(order)
    .reduce((sum, line) => sum + line.quantity * Number(line.unit_price), 0);
  const total = (order: StoreOrder) => subtotal(order) + Number(order.shipping_price);
  const deliveryOf = (order: StoreOrder) => fulfillmentByOrder.get(order.id)?.status || "pending";

  const filtered = useMemo(() => orders.filter(order => {
    if (paymentFilter !== "all" && order.status !== paymentFilter) return false;
    if (supportFilter==="active" && !supportCases.some(c=>c.order_id===order.id&&["open","in_review","approved"].includes(c.status))) return false;
    if (supportFilter==="none" && supportCases.some(c=>c.order_id===order.id)) return false;
    if (deliveryFilter === "unpaid" && order.status === "paid") return false;
    if (deliveryFilter !== "all" && deliveryFilter !== "unpaid"
      && (order.status !== "paid" || deliveryOf(order) !== deliveryFilter)) return false;
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return !q || [
      order.id, order.buyer?.buyer_name, order.buyer?.buyer_email, order.postal_code,
      order.product_name, ...lines.filter(line => line.order_id === order.id)
        .map(line => line.product_name),
    ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(q));
  }), [orders, lines, paymentFilter, deliveryFilter, supportFilter, supportCases, search, fulfillmentByOrder]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const rows = filtered.slice((Math.min(page, totalPages) - 1) * 10, Math.min(page, totalPages) * 10);

  const changeStage = async () => {
    if (!canManage || saving || !selected || !selectedIsPaid || !nextStatus) return;
    if (recipientRequired && recipient.trim().length < 3) {
      setToast({ msg: "Informe o nome de quem recebeu o pedido.", type: "error" }); return;
    }
    if (issueRequired && note.trim().length < 10) {
      setToast({ msg: "Descreva a ocorrência com pelo menos 10 caracteres.", type: "error" }); return;
    }
    setSaving(true);
    const { error: actionError } = await supabase.rpc("artvideo_store_advance_fulfillment_v1", {
      p_order_id: selected.id, p_next_status: nextStatus,
      p_note: note.trim() || null, p_recipient_name: recipient.trim() || null,
    });
    if (actionError) {
      setToast({ msg: systemErrorMessage(actionError), type: "error" });
    } else {
      setToast({ msg: "Etapa da entrega atualizada.", type: "success" });
      setNote(""); setRecipient(""); setActionMode("advance");
      await Promise.all([refresh(true), loadHistory(selected.id)]);

    }
    setSaving(false);
  };

  if (!activeOrganization?.is_artvideo_tenant || !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;

  const waiting = orders.filter(order => order.status === "paid" && deliveryOf(order) === "pending").length;
  const preparing = orders.filter(order => order.status === "paid" && ["preparing", "ready"].includes(deliveryOf(order))).length;
  const delivering = orders.filter(order => order.status === "paid" && ["out_for_delivery", "delivery_issue"].includes(deliveryOf(order))).length;
  const completed = orders.filter(order => order.status === "paid" && ["delivered","picked_up"].includes(deliveryOf(order))).length;
  const postSaleCount = supportCases.filter(c=>["open","in_review","approved"].includes(c.status)).length;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Pedidos da Loja"
      subtitle="Acompanhe pagamentos, separação de produtos e entregas da Artvideo."/>
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      {[
        { label: "Aguardando separação", value: waiting, Icon: ShoppingBag },
        { label: "Em preparação", value: preparing, Icon: PackageCheck },
        { label: "Em entrega", value: delivering, Icon: Truck },
        { label: "Concluídos", value: completed, Icon: CheckCheck },
        { label: "Pós-venda", value: postSaleCount, Icon: RotateCcw },
      ].map(card => <div key={card.label} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><card.Icon size={20}/></span>
        <div className="min-w-0"><p className="text-[11px] leading-4 text-muted-foreground">{card.label}</p><strong className="block text-2xl">{card.value}</strong></div>
      </div>)}
    </div>

    <Section title="Vendas do site" description="Clique em um pedido para consultar detalhes, acompanhar a entrega e registrar movimentações.">
      <div className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_165px_170px_160px]">
          <label className="relative min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar cliente, pedido ou produto" aria-label="Buscar pedidos"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm focus:outline-primary"/>
          </label>
          <select aria-label="Filtrar pagamento" value={paymentFilter}
            onChange={e => { setPaymentFilter(e.target.value); setPage(1); }}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            <option value="all">Todos os pagamentos</option>
            {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filtrar entrega" value={deliveryFilter}
            onChange={e => { setDeliveryFilter(e.target.value); setPage(1); }}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            <option value="all">Todas as entregas</option>
            <option value="unpaid">Sem pagamento confirmado</option>
            {Object.entries(deliveryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filtrar pós-venda" value={supportFilter}
            onChange={e=>{setSupportFilter(e.target.value);setPage(1);}}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            <option value="all">Todo pós-venda</option>
            <option value="active">Com solicitação ativa</option>
            <option value="none">Sem solicitações</option>
          </select>
        </div>

        {error && <div role="alert" className="rounded-md border border-red-500/20 p-4 text-sm text-red-600">
          Falha ao carregar os pedidos: {error}
          <button type="button" onClick={() => void refresh()} className="ml-2 font-bold underline">Tentar novamente</button>
        </div>}
        {loading && !orders.length ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando pedidos...</p>
        : !rows.length ? <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <ShoppingBag size={29} className="mx-auto mb-3"/>
          {orders.length ? "Nenhum pedido encontrado neste filtro." : "Nenhum pedido registrado."}
        </div>
        : <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[830px] text-left text-sm">
            <thead className="bg-muted/40 text-xs font-bold text-muted-foreground">
              <tr><th className="p-3">Pedido</th><th className="p-3">Cliente</th>
                <th className="p-3">Itens</th><th className="p-3">Total</th>
                <th className="p-3">Pagamento</th><th className="p-3">Entrega</th><th className="p-3">Pós-venda</th></tr>
            </thead>
            <tbody>{rows.map(order => <tr key={order.id}
              onClick={() => setSelectedId(order.id)} tabIndex={0} role="button"
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(order.id); } }}
              className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40 focus-visible:bg-muted/40">
              <td className="p-3"><strong className="block">#{order.id.slice(0,8).toUpperCase()}</strong>
                <span className="text-xs text-muted-foreground">{timeText(order.created_at)}</span></td>
              <td className="p-3"><strong className="block">{order.buyer?.buyer_name || "Cliente"}</strong>
                <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{order.buyer?.buyer_email || ""}</span></td>
              <td className="p-3">{orderLines(order).reduce((sum,line) => sum + line.quantity,0)} itens</td>
              <td className="p-3 font-bold">{formatCurrency(total(order))}</td>
              <td className="p-3"><span className={"inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold " + paymentColor(order.status)}>{paymentLabels[order.status] || order.status}</span></td>
              <td className="p-3">{order.status === "paid"
                ? <><span className="mr-1 text-[11px] text-muted-foreground">{order.shipping_service_id === "pickup" ? "Retirada" : "Entrega"}</span><DeliveryBadge status={deliveryOf(order)}/></>
                : <span className="text-xs text-muted-foreground">Aguardando pagamento</span>}</td>
              <td className="p-3">{supportCases.some(c=>c.order_id===order.id&&["open","in_review","approved"].includes(c.status))
                ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">Em análise</span>
                : supportCases.some(c=>c.order_id===order.id) ? <span className="text-xs text-muted-foreground">Registrado</span> : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {filtered.length > 10 && <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1,p-1))} aria-label="Página anterior" className="rounded p-1 disabled:opacity-40"><ChevronLeft size={19}/></button>
          {Math.min(page,totalPages)} de {totalPages}
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages,p+1))} aria-label="Próxima página" className="rounded p-1 disabled:opacity-40"><ChevronRight size={19}/></button>
        </div>}
      </div>
    </Section>
    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
      <BtnSecondary onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Atualizar</BtnSecondary>
    </AdminStickyToolbar>

    <AdminDialog open={Boolean(selected)} title={selected ? "Pedido #" + selected.id.slice(0,8).toUpperCase() : "Pedido"}
      description={selected ? "Compra realizada em " + timeText(selected.created_at) : undefined}
      className="max-w-3xl" onClose={() => { if (!saving) setSelectedId(null); }}
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        <BtnSecondary onClick={() => setSelectedId(null)} disabled={saving}>Fechar</BtnSecondary>
        {selected && selectedIsPaid && canManage && nextStatus && <BtnPrimary
          onClick={() => void changeStage()} disabled={saving || (recipientRequired && recipient.trim().length < 3)
            || (issueRequired && note.trim().length < 10)}
          loading={saving} loadingText="Salvando...">{actionLabel}</BtnPrimary>}
      </div>}>
      {selected && <div className="space-y-5 p-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={"inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold " + paymentColor(selected.status)}>
            {paymentLabels[selected.status] || selected.status}
          </span>
          {selectedIsPaid && <DeliveryBadge status={currentStatus}/>}
          {selected.paid_at && <span className="text-xs text-muted-foreground">Pagamento: {timeText(selected.paid_at)}</span>}
        </div>

        {isPickup && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-semibold text-primary">
          Retirada na loja · o cliente poderá buscar o pedido após ser marcado como pronto.
        </div>}
        <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div><h3 className="mb-2 font-bold">Cliente</h3>
            <p>{selected.buyer?.buyer_name}</p>
            <p className="break-all text-muted-foreground">{selected.buyer?.buyer_email}</p>
            <p>{selected.buyer?.buyer_phone}</p>
          </div>
          <div><h3 className="mb-2 font-bold">{isPickup ? "Ponto de retirada" : "Endereço de entrega"}</h3>
            <p>{selected.buyer?.street}, {selected.buyer?.number}{selected.buyer?.complement ? " · " + selected.buyer.complement : ""}</p>
            <p>{selected.buyer?.district}, {selected.buyer?.city}/{selected.buyer?.state}</p>
            <p>CEP {selected.postal_code}</p>
            <p className="mt-1 text-muted-foreground">{selected.shipping_service_name}</p>
          </div>
        </div>

        <StoreAfterSalesStaff key={selected.id} orderId={selected.id} paymentStatus={selected.status}
          canManage={canManage} orderTotal={total(selected)}
          items={orderLines(selected).map(line=>({
            lineKey:line.id===selected.id?"legacy":line.id,
            title:line.product_name,quantity:line.quantity,
          }))}
          onChange={()=>void refresh(true)}/>
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-2 font-bold">Produtos e valores</h3>
          {orderLines(selected).map(line => <div key={line.id} className="flex justify-between gap-4 border-b border-border py-2">
            <span>{line.quantity} × {line.product_name}</span>
            <strong className="shrink-0">{formatCurrency(line.quantity * Number(line.unit_price))}</strong>
          </div>)}
          <div className="mt-3 flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal(selected))}</strong></div>
          <div className="mt-2 flex justify-between"><span>Entrega</span><strong>{formatCurrency(selected.shipping_price)}</strong></div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-extrabold">
            <span>Total</span><span>{formatCurrency(total(selected))}</span>
          </div>
        </div>

        {selectedIsPaid ? <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><Truck size={18} className="text-primary"/> {isPickup ? "Acompanhamento da retirada" : "Acompanhamento da entrega"}</h3>
          <div className={"grid gap-1.5 " + (isPickup ? "grid-cols-4" : "grid-cols-5")} aria-label={"Etapa atual: " + deliveryLabels[currentStatus]}>
            {(isPickup ? (["pending","preparing","ready","picked_up"] as FulfillmentStatus[]) : deliverySequence).map((state,index) => {
              const sequence = isPickup ? (["pending","preparing","ready","picked_up"] as FulfillmentStatus[]) : deliverySequence;
              const position = sequence.indexOf(currentStatus === "delivery_issue" ? "out_for_delivery" : currentStatus);
              const finished = index <= position;
              return <div key={state} className="min-w-0">
                <div className={"h-2 rounded-full " + (finished ? "bg-primary" : "bg-muted")}/>
                <p className={"mt-1.5 break-words text-[10px] leading-tight " + (finished ? "font-bold text-foreground" : "text-muted-foreground")}>
                  {isPickup ? ["Pendente","Separação","Pronto","Retirado"][index] : ["Pendente","Separação","Pronto","Em rota","Entregue"][index]}
                </p>
              </div>;
            })}
          </div>
          {currentStatus === "delivery_issue" && <p className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600">
            <AlertTriangle size={17}/> Há uma ocorrência registrada. Verifique o histórico antes de retomar a entrega.
          </p>}
          {(currentStatus === "delivered" || currentStatus === "picked_up") && <p className="mt-4 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCheck size={16} className="mr-2 inline"/>{isPickup ? "Retirada registrada para" : "Entrega registrada para"} {fulfillmentByOrder.get(selected.id)?.recipient_name || "destinatário"} em {fulfillmentByOrder.get(selected.id)?.delivered_at ? timeText(fulfillmentByOrder.get(selected.id)!.delivered_at!) : "data não informada"}.
          </p>}
          {canManage && currentStatus !== "delivered" && currentStatus !== "picked_up" && <div className="mt-4 space-y-3 border-t border-border pt-4">
            {currentStatus === "out_for_delivery" && <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={actionMode === "advance"} onClick={() => { setActionMode("advance"); setNote(""); }}
                className={"rounded-md border px-3 py-2 text-xs font-bold " + (actionMode === "advance" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                Confirmar entrega
              </button>
              <button type="button" aria-pressed={actionMode === "issue"} onClick={() => { setActionMode("issue"); setRecipient(""); }}
                className={"rounded-md border px-3 py-2 text-xs font-bold " + (actionMode === "issue" ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-border hover:bg-muted")}>
                Registrar ocorrência
              </button>
            </div>}
            {recipientRequired && <label className="block text-xs font-bold">Nome de quem recebeu *
              <input type="text" maxLength={120} value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder="Nome do recebedor" className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"/>
            </label>}
            <label className="block text-xs font-bold">Observação {issueRequired ? "*" : "(opcional)"}
              <textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}
                placeholder={issueRequired ? "Descreva o que aconteceu com a entrega..." : "Adicione alguma informação sobre a movimentação"}
                className="mt-1.5 w-full resize-y rounded-md border border-border bg-background p-3 text-sm"/>
            </label>
            {recipientRequired && <p className="text-[11px] text-muted-foreground">
              A confirmação é registrada manualmente pela equipe, com o nome de quem recebeu. Não equivale a uma assinatura digital.
            </p>}
          </div>}
        </div> : <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <Clock3 size={17} className="mr-2 inline"/>A preparação e a entrega ficam bloqueadas até o pagamento ser confirmado pelo provedor.
          {selected.status === "manual_review" && <strong className="mt-2 block">Este pedido precisa de revisão financeira antes de qualquer envio.</strong>}
        </div>}

        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><ClipboardCheck size={18} className="text-primary"/> Histórico da operação</h3>
          {historyLoading ? <p className="text-xs text-muted-foreground">Carregando histórico...</p>
          : !events.length ? <p className="text-xs text-muted-foreground">Nenhuma movimentação logística registrada neste pedido.</p>
          : <ol className="space-y-4">{events.map(event => <li key={event.id} className="border-l-2 border-primary/40 pl-4">
            <p className="text-[13px] font-bold">{deliveryLabels[event.to_status] || event.to_status}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {timeText(event.created_at)} · {event.actor_name || "Colaborador Artvideo"}
            </p>
            {event.recipient_name && <p className="mt-1 text-xs">Recebido por: {event.recipient_name}</p>}
            {event.note && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{event.note}</p>}
          </li>)}</ol>}
        </div>
      </div>}
    </AdminDialog>
  </div>;
}
