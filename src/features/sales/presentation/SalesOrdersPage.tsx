import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CreditCard, Plus, ShoppingBag, Wallet, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { AdminSearchPanel, AdminSearchTextField, AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminFieldLabel, AdminSelect, FInput } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, EmptyState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { listSalesOrders, type SalesOrderFilters, type SalesOrderListRow } from "../infrastructure/sales-orders.repository";
import { SalesOrderDetailDialog } from "./SalesOrderDetailDialog";
import {
  formatSalesDate, formatSalesDueDate, orderFulfillmentLabels, orderPaymentLabels,
  orderStatusLabels,
} from "../domain/sales-order-display";

function FilterSelect({
  label,value,onChange,options,
}: {
  label: string;value: string;onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return <div className="min-w-0">
    <AdminFieldLabel label={label}/>
    <AdminSelect value={value} onValueChange={onChange} options={options} ariaLabel={label}
      className="h-[42px] md:h-9 md:min-h-9 md:py-1.5 md:text-xs"/>
  </div>;
}

function StatusPill({ text, tone = "neutral" }: {
  text: string;
  tone?: "neutral" | "warning" | "success" | "blue" | "danger";
}) {
  const styles = {
    neutral: "border-border bg-muted/35 text-muted-foreground",
    warning: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    blue: "border-primary/20 bg-primary/10 text-primary",
    danger: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  };
  return <span className={"inline-flex w-fit rounded-full border px-2 py-1 text-[10px] font-semibold " + styles[tone]}>
    {text}
  </span>;
}

function OrderStatuses({ order }: { order: SalesOrderListRow }) {
  return <div className="flex min-w-0 flex-wrap gap-1.5">
    <StatusPill text={orderStatusLabels[order.status]} tone={order.status === "cancelled" ? "danger" : "blue"}/>
    <StatusPill text={orderPaymentLabels[order.payment_status]}
      tone={order.payment_status === "paid" ? "success"
        : order.payment_status === "cancelled" ? "danger" : "warning"}/>
    {order.status !== "cancelled" && <StatusPill text={orderFulfillmentLabels[order.fulfillment_status]}
      tone={order.fulfillment_status === "delivered" ? "success"
        : order.fulfillment_status === "pending" ? "neutral" : "blue"}/>}
  </div>;
}

export function SalesOrdersPage({ onNewSale }: { onNewSale: () => void }) {
  const { activeOrganizationId,hasPermission } = useAuth();
  const organizationId=activeOrganizationId || "";
  const queryClient=useQueryClient();
  const canView=hasPermission("sales.view");
  const [search,setSearch]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [status,setStatus]=useState<SalesOrderFilters["status"]>("all");
  const [payment,setPayment]=useState<SalesOrderFilters["payment"]>("all");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState<"newest"|"oldest"|"highest"|"lowest">("newest");
  const [pageSize,setPageSize]=useState(15);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);

  useEffect(() => {
    const id=window.setTimeout(() => setDebouncedSearch(search),300);
    return () => window.clearTimeout(id);
  },[search]);

  const filters=useMemo(() => ({
    search:debouncedSearch.trim(),status:status||"all",payment:payment||"all",
    from,to,page,pageSize,
  } satisfies SalesOrderFilters),[debouncedSearch,status,payment,from,to,page,pageSize]);

  const badPeriod=Boolean(from && to && from>to);
  const ordersQuery=useQuery({
    queryKey:["sales",organizationId,"orders",filters],
    queryFn:()=>listSalesOrders(organizationId,filters),
    enabled:Boolean(organizationId && canView && !badPeriod),
    staleTime:15_000,
    refetchOnWindowFocus:true,
    refetchInterval:20_000, // segurança caso o status financeiro não dispare evento no pedido
  });
  // A ordenação alternativa se aplica somente aos itens da página carregada.
  useEffect(()=>{
    if(!organizationId||!canView)return;
    const channel=supabase.channel("sales-orders-live:"+organizationId)
      .on("postgres_changes",{
        event:"*",schema:"public",table:"sales_orders",
        filter:"organization_id=eq."+organizationId,
      },()=>{
        void queryClient.invalidateQueries({queryKey:["sales",organizationId,"orders"]});
        void queryClient.invalidateQueries({queryKey:["sales",organizationId,"order"]});
      })
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[organizationId,canView,queryClient]);

  const orders=useMemo(()=>{
    const list=[...(ordersQuery.data?.items||[])];
    return list.sort((a,b)=>{
      if(sort==="highest")return Number(b.total_amount)-Number(a.total_amount);
      if(sort==="lowest")return Number(a.total_amount)-Number(b.total_amount);
      const delta=new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
      return sort==="oldest"?-delta:delta;
    });
  },[ordersQuery.data?.items,sort]);
  const data=ordersQuery.data;

  const clearFilters=()=>{
    setSearch("");setStatus("all");setPayment("all");setFrom("");setTo("");setPage(1);setSort("newest");
  };
  const setFilter=<T,>(setter:(v:T)=>void,value:T)=>{setter(value);setPage(1);};
  const metrics=[
    {label:"Pedidos encontrados",value:String(data?.total ?? "—"),icon:ClipboardList},
    {label:"Pagamentos pendentes",value:String(data?.pending ?? "—"),icon:CreditCard},
    {label:"Total em aberto",value:data?formatCurrency(data.open_total):"—",icon:Wallet},
  ];

  return <div className="min-w-0 space-y-4 pb-6">
    {toast && <Toast type="success" message={toast} onClose={()=>setToast(null)}/>}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-foreground">Pedidos comerciais</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Acompanhe vendas, pagamentos no Financeiro, separação e entregas.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasPermission("sales.create") && <AdminButton size="sm" onClick={onNewSale}>
          <Plus size={16}/> Nova venda
        </AdminButton>}
      </div>
    </div>

    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
      {metrics.map(metric=><AdminCard key={metric.label} className="px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <metric.icon size={15}/><span>{metric.label}</span>
        </div>
        <p className="mt-2 break-words text-xl font-bold tabular-nums text-foreground">{metric.value}</p>
      </AdminCard>)}
    </div>

    <AdminSearchPanel title="Buscar pedidos"
      headerActions={<>
        {(search||status!=="all"||payment!=="all"||from||to||sort!=="newest")
          && <AdminSearchClearButton onClick={clearFilters}/>}
        <AdminSearchSortMenu label="Ordenar pedidos nesta página" value={sort}
          onChange={setSort} options={[
            {value:"newest",label:"Mais recentes"},
            {value:"oldest",label:"Mais antigos"},
            {value:"highest",label:"Maior valor"},
            {value:"lowest",label:"Menor valor"},
          ]}/>
      </>}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AdminSearchTextField label="Pedido, cliente, produto ou SKU"
          value={search} onChange={value=>setFilter(setSearch,value)}
          placeholder="Buscar pedidos..."/>
        <FilterSelect label="Situação comercial" value={status||"all"}
          onChange={value=>setFilter(setStatus,value as SalesOrderFilters["status"])}
          options={[
            {value:"all",label:"Todas"},
            {value:"confirmed",label:"Confirmados"},
            {value:"cancelled",label:"Cancelados"},
          ]}/>
        <FilterSelect label="Pagamento" value={payment||"all"}
          onChange={value=>setFilter(setPayment,value as SalesOrderFilters["payment"])}
          options={[
            {value:"all",label:"Todos"},
            {value:"pending",label:"Pendente"},
            {value:"partial",label:"Parcial"},
            {value:"paid",label:"Recebido"},
            {value:"cancelled",label:"Cancelado"},
          ]}/>
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 xl:col-span-2">
          <FInput label="Data inicial" type="date" value={from}
            onChange={(event:React.ChangeEvent<HTMLInputElement>)=>setFilter(setFrom,event.target.value)}
            className="h-[42px] md:h-9 md:py-1.5 md:text-xs"/>
          <FInput label="Data final" type="date" value={to}
            onChange={(event:React.ChangeEvent<HTMLInputElement>)=>setFilter(setTo,event.target.value)}
            className="h-[42px] md:h-9 md:py-1.5 md:text-xs"/>
        </div>
      </div>
      {badPeriod && <p role="alert" className="mt-3 text-xs text-destructive">
        A data inicial não pode ser posterior à data final.
      </p>}
    </AdminSearchPanel>

    {!canView ? <EmptyState icon={ClipboardList} title="Sem permissão para visualizar pedidos"
      message="Solicite acesso ao módulo Vendas."/>
      : badPeriod ? null
      : ordersQuery.isPending ? <LoadingState text="Carregando pedidos comerciais..."/>
      : ordersQuery.isError ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/20 bg-card p-5">
        <p className="text-sm text-destructive">{systemErrorMessage(ordersQuery.error,"Falha ao carregar pedidos.")}</p>
        <AdminButton variant="secondary" size="sm" onClick={()=>void ordersQuery.refetch()}>Tentar novamente</AdminButton>
      </div>
      : orders.length===0 ? <EmptyState icon={ShoppingBag} title="Nenhum pedido encontrado"
        message={data?.total===0 && !debouncedSearch && status==="all" && payment==="all" && !from && !to
          ? "As vendas confirmadas pela Vitrine aparecerão aqui." : "Tente alterar os filtros da busca."}/>
      :<AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
        <div className="divide-y divide-border md:hidden">
          {orders.map(order=><button type="button" key={order.id}
            onClick={()=>setSelectedId(order.id)}
            aria-label={"Ver pedido comercial "+order.order_number}
            className="flex w-full min-w-0 items-start gap-3 p-3.5 text-left outline-none hover:bg-muted/25 focus-visible:bg-primary/10">
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">Pedido #{order.order_number}</span>
                <strong className="text-sm tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(order.total_amount)}</strong>
              </div>
              <p className="truncate text-sm font-medium text-foreground">
                {order.customer_name_snapshot||"Consumidor não identificado"}
              </p>
              <OrderStatuses order={order}/>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatSalesDate(order.created_at)}</span>
                {order.open_amount>0&&order.status!=="cancelled"
                  ?<span className="font-semibold text-orange-700 dark:text-orange-300">
                    {formatCurrency(order.open_amount)} em aberto
                  </span>
                  :order.status!=="cancelled"&&order.payment_status==="paid"
                  ?<span className="font-semibold text-emerald-700 dark:text-emerald-300">Recebido</span>
                  :null}
              </div>
            </div>
            <ChevronRight size={18} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true"/>
          </button>)}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <TopTableScrollbar/>
          <table className="min-w-[840px]">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">Pedido</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Situações</th>
                <th className="px-4 py-3 text-left">Criado em</th>
                <th className="px-4 py-3 text-left">Vencimento</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map(order=><tr key={order.id}
                onClick={()=>setSelectedId(order.id)}
                onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedId(order.id);}}}
                tabIndex={0} role="button" aria-label={"Ver pedido comercial " + order.order_number}
                className="cursor-pointer outline-none transition-colors hover:bg-muted/25 focus-visible:bg-primary/10">
                <td className="px-4 py-3 align-top">
                  <p className="font-bold text-foreground">#{order.order_number}</p>
                  <p className="mt-1 max-w-36 truncate text-[11px] text-muted-foreground">{order.seller_name}</p>
                </td>
                <td className="max-w-52 px-4 py-3 align-top">
                  <p className="truncate font-semibold text-foreground">{order.customer_name_snapshot || "Consumidor não identificado"}</p>
                </td>
                <td className="px-4 py-3 align-top"><OrderStatuses order={order}/></td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">{formatSalesDate(order.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">{formatSalesDueDate(order.due_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                  <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(order.total_amount)}</strong>
                  {order.status!=="cancelled" && order.open_amount>0 && <p className="mt-1 text-[11px] text-orange-700 dark:text-orange-300">
                    {formatCurrency(order.open_amount)} em aberto
                  </p>}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} totalItems={data?.total||0}
          pageSizeOptions={[10,15,25,50]} defaultPageSize={15}
          storageKey="union-sales-order-page-size"
          showFilteredTotal
          onPageChange={setPage}
          onPageSizeChange={size=>{setPageSize(size);setPage(1);}}/>
      </AdminCard>}

    {selectedId && <SalesOrderDetailDialog
      organizationId={organizationId}
      orderId={selectedId}
      onClose={()=>setSelectedId(null)}
      onChanged={message=>{setToast(message);void ordersQuery.refetch();}}
    />}
  </div>;
}
