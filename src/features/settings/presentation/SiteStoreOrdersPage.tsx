import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCheck, ClipboardCheck,
  HelpCircle, MapPin, PackageCheck, RotateCcw, ShoppingBag, Truck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section,
} from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel, AdminSearchClearButton, AdminSearchTextField } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminFieldLabel, AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { StoreAfterSalesStaff } from "./StoreAfterSalesStaff";

type StoreOrder = {
  id: string; order_number: number; inventory_item_id: string | null; created_at: string; status: string; quantity: number;
  product_name: string; unit_price: number; shipping_price: number;
  shipping_service_name: string; shipping_service_id: string; postal_code: string;
  buyer: Record<string, string>; preference_id: string | null;
  payment_id: string | null; payment_provider: string | null; paid_at: string | null; expires_at: string;
  payment_issue_status: "refunded"|"charged_back"|null; payment_issue_at:string|null;
};
type StoreOrderLine = {
  id: string; order_id: string; product_name: string; quantity: number; unit_price: number; inventory_item_id: string | null;
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
const pickupSequence = ["pending", "preparing", "ready", "picked_up"] as const;
type PickupStep = typeof pickupSequence[number];
const pickupProgressTones: Record<PickupStep,{ bar:string; text:string }> = {
  pending: {
    bar:"bg-amber-500 dark:bg-amber-400",
    text:"text-amber-700 dark:text-amber-300",
  },
  preparing: {
    bar:"bg-sky-500 dark:bg-sky-400",
    text:"text-sky-700 dark:text-sky-300",
  },
  ready: {
    bar:"bg-violet-500 dark:bg-violet-400",
    text:"text-violet-700 dark:text-violet-300",
  },
  picked_up: {
    bar:"bg-emerald-500 dark:bg-emerald-400",
    text:"text-emerald-700 dark:text-emerald-300",
  },
};
const nextActions: Partial<Record<FulfillmentStatus, { status: FulfillmentStatus; label: string }>> = {
  pending: { status: "preparing", label: "Iniciar separação" },
  preparing: { status: "ready", label: "Pronto para entrega" },
  ready: { status: "out_for_delivery", label: "Saiu para entrega" },
  out_for_delivery: { status: "delivered", label: "Confirmar entrega" },
  delivery_issue: { status: "out_for_delivery", label: "Retomar entrega" },
};
const timeText = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const orderCode = (order: StoreOrder) => "PED-" + String(order.order_number);
const formatZip = (raw?: string | null) => {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 8 ? digits.slice(0, 5) + "-" + digits.slice(5) : (raw || "Não informado");
};
const formatPhone = (raw?: string | null) => {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length === 11) return "+55 (" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
  if (digits.length === 10) return "+55 (" + digits.slice(0, 2) + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
  return raw || "Não informado";
};
type StockAddress = { name: string | null; sku: string | null;
  storage_shelf: string | null; storage_level: string | null; storage_compartment: string | null };

function paymentColor(status: string) {
  if (status === "paid") return STATUS_TONE_CLASSES.success.badge;
  if (["cancelled", "expired"].includes(status)) return STATUS_TONE_CLASSES.danger.badge;
  return status === "manual_review" ? STATUS_TONE_CLASSES.review.badge
    : status === "creating" ? STATUS_TONE_CLASSES.progress.badge
    : status === "awaiting_payment" ? STATUS_TONE_CLASSES.waiting.badge
    : STATUS_TONE_CLASSES.pending.badge;
}
function fulfillmentColor(status: FulfillmentStatus) {
  if (status === "delivered" || status === "picked_up") return STATUS_TONE_CLASSES.success.badge;
  if (status === "delivery_issue") return STATUS_TONE_CLASSES.danger.badge;
  return status === "pending" ? STATUS_TONE_CLASSES.pending.badge
    : status === "preparing" || status === "out_for_delivery" ? STATUS_TONE_CLASSES.progress.badge
    : STATUS_TONE_CLASSES.waiting.badge;
}
function DeliveryBadge({ status }: { status: FulfillmentStatus }) {
  return <span className={"inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold " + fulfillmentColor(status)}>
    {deliveryLabels[status]}
  </span>;
}

