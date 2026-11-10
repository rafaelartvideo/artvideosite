import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, CheckCircle2, ClipboardList, RotateCcw, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLocation, useNavigate } from "react-router";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { SalesExchangeDialog } from "./SalesExchangeDialog";
import type { SalesOrderDetail } from "../infrastructure/sales-orders.repository";
import {
  listSalesReturns,receiveSalesReturn,requestSalesReturn,reviewSalesReturn,reconcileSalesReturnCredit,
  type SalesReturn,
} from "../infrastructure/sales-operations.repository";
import { formatSalesDate } from "../domain/sales-order-display";

const typeLabels:Record<SalesReturn["type"],string>={
  refund:"Reembolso",exchange:"Troca",store_credit:"Crédito em loja",
};
const statusLabels:Record<SalesReturn["status"],string>={
  requested:"Aguardando análise",approved:"Aprovada",rejected:"Recusada",
  awaiting_finance:"Conciliação financeira pendente",received:"Mercadoria recebida",closed:"Concluída",
};

export function SalesReturnsDialog({organizationId,order,onClose,onChanged}:{
  organizationId:string;order:SalesOrderDetail;onClose:()=>void;onChanged:(message:string)=>void;
}) {
  const {hasPermission}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const client=useQueryClient();
  const [createOpen,setCreateOpen]=useState(false);
  const [exchanging,setExchanging]=useState<SalesReturn|null>(null);
  const [requestType,setRequestType]=useState<SalesReturn["type"]>("refund");
  const [reason,setReason]=useState("");
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [action,setAction]=useState<{id:string;kind:"approve"|"reject"|"receive"|"reconcile"}|null>(null);
  const [resolution,setResolution]=useState("");
  const [disposition,setDisposition]=useState<"restock"|"quarantine">("restock");
  const [error,setError]=useState<string|null>(null);

  const returnsQuery=useQuery({
    queryKey:["sales",organizationId,"returns",order.id],
    queryFn:()=>listSalesReturns(organizationId,order.id),
    enabled:Boolean(order.id&&organizationId),staleTime:10_000,
  });
  const returns=returnsQuery.data||[];
  const alreadyReturned=useMemo(()=>{
    const result=new Map<string,number>();
    for(const entry of returns){
      if(entry.status==="rejected")continue;
      for(const item of entry.items)result.set(item.order_item_id,
        (result.get(item.order_item_id)||0)+Number(item.quantity));
    }
    return result;
  },[returns]);
  const selected=order.items.map(line=>({
    orderItemId:line.id,quantity:Number(quantities[line.id]||0),
  })).filter(line=>line.quantity>0);
  const selectedGross=order.items.reduce((sum,line)=>{
    const quantity=Number(quantities[line.id]||0);
    return sum+line.line_total*quantity/line.quantity*(order.total_amount/order.subtotal);
  },0);
  const invalid=reason.trim().length<8||
    selected.length===0||
    selected.some(line=>!Number.isInteger(line.quantity)||
      line.quantity>(order.items.find(item=>item.id===line.orderItemId)?.quantity||0)-
        (alreadyReturned.get(line.orderItemId)||0));

  const refresh=(message:string)=>{
    setError(null);
    setCreateOpen(false);
    setAction(null);
    setReason("");
    setQuantities({});
    setResolution("");
    void client.invalidateQueries({queryKey:["sales",organizationId]});
    onChanged(message);
  };

  const requestMutation=useMutation({
    mutationFn:()=>requestSalesReturn(organizationId,order.id,{
      type:requestType,reason,items:selected,
    }),
    onSuccess:data=>refresh("Devolução #"+data.number+" solicitada. Aguardando aprovação."),
    onError:e=>setError(systemErrorMessage(e,"Não foi possível solicitar devolução.")),
  });
  const reviewMutation=useMutation({
    mutationFn:()=>reviewSalesReturn(organizationId,action!.id,action!.kind==="approve",resolution),
    onSuccess:()=>refresh("Solicitação analisada com sucesso."),
    onError:e=>setError(systemErrorMessage(e,"Não foi possível analisar devolução.")),
  });
  const receiveMutation=useMutation({
    mutationFn:()=>receiveSalesReturn(organizationId,action!.id,disposition,resolution),
    onSuccess:data=>refresh(data.status==="awaiting_finance"
      ?"Mercadoria recebida. A conta a receber exige conciliação no Financeiro."
      :"Mercadoria recebida. "+(data.refund_payable_id?"Reembolso registrado em Contas a Pagar.":"Histórico atualizado.")),
    onError:e=>setError(systemErrorMessage(e,"Não foi possível registrar o retorno de mercadoria.")),
  });
  const reconcileMutation=useMutation({
    mutationFn:()=>reconcileSalesReturnCredit(organizationId,action!.id,resolution),
    onSuccess:data=>refresh(
      "Crédito conciliado: "+formatCurrency(data.receivable_credit)+
      (data.refund_payable_id?" · Reembolso a pagar: "+formatCurrency(data.refund_due):" · Sem reembolso adicional.")
    ),
    onError:e=>setError(systemErrorMessage(e,
      "Não foi possível conciliar automaticamente. Confira o histórico no Financeiro.")),
  });
  const busy=requestMutation.isPending||reviewMutation.isPending||
    receiveMutation.isPending||reconcileMutation.isPending;
  const openFinance=(id:string,type:"receivables"|"payables")=>{
    const mode=new URLSearchParams(location.search).get("mode")==="crm"?"?mode=crm":"";
    onClose();navigate("/admin/finance/"+type+"/"+encodeURIComponent(id)+mode);
  };

  return <><AdminDialog open onClose={()=>!busy&&onClose()}
    preparing={returnsQuery.isPending}
    preparingText="Preparando trocas e devoluções..."
    preparingError={returnsQuery.isError ? systemErrorMessage(returnsQuery.error, "Não foi possível carregar as devoluções.") : null}
    onRetryPreparing={() => { void returnsQuery.refetch(); }}
    title={"Trocas e devoluções · Pedido #"+order.order_number}
    description="Acompanhe solicitações, aprovações, devoluções e reembolsos sem criar movimentações fictícias."
    className="w-[calc(100vw-1.25rem)] max-w-3xl"
    bodyClassName="max-h-[min(72dvh,720px)] overflow-y-auto"
    footer={<div className="flex w-full flex-wrap justify-end gap-2">
      {hasPermission("sales.returns.create")&&order.status==="confirmed"&&
        order.fulfillment_status!=="pending"&&<AdminButton size="sm"
          onClick={()=>{setCreateOpen(true);setError(null);}}>
          <RotateCcw size={15}/> Solicitar devolução
        </AdminButton>}
      <AdminButton size="sm" variant="secondary" onClick={onClose}>Fechar</AdminButton>
    </div>}>
    {returnsQuery.isPending?<LoadingState text="Carregando trocas e devoluções..."/>
      :returnsQuery.isError?<p role="alert" className="text-sm text-destructive">
        {systemErrorMessage(returnsQuery.error,"Não foi possível consultar devoluções.")}
      </p>
      :returns.length===0?<div className="py-8 text-center text-sm text-muted-foreground">
        <ClipboardList size={28} className="mx-auto mb-3 opacity-50"/>
        Nenhuma troca ou devolução registrada para este pedido.
      </div>:<div className="space-y-3">
        {returns.map(entry=><section key={entry.id} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">Solicitação #{entry.return_number} · {typeLabels[entry.type]}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatSalesDate(entry.created_at)}</p>
            </div>
            <div className="text-right">
              <strong className="tabular-nums text-sm">{formatCurrency(entry.credit_amount)}</strong>
              <p className="mt-1 text-xs font-semibold text-primary">{statusLabels[entry.status]}</p>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{entry.reason}</p>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {entry.items.map(item=><div key={item.id} className="flex justify-between gap-2 px-3 py-2 text-xs">
              <span className="min-w-0 break-words">{item.quantity} × {item.product}</span>
              <strong className="shrink-0">{formatCurrency(item.credit_amount)}</strong>
            </div>)}
          </div>
          {entry.exchange_items?.length>0&&<div className="mt-3 space-y-1 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold">Produtos entregues na troca</p>
            {entry.exchange_items.map(item=><div key={item.id}
              className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 break-words">{item.quantity} × {item.product}</span>
              <strong className="shrink-0">{formatCurrency(item.line_total)}</strong>
            </div>)}
          </div>}
          {entry.notes&&<p className="mt-2 text-xs text-muted-foreground">{entry.notes}</p>}
          {entry.status==="awaiting_finance"&&<p className="mt-2 rounded-lg border border-orange-500/20 p-3 text-xs text-orange-700 dark:text-orange-300">
            Produto recebido. A venda ainda possui saldo financeiro; concilie o crédito antes de reembolsar o cliente.
          </p>}
          {entry.refund_payable_id&&<div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Reembolso a pagar no Financeiro</p>
            <AdminButton variant="secondary" size="sm" onClick={()=>openFinance(entry.refund_payable_id!,"payables")}>
              <Wallet size={14}/> Abrir reembolso
            </AdminButton>
          </div>}
          {entry.status==="awaiting_finance"&&hasPermission("sales.returns.approve")&&
            hasPermission("finance.receivables.edit")&&
            <AdminButton variant="secondary" size="sm" className="mt-3" onClick={()=>{
              setAction({id:entry.id,kind:"reconcile"});setResolution("");setError(null);
            }}>
              <Wallet size={14}/> Conciliar crédito no Financeiro
            </AdminButton>}
          {entry.status==="received"&&entry.type==="exchange"&&hasPermission("sales.returns.approve")&&
            <AdminButton size="sm" className="mt-3" onClick={()=>setExchanging(entry)}>
              <ArrowLeftRight size={14}/> Entregar substitutos
            </AdminButton>}
          {entry.status==="approved"&&hasPermission("sales.returns.approve")&&
            <AdminButton size="sm" className="mt-3" onClick={()=>{setAction({id:entry.id,kind:"receive"});setError(null);}}>
              <CheckCircle2 size={14}/> Registrar recebimento
            </AdminButton>}
          {entry.status==="requested"&&hasPermission("sales.returns.approve")&&
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminButton size="sm" onClick={()=>{setAction({id:entry.id,kind:"approve"});setError(null);}}>
                Aprovar
              </AdminButton>
              <AdminButton size="sm" variant="secondary" onClick={()=>{setAction({id:entry.id,kind:"reject"});setError(null);}}>
                Recusar
              </AdminButton>
            </div>}
        </section>)}
      </div>}
    </AdminDialog>

    {createOpen&&<AdminDialog open onClose={()=>!busy&&setCreateOpen(false)}
      title="Nova solicitação de troca ou devolução"
      description="Informe quais produtos retornam e por quê. A solicitação não altera estoque nem Financeiro."
      className="w-[calc(100vw-1.25rem)] max-w-xl"
      bodyClassName="max-h-[min(70dvh,640px)] overflow-y-auto"
      footer={<div className="flex justify-end gap-2">
        <AdminButton size="sm" variant="secondary" disabled={busy} onClick={()=>setCreateOpen(false)}>Voltar</AdminButton>
        <AdminButton size="sm" disabled={invalid||busy} loading={busy}
          onClick={()=>{setError(null);requestMutation.mutate();}}>Solicitar análise</AdminButton>
      </div>}>
      <div className="space-y-4">
        <label className="block space-y-1 text-xs font-semibold">
          <span>Tipo de solicitação</span>
          <AdminSelect value={requestType} onValueChange={value=>setRequestType(value as SalesReturn["type"])}
            options={[{value:"refund",label:"Devolução com reembolso"},{value:"exchange",label:"Troca de produto"}]}
            ariaLabel="Tipo de solicitação" className="h-[42px] md:h-9 md:min-h-9 md:py-1.5 md:text-xs"/>
        </label>
        <div className="divide-y divide-border rounded-lg border border-border">
          {order.items.map(item=>{
            const maximum=item.quantity-(alreadyReturned.get(item.id)||0);
            return <label key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0"><p className="break-words text-xs font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {maximum} disponível para devolução · {formatCurrency(item.line_total)}
                </p>
              </div>
              <input type="number" min={0} max={maximum} step={1}
                aria-label={"Quantidade a devolver de "+item.name}
                value={quantities[item.id]??0}
                disabled={maximum<=0}
                onChange={e=>setQuantities(previous=>({...previous,[item.id]:Number(e.target.value)}))}
                className="h-10 w-20 shrink-0 rounded-lg border border-border bg-background px-2 text-right text-sm"/>
            </label>;
          })}
        </div>
        <p className="text-right text-sm">Crédito estimado: <strong>{formatCurrency(selectedGross)}</strong></p>
        <label className="block space-y-1 text-xs font-semibold"><span>Motivo *</span>
          <textarea rows={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}
            placeholder="Descreva o problema com os produtos..."
            className="w-full rounded-lg border border-border bg-background p-3 text-sm"/>
        </label>
        <p className="text-xs text-muted-foreground">
          O reembolso financeiro dependerá de aprovação e conciliação. Nenhum pagamento é estornado automaticamente.
        </p>
        {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </AdminDialog>}

    {exchanging&&<SalesExchangeDialog
      organizationId={organizationId}
      entry={exchanging}
      onClose={()=>setExchanging(null)}
      onCompleted={message=>{setExchanging(null);refresh(message);}}
    />}
    {action&&<AdminDialog open onClose={()=>!busy&&setAction(null)}
      title={action.kind==="receive"?"Receber mercadorias devolvidas":
        action.kind==="reconcile"?"Conciliar devolução financeira":
        action.kind==="approve"?"Aprovar devolução":"Recusar devolução"}
      description="A ação ficará registrada no histórico do pedido."
      className="max-w-lg"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" size="sm" disabled={busy} onClick={()=>setAction(null)}>Voltar</AdminButton>
        <AdminButton size="sm" disabled={busy||
          (action.kind==="reconcile"&&resolution.trim().length<10)||
          (action.kind!=="receive"&&action.kind!=="reconcile"&&resolution.trim().length<5)} loading={busy}
          onClick={()=>{
            setError(null);
            if(action.kind==="receive")receiveMutation.mutate();
            else if(action.kind==="reconcile")reconcileMutation.mutate();
            else reviewMutation.mutate();
          }}>Confirmar</AdminButton>
      </div>}>
      <div className="space-y-3">
        {action.kind==="receive"&&<div className="grid grid-cols-2 gap-2">
          {(["restock","quarantine"] as const).map(value=><button type="button" key={value}
            onClick={()=>setDisposition(value)} className={"rounded-lg border p-3 text-xs font-semibold "+
              (value===disposition?"border-primary bg-primary/5":"border-border")}>
            {value==="restock"?"Devolver ao estoque":"Separar para análise"}
          </button>)}
        </div>}
        <label className="block space-y-1.5 text-xs font-semibold">
          <span>{action.kind==="receive"?"Observações do recebimento":
            action.kind==="reconcile"?"Motivo da conciliação *":"Motivo ou parecer *"}</span>
          <textarea value={resolution} rows={3} maxLength={1000}
            onChange={e=>setResolution(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm"/>
        </label>
        {action.kind==="receive"&&<p className="text-xs text-muted-foreground">
          Ao confirmar, o retorno físico será registrado apenas uma vez. Reembolsos devem ser concluídos pelo Financeiro.
        </p>}
        {action.kind==="reconcile"&&<p className="text-xs text-muted-foreground">
          Esta ação abate primeiro parcelas ainda não recebidas. Se o crédito superar o saldo
          em aberto, cria uma conta a pagar para o reembolso real. Nenhuma baixa de dinheiro
          será simulada. O histórico da cobrança é preservado.
        </p>}
        {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </AdminDialog>}
  </>;
}
