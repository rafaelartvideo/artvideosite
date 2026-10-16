import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft, CheckCircle2, CircleCheck, ClipboardList, Clock3, Copy,
  CreditCard, Headphones, LoaderCircle, LockKeyhole, MapPin, Package,
  PackageCheck, RefreshCw, ShieldCheck, ShoppingBag, Store, Truck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { formatCurrency } from "@/shared/domain/formatters";
import { getStoreTracking, type StoreTracking } from "../infrastructure/storefront.repository";
import { StoreAfterSalesCustomer } from "./StoreAfterSalesCustomer";

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
const isToken=(v:string)=>/^[a-f0-9]{64}$/i.test(v);
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

export function StoreOrderTrackingPage() {
  const [params]=useSearchParams();
  const [token,setToken]=useState(()=>{
    const hash=new URLSearchParams(typeof window!=="undefined" ? window.location.hash.slice(1):"");
    const fromLink=hash.get("c")||"";
    if(isToken(fromLink)) return fromLink.toLowerCase();
    try {const remembered=sessionStorage.getItem("artvideo-store-tracking")||"";return isToken(remembered)?remembered:"";}catch{return "";}
  });
  const [entered,setEntered]=useState("");
  const [order,setOrder]=useState<StoreTracking|null>(null);
  const [loading,setLoading]=useState(Boolean(token));
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const fetchOrder=useCallback(async(code:string,silent=false)=>{
    if(!code)return;
    if(!silent)setLoading(true);
    setError("");
    try {
      const result=await getStoreTracking(code);
      setOrder(result);
      try{sessionStorage.setItem("artvideo-store-tracking",code);}catch{/* Sessão sem armazenamento. */}
    }catch(err){
      setError(err instanceof Error?err.message:"Não foi possível consultar o pedido.");
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{if(token)void fetchOrder(token);},[token,fetchOrder]);
  useEffect(()=>{
    if(!token)return;
    const id=window.setInterval(()=>{
      if(!document.hidden)void fetchOrder(token,true);
    },60000);
    return ()=>window.clearInterval(id);
  },[token,fetchOrder]);
  const share=async()=>{
    const url=window.location.origin+"/acompanhar-pedido#c="+token;
    try{await navigator.clipboard.writeText(url);setCopied(true);}
    catch{setError("Não foi possível copiar automaticamente. Utilize o endereço desta página.");}
  };
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    const candidate=entered.trim().replace(/[\s-]/g,"").toLowerCase();
    if(!isToken(candidate)){setError("Informe o código de acesso completo enviado com sua compra.");return;}
    window.history.replaceState(null,"","/acompanhar-pedido#c="+candidate);
    setOrder(null);setToken(candidate);setEntered("");setCopied(false);
  };

  const pickup=order?.deliveryMethod==="pickup";
  const paid=order?.paymentStatus==="paid";
  const finished=order?.fulfillmentStatus==="delivered" || order?.fulfillmentStatus==="picked_up";
  const allSteps=pickup?stepsPickup:stepsDelivery;
  const index=order?allSteps.findIndex(s=>s.key===order.fulfillmentStatus):-1;
  const effective=index<0 && order?.fulfillmentStatus==="delivery_issue" ? 3 : Math.max(0,index);
  const resultText=order?.fulfillmentStatus==="ready"&&pickup?"Disponível para retirada":statuses[order?.fulfillmentStatus||""]||"Em andamento";
  const returnState=params.get("retorno");
  return <div className="min-h-[72vh] bg-[#f6f9fd] text-[#112640]">
    <section className="bg-gradient-to-r from-[#071b34] via-[#0d3158] to-[#174d7f] py-10 text-white sm:py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="flex items-center gap-2 text-[12px] font-bold text-blue-200"><ShoppingBag size={16}/> Eletrônica Artvideo</p>
        <h1 className="mt-3 text-[30px] font-extrabold tracking-tight sm:text-[38px]" style={{fontFamily:"'Poppins','Inter',sans-serif"}}>
          Acompanhe seu pedido
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-white/75">
          Consulte o pagamento, a preparação e a entrega ou retirada, sem precisar criar uma conta.
        </p>
      </div>
    </section>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {returnState&&<div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-[12px] leading-5 text-[#3c6087]">
        <ShieldCheck size={19} className="shrink-0 text-[var(--art-primary)]"/>
        Você voltou do ambiente de pagamento. O pagamento não é confirmado apenas pelo retorno: o status abaixo será atualizado depois da validação pelo provedor.
      </div>}
      {!token&&<div className={card+" mx-auto max-w-xl p-6 sm:p-8"}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[var(--art-primary)]"><LockKeyhole size={26}/></div>
        <h2 className="mt-4 text-center text-[20px] font-extrabold">Acesse seu acompanhamento</h2>
        <p className="mt-2 text-center text-[13px] leading-6 text-[#627993]">
          Use seu link privado de acompanhamento ou informe o código de acesso da compra.
          Apenas o número do pedido não permite consultar os dados.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-[12px] font-bold" htmlFor="tracking-secret">Código de acesso
            <input id="tracking-secret" value={entered} onChange={e=>setEntered(e.target.value)} autoComplete="off"
              placeholder="Cole seu código de acompanhamento"
              className="mt-2 min-h-12 w-full rounded-lg border border-[#dbe5f1] px-4 text-[13px] outline-none focus:border-[var(--art-primary)]"/>
          </label>
          <button type="submit" className={primaryButton+" w-full"}>Consultar pedido</button>
        </form>
        <p className="mt-5 text-center text-[11px] text-[#8393a8]">Se perdeu o link, entre em contato com a Artvideo para recuperar o acesso.</p>
      </div>}
      {loading&&<div className={card+" flex min-h-48 items-center justify-center gap-3 text-[13px] text-[#64809f]"}>
        <LoaderCircle size={21} className="animate-spin text-[var(--art-primary)]"/> Consultando pedido...
      </div>}
      {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
        {error}
        {token&&<button type="button" onClick={()=>void fetchOrder(token)} className="ml-3 font-bold underline">Tentar novamente</button>}
      </div>}
      {token&&!loading&&!order&&<div className="flex flex-wrap gap-3">
        <button type="button" className={secondaryButton} onClick={()=>{setToken("");setError("");window.history.replaceState(null,"","/acompanhar-pedido");}}>Informar outro código</button>
        <Link to="/loja" className={secondaryButton}>Voltar à loja</Link>
      </div>}
      {order&&<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <section className={card+" overflow-hidden"}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5edf7] p-5 sm:p-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6e85a0]">Pedido #{order.number}</p>
                <h2 className="mt-2 text-[22px] font-extrabold tracking-tight">{paid?(finished?"Pedido concluído":resultText):paymentNames[order.paymentStatus]||"Em análise"}</h2>
                <p className="mt-1 text-[12px] text-[#74849a]">Realizado em {displayDate(order.createdAt)}</p>
              </div>
              <span className={"rounded-full px-3 py-2 text-[11px] font-bold "+(finished?"bg-emerald-50 text-emerald-700":paid?"bg-blue-50 text-blue-700":"bg-amber-50 text-amber-700")}>
                {paid?"Pagamento confirmado":paymentNames[order.paymentStatus]||"Pagamento em análise"}
              </span>
            </div>
            <div className="p-5 sm:p-6">
              {!paid?<div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50 p-4 text-[12px] leading-6 text-[#936323]">
                <Clock3 size={20} className="mt-0.5 shrink-0"/>
                {order.paymentStatus==="manual_review"?"Seu pagamento precisa ser conferido pela equipe. Não é necessário realizar uma nova cobrança nesta página.":
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
