import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, CheckCircle2, CircleCheck, ClipboardList, Clock3, Copy,
  Headphones, LockKeyhole, MapPin, Package,
  PackageCheck, RefreshCw, ShieldCheck, ShoppingBag, Store, Truck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { formatCurrency } from "@/shared/domain/formatters";
import { getStoreTracking, type StoreTracking } from "../infrastructure/storefront.repository";
import { StoreAfterSalesCustomer } from "./StoreAfterSalesCustomer";
import { TrackingLoading } from "@/features/service-tracking/presentation/TrackingLoading";

const statuses:Record<string,string> = {
  pending:"Aguardando separação",preparing:"Separando produtos",
  ready:"Pedido pronto",out_for_delivery:"Saiu para entrega",
  delivery_issue:"Ocorrência na entrega",delivered:"Entregue",
  picked_up:"Retirado na loja",
};
const paymentNames:Record<string,string>={
  creating:"Preparando pagamento",awaiting_payment:"Aguardando pagamento",
  paid:"Pagamento confirmado",cancelled:"Pagamento cancelado",
  expired:"Pagamento expirado",manual_review:"Pagamento em análise",
};
const displayDate=(date:string)=>new Date(date).toLocaleString("pt-BR",{
  dateStyle:"medium",timeStyle:"short",
});
const stepsDelivery=[
  {key:"pending",name:"Pedido recebido",Icon:ClipboardList},
  {key:"preparing",name:"Separação",Icon:Package},
  {key:"ready",name:"Pronto",Icon:PackageCheck},
  {key:"out_for_delivery",name:"Em rota",Icon:Truck},
  {key:"delivered",name:"Entregue",Icon:CircleCheck},
];
const stepsPickup=[
  {key:"pending",name:"Pedido recebido",Icon:ClipboardList},
  {key:"preparing",name:"Separação",Icon:Package},
  {key:"ready",name:"Pronto para retirada",Icon:Store},
  {key:"picked_up",name:"Retirado",Icon:CircleCheck},
];
const primaryButton="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-[13px] font-bold text-white transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";
const secondaryButton="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe5f2] bg-white px-4 text-[12px] font-bold text-[#425a79] transition-colors hover:bg-[#eaf3ff] focus-visible:outline-2 focus-visible:outline-blue-500";
const card="rounded-xl border border-[#e0e8f3] bg-white shadow-[0_5px_20px_rgba(13,39,77,.035)]";

