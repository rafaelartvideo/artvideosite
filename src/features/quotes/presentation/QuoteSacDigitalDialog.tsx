import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AdminDialog, AdminButton, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { adminPath } from "@/features/admin-shell/admin-routes";
import {
 DEFAULT_SAC_ORDER_MESSAGE_PRESETS, listSacDigitalOrderMessagePresets,
 prepareSacDigitalNewConversationContact, startSacDigitalNewConversation,
 refreshSacDigitalProtocol, sendSacDigitalTextMessage,
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
 const [acceptedProtocol,setAcceptedProtocol]=useState("");
 const [deliveryState,setDeliveryState]=useState("accepted");
 const [uncertainProtocol,setUncertainProtocol]=useState("");
 const requestId=useRef(crypto.randomUUID());
 const inFlight=useRef(false);
 const customer=quote?.customer||{};
 useEffect(()=>{
  let cancelled=false;
  setError("");setAcceptedProtocol("");setUncertainProtocol("");setLoading(true);
  requestId.current=crypto.randomUUID();
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
  if(inFlight.current||uncertainProtocol||!message.trim()||!organizationId||!quote.customer_id)return;
  inFlight.current=true;setSending(true);setError("");
  let attemptedProtocol="";
  try{
   const prepared=await prepareSacDigitalNewConversationContact(organizationId,{customerId:quote.customer_id});
   const contactId=prepared?.contact?.external_contact_id;
   if(!prepared.prepared||!contactId)throw new Error(prepared.error||"Não foi possível preparar o contato do cliente na SAC Digital.");
   const response=await startSacDigitalNewConversation(organizationId,contactId,message.trim());
   if(!response?.success || !response.protocol) throw new Error("Não foi possível identificar o protocolo de atendimento.");
   if(response.mode==="existing"){
    attemptedProtocol=response.protocol;
    // The API returns success:true merely for discovering an active conversation.
    // It DOES NOT send a message in this branch. Submit it explicitly and await
    // a provider-backed send receipt before presenting any confirmation.
    await refreshSacDigitalProtocol(organizationId,response.protocol);
    const receipt=await sendSacDigitalTextMessage(organizationId,response.protocol,message.trim(),requestId.current);
    const state=String(receipt?.delivery_status||"unknown").toLowerCase();
    if(!receipt?.success || !["accepted","queued","sent","delivered","read"].includes(state))
     throw new Error("A SAC Digital não confirmou o envio desta mensagem. Consulte o atendimento antes de tentar novamente.");
    setDeliveryState(state);
    setAcceptedProtocol(response.protocol);
   }else if(response.mode==="protocol"){
    // New conversations only get here after the provider's send operation.
    // Protocol confirmation is not proof of WhatsApp delivery.
    setDeliveryState("accepted");
    setAcceptedProtocol(response.protocol);
   }else{
    throw new Error("O atendimento foi localizado, mas o envio não foi confirmado.");
   }
  }catch(caught){
   const failure=caught as Error & {outcome?:string;protocol?:string};
   setError(systemErrorMessage(caught,"Não foi possível enviar a mensagem pela SAC Digital."));
   if(failure.outcome==="unknown"){
    setUncertainProtocol(String(failure.protocol||attemptedProtocol||"unknown"));
    setError("O resultado do envio é incerto. Consulte a conversa no SAC Digital antes de repetir para evitar mensagens duplicadas.");
   }
  }
  finally{inFlight.current=false;setSending(false);}
 };
 const openConversation=()=>{
  const query=new URLSearchParams({customer:String(quote.customer_id)});
  const destination=acceptedProtocol||uncertainProtocol;
  if(destination && destination!=="unknown" && /^[A-Za-z0-9_-]{3,80}$/.test(destination))query.set("protocol",destination);
  window.open(`${adminPath("tools","sac-digital") }?${query.toString()}`,"_blank","noopener,noreferrer");
  onClose();
 };
 return <AdminDialog open onClose={()=>{if(!sending)onClose();}}
  title={acceptedProtocol?"Envio aceito pela SAC":"WhatsApp · Orçamento"}
  description={acceptedProtocol?"Solicitação aceita; a entrega ao WhatsApp pode levar mais tempo.":"Selecione um modelo, revise a mensagem e envie pelo SAC Digital."}
  className="max-w-xl"
  footer={acceptedProtocol?<div className="flex w-full justify-end gap-2"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary><AdminButton onClick={openConversation}>Abrir conversa</AdminButton></div>
   :<div className="flex w-full flex-wrap justify-end gap-2"><BtnSecondary onClick={onClose} disabled={sending}>Cancelar</BtnSecondary>
    {uncertainProtocol && <AdminButton variant="secondary" onClick={openConversation}>Conferir conversa</AdminButton>}
    <AdminButton onClick={()=>void send()} loading={sending} disabled={sending||loading||Boolean(uncertainProtocol)||!message.trim()}><WhatsAppBrandIcon size={15}/> Enviar pelo SAC</AdminButton></div>}>
  {acceptedProtocol?<div role="status" className="flex flex-col items-center gap-3 py-9 text-center"><CheckCircle2 size={48} className="text-emerald-600"/><p className="font-semibold">Envio {deliveryState==="queued"?"na fila":deliveryState==="delivered"?"entregue":deliveryState==="read"?"lido":"aceito"} pela SAC Digital.</p><p className="max-w-sm text-sm text-muted-foreground">A confirmação de envio não significa que o WhatsApp já entregou a mensagem. Verifique o status na conversa.</p><p className="text-xs text-muted-foreground">Protocolo de atendimento: {acceptedProtocol}</p></div>
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