export function SiteStoreOrdersPage({ onBack, embedded = false }: { onBack: () => void; embedded?: boolean }) {
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [supportFilter,setSupportFilter]=useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalView, setModalView] = useState<"order" | "afterSales">("order");
  const [pickupHelp, setPickupHelp] = useState(false);
  const [stockLine, setStockLine] = useState<StoreOrderLine | null>(null);
  const [stockAddress, setStockAddress] = useState<StockAddress | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [pickupCode, setPickupCode] = useState("");
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
        .select("id,order_number,created_at,status,payment_issue_status,payment_issue_at,quantity,inventory_item_id,product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,postal_code,buyer,preference_id,payment_id,payment_provider,paid_at,expires_at")
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("artvideo_store_order_items")
        .select("id,order_id,inventory_item_id,product_name,quantity,unit_price")
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
  // A confirmação do pagamento chega pelo webhook/conciliador e atualiza a
  // linha no banco. Realtime avisa este painel, sem simular aprovação no cliente.
  useEffect(() => {
    if (!activeOrganization?.id) return;
    const channel = supabase.channel("artvideo-store-orders-" + activeOrganization.id)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "artvideo_store_orders",
        filter: "organization_id=eq." + activeOrganization.id,
      }, () => { if (!document.hidden) void refresh(true); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeOrganization?.id, refresh]);
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void refresh(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  useEffect(() => { dialogBodyRef.current?.scrollTo(0, 0); }, [modalView]);
  useEffect(() => {
    if (!selectedId) { setModalView("order"); setPickupHelp(false); setStockLine(null); }
  }, [selectedId]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 60000);
    return () => window.clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    setActionMode("advance"); setNote(""); setRecipient(""); setPickupCode("");
    void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const orderLines = (order: StoreOrder) => {
    const found = lines.filter(line => line.order_id === order.id);
    return found.length ? found : [{
      id: order.id, order_id: order.id, product_name: order.product_name,
      quantity: order.quantity, unit_price: order.unit_price, inventory_item_id: order.inventory_item_id,
    }];
  };
  const openStockAddress = async (line: StoreOrderLine) => {
    setStockLine(line);
    setStockAddress(null);
    setStockError("");
    if (!line.inventory_item_id || !activeOrganization?.id) return;
    setStockLoading(true);
    const { data, error: lookupError } = await supabase.from("inventory_items")
      .select("name,sku,storage_shelf,storage_level,storage_compartment")
      .eq("id", line.inventory_item_id)
      .eq("organization_id", activeOrganization.id)
      .maybeSingle();
    if (lookupError) setStockError(systemErrorMessage(lookupError));
    else setStockAddress(data as StockAddress | null);
    setStockLoading(false);
  };
  const subtotal = (order: StoreOrder) => orderLines(order)
    .reduce((sum, line) => sum + line.quantity * Number(line.unit_price), 0);
  // Retirada na loja não tem cobrança de frete. O valor de entrega chega do banco;
  // campo ausente/nulo não pode transformar o total em NaN.
  const deliveryCost = (order: StoreOrder) => order.shipping_service_id === "pickup"
    ? 0 : Number(order.shipping_price ?? 0);
  const total = (order: StoreOrder) => subtotal(order) + deliveryCost(order);
  const deliveryOf = (order: StoreOrder) => fulfillmentByOrder.get(order.id)?.status || "pending";

  const filtered = useMemo(() => orders.filter(order => {
    if (paymentFilter !== "all" && order.status !== paymentFilter) return false;
    if (supportFilter==="active" && !supportCases.some(c=>c.order_id===order.id&&["open","in_review","approved"].includes(c.status))) return false;
    if (supportFilter==="none" && supportCases.some(c=>c.order_id===order.id)) return false;
    if (deliveryFilter === "unpaid" && order.status === "paid") return false;
    if (deliveryFilter !== "all" && deliveryFilter !== "unpaid"
      && (order.status !== "paid" || deliveryOf(order) !== deliveryFilter)) return false;
    const customer = customerSearch.trim().toLocaleLowerCase("pt-BR");
    const orderNeedle = orderSearch.trim().toLocaleLowerCase("pt-BR");
    const product = productSearch.trim().toLocaleLowerCase("pt-BR");
    const customerMatches = !customer || [
      order.buyer?.buyer_name, order.buyer?.buyer_email, order.buyer?.buyer_phone,
    ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(customer));
    const orderMatches = !orderNeedle || [order.id, orderCode(order), String(order.order_number)]
      .some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(orderNeedle));
    const productMatches = !product || [
      order.product_name, ...lines.filter(line => line.order_id === order.id).map(line => line.product_name),
    ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(product));
    return customerMatches && orderMatches && productMatches;
  }), [orders, lines, paymentFilter, deliveryFilter, supportFilter, supportCases,
    customerSearch, orderSearch, productSearch, fulfillmentByOrder]);
  const hasActiveFilters = Boolean(customerSearch.trim() || orderSearch.trim() || productSearch.trim()
    || paymentFilter !== "all" || deliveryFilter !== "all" || supportFilter !== "all");
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const changeStage = async () => {
    if (!canManage || saving || !selected || !selectedIsPaid || !nextStatus) return;
    if (recipientRequired && recipient.trim().length < 3) {
      setToast({ msg: "Informe o nome de quem recebeu o pedido.", type: "error" }); return;
    }
    if (issueRequired && note.trim().length < 10) {
      setToast({ msg: "Descreva a ocorrência com pelo menos 10 caracteres.", type: "error" }); return;
    }
    if (nextStatus === "picked_up" && !/^\d{4}$/.test(pickupCode)) {
      setToast({ msg: "Informe o código de 4 dígitos apresentado pelo cliente.", type: "error" }); return;
    }
    setSaving(true);
    const result = nextStatus === "picked_up"
      ? await supabase.rpc("artvideo_store_confirm_pickup_v1", {
          p_order_id: selected.id, p_recipient_name: recipient.trim(),
          p_pickup_code: pickupCode,
        })
      : await supabase.rpc("artvideo_store_advance_fulfillment_v1", {
          p_order_id: selected.id, p_next_status: nextStatus,
          p_note: note.trim() || null, p_recipient_name: recipient.trim() || null,
        });
    if (result.error || (result.data && typeof result.data === "object" && "error" in result.data)) {
      setToast({ msg: result.error ? systemErrorMessage(result.error) : String((result.data as {error:string}).error), type: "error" });
    } else {
      setToast({ msg: "Etapa da entrega atualizada.", type: "success" });
      setNote(""); setRecipient(""); setPickupCode(""); setActionMode("advance");
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
    {!embedded && <PageHeader title="Pedidos da Loja"
      subtitle="Acompanhe pagamentos, separação de produtos e entregas da Artvideo."/>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[
        { label: "Aguardando separação", value: waiting, Icon: ShoppingBag,
          tone: "border-amber-200 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/20",
          iconTone: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
        { label: "Em preparação", value: preparing, Icon: PackageCheck,
          tone: "border-sky-200 bg-sky-50/70 dark:border-sky-800/60 dark:bg-sky-950/20",
          iconTone: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" },
        { label: "Em entrega", value: delivering, Icon: Truck,
          tone: "border-violet-200 bg-violet-50/70 dark:border-violet-800/60 dark:bg-violet-950/20",
          iconTone: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" },
        { label: "Concluídos", value: completed, Icon: CheckCheck,
          tone: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800/60 dark:bg-emerald-950/20",
          iconTone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        { label: "Pós-venda", value: postSaleCount, Icon: RotateCcw,
          tone: "border-rose-200 bg-rose-50/70 dark:border-rose-800/60 dark:bg-rose-950/20",
          iconTone: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" },
      ].map(card => <div key={card.label} className={`flex min-w-0 items-center gap-3 rounded-lg border p-4 ${card.tone}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconTone}`}>
          <card.Icon size={20}/>
        </span>
        <div className="min-w-0"><p className="text-[11px] leading-4 text-muted-foreground">{card.label}</p>
          <strong className="block text-2xl text-foreground">{card.value}</strong>
        </div>
      </div>)}
    </div>

    <AdminSearchPanel title="Buscar pedidos" headerActions={
      hasActiveFilters ? <AdminSearchClearButton onClick={() => {
        setCustomerSearch(""); setOrderSearch(""); setProductSearch("");
        setPaymentFilter("all"); setDeliveryFilter("all"); setSupportFilter("all"); setPage(1);
      }} /> : undefined
    }>
      <div className="grid min-w-0 grid-cols-1 items-end gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminSearchTextField label="Cliente" value={customerSearch}
          onChange={value => { setCustomerSearch(value); setPage(1); }}
          placeholder="Nome, e-mail ou telefone" />
        <AdminSearchTextField label="Pedido" value={orderSearch}
          onChange={value => { setOrderSearch(value); setPage(1); }}
          placeholder="Número do pedido" />
        <AdminSearchTextField label="Produto" value={productSearch}
          onChange={value => { setProductSearch(value); setPage(1); }}
          placeholder="Nome do produto" />
        <div className="min-w-0">
          <AdminFieldLabel label="Pagamento" />
          <AdminSelect className="w-full min-w-0" ariaLabel="Filtrar pagamento"
            value={paymentFilter} onValueChange={value => { setPaymentFilter(value); setPage(1); }}
            options={[{ value: "all", label: "Todos os pagamentos" },
              ...Object.entries(paymentLabels).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div className="min-w-0">
          <AdminFieldLabel label="Entrega" />
          <AdminSelect className="w-full min-w-0" ariaLabel="Filtrar entrega"
            value={deliveryFilter} onValueChange={value => { setDeliveryFilter(value); setPage(1); }}
            options={[{ value: "all", label: "Todas as entregas" },
              { value: "unpaid", label: "Sem pagamento confirmado" },
              ...Object.entries(deliveryLabels).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div className="min-w-0">
          <AdminFieldLabel label="Pós-venda" />
          <AdminSelect className="w-full min-w-0" ariaLabel="Filtrar pós-venda"
            value={supportFilter} onValueChange={value => { setSupportFilter(value); setPage(1); }}
            options={[{ value: "all", label: "Todo pós-venda" },
              { value: "active", label: "Com solicitação ativa" },
              { value: "none", label: "Sem solicitações" }]} />
        </div>
      </div>
    </AdminSearchPanel>
    <AdminCard className="[&_th]:md:py-2 [&_td]:md:py-2.5">
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-md border border-red-500/20 p-4 text-sm text-red-600">
          Falha ao carregar os pedidos: {error}
          <button type="button" onClick={() => void refresh()} className="ml-2 font-bold underline">Tentar novamente</button>
        </div>}
        {loading && !orders.length ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando pedidos...</p>
        : !rows.length ? <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <ShoppingBag size={29} className="mx-auto mb-3"/>
          {orders.length ? "Nenhum pedido encontrado neste filtro." : "Nenhum pedido registrado."}
        </div>
        : <div className="overflow-x-auto">
          <table className="min-w-[830px]">
            <thead>
              <tr><th scope="col" className="p-3 text-left">Pedido</th><th scope="col" className="p-3 text-left">Cliente</th>
                <th scope="col" className="p-3 text-left">Itens</th><th scope="col" className="p-3 text-left">Total</th>
                <th scope="col" className="p-3 text-left">Pagamento</th><th scope="col" className="p-3 text-left">Situação</th><th scope="col" className="p-3 text-left">Pós-venda</th></tr>
            </thead>
            <tbody>{rows.map(order => <tr key={order.id}
              onClick={() => setSelectedId(order.id)} tabIndex={0} role="button"
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(order.id); } }}
              className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40">
              <td className="p-3"><strong className="block">{orderCode(order)}</strong>
                <span className="text-xs text-muted-foreground">{timeText(order.created_at)}</span></td>
              <td className="p-3"><strong className="block">{order.buyer?.buyer_name || "Cliente"}</strong>
                <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{order.buyer?.buyer_email || ""}</span></td>
              <td className="p-3">{orderLines(order).reduce((sum,line) => sum + line.quantity,0)} itens</td>
              <td className="p-3 font-bold">{formatCurrency(total(order))}</td>
              <td className="p-3"><span className={"inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold " + paymentColor(order.status)}>{order.payment_issue_status==="refunded"?"Estornado · revisar":
                  order.payment_issue_status==="charged_back"?"Contestado · revisar":
                  paymentLabels[order.status] || order.status}</span></td>
              <td className="p-3">{order.status === "paid"
                ? <DeliveryBadge status={deliveryOf(order)}/>
                : <span className="text-xs text-muted-foreground">Aguardando pagamento</span>}</td>
              <td className="p-3">{supportCases.some(c=>c.order_id===order.id&&["open","in_review","approved"].includes(c.status))
                ? <span className={`rounded-full border px-2 py-1 text-xs font-bold ${STATUS_TONE_CLASSES.review.badge}`}>Em análise</span>
                : supportCases.some(c=>c.order_id===order.id) ? <span className="text-xs text-muted-foreground">Registrado</span> : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <PaginationBar showFilteredTotal={hasActiveFilters} page={safePage} pageSize={pageSize}
          totalItems={filtered.length} onPageChange={setPage}
          onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </div>
    </AdminCard>
    {!embedded && <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
    </AdminStickyToolbar>}

    <AdminDialog open={Boolean(selected)} title={selected ? (modalView === "afterSales" ? "Pós-venda · " : "Pedido ") + orderCode(selected) : "Pedido"}
      description={selected ? "Compra realizada em " + timeText(selected.created_at) : undefined}
      className={modalView === "afterSales"
        ? "h-auto max-h-[calc(100dvh-1.5rem)] max-w-3xl"
        : "h-[min(820px,calc(100dvh-1.5rem))] max-w-4xl"}
      bodyClassName={modalView === "afterSales" ? "flex-none overscroll-contain" : "overscroll-contain"}
      bodyRef={dialogBodyRef} onClose={() => { if (!saving) setSelectedId(null); }}
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        {modalView === "afterSales" && <BtnSecondary onClick={() => setModalView("order")}>Voltar ao pedido</BtnSecondary>}
        {modalView === "order" && <BtnSecondary onClick={() => setSelectedId(null)} disabled={saving}>Fechar</BtnSecondary>}
        {modalView === "order" && selected && <BtnPrimary onClick={() => { setPickupHelp(false); setModalView("afterSales"); }}>
          <RotateCcw size={15}/> Pós-venda
        </BtnPrimary>}
        {modalView === "order" && selected && selectedIsPaid && canManage && nextStatus && <BtnPrimary
          onClick={() => void changeStage()} disabled={saving || (recipientRequired && recipient.trim().length < 3)
            || (issueRequired && note.trim().length < 10)
            || (nextStatus === "picked_up" && !/^\d{4}$/.test(pickupCode))}
          loading={saving} loadingText="Salvando...">{actionLabel}</BtnPrimary>}
      </div>}>
      {selected && (modalView === "afterSales"
        ? <div key={"after-sales-" + selected.id} className="animate-in fade-in slide-in-from-right-3 duration-200 motion-reduce:animate-none">
          <StoreAfterSalesStaff orderId={selected.id} paymentStatus={selected.status}
            canManage={canManage} orderTotal={total(selected)} standalone
            items={orderLines(selected).map(line => ({
              lineKey: line.id === selected.id ? "legacy" : line.id,
              title: line.product_name, quantity: line.quantity,
            }))}
            onChange={() => void refresh(true)} />
        </div>
        : <div key={"order-" + selected.id} className="space-y-5 p-1 text-sm animate-in fade-in slide-in-from-left-3 duration-200 motion-reduce:animate-none">

        <div className="flex flex-wrap items-center gap-2">
          <span className={"inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold " + paymentColor(selected.status)}>
            {paymentLabels[selected.status] || selected.status}
          </span>
          {selectedIsPaid && <DeliveryBadge status={currentStatus}/>}
          {selected.paid_at && <span className="text-xs text-muted-foreground">Pagamento: {timeText(selected.paid_at)}</span>}

        </div>


        <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div><h3 className="mb-2 font-bold">Cliente</h3>
            <p>{selected.buyer?.buyer_name}</p>
            <p className="break-all text-muted-foreground">{selected.buyer?.buyer_email}</p>
            <p>{formatPhone(selected.buyer?.buyer_phone)}</p>
          </div>
          <div><h3 className="mb-2 flex items-center gap-2 font-bold">
              {isPickup ? "Ponto de retirada" : "Endereço de entrega"}
              {isPickup && <span className="relative inline-flex">
                <button type="button" aria-label="Ajuda sobre retirada na loja" aria-expanded={pickupHelp}
                  onClick={() => setPickupHelp(open => !open)}
                  className="rounded-full text-primary hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-primary">
                  <HelpCircle size={17}/>
                </button>
                {pickupHelp && <span role="tooltip" className="absolute right-0 top-7 z-10 w-64 rounded-lg border border-border bg-popover p-3 text-xs font-normal leading-5 text-popover-foreground shadow-lg sm:right-auto sm:left-0">
                  Retirada na loja: o cliente poderá buscar o pedido depois que a equipe marcar como pronto.
                </span>}
              </span>}
            </h3>
            <p>{selected.buyer?.street}, {selected.buyer?.number}{selected.buyer?.complement ? " · " + selected.buyer.complement : ""}</p>
            <p>{selected.buyer?.district}, {selected.buyer?.city}/{selected.buyer?.state}</p>
            <p>CEP {formatZip(selected.postal_code)}</p>
            <p className="mt-1 text-muted-foreground">{selected.shipping_service_name}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-2 font-bold">Produtos e valores</h3>
          {orderLines(selected).map(line => <div key={line.id} className="flex justify-between gap-4 border-b border-border py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0">{line.quantity} × {line.product_name}</span>
              <button type="button" title="Localização no estoque" aria-label={"Localização de " + line.product_name + " no estoque"}
                onClick={() => void openStockAddress(line)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
                <MapPin size={16}/>
              </button>
            </span>
            <strong className="shrink-0 text-right">{formatCurrency(line.quantity * Number(line.unit_price))}</strong>
          </div>)}
          <div className="mt-3 flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal(selected))}</strong></div>
          {!isPickup && <div className="mt-2 flex justify-between">
            <span>Entrega</span><strong>{formatCurrency(deliveryCost(selected))}</strong>
          </div>}
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-extrabold">
            <span>Total</span><span>{formatCurrency(total(selected))}</span>
          </div>
        </div>

        {selectedIsPaid ? <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><Truck size={18} className="text-primary"/> {isPickup ? "Acompanhamento da retirada" : "Acompanhamento da entrega"}</h3>
          <div className={"grid gap-1.5 " + (isPickup ? "grid-cols-4" : "grid-cols-5")} aria-label={"Etapa atual: " + deliveryLabels[currentStatus]}>
            {(isPickup ? pickupSequence : deliverySequence).map((state,index) => {
              const sequence:readonly FulfillmentStatus[] = isPickup ? pickupSequence : deliverySequence;
              const position = sequence.indexOf(currentStatus === "delivery_issue" ? "out_for_delivery" : currentStatus);
              const complete = isPickup
                ? index < position || (index === position && currentStatus === "picked_up")
                : index <= position;
              const active = isPickup && index === position && !complete;
              const reached = complete || active;
              const tone = isPickup ? pickupProgressTones[state as PickupStep] : null;
              return <div key={state} className="min-w-0" aria-current={active ? "step" : undefined}>
                <div className={"relative overflow-hidden rounded-full " + (isPickup ? "h-2.5 " : "h-2 ") +
                  (reached ? tone?.bar || "bg-primary" : "bg-muted") +
                  (isPickup && active ? " art-fulfillment-bar-active" : isPickup && complete ? " art-fulfillment-bar-done" : "")}
                  aria-hidden="true"/>
                <p className={"mt-1.5 break-words text-[10px] leading-tight " +
                  (reached ? "font-bold " + (tone?.text || "text-foreground") : "text-muted-foreground")}>
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
            {nextStatus === "picked_up" && <label className="block text-xs font-bold">Código de retirada (4 dígitos) *
              <input type="text" inputMode="numeric" autoComplete="off"
                maxLength={4} value={pickupCode}
                onChange={e => setPickupCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000" aria-label="Código de retirada"
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-center text-lg font-bold tracking-[0.35em]"/>
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                Peça ao cliente os quatro dígitos exibidos no acompanhamento do pedido.
              </span>
            </label>}
            {nextStatus !== "picked_up" && <label className="block text-xs font-bold">Observação {issueRequired ? "*" : "(opcional)"}
              <textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}
                placeholder={issueRequired ? "Descreva o que aconteceu com a entrega..." : "Adicione alguma informação sobre a movimentação"}
                className="mt-1.5 w-full resize-y rounded-md border border-border bg-background p-3 text-sm"/>
            </label>}
            {recipientRequired && <p className="text-[11px] text-muted-foreground">
              A confirmação é registrada manualmente pela equipe, com o nome de quem recebeu. Não equivale a uma assinatura digital.
            </p>}
          </div>}
        </div> : selected.status === "manual_review" ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs font-semibold leading-5 text-amber-700 dark:text-amber-300">
          Este pedido precisa de revisão financeira antes de qualquer envio.
        </div> : null}

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
      </div>)}
    </AdminDialog>
    <AdminDialog open={Boolean(stockLine)} title="Localização no estoque"
      description={stockLine?.product_name} className="max-w-md"
      onClose={() => setStockLine(null)}
      footer={<div className="flex justify-end"><BtnSecondary onClick={() => setStockLine(null)}>Fechar</BtnSecondary></div>}>
      {stockLoading ? <p className="text-sm text-muted-foreground">Consultando localização...</p>
      : stockError ? <p role="alert" className="text-sm text-destructive">{stockError}</p>
      : stockAddress && (stockAddress.storage_shelf || stockAddress.storage_level || stockAddress.storage_compartment)
        ? <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Endereço cadastrado para este item no estoque:</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ["Prateleira", stockAddress.storage_shelf],
                ["Nível", stockAddress.storage_level],
                ["Compartimento", stockAddress.storage_compartment],
              ] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <strong className="mt-1 block break-words">{value || "—"}</strong>
              </div>)}
            </div>
          </div>
        : <p className="text-sm text-muted-foreground">Este produto não possui uma localização de estoque cadastrada.</p>}
    </AdminDialog>
  </div>;
}
