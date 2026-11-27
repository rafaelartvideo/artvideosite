import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSignature, ImagePlus, Info, PackageCheck, ShieldCheck } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/primitives/popover";
import { supabase } from "@/lib/supabase";
import { OrderSignatureRequestDialog } from "./OrderSignatureRequestDialog";
import { SignatureQrDialog } from "./SignatureQrDialog";
import { signatureRequestCreationFeedback } from "@/features/documents/domain/document-signature-feedback.mjs";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { listOrderSignatureRequests } from "@/features/documents/infrastructure/document-signatures.repository";
import type { DocumentSignatureRequestSummary } from "@/features/documents/domain/document-signature";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import {
  attachOrderSituationDocument, listAttachmentTypes, listOrderSituationDocuments,
} from "../infrastructure/order-documents.repository";
import { listOrderWarrantyPartners, type OrderWarrantyPartner } from "../infrastructure/order-finance.repository";
import {
  completeOrderTerminalExit, getOrderTerminalStock, getUnrepairedReturn, startUnrepairedReturn, cancelUnrepairedReturn, markUnrepairedReturnNotified, type UnrepairedReturnAttempt,
  type OrderTerminalOutcome,type OrderTerminalStockItem,type OrderTerminalStockDecision,
} from "../infrastructure/order-terminal-exit.repository";

const TERMINAL_CONFIG = {
  disposal_confirmed:{
    title:"Confirmar descarte",
    docType:"TERMO_DESCARTE",
    evidence:"evidência de descarte",
    subTitle:"Autorização do proprietário, destinação ambiental e conferência do estoque",
    button:"Confirmar descarte e fechar OS",
  },
  returned_unrepaired:{
    title:"Devolver sem reparo",
    docType:"TERMO_DEVOLUCAO_SEM_REPARO",
    evidence:"evidência de devolução",
    subTitle:"Recebimento do equipamento pelo cliente, com termo assinado e evidência de devolução",
    button:"Confirmar devolução e fechar OS",
  },
} as const;

type StockChoice = {decision:""|"reusable"|"installed"|"damaged"|"not_recovered";returnQty:string;physical:boolean};
const INITIAL_CHOICE:StockChoice={decision:"",returnQty:"",physical:false};
const STOCK_OPTIONS=[
  {value:"",label:"Selecione o destino da peça"},
  {value:"reusable",label:"Recuperada e conferida — devolver ao estoque"},
  {value:"installed",label:"Instalada ou consumida — não retornar"},
  {value:"damaged",label:"Danificada / inutilizada — não retornar"},
  {value:"not_recovered",label:"Não recuperada — não retornar"},
];