/** Painel do pedido utilizado dentro do acompanhamento unificado na página inicial. */
export function StoreOrderTrackingDetails({ token, onReady }: { token: string; onReady: () => void }) {
  const [params]=useSearchParams();
  const [order,setOrder]=useState<StoreTracking|null>(null);
  const [loading,setLoading]=useState(true);
  const [hasLoadedOnce,setHasLoadedOnce]=useState(false);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const fetchOrder=useCallback(async(code:string,silent=false)=>{
    if(!code)return;
    if(!silent){setLoading(true);setOrder(null);}
    setError("");
    try {
      const result=await getStoreTracking(code);
      setOrder(result);
      try{sessionStorage.setItem("artvideo-store-tracking",code);}catch{/* Sessão sem armazenamento. */}
    }catch(err){
      setOrder(null);
      setError(err instanceof Error?err.message:"Não foi possível consultar o pedido.");
    }finally{
      setLoading(false);
      if(!silent){
        setHasLoadedOnce(true);
        onReady();
      }
    }
  },[onReady]);
  useEffect(()=>{if(token)void fetchOrder(token);},[token,fetchOrder]);
  useEffect(()=>{
    if(!token)return;
    const id=window.setInterval(()=>{
      if(!document.hidden)void fetchOrder(token,true);
    },60000);
    return ()=>window.clearInterval(id);
  },[token,fetchOrder]);
  const share=async()=>{
    const url=window.location.origin+"/#acompanhar-servico&c="+token;
    try{await navigator.clipboard.writeText(url);setCopied(true);}
    catch{setError("Não foi possível copiar automaticamente. Utilize o endereço desta página.");}
  };
  const pickup=order?.deliveryMethod==="pickup";
  const paid=order?.paymentStatus==="paid";
  const paymentIssueText=order?.paymentIssueStatus==="refunded"?"Pagamento estornado":
    order?.paymentIssueStatus==="charged_back"?"Pagamento contestado":null;
  const finished=order?.fulfillmentStatus==="delivered" || order?.fulfillmentStatus==="picked_up";
  const allSteps=pickup?stepsPickup:stepsDelivery;
  const index=order?allSteps.findIndex(s=>s.key===order.fulfillmentStatus):-1;
  const effective=index<0 && order?.fulfillmentStatus==="delivery_issue" ? 3 : Math.max(0,index);
  const resultText=order?.fulfillmentStatus==="ready"&&pickup?"Disponível para retirada":statuses[order?.fulfillmentStatus||""]||"Em andamento";
  const returnState=params.get("retorno");
  return <div className="mt-5 text-[#112640]">
    <div className="space-y-6">
      {returnState&&<div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-[12px] leading-5 text-[#3c6087]">
        <ShieldCheck size={19} className="shrink-0 text-[var(--art-primary)]"/>
        Você voltou do ambiente de pagamento. O pagamento não é confirmado apenas pelo retorno: o status abaixo será atualizado depois da validação pelo provedor.
      </div>}
      {loading&&hasLoadedOnce&&<TrackingLoading subject="pedido"/>}
      {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
        {error}
        {token&&<button type="button" onClick={()=>void fetchOrder(token)} className="ml-3 font-bold underline">Tentar novamente</button>}
      </div>}
      {order&&<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <section className={card+" overflow-hidden"}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5edf7] p-5 sm:p-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6e85a0]">Pedido #{order.number}</p>
                <h2 className="mt-2 text-[22px] font-extrabold tracking-tight">{paid?(finished?"Pedido concluído":resultText):paymentIssueText||paymentNames[order.paymentStatus]||"Em análise"}</h2>
                <p className="mt-1 text-[12px] text-[#74849a]">Realizado em {displayDate(order.createdAt)}</p>
              </div>
              <span className={"rounded-full px-3 py-2 text-[11px] font-bold "+(finished?"bg-emerald-50 text-emerald-700":paid?"bg-blue-50 text-blue-700":"bg-amber-50 text-amber-700")}>
                {paid?"Pagamento confirmado":paymentIssueText||paymentNames[order.paymentStatus]||"Pagamento em análise"}
              </span>
            </div>
            <div className="p-5 sm:p-6">
              {!paid?<div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50 p-4 text-[12px] leading-6 text-[#936323]">
                <Clock3 size={20} className="mt-0.5 shrink-0"/>
                {paymentIssueText?
                  paymentIssueText+". A equipe da Artvideo precisa analisar essa ocorrência. Não faça novo pagamento por esta página.":
                  order.paymentStatus==="manual_review"?"Seu pagamento precisa ser conferido pela equipe. Não é necessário realizar uma nova cobrança nesta página.":
                  order.paymentStatus==="cancelled"||order.paymentStatus==="expired"?"O pagamento não foi confirmado. Você pode entrar em contato com a Artvideo caso precise de ajuda.":
                  "Estamos aguardando a confirmação de pagamento. Esta página será atualizada automaticamente."}
              </div>:<>
                <div className="grid gap-3 sm:grid-cols-5" role="list" aria-label="Etapas do pedido">
                  {allSteps.map((step,i)=>{
                    const active=i===effective,done=i<effective||finished;
                    const Icon=step.Icon;
                    return <div key={step.key} role="listitem" className="min-w-0">
                      <div className={"flex h-11 w-11 items-center justify-center rounded-full border sm:mx-auto "+
                        (done?"border-emerald-200 bg-emerald-50 text-emerald-700":active?"border-blue-200 bg-blue-50 text-[var(--art-primary)]":"border-[#e3eaf3] bg-[#f9fbff] text-[#91a0b4]")}>
                        {done?<CheckCircle2 size={21}/>:<Icon size={21}/>}
                      </div>
                      <div className="mt-2 text-left text-[11px] font-semibold leading-4 text-[#425a76] sm:text-center">{step.name}</div>
                      <div className={"mt-2 h-1.5 rounded-full "+(i<=effective?"bg-[var(--art-primary)]":"bg-[#e7edf6]")}/>
                    </div>;
                  })}
                </div>
                {order.fulfillmentStatus==="delivery_issue"&&<p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-800">
                  Houve uma ocorrência durante a entrega. A equipe está acompanhando a situação.
                </p>}
                {pickup&&order.fulfillmentStatus==="ready"&&<p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[12px] font-bold text-emerald-800">
                  Seu pedido está pronto! Confira os horários abaixo antes de ir à loja.
                </p>}
              </>}
            </div>
          </section>
          {pickup&&order.pickupLocation&&<section className={card+" p-5 sm:p-6"}>
            <h3 className="flex items-center gap-2 text-[16px] font-extrabold"><Store size={20} className="text-[var(--art-primary)]"/> Retirada na loja</h3>
            <div className="mt-4 space-y-2 text-[13px] text-[#4e6782]">
              <p className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/>
                <span>{order.pickupLocation.street}, {order.pickupLocation.number} — {order.pickupLocation.district}, {order.pickupLocation.city}/{order.pickupLocation.state}. CEP {order.pickupLocation.postalCode}</span>
              </p>
              {order.pickupLocation.hours&&<p className="whitespace-pre-wrap"><strong>Horários:</strong> {order.pickupLocation.hours}</p>}
              {order.pickupLocation.instructions&&<p className="whitespace-pre-wrap">{order.pickupLocation.instructions}</p>}
              {!finished&&order.fulfillmentStatus!=="ready"&&<p className="mt-3 rounded-lg bg-[#f2f7ff] p-3 text-[12px] text-[#536f90]">
                Aguarde a confirmação de que o pedido está pronto para retirada.
              </p>}
            </div>
          </section>}
          <StoreAfterSalesCustomer token={token} paymentStatus={order.paymentStatus}
            cases={order.supportCases || []} onSubmitted={()=>fetchOrder(token,true)}/>
          {order.timeline.length>0&&<section className={card+" p-5 sm:p-6"}>
            <h3 className="flex items-center gap-2 text-[16px] font-extrabold"><ClipboardList size={19} className="text-[var(--art-primary)]"/> Histórico de atualizações</h3>
            <ol className="mt-5 space-y-4">{[...order.timeline].reverse().map((event,i)=>
              <li key={i} className="border-l-2 border-blue-200 pl-4">
                <p className="text-[13px] font-bold">{statuses[event.status]||"Atualização do pedido"}</p>
                <p className="mt-1 text-[11px] text-[#8292a6]">{displayDate(event.createdAt)}</p>
              </li>)}</ol>
          </section>}
        </main>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24">
          <div className={card+" overflow-hidden"}>
            <div className="border-b border-[#e8eef6] p-5"><h3 className="flex items-center gap-2 text-[15px] font-extrabold"><ShoppingBag size={18} className="text-[var(--art-primary)]"/> Resumo da compra</h3></div>
            <div className="divide-y divide-[#edf1f6]">
              {order.items.map((item,i)=><div key={i} className="flex justify-between gap-3 px-5 py-3 text-[12px]">
                <span className="min-w-0 text-[#425a75]">{item.quantity} × {item.title}</span>
                <strong className="shrink-0">{formatCurrency(item.quantity*item.unitPrice)}</strong>
              </div>)}
            </div>
            <div className="space-y-3 border-t border-[#e8eef6] p-5 text-[12px]">
              <div className="flex justify-between gap-3"><span>Subtotal</span><strong>{formatCurrency(order.subtotal)}</strong></div>
              <div className="flex justify-between gap-3"><span>{pickup?"Retirada":"Entrega"}</span><strong>{order.shippingPrice===0?"Grátis":formatCurrency(order.shippingPrice)}</strong></div>
              <div className="flex justify-between gap-3 border-t border-[#e9eef6] pt-3 text-[16px] font-extrabold"><span>Total</span><span className="text-[var(--art-primary)]">{formatCurrency(order.total)}</span></div>
            </div>
          </div>
          <div className={card+" p-5"}>
            <h3 className="flex items-center gap-2 text-[14px] font-extrabold"><LockKeyhole size={17} className="text-[var(--art-primary)]"/> Seu link privado</h3>
            <p className="mt-2 text-[12px] leading-5 text-[#687f98]">Guarde este link para acompanhar o pedido depois. Qualquer pessoa com ele poderá consultar o andamento.</p>
            <button type="button" className={primaryButton+" mt-4 w-full"} onClick={()=>void share()}>
              {copied?<CheckCircle2 size={17}/>:<Copy size={17}/>} {copied?"Link copiado":"Copiar link de acompanhamento"}
            </button>
            <button type="button" className={secondaryButton+" mt-2 w-full"} onClick={()=>void fetchOrder(token)} disabled={loading}>
              <RefreshCw size={16}/> Atualizar situação
            </button>
          </div>
        </aside>
      </div>}
      <div className="flex flex-wrap items-center gap-4 pt-2 text-[12px]">
        <Link to="/loja" className="inline-flex items-center gap-2 font-bold text-[var(--art-primary)] hover:underline"><ArrowLeft size={16}/> Voltar à loja</Link>
        <Link to="/contato" className="inline-flex items-center gap-2 font-bold text-[#536e8e] hover:text-[var(--art-primary)]"><Headphones size={16}/> Precisa de ajuda?</Link>
      </div>
    </div>
  </div>;
}
