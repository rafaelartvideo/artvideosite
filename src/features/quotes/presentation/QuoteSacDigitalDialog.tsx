import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { AdminDialog, AdminButton, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { adminPath } from "@/features/admin-shell/admin-routes";
import {
 DEFAULT_SAC_ORDER_MESSAGE_PRESETS, listSacDigitalOrderMessagePresets,
 prepareSacDigitalNewConversationContact, startSacDigitalNewConversation,
 type SacDigitalOrderMessagePreset,
} from "@/features/sac-digital/infrastructure/sac-digital.repository";
import { parseQuoteRequestMessage, quoteAddressLabel, quoteRequestAddress } from "../domain/quote-request-details.mjs";

function renderQuoteTemplate(template:string, quote:any) {
 const customer=quote?.customer||{};
 const name=String(customer.trade_name||customer.full_name||"").trim();
 const parsed=parseQuoteRequestMessage(quote?.customer_message);
 const schedule=parsed.schedule||"A confirmar";
 const match=schedule.match(/^(\d{2}\/\d{2}\/\d{4})\s*[·-]\s*(.+)$/);
 const address=quoteAddressLabel(quoteRequestAddress(quote));
 const values:Record<string,string>={
  "{primeiro_nome}":name.split(/\s+/)[0]||"cliente","{nome_cliente}":name||"cliente",
  "{protocolo}":String(quote.protocol||""),"{servico}":String(quote.service?.title||parsed.service||parsed.equipment||"seu atendimento"),
  "{data}":match?.[1]||"A confirmar","{horario}":match?.[2]||"A confirmar",
  "{endereco}":address||"A confirmar","{os}":"—",
 };
 return Object.entries(values).reduce((text,[variable,value])=>text.replaceAll(variable,value),String(template||""));
}
export function QuoteSacDigitalDialog({quote,organizationId,onClose}:{
 quote:any;organizationId:string;onClose:()=>void;
}) {
 const [presets,setPresets]=useState<SacDigitalOrderMessagePreset[]>([]);
 const [purpose,setPurpose]=useState("");
 const [message,setMessage]=useState("");
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [successProtocol,setSuccessProtocol]=useState("");
 const inFlight=useRef(false);
 const customer=quote?.customer||{};
 useEffect(()=>{
  let cancelled=false;
  setError("");setSuccessProtocol("");setLoading(true);
  const defaults=DEFAULT_SAC_ORDER_MESSAGE_PRESETS.filter(p=>p.scope==="quote"||p.scope==="both");
  const apply=(items:SacDigitalOrderMessagePreset[])=>{
   if(cancelled)return;
   const available=items.filter(p=>p.is_active&&(p.scope==="quote"||p.scope==="both"));
   setPresets(available);
   const first=available[0];
   setPurpose(first?.preset_key||"");setMessage(first?renderQuoteTemplate(first.message_template,quote):"");
   setLoading(false);
  };
  void listSacDigitalOrderMessagePresets(organizationId).then(apply).catch(()=>{
    if(!cancelled){apply(defaults);setError("Não foi possível consultar os modelos salvos. Confira a integração antes de enviar.");}
  });
  return ()=>{cancelled=true;};
 },[quote?.id,organizationId]);
 const send=async()=>{
  if(inFlight.current||!message.trim()||!organizationId||!quote.customer_id)return;
  inFlight.current=true;setSending(true);setError("");
  try{
   const prepared=await prepareSacDigitalNewConversationContact(organizationId,{customerId:quote.customer_id});
   const contactId=prepared?.contact?.external_contact_id;
   if(!prepared.prepared||!contactId)throw new Error(prepared.error||"Não foi possível preparar o contato do cliente na SAC Digital.");
   const response=await startSacDigitalNewConversation(organizationId,contactId,message.trim());
   if(!response?.success || !response.protocol)throw new Error("A SAC Digital não confirmou um protocolo para esta mensagem.");
   setSuccessProtocol(response.protocol);
  }catch(caught){setError(systemErrorMessage(caught,"Não foi possível enviar a mensagem pela SAC Digital."));}
  finally{inFlight.current=false;setSending(false);}
 };
 const openConversation=()=>{
  const query=new URLSearchParams({customer:String(quote.customer_id)});
  if(successProtocol && /^[A-Za-z0-9_-]{3,80}$/.test(successProtocol))query.set("protocol",successProtocol);
  window.open(`${adminPath("tools","sac-digital") }?${query.toString()}`,"_blank","noopener,noreferrer");
  onClose();
 };
 return <AdminDialog open onClose={()=>{if(!sending)onClose();}}
  title={successProtocol?"Mensagem enviada":"WhatsApp · Orçamento"}
  description={successProtocol?"O SAC Digital confirmou o atendimento.":"Selecione um modelo, revise a mensagem e envie pelo SAC Digital."}
  className="max-w-xl"
  footer={successProtocol?<div className="flex w-full justify-end gap-2"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary><AdminButton onClick={openConversation}>Abrir conversa</AdminButton></div>
   :<div className="flex w-full flex-wrap justify-end gap-2"><BtnSecondary onClick={onClose} disabled={sending}>Cancelar</BtnSecondary>
    <AdminButton onClick={()=>void send()} loading={sending} disabled={sending||loading||!message.trim()}><MessageCircle size={15}/> Enviar pelo SAC</AdminButton></div>}>
  {successProtocol?<div role="status" className="flex flex-col items-center gap-3 py-9 text-center"><CheckCircle2 size={48} className="text-emerald-600"/><p className="font-semibold">Mensagem confirmada pela SAC Digital.</p><p className="text-xs text-muted-foreground">Protocolo de atendimento: {successProtocol}</p></div>
   :<div className="space-y-4">
    <div className="rounded-lg bg-muted/30 p-3"><p className="text-sm font-semibold">{customer.trade_name||customer.full_name||"Cliente"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Orçamento {quote.protocol||quote.id}</p></div>
    <FSelect label="Modelo da mensagem" value={purpose} disabled={loading||sending}
     options={presets.map(p=>({value:p.preset_key,label:p.label}))}
     onChange={(event:any)=>{const key=event.target.value;setPurpose(key);const next=presets.find(p=>p.preset_key===key);if(next)setMessage(renderQuoteTemplate(next.message_template,quote));}}/>
    <FTextarea label="Mensagem" value={message} rows={6} maxLength={5000} disabled={loading||sending}
      onChange={(event:any)=>setMessage(event.target.value)} placeholder="Escreva a mensagem para o cliente"/>
    <p className="text-xs text-muted-foreground">O envio não é automático. A mensagem será enviada somente após você confirmar.</p>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   </div>}
 </AdminDialog>;
}