export function OrderTerminalExitDialog({
  order,outcome,initialReason,templates,templatesLoading=false,usedItems,partRequests,history,printedBy,onClose,onDone,onReturnChanged,onNotifyCustomer,notificationConversationOpen=false,
}:{
  order:any;
  outcome:OrderTerminalOutcome;
  initialReason?:string|null;
  templates:PrintTemplate[];
  templatesLoading?:boolean;
  usedItems:any[];
  partRequests:any[];
  history:any[];
  printedBy?:string|null;
  onClose:()=>void;
  onReturnChanged?:(attempt:UnrepairedReturnAttempt|null)=>void;
  onNotifyCustomer?:(message:string,onSent:(conversationId:string,providerMessageId:string)=>Promise<void>)=>void;
  notificationConversationOpen?:boolean;
  onDone:(result:{id:string;outcome:OrderTerminalOutcome;completed_at:string;returned_to_stock:number})=>void;
}){
  const cfg=TERMINAL_CONFIG[outcome];
  const org=String(order.organization_id||"");
  const orderId=String(order.id||"");
  const isReturn=outcome==="returned_unrepaired";
  const [attempt,setAttempt]=useState<UnrepairedReturnAttempt|null>(null);
  const [category,setCategory]=useState(initialReason?"Orçamento reprovado":"");
  const [observations,setObservations]=useState(initialReason||"");
  const [cancelConfirm,setCancelConfirm]=useState(false);
  const [reason,setReason]=useState(initialReason||"");
  const initiating=isReturn&&!attempt;
  const returnCategories=["Impossibilidade técnica","Peça indisponível","Orçamento reprovado","Desistência do cliente","Equipamento sem defeito constatado","Reparo economicamente inviável","Outros"];
  const [partnerId,setPartnerId]=useState(String(order.disposal_partner_id||""));
  const [partners,setPartners]=useState<OrderWarrantyPartner[]>([]);
  const [attachments,setAttachments]=useState<Array<{media_id:string;created_at?:string;attachment_type?:{name:string}|null;media?:{file_name?:string}|null}>>([]);
  const [attachmentTypeId,setAttachmentTypeId]=useState("");
  const [evidenceId,setEvidenceId]=useState("");
  const [evidenceFile,setEvidenceFile]=useState<File|null>(null);
  const [uploading,setUploading]=useState(false);
  const [stock,setStock]=useState<OrderTerminalStockItem[]>([]);
  const [stockChoices,setStockChoices]=useState<Record<string,StockChoice>>({});
  const [requests,setRequests]=useState<DocumentSignatureRequestSummary[]>([]);
  const [signatureId,setSignatureId]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);
  const [submitting,setSubmitting]=useState(false);
  const [acknowledged,setAcknowledged]=useState(false);
  const [step,setStep]=useState<"form"|"signature"|"qr">("form");
  const [qrLink,setQrLink]=useState<string|null>(null);
  const [signatureBusy,setSignatureBusy]=useState(false);
  useEffect(()=>{if(step!=="signature")setSignatureBusy(false);},[step]);
  const signatureRefreshInFlight=useRef(false);

  const template=templates.find(t=>t.is_active!==false&&t.document_type===cfg.docType);
  // Antecipa apenas o código do renderizador, após abrir a OS e sem consultas extras.
  // Isso evita baixar o html2pdf só depois que o operador confirma o envio do termo.
  useEffect(()=>{
    if(loading||templatesLoading||!template)return;
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean}}).connection;
    if(connection?.saveData)return;
    const timer=window.setTimeout(()=>{void import("html2pdf.js").catch(()=>undefined);},800);
    return()=>window.clearTimeout(timer);
  },[loading,templatesLoading,template?.id]);
  const signedRequests=useMemo(()=>requests.filter(r=>
    r.print_template_id===template?.id&&r.status==="signed"&&Boolean(r.signed_at)&&(!isReturn||(attempt&&Date.parse(r.created_at)>=Date.parse(attempt.started_at)&&Date.parse(r.signed_at||"")>=Date.parse(attempt.started_at)))
  ).sort((a,b)=>Date.parse(b.signed_at||"")-Date.parse(a.signed_at||"")),[requests,template?.id,isReturn,attempt]);

  useEffect(()=>{
    let alive=true;
    setLoading(true);setError("");
    void Promise.all([
      listOrderSignatureRequests(org,orderId),
      listAttachmentTypes(true,org),
      listOrderSituationDocuments(orderId,org),
      getOrderTerminalStock(org,orderId),
      outcome==="disposal_confirmed"?listOrderWarrantyPartners(org):Promise.resolve([]),
      isReturn?getUnrepairedReturn(org,orderId):Promise.resolve(null),
    ]).then(([loadedRequests,attachmentResult,documents,stockRows,partnerRows,loadedAttempt])=>{
      if(!alive)return;
      if(attachmentResult.error)throw attachmentResult.error;
      if(documents.error)throw documents.error;
      setAttempt(loadedAttempt);
      if(loadedAttempt){setReason(loadedAttempt.reason);setCategory(loadedAttempt.reason_category);setObservations(loadedAttempt.observations);}
      setRequests(loadedRequests);
      setAttachments((documents.data||[]) as any[]);
      setStock(stockRows);
      setPartners(partnerRows);
      const type=(attachmentResult.data||[]).find(item=>item.name?.trim().toLocaleLowerCase("pt-BR")===cfg.evidence);
      setAttachmentTypeId(type?.id||"");
    }).catch(e=>{
      if(alive)setError(systemErrorMessage(e,"Não foi possível consultar os requisitos do encerramento."));
    }).finally(()=>{if(alive)setLoading(false)});
    return()=>{alive=false};
  },[org,orderId,outcome,refresh,cfg.evidence,isReturn]);

  // O estado da assinatura é atualizado por evento e, enquanto aguarda,
  // por fallback leve de 15s somente com a OS aberta e aba visível.
  const refreshSignatures=useCallback(async()=>{
    if(signatureRefreshInFlight.current)return;
    signatureRefreshInFlight.current=true;
    try {setRequests(await listOrderSignatureRequests(org,orderId));}
    catch (cause) {console.warn("order-terminal-signatures: refresh",systemErrorMessage(cause));}
    finally {signatureRefreshInFlight.current=false;}
  },[org,orderId]);
  useEffect(()=>{
    if(!org||!orderId||initiating)return;
    const channel=supabase.channel("order-terminal-signatures:"+orderId)
      .on("postgres_changes",{
        event:"*",schema:"public",table:"document_signature_requests",
        filter:"service_order_id=eq."+orderId,
      },()=>{void refreshSignatures();})
      .subscribe();
    const onVisibility=()=>{if(document.visibilityState==="visible")void refreshSignatures();};
    document.addEventListener("visibilitychange",onVisibility);
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible" && step!=="signature" && signedRequests.length===0)
        void refreshSignatures();
    },15000);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",onVisibility);
      void supabase.removeChannel(channel);
    };
  },[org,orderId,refreshSignatures,step,signedRequests.length,initiating]);

  useEffect(()=>{
    setSignatureId(current=>signedRequests.some(x=>x.id===current)?current:(signedRequests[0]?.id||""));
  },[signedRequests]);
  useEffect(()=>{
    setEvidenceId(current=>attachments.some(a=>a.media_id===current&&(!isReturn||(attempt&&Date.parse(a.created_at||"")>=Date.parse(attempt.started_at))))?current:
      (attachments.filter(a=>a.attachment_type?.name?.trim().toLocaleLowerCase("pt-BR")===cfg.evidence&&(!isReturn||(attempt&&Date.parse(a.created_at||"")>=Date.parse(attempt.started_at))))
        .at(-1)?.media_id||""));
  },[attachments,cfg.evidence,isReturn,attempt]);

  const evidenceOptions=attachments.filter(a=>
    a.attachment_type?.name?.trim().toLocaleLowerCase("pt-BR")===cfg.evidence&&(!isReturn||(attempt&&Date.parse(a.created_at||"")>=Date.parse(attempt.started_at)))
  );
  const updateChoice=(id:string,change:Partial<StockChoice>)=>{
    setStockChoices(current=>({...current,[id]:{...(current[id]||INITIAL_CHOICE),...change}}));
  };
  const invalidStock=stock.some(item=>{
    const choice=stockChoices[item.inventory_item_id];
    if(!choice?.decision)return true;
    if(choice.decision!=="reusable")return false;
    const value=Number(choice.returnQty);
    return !choice.physical||!Number.isFinite(value)||value<=0||value>item.quantity_outstanding;
  });
  const canFinish=Boolean(!loading&&!submitting&&!uploading&&!error&&template&&signatureId&&evidenceId
    &&(!isReturn||(attempt&&evidenceOptions.some(a=>a.media_id===evidenceId)))&&reason.trim().length>=8&&acknowledged&&!invalidStock
    &&(outcome!=="disposal_confirmed"||partnerId));

  const canStart=Boolean(!loading&&!submitting&&!error&&category&&(category!=="Outros"||observations.trim().length>=8));
  const beginReturn=async()=>{
    if(!canStart)return;
    setSubmitting(true);setError("");
    try{
      const saved=await startUnrepairedReturn(org,orderId,category,observations);
      setAttempt(saved);setReason(saved.reason);setAcknowledged(false);
      setSignatureId("");setEvidenceId("");setStockChoices({});
      onReturnChanged?.(saved);
      notifyAdmin("Devolução iniciada. A OS permanece aberta aguardando retirada.","success");
    }catch(e){setError(systemErrorMessage(e,"Não foi possível iniciar a devolução."));}
    finally{setSubmitting(false);}
  };
  const notifyCustomer=()=>{
    if(!attempt||!onNotifyCustomer||notificationConversationOpen)return;
    const currentAttemptId=attempt.id;
    const publicReason=attempt.reason_category==="Outros"?"Conforme avaliação realizada":attempt.reason_category;
    const message="Olá! Sobre a OS #"+order.os_number+", informamos que o equipamento está disponível para retirada sem reparo.\n\nMotivo: "+publicReason+".\n\nPedimos que entre em contato para combinar a retirada. Estamos à disposição para esclarecer qualquer dúvida.";
    onNotifyCustomer(message,async(conversationId,providerMessageId)=>{
      const saved=await markUnrepairedReturnNotified(org,orderId,currentAttemptId,conversationId,providerMessageId);
      setAttempt(current=>current?.id===saved.id?saved:current);
      notifyAdmin("Cliente notificado. Envio registrado na devolução.","success");
    });
  };
  const cancelReturn=async()=>{
    if(!attempt||submitting)return;
    setSubmitting(true);setError("");
    try{
      await cancelUnrepairedReturn(org,orderId);
      onReturnChanged?.(null);
      notifyAdmin("Devolução cancelada. Situação anterior restaurada.","success");
      onClose();
    }catch(e){setError(systemErrorMessage(e,"Não foi possível cancelar a devolução."));}
    finally{setSubmitting(false);setCancelConfirm(false);}
  };

  const upload=async()=>{
    if(!evidenceFile||uploading||!attachmentTypeId)return;
    if(evidenceFile.size<=0||evidenceFile.size>25*1024*1024){
      setError("O arquivo deve ter até 25 MB e não pode estar vazio.");return;
    }
    const supported=["image/jpeg","image/png","image/webp","application/pdf"];
    if(!supported.includes(evidenceFile.type)){
      setError("Selecione uma imagem JPG, PNG, WebP ou PDF.");return;
    }
    setUploading(true);setError("");
    try{
      const mediaId=await attachOrderSituationDocument({
        organizationId:org,serviceOrderId:orderId,
        attachmentTypeId,file:evidenceFile,optimizePhoto:true,
      });
      setEvidenceFile(null);setEvidenceId(mediaId);
      // Não recarregar estoque, parceiros e todas as assinaturas após um anexo.
      const updatedDocuments=await listOrderSituationDocuments(orderId,org);
      if(updatedDocuments.error)throw updatedDocuments.error;
      setAttachments((updatedDocuments.data||[]) as any[]);
      notifyAdmin("Evidência anexada aos documentos da OS.","success");
    }catch(e){setError(systemErrorMessage(e,"Não foi possível anexar a evidência."))}
    finally{setUploading(false)}
  };

  const confirm=async()=>{
    if(!canFinish)return;
    setSubmitting(true);setError("");
    try{
      const choices:OrderTerminalStockDecision[]=stock.map(item=>{
        const choice=stockChoices[item.inventory_item_id];
        return {
          inventory_item_id:item.inventory_item_id,
          decision:choice.decision as OrderTerminalStockDecision["decision"],
          return_qty:choice.decision==="reusable"?Number(choice.returnQty):0,
          physical_confirmed:choice.decision==="reusable"&&choice.physical,
        };
      });
      const result=await completeOrderTerminalExit({
        organizationId:org,orderId,outcome,reason,
        signatureRequestId:signatureId,evidenceMediaId:evidenceId,
        disposalPartnerId:outcome==="disposal_confirmed"?partnerId:null,
        stockDecisions:choices,
      });
      onDone(result);
    }catch(e){setError(systemErrorMessage(e,"Não foi possível finalizar esta OS."));}
    finally{setSubmitting(false)}
  };

  return <AdminDialog open={!notificationConversationOpen} minimizable={false}
    onClose={()=>{if(submitting||uploading||signatureBusy)return;if(step==="form")onClose();else setStep("form");}}
    title={step==="form"
      ? <span className="inline-flex items-center gap-2">{isReturn?(initiating?"Iniciar devolução sem reparo":"Confirmar devolução"):cfg.title}
          <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Informações sobre o encerramento" title="Informações sobre o encerramento"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
          <Info size={17}/>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="z-[170] w-[min(22rem,calc(100vw-2rem))] p-4 text-xs leading-relaxed">
        <p className="mb-2 font-bold text-foreground">{isReturn?"Devolução em duas etapas":"Encerramento sem cobrança"}</p>
        <p>{isReturn?"Iniciar a devolução mantém a OS aberta. Confirme a entrega física para fechar a OS e registrar a perda, quando aplicável.":"A OS será fechada na situação correspondente. O registro ficará em Financeiro → Perdas, sem pagamento nem baixa de caixa."}</p>
        <p className="mt-2">Só as peças recuperadas e conferidas fisicamente voltarão ao estoque.</p>
      </PopoverContent>
    </Popover>
        </span>
      : step==="signature"?"Enviar para assinatura":"Assinatura pronta"}
    description={`OS #${order.os_number||""}`}
    className={step==="form"?"w-[calc(100vw-1.5rem)] max-w-3xl":"w-[calc(100vw-1.5rem)] max-w-xl"}
    transitionKey={step}
    preparing={(loading||(!initiating&&templatesLoading))&&step==="form"}
    preparingKey={orderId+":"+outcome}
    preparingText={outcome==="disposal_confirmed"?"Preparando descarte...":"Preparando devolução..."}
    footer={step==="form" ? <div className="flex flex-wrap justify-end gap-2">
      <AdminButton variant="secondary" disabled={submitting||uploading} onClick={onClose}>Voltar</AdminButton>
      {attempt&&<AdminButton variant="secondary" disabled={submitting||uploading||loading||signedRequests.length>0} onClick={()=>setCancelConfirm(true)}>Cancelar devolução</AdminButton>}
      <AdminButton disabled={initiating?!canStart:!canFinish} loading={submitting} onClick={()=>void (initiating?beginReturn():confirm())}>
        <ShieldCheck size={16}/>{initiating?"Iniciar devolução":cfg.button}
      </AdminButton>
    </div> : null}>
    {step==="signature" ? <OrderSignatureRequestDialog
      embedded open order={order} templates={templates}
      preferredDocumentType={cfg.docType}
      existingRequests={isReturn?requests.filter(r=>attempt&&Date.parse(r.created_at)>=Date.parse(attempt.started_at)):requests}
      usedItems={usedItems} partRequests={partRequests} history={history} printedBy={printedBy}
      onBusyChange={setSignatureBusy}
      onClose={()=>setStep(current=>current==="qr"?"qr":"form")}
      onCreated={result=>{
        const feedback=signatureRequestCreationFeedback(result);
        notifyAdmin(feedback.message,feedback.type);
        void refreshSignatures();
        if(result.link){setQrLink(result.link);setStep("qr");}
        else setStep("form");
      }}
    /> : step==="qr" ? <SignatureQrDialog embedded link={qrLink}
      onClose={()=>{setQrLink(null);setStep("form");void refreshSignatures();}}/> : <div className="space-y-4">
        {isReturn?<section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">{initiating?"1. Motivo da devolução":"2. Aguardando retirada sem reparo"}</h3>
            <span className="text-xs text-muted-foreground">{initiating?"Etapa 1 de 2":"Etapa 2 de 2"}</span>
          </div>
          {initiating?<><FSelect label="Motivo da devolução" required value={category}
            onChange={(e:any)=>setCategory(e.target.value)} disabled={submitting}
            options={[{value:"",label:"Selecione o motivo"},...returnCategories.map(value=>({value,label:value}))]}/>
          <FTextarea label="Observações" required={category==="Outros"} rows={3} value={observations}
            onChange={(e:any)=>setObservations(e.target.value)} placeholder="Descreva as condições do equipamento..." disabled={submitting}/>
          <p className="text-xs text-muted-foreground">A OS ficará aberta até a entrega efetiva do equipamento.</p></>:<>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Motivo</p><p className="text-sm font-semibold">{attempt?.reason_category}</p></div>
            <div><p className="text-xs text-muted-foreground">Aguardando desde</p><p className="text-sm font-semibold">{attempt&&new Date(attempt.started_at).toLocaleString("pt-BR")}</p></div>
          </div>
          {attempt?.observations&&<p className="whitespace-pre-wrap text-sm">{attempt.observations}</p>}
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">OS aberta · Equipamento sob responsabilidade da assistência</p>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="min-w-0">
              {attempt?.notified_at?<><p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16}/> Cliente notificado</p><p className="text-xs text-muted-foreground">{new Date(attempt.notified_at).toLocaleString("pt-BR")}</p></>:<p className="text-sm text-muted-foreground">Cliente ainda não notificado</p>}
            </div>
            {onNotifyCustomer&&<AdminButton variant="secondary" disabled={submitting||loading||notificationConversationOpen} onClick={notifyCustomer}>{attempt?.notified_at?"Notificar novamente":"Notificar cliente"}</AdminButton>}
          </div>
          {cancelConfirm&&<div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm">Cancelar a devolução e restaurar a situação anterior da OS?</p>
            <div className="flex justify-end gap-2"><AdminButton variant="secondary" disabled={submitting} onClick={()=>setCancelConfirm(false)}>Voltar</AdminButton><AdminButton disabled={submitting} loading={submitting} onClick={()=>void cancelReturn()}>Confirmar cancelamento</AdminButton></div>
          </div>}
          </>}
        </section>:<section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">{outcome==="disposal_confirmed"?"Motivo e instituição":"Motivo da devolução"}</h3>
          <FTextarea label={outcome==="disposal_confirmed"?"Motivo do descarte":"Motivo da devolução"} required
            rows={2} value={reason} onChange={(e:any)=>setReason(e.target.value)}
            placeholder="Registre o motivo técnico e as condições verificadas..." disabled={submitting}/>
          {outcome==="disposal_confirmed"&&<FSelect label="Instituição destinatária" required value={partnerId}
            onChange={(e:any)=>setPartnerId(e.target.value)}
            disabled={submitting}
            options={[{value:"",label:"Selecione uma instituição parceira"},
              ...partners.map(item=>({value:item.id,label:item.name}))]}/>}
        </section>}
        {!initiating&&<>
        <section className={isReturn?"space-y-3 border-t border-border pt-4":"space-y-3 rounded-xl border border-border bg-card p-4"}>
          <h3 className="text-sm font-bold text-foreground">Termo e assinaturas</h3>
          {isReturn&&<p className="text-xs text-muted-foreground">Solicite a assinatura do recebimento somente na entrega física.</p>}
          <p className="text-xs text-muted-foreground">{template?.name||"Termo de encerramento"}</p>
          {signedRequests.length>0?<div className="space-y-2">
            <FSelect label="Termo assinado" value={signatureId} onChange={(e:any)=>setSignatureId(e.target.value)}
              options={signedRequests.map(r=>({value:r.id,label:`Assinado em ${new Date(r.signed_at||r.created_at).toLocaleString("pt-BR")} · ${r.external_signer_name||"Cliente"}`}))}/>
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={15}/> Assinatura registrada
            </p>
          </div>:<p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Aguardando assinatura do termo.
          </p>}
          <AdminButton variant="secondary" onClick={()=>setStep("signature")} disabled={!template||submitting}>
            <FileSignature size={16}/> {signedRequests.length?"Solicitar outro termo":"Solicitar assinatura do termo"}
          </AdminButton>
          {!template&&<p className="text-xs text-destructive">Modelo não carregado. Verifique os modelos no módulo Documentos.</p>}
        </section>
        <section className={isReturn?"space-y-3 border-t border-border pt-4":"space-y-3 rounded-xl border border-border bg-card p-4"}>
          <h3 className="text-sm font-bold text-foreground">Evidência de {outcome==="disposal_confirmed"?"descarte":"devolução"}</h3>
          <p className="text-xs text-muted-foreground">Anexe uma foto ou PDF para registrar a {outcome==="disposal_confirmed"?"destinação":"entrega"}.</p>
          {evidenceOptions.length>0&&<FSelect label="Evidência anexada" value={evidenceId}
            onChange={(e:any)=>setEvidenceId(e.target.value)}
            options={evidenceOptions.map((a,i)=>({
              value:a.media_id,label:a.media?.file_name||`Evidência ${i+1}`
            }))}/>}
          <div className="flex flex-wrap items-center gap-3">
            <label className={isReturn?"flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-5 text-xs font-semibold hover:bg-muted":"inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"}>
              <ImagePlus size={16}/> {isReturn?(evidenceFile||evidenceId?"Trocar":"Adicionar"):"Selecionar foto ou PDF"}
              <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e=>setEvidenceFile(e.currentTarget.files?.[0]||null)} disabled={submitting||uploading}/>
            </label>
            {evidenceFile&&<span className="min-w-0 max-w-44 truncate text-xs text-muted-foreground">{evidenceFile.name}</span>}
            <AdminButton size="sm" disabled={!evidenceFile||!attachmentTypeId||uploading||submitting}
              loading={uploading} onClick={()=>void upload()}>Anexar evidência</AdminButton>
          </div>
          {!attachmentTypeId&&<p role="alert" className="text-xs text-destructive">
            O tipo de evidência não está disponível nesta empresa.
          </p>}
        </section>
        {stock.length>0 && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <PackageCheck size={17}/> Conferência das peças
          </h3>
          {stock.map(item=>{
              const choice=stockChoices[item.inventory_item_id]||INITIAL_CHOICE;
              return <div key={item.inventory_item_id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-foreground">{item.name}</p>
                    {item.sku&&<p className="text-[11px] text-muted-foreground">SKU {item.sku}</p>}
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Saída pendente: {item.quantity_outstanding} {item.unit}
                  </span>
                </div>
                <FSelect label="Destino confirmado da peça" required value={choice.decision}
                  onChange={(e:any)=>updateChoice(item.inventory_item_id,{decision:e.target.value,physical:false,returnQty:""})}
                  options={STOCK_OPTIONS} disabled={submitting}/>
                {choice.decision==="reusable"&&<div className="space-y-2 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3">
                  <FInput label="Quantidade fisicamente recuperada" type="number" min="0" max={item.quantity_outstanding}
                    step="0.001" value={choice.returnQty}
                    onChange={(e:any)=>updateChoice(item.inventory_item_id,{returnQty:e.target.value})}
                    disabled={submitting}/>
                  <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <input type="checkbox" checked={choice.physical} disabled={submitting}
                      onChange={e=>updateChoice(item.inventory_item_id,{physical:e.target.checked})}/>
                    Confirmei fisicamente que a quantidade está em condições de reutilização
                  </label>
                </div>}
              </div>;
            })}
          <p className="text-xs text-muted-foreground">
            Peças instaladas, danificadas ou não recuperadas são registradas, mas não entram no estoque.
            Uma nova entrada será criada somente para a quantidade reutilizável confirmada.
          </p>
        </section>}
        <label className="flex items-start gap-2 border-t border-border pt-4 text-xs font-semibold leading-5 text-foreground">
          <input type="checkbox" className="mt-1" checked={acknowledged} disabled={submitting}
            onChange={e=>setAcknowledged(e.target.checked)}/>
          Confirmo que conferi o equipamento, o termo, a evidência e as peças antes de encerrar a OS.
        </label>
        </>}
      {error&&<p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertTriangle size={15} className="shrink-0"/>{error}
        <button type="button" className="ml-auto underline" onClick={()=>{setError("");setRefresh(x=>x+1)}}>Tentar novamente</button>
      </p>}
    </div>}
  </AdminDialog>;
}
