import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ClipboardList, LockKeyhole, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";

type PublicProposal = {
  proposal_number:number;organization_name:string;customer_name:string;
  valid_until:string;subtotal:number;discount:number;total:number;
  notes:string|null;
  items:Array<{name:string;quantity:number;unit_price:number;total:number}>;
};
function dateLabel(value:string){
  const parts=value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return parts?parts[3]+"/"+parts[2]+"/"+parts[1]:value;
}
const fieldClass="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600";
const buttonClass="flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50";

export function PublicSalesProposalApprovalPage(){
  const {token}=useParams<{token:string}>();
  const valid=Boolean(token&&/^[a-f0-9]{64}$/i.test(token));
  const [name,setName]=useState("");
  const [last4,setLast4]=useState("");
  const [consent,setConsent]=useState(false);
  const [decision,setDecision]=useState<"approved"|"rejected"|null>(null);
  const [confirmed,setConfirmed]=useState<"approved"|"rejected"|null>(null);
  const [error,setError]=useState<string|null>(null);
  const query=useQuery({
    queryKey:["public","sales-proposal-approval",token],
    queryFn:async()=>{
      const {data,error}=await supabase.rpc("get_sales_proposal_public_v1",{p_token:token!});
      if(error)throw error;
      return data as PublicProposal;
    },
    enabled:valid,staleTime:30_000,retry:false,
  });
  const mutation=useMutation({
    mutationFn:async()=>{
      if(!decision||!consent)throw new Error("Confirme sua decisão.");
      const {data,error}=await supabase.rpc("respond_sales_proposal_public_v1",{
        p_token:token,p_decision:decision,p_confirm_name:name.trim(),
        p_document_last4:last4.trim(),p_consent:true,
      });
      if(error)throw error;
      return data as {status:"approved"|"rejected"};
    },
    onSuccess:value=>{setConfirmed(value.status);setError(null);},
    onError:e=>setError(systemErrorMessage(e,"Não foi possível registrar a resposta.")),
  });

  return <div className="min-h-dvh bg-slate-100 px-4 py-10 text-slate-900">
    <main className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 border-b border-slate-200 pb-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700">
          <ClipboardList size={19}/> Aprovação de proposta comercial
        </div>
        <h1 className="text-2xl font-bold">Confirmação do cliente</h1>
        <p className="mt-2 text-sm text-slate-500">
          Confira os valores e confirme sua decisão. Você não precisa criar uma conta para responder.
        </p>
      </header>
      {!valid?<p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-700">
        Link de proposta inválido. Solicite outro ao vendedor.
      </p>:confirmed?<div className="space-y-3 py-12 text-center">
        {confirmed==="approved"?<CheckCircle2 size={48} className="mx-auto text-emerald-600"/>:
          <XCircle size={48} className="mx-auto text-orange-600"/>}
        <h2 className="text-xl font-bold">
          {confirmed==="approved"?"Proposta aprovada":"Proposta recusada"}
        </h2>
        <p className="text-sm text-slate-600">
          Sua decisão foi registrada. O vendedor poderá dar continuidade ao atendimento.
        </p>
        <p className="text-xs text-slate-500">
          A aprovação comercial não realiza nenhum pagamento nem conclui a entrega.
        </p>
      </div>:query.isPending?<div className="py-14 text-center text-sm text-slate-500">
        Carregando dados da proposta...
      </div>:query.isError||!query.data?<div role="alert" className="flex gap-2 rounded-lg border border-red-200 p-4 text-sm text-red-700">
        <AlertCircle size={18} className="shrink-0"/>
        <p>{systemErrorMessage(query.error,"A proposta não está mais disponível.")}</p>
      </div>:<div className="space-y-6">
        <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Empresa</p>
            <p className="font-semibold">{query.data.organization_name}</p>
            <p className="mt-2 text-xs text-slate-500">Proposta #{query.data.proposal_number}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="font-semibold">{query.data.customer_name}</p>
            <p className="mt-2 text-xs text-slate-500">Validade: {dateLabel(query.data.valid_until)}</p>
          </div>
        </div>
        <section className="space-y-2">
          <h2 className="text-base font-bold">Produtos da proposta</h2>
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {query.data.items.map((line,index)=><div key={index}
              className="flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="break-words font-medium">{line.name}</p>
                <p className="mt-1 text-xs text-slate-500">{line.quantity} × {formatCurrency(line.unit_price)}</p>
              </div>
              <strong className="shrink-0 tabular-nums">{formatCurrency(line.total)}</strong>
            </div>)}
          </div>
          <div className="space-y-1 rounded-lg bg-slate-100 p-3 text-sm">
            <div className="flex justify-between gap-2"><span>Subtotal</span><span>{formatCurrency(query.data.subtotal)}</span></div>
            <div className="flex justify-between gap-2"><span>Desconto</span><span>{formatCurrency(query.data.discount)}</span></div>
            <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 text-lg font-bold">
              <span>Total</span><span>{formatCurrency(query.data.total)}</span>
            </div>
          </div>
          {query.data.notes&&<div>
            <h3 className="mb-1 text-sm font-semibold">Condições comerciais</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{query.data.notes}</p>
          </div>}
        </section>
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h2 className="text-base font-bold">Sua resposta</h2>
          <label className="block space-y-1.5 text-sm font-semibold">
            <span>Nome de quem confirma *</span>
            <input value={name} maxLength={160} autoComplete="name"
              onChange={event=>setName(event.target.value)} className={fieldClass}
              placeholder="Nome completo"/>
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            <span>Últimos quatro dígitos do CPF/CNPJ do cliente *</span>
            <input value={last4} maxLength={4} inputMode="numeric" autoComplete="off"
              onChange={event=>setLast4(event.target.value.replace(/\D/g,"").slice(0,4))}
              className={fieldClass} placeholder="0000"/>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm leading-5">
            <input type="checkbox" checked={consent}
              onChange={event=>setConsent(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-blue-700"/>
            <span>Li os itens, valores e condições da proposta e confirmo que esta é minha decisão comercial.</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={()=>{setDecision("approved");setError(null);}}
              className={buttonClass+" "+(decision==="approved"?"bg-emerald-600 text-white":"border border-emerald-400 text-emerald-700")}>
              <CheckCircle2 size={17}/> Aprovar
            </button>
            <button type="button" onClick={()=>{setDecision("rejected");setError(null);}}
              className={buttonClass+" "+(decision==="rejected"?"bg-orange-600 text-white":"border border-orange-400 text-orange-700")}>
              <XCircle size={17}/> Recusar
            </button>
          </div>
          {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-xs text-red-700">{error}</p>}
          <button type="button" disabled={!decision||name.trim().length<3||last4.length!==4||!consent||mutation.isPending}
            onClick={()=>{setError(null);mutation.mutate();}}
            className={buttonClass+" w-full bg-blue-700 text-white hover:bg-blue-800"}>
            {mutation.isPending?"Registrando resposta...":"Confirmar minha decisão"}
          </button>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <LockKeyhole size={13}/> Link individual, de uso único e com prazo limitado.
          </p>
        </section>
      </div>}
    </main>
  </div>;
}
