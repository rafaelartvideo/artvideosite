import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, BarChart3, Edit2, Medal, Plus, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardHeader, AdminDialog, AdminIconButton, Section } from "@/shared/ui/admin/AdminLayout";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { getSalesManagement,saveSalesSellerGoal,
  type SalesManagement,type SalesSellerMetric,
} from "../infrastructure/sales-operations.repository";
import { localSalesDate,parseSalesMoney } from "../domain/sales-payment-schedule";
import { SalesCommissionsSection } from "./SalesCommissionsSection";

function numeric(value:unknown){return Number(value)||0;}
function downloadCsv(data:SalesManagement){
  const escapeCsv=(value:unknown)=>{
    const str=String(value??"");
    // Evita interpretação de fórmulas ao abrir CSV no Excel.
    const safe=/^[\s]*[=+\-@]/.test(str)?"'"+str:str;
    return '"'+safe.replace(/"/g,'""')+'"';
  };
  const rows=[
    ["Vendedor","Pedidos","Venda bruta","Devoluções","Vendas líquidas",
      "Recebido líquido","Meta","Progresso %","Comissão %","Base","Comissão estimada"],
    ...data.sellers.map(s=>[s.name,s.orders,s.gross,s.returned,s.net,s.received_net,
      s.target,s.progress,s.rate,s.basis,s.commission_estimated]),
  ];
  const content="\uFEFF"+rows.map(row=>row.map(escapeCsv).join(";")).join("\r\n");
  const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download="Relatorio Vendas "+data.month+".csv";
  document.body.appendChild(link);
  try{link.click();}finally{
    link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
}

export function SalesManagementPage(){
  const {activeOrganizationId,hasPermission}=useAuth();
  const org=activeOrganizationId||"";
  const client=useQueryClient();
  const [month,setMonth]=useState(()=>localSalesDate().slice(0,7));
  const [editing,setEditing]=useState<SalesSellerMetric|null>(null);
  const [sellerId,setSellerId]=useState("");
  const [target,setTarget]=useState("0,00");
  const [rate,setRate]=useState("0");
  const [basis,setBasis]=useState<"received"|"confirmed">("received");
  const [error,setError]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const allowed=hasPermission("sales.reports.view");
  const query=useQuery({
    queryKey:["sales",org,"management",month],
    queryFn:()=>getSalesManagement(org,month),
    enabled:Boolean(allowed&&org),staleTime:20_000,
  });
  const data=query.data;
  const sellers=data?.sellers||[];
  const maxTrend=Math.max(1,...(data?.trend||[]).map(item=>numeric(item.net)));
  const maxProduct=Math.max(1,...(data?.top_products||[]).map(item=>numeric(item.total)));
  const saveMutation=useMutation({
    mutationFn:()=>saveSalesSellerGoal(org,{
      sellerId:editing?.seller_id||sellerId,month,
      target:parseSalesMoney(target),
      rate:Number(rate.replace(",",".")),
      basis,
    }),
    onSuccess:()=>{
      setEditing(null);setError(null);setToast("Meta e comissão do vendedor atualizadas.");
      void client.invalidateQueries({queryKey:["sales",org,"management",month]});
    },
    onError:e=>setError(systemErrorMessage(e,"Não foi possível salvar meta/comissão.")),
  });
  const manage=Boolean(data?.can_manage_goals&&hasPermission("sales.targets.manage"));
  const editGoal=(seller?:SalesSellerMetric)=>{
    setEditing(seller||{seller_id:"",name:"",orders:0,gross:0,returned:0,net:0,
      received_net:0,target:0,rate:0,basis:"received",commission_estimated:0,progress:0});
    setSellerId(seller?.seller_id||data?.seller_choices?.[0]?.id||"");
    setTarget(seller?String(seller.target).replace(".",","):"0,00");
    setRate(seller?String(seller.rate).replace(".",","):"0");
    setBasis(seller?.basis||"received");setError(null);
  };

  return <div className="min-w-0 space-y-4 pb-7">
    {toast&&<Toast type="success" message={toast} onClose={()=>setToast(null)}/>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold">Gestão comercial</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Vendas, recebimentos, metas, desempenho e comissões por empresa.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="space-y-1 text-xs font-semibold">
          <span className="block">Mês de referência</span>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"/>
        </label>
        {data&&<AdminButton variant="secondary" size="sm"
          onClick={()=>downloadCsv(data)}>
          <ArrowDownToLine size={15}/> Exportar CSV
        </AdminButton>}
        {manage&&<AdminButton size="sm" onClick={()=>editGoal()}>
          <Plus size={15}/> Definir meta
        </AdminButton>}
      </div>
    </div>
    {!allowed?<EmptyState icon={BarChart3} title="Sem acesso aos relatórios"
      message="Solicite permissão para visualizar relatórios comerciais."/>
      :query.isPending?<LoadingState text="Carregando indicadores comerciais..."/>
      :query.isError||!data?<div className="space-y-2 rounded-xl border border-destructive/20 p-4">
        <p role="alert" className="text-xs text-destructive">
          {systemErrorMessage(query.error,"Não foi possível carregar a gestão comercial.")}
        </p>
        <AdminButton variant="secondary" size="sm" onClick={()=>void query.refetch()}>
          Tentar novamente
        </AdminButton>
      </div>:<>
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {([
            {label:"Vendas líquidas",value:formatCurrency(data.summary.net_sales),icon:BarChart3},
            {label:"Recebido",value:formatCurrency(data.summary.received),icon:Wallet},
            {label:"Saldo em aberto",value:formatCurrency(data.summary.open_receivables),icon:Wallet},
            {label:"Ticket médio",value:formatCurrency(data.summary.average_ticket),icon:Medal},
          ]).map(card=><AdminCard key={card.label} className="p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <card.icon size={16}/>{card.label}
            </p>
            <p className="mt-2 break-words text-base font-bold tabular-nums sm:text-xl">{card.value}</p>
          </AdminCard>)}
        </div>
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-3 text-xs">
            <p className="text-muted-foreground">Pedidos confirmados</p>
            <strong className="mt-2 block text-lg">{data.summary.orders}</strong>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-xs">
            <p className="text-muted-foreground">Vendas brutas</p>
            <strong className="mt-2 block text-lg">{formatCurrency(data.summary.gross_sales)}</strong>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-xs">
            <p className="text-muted-foreground">Devoluções registradas</p>
            <strong className="mt-2 block text-lg">{formatCurrency(data.summary.returns)}</strong>
          </div>
          {data.summary.margin_available&&<div className="rounded-lg border border-border bg-card p-3 text-xs">
            <p className="text-muted-foreground">Margem bruta estimada</p>
            <strong className="mt-2 block text-lg">{formatCurrency(data.summary.estimated_margin||0)}</strong>
          </div>}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="Últimos seis meses">
            <div className="space-y-3">
            {data.trend.map(point=><div key={point.month} className="grid grid-cols-[70px_minmax(0,1fr)_110px] items-center gap-3">
              <span className="text-xs text-muted-foreground">{point.month.slice(5)}/{point.month.slice(2,4)}</span>
              <div className="h-5 overflow-hidden rounded-md bg-muted">
                <div className="h-full rounded-md bg-primary" style={{width:Math.max(0,100*numeric(point.net)/maxTrend)+"%"}}/>
              </div>
              <strong className="text-right text-xs tabular-nums">{formatCurrency(point.net)}</strong>
            </div>)}
            </div>
          </Section>
          <Section title="Produtos mais vendidos">
            <div className="space-y-3">
            {data.top_products.length===0?<p className="text-xs text-muted-foreground">Ainda não há vendas neste mês.</p>
              :data.top_products.map(product=><div key={product.product_id} className="space-y-1">
                <div className="flex min-w-0 justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{product.name} · {product.units} un.</span>
                  <strong className="shrink-0 tabular-nums">{formatCurrency(product.total)}</strong>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{width:Math.max(0,100*numeric(product.total)/maxProduct)+"%"}}/>
                </div>
              </div>)}
            </div>
          </Section>
        </div>
        <AdminCard square>
          <AdminCardHeader>
            <div className="min-w-0">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">Vendedores, metas e comissões</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Comissão estimada; não gera pagamento até aprovação e baixa financeira. A base é definida por vendedor.
              </p>
            </div>
            {manage&&<AdminButton variant="secondary" size="sm" onClick={()=>editGoal()}>
              <Plus size={14}/> Configurar
            </AdminButton>}
          </AdminCardHeader>
        </AdminCard>
        <AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
          <div className="divide-y divide-border lg:hidden">
            {sellers.length===0
              ?<p className="px-4 py-6 text-sm text-muted-foreground">Sem vendedores ativos neste período.</p>
              :sellers.map(seller=><div key={seller.seller_id} className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{seller.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{seller.orders} pedido(s)</p>
                  </div>
                  {manage&&<button type="button" onClick={()=>editGoal(seller)}
                    className="text-xs font-semibold text-primary">Editar meta</button>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-muted-foreground">Vendas líquidas</p>
                    <strong className="mt-1 block text-sm tabular-nums">{formatCurrency(seller.net)}</strong>
                  </div>
                  <div><p className="text-muted-foreground">Meta mensal</p>
                    <strong className="mt-1 block text-sm tabular-nums">{formatCurrency(seller.target)}</strong>
                  </div>
                  <div><p className="text-muted-foreground">Comissão estimada</p>
                    <strong className="mt-1 block text-sm tabular-nums">{formatCurrency(seller.commission_estimated)}</strong>
                  </div>
                  <div><p className="text-muted-foreground">Regra</p>
                    <p className="mt-1 font-semibold">{seller.rate}% · {seller.basis==="received"?"recebido":"confirmado"}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Atingimento da meta</span>
                    <strong>{seller.target>0?seller.progress+"%":"Meta não definida"}</strong>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary"
                      style={{width:Math.min(100,Math.max(0,numeric(seller.progress)))+"%"}}/>
                  </div>
                </div>
              </div>)}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <TopTableScrollbar/>
            <table className="min-w-[900px]">
              <thead>
                <tr><th className="px-4 py-3 text-left">Vendedor</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Vendas líquidas</th>
                  <th className="px-4 py-3 text-right">Meta</th>
                  <th className="px-4 py-3 text-right">Atingimento</th>
                  <th className="px-4 py-3 text-right">Comissão</th>
                  {manage&&<th className="px-4 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sellers.map(seller=><tr key={seller.seller_id}>
                  <td className="px-4 py-3 font-semibold">{seller.name}</td>
                  <td className="px-4 py-3 text-right">{seller.orders}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(seller.net)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(seller.target)}</td>
                  <td className="px-4 py-3 text-right">{seller.target>0?seller.progress+"%":"—"}</td>
                  <td className="px-4 py-3 text-right">
                    <strong className="tabular-nums">{formatCurrency(seller.commission_estimated)}</strong>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {seller.rate}% · {seller.basis==="received"?"recebimentos":"vendas confirmadas"}
                    </p>
                  </td>
                  {manage&&<td className="px-4 py-3 text-right">
                    <AdminIconButton variant="tertiary" ariaLabel={"Editar meta de "+seller.name}
                      onClick={()=>editGoal(seller)}><Edit2 size={15}/></AdminIconButton>
                  </td>}
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Recebimentos são vinculados ao mês da venda; não representam necessariamente o fluxo de caixa do mês.
            Os valores descontam devoluções recebidas e podem ser recalculados antes do pagamento de comissões.
          </p>
        </AdminCard>
        <SalesCommissionsSection organizationId={org} month={month} sellers={sellers} canManage={manage}/>
      </>}

    {editing&&<AdminDialog open onClose={()=>!saveMutation.isPending&&setEditing(null)}
      title="Meta e comissão"
      description={"Defina o objetivo e a regra do vendedor para "+month+"."}
      className="max-w-md"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" size="sm" disabled={saveMutation.isPending}
          onClick={()=>setEditing(null)}>Voltar</AdminButton>
        <AdminButton size="sm" loading={saveMutation.isPending}
          disabled={saveMutation.isPending||!(editing.seller_id||sellerId)||
            !Number.isFinite(parseSalesMoney(target))||parseSalesMoney(target)<0||
            !Number.isFinite(Number(rate.replace(",",".")))||
            Number(rate.replace(",","."))<0||Number(rate.replace(",","."))>30}
          onClick={()=>{setError(null);saveMutation.mutate();}}>Salvar meta</AdminButton>
      </div>}>
      <div className="space-y-3">
        <label className="block space-y-1 text-xs font-semibold"><span>Vendedor</span>
          <select value={editing.seller_id||sellerId} disabled={Boolean(editing.seller_id)}
            onChange={e=>setSellerId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
            {data?.seller_choices?.map(seller=><option key={seller.id} value={seller.id}>{seller.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-xs font-semibold"><span>Meta mensal (R$)</span>
          <input value={target} inputMode="decimal" onChange={e=>setTarget(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        </label>
        <label className="block space-y-1 text-xs font-semibold"><span>Comissão (%)</span>
          <input value={rate} inputMode="decimal" onChange={e=>setRate(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        </label>
        <label className="block space-y-1 text-xs font-semibold"><span>Base de cálculo</span>
          <select value={basis} onChange={e=>setBasis(e.target.value as "received"|"confirmed")}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="received">Valores recebidos, líquidos de devoluções</option>
            <option value="confirmed">Vendas confirmadas, líquidas de devoluções</option>
          </select>
        </label>
        {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          A comissão é estimativa gerencial, não uma saída financeira automática.
        </p>
      </div>
    </AdminDialog>}
  </div>;
}
