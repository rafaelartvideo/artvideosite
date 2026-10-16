import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Search, ShoppingBag, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, AdminStickyToolbar, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";

type StoreOrder = {
 id: string; created_at: string; status: string; quantity: number;
 product_name: string; unit_price: number; shipping_price: number;
 shipping_service_name: string; postal_code: string;
 buyer: Record<string, string>; preference_id: string | null;
 payment_id: string | null; paid_at: string | null;
 expires_at: string;
};
type StoreOrderLine = { id: string; order_id: string; product_name: string; quantity: number; unit_price: number; };
const stateLabels: Record<string,string> = {
 creating: "Preparando pagamento", awaiting_payment: "Aguardando pagamento",
 paid: "Pago", cancelled: "Cancelado", expired: "Expirado",
 manual_review: "Revisão necessária",
};
function statusColor(status: string) {
  if(status==="paid") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if(status==="manual_review") return "border-red-500/30 bg-red-500/10 text-red-600";
  if(status==="cancelled"||status==="expired") return "border-border bg-muted text-muted-foreground";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}
export function SiteStoreOrdersPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const [orders,setOrders]=useState<StoreOrder[]>([]);
  const [lines,setLines]=useState<StoreOrderLine[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<StoreOrder|null>(null);

  const refresh=useCallback(async () => {
    setLoading(true);setError("");
    const [orderResult,lineResult]=await Promise.all([
      supabase.from("artvideo_store_orders").select("id,created_at,status,quantity,product_name,unit_price,shipping_price,shipping_service_name,postal_code,buyer,preference_id,payment_id,paid_at,expires_at").order("created_at",{ascending:false}).limit(500),
      supabase.from("artvideo_store_order_items").select("id,order_id,product_name,quantity,unit_price").order("created_at",{ascending:true}).limit(2000),
    ]);
    if(orderResult.error||lineResult.error) setError(systemErrorMessage(orderResult.error||lineResult.error));
    else {setOrders((orderResult.data||[]) as StoreOrder[]);setLines((lineResult.data||[]) as StoreOrderLine[]);}
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    const id=window.setInterval(()=>{void refresh();},60000);
    return ()=>window.clearInterval(id);
  },[refresh]);

  const orderLines=(order:StoreOrder)=>{
    const found=lines.filter(line=>line.order_id===order.id);
    return found.length ? found : [{
      id:order.id,order_id:order.id,product_name:order.product_name,
      quantity:order.quantity,unit_price:order.unit_price,
    }];
  };
  const subtotal=(order:StoreOrder)=>orderLines(order).reduce((sum,line)=>sum+line.quantity*Number(line.unit_price),0);
  const total=(order:StoreOrder)=>subtotal(order)+Number(order.shipping_price);
  const filtered=useMemo(()=>orders.filter(order=>{
    if(filter!=="all" && order.status!==filter) return false;
    const text=search.trim().toLowerCase();
    return !text||[order.id,order.buyer?.buyer_name,order.buyer?.buyer_email,order.postal_code,
       order.product_name,...lines.filter(line=>line.order_id===order.id).map(line=>line.product_name)]
       .some(value=>String(value||"").toLowerCase().includes(text));
  }),[orders,lines,search,filter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/10));
  const rows=filtered.slice((Math.min(page,totalPages)-1)*10,Math.min(page,totalPages)*10);

  if(!activeOrganization?.is_artvideo_tenant||!hasPermission("site.view")||!hasPermission("site_settings.view")) return null;
  return <div className="min-w-0 space-y-5">
    <PageHeader title="Pedidos da Loja" eyebrow="Site"
      subtitle="Acompanhe compras feitas na loja Artvideo, pagamentos e entregas."/>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Pedidos</p><strong className="mt-1 block text-2xl">{orders.length}</strong></div>
      <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Pagos</p><strong className="mt-1 block text-2xl">{orders.filter(o=>o.status==="paid").length}</strong></div>
      <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Em revisão</p><strong className="mt-1 block text-2xl">{orders.filter(o=>o.status==="manual_review").length}</strong></div>
    </div>
    <Section title="Vendas do site" description="Pedidos registrados no checkout. Os dados financeiros são confirmados pelo provedor de pagamento.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              placeholder="Buscar pedido, cliente, produto ou CEP"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm focus:outline-primary"/>
          </label>
          <select aria-label="Filtrar situação" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            <option value="all">Todas as situações</option>
            {Object.entries(stateLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}
          </select>
        </div>
        {error && <div className="rounded-lg border border-red-500/20 p-4 text-sm text-red-600">Erro ao carregar pedidos: {error} <button className="font-bold underline" onClick={()=>void refresh()}>Tentar novamente</button></div>}
        {loading && !orders.length ? <p className="py-9 text-center text-sm text-muted-foreground">Carregando pedidos...</p>
          : !rows.length ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <ShoppingBag size={28} className="mx-auto mb-3"/>Nenhum pedido encontrado.
          </div> : <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[730px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th className="p-3">Pedido / data</th><th className="p-3">Cliente</th><th className="p-3">Produtos</th>
                <th className="p-3">Total</th><th className="p-3">Situação</th>
              </tr></thead>
              <tbody>{rows.map(order=><tr key={order.id}
                onClick={()=>setSelected(order)} tabIndex={0} role="button"
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(order);}}}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40 focus:bg-muted/40">
                <td className="p-3"><strong className="block">#{order.id.slice(0,8).toUpperCase()}</strong><span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("pt-BR")}</span></td>
                <td className="p-3"><strong className="block">{order.buyer?.buyer_name||"Cliente"}</strong><span className="text-xs text-muted-foreground">{order.buyer?.buyer_email||""}</span></td>
                <td className="p-3">{orderLines(order).reduce((total,line)=>total+line.quantity,0)} itens</td>
                <td className="p-3 font-bold">{formatCurrency(total(order))}</td>
                <td className="p-3"><span className={"inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold "+statusColor(order.status)}>{stateLabels[order.status]||order.status}</span></td>
              </tr>)}</tbody>
            </table>
          </div>}
        {filtered.length>10 && <div className="flex justify-end gap-3 text-sm text-muted-foreground">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft size={19}/></button>
          {Math.min(page,totalPages)} de {totalPages}
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}><ChevronRight size={19}/></button>
        </div>}
      </div>
    </Section>
    <AdminStickyToolbar><BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
      <BtnSecondary onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Atualizar</BtnSecondary>
    </AdminStickyToolbar>
    <AdminDialog open={Boolean(selected)} title={selected?"Pedido #"+selected.id.slice(0,8).toUpperCase():"Pedido"}
      onClose={()=>setSelected(null)} className="max-w-2xl">
      {selected && <div className="space-y-5 p-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={"rounded-full border px-3 py-1 text-xs font-bold "+statusColor(selected.status)}>{stateLabels[selected.status]||selected.status}</span>
          <span className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString("pt-BR")}</span>
        </div>
        <div><h3 className="font-bold">Cliente</h3>
          <p>{selected.buyer?.buyer_name}</p><p>{selected.buyer?.buyer_email}</p>
          <p>{selected.buyer?.buyer_phone}</p></div>
        <div><h3 className="mb-2 font-bold">Produtos</h3>
          {orderLines(selected).map(line=><div key={line.id} className="flex justify-between gap-4 border-b border-border py-2">
            <span>{line.quantity} × {line.product_name}</span>
            <strong>{formatCurrency(line.quantity*Number(line.unit_price))}</strong>
          </div>)}
          <div className="mt-3 flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal(selected))}</strong></div>
          <div className="mt-2 flex justify-between"><span>Entrega</span><strong>{formatCurrency(selected.shipping_price)}</strong></div>
          <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-extrabold"><span>Total</span><span>{formatCurrency(total(selected))}</span></div>
        </div>
        <div><h3 className="flex items-center gap-2 font-bold"><Truck size={16}/> Entrega</h3>
          <p className="mt-2">{selected.buyer?.street}, {selected.buyer?.number}{selected.buyer?.complement?" · "+selected.buyer.complement:""}</p>
          <p>{selected.buyer?.district}, {selected.buyer?.city}/{selected.buyer?.state}, CEP {selected.postal_code}</p>
          <p className="mt-2 text-muted-foreground">{selected.shipping_service_name}</p>
        </div>
        <div className="border-t border-border pt-3 text-xs text-muted-foreground">
          <p>Pagamento: {selected.payment_id?"Confirmado pelo provedor":"Aguardando confirmação ou análise"}</p>
          {selected.status==="manual_review" && <p className="mt-2 font-bold text-red-600">Revisão necessária: confira o pagamento no provedor antes de qualquer envio ou reembolso.</p>}
        </div>
      </div>}
    </AdminDialog>
  </div>;
}
