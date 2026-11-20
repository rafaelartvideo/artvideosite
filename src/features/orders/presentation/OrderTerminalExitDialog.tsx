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
  completeOrderTerminalExit, getOrderTerminalStock,
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
  order,outcome,templates,templatesLoading=false,usedItems,partRequests,history,printedBy,onClose,onDone,
}:{
  order:any;
  outcome:OrderTerminalOutcome;
  templates:PrintTemplate[];
  templatesLoading?:boolean;
  usedItems:any[];
  partRequests:any[];
  history:any[];
  printedBy?:string|null;
  onClose:()=>void;
  onDone:(result:{id:string;outcome:OrderTerminalOutcome;completed_at:string;returned_to_stock:number})=>void;
}){
  const cfg=TERMINAL_CONFIG[outcome];
  const org=String(order.organization_id||"");
  const orderId=String(order.id||"");
  const [reason,setReason]=useState("");
  const [partnerId,setPartnerId]=useState(String(order.disposal_partner_id||""));
  const [partners,setPartners]=useState<OrderWarrantyPartner[]>([]);
  const [attachments,setAttachments]=useState<Array<{media_id:string;attachment_type?:{name:string}|null;media?:{file_name?:string}|null}>>([]);
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
  const signatureRefreshInFlight=useRef(false);

  const template=templates.find(t=>t.is_active!==false&&t.document_type===cfg.docType);
  const signedRequests=useMemo(()=>requests.filter(r=>
    r.print_template_id===template?.id&&r.status==="signed"&&Boolean(r.signed_at)
  ).sort((a,b)=>Date.parse(b.signed_at||"")-Date.parse(a.signed_at||"")),[requests,template?.id]);

  useEffect(()=>{
    let alive=true;
    setLoading(true);setError("");
    void Promise.all([
      listOrderSignatureRequests(org,orderId),
      listAttachmentTypes(true,org),
      listOrderSituationDocuments(orderId,org),
      getOrderTerminalStock(org,orderId),
      outcome==="disposal_confirmed"?listOrderWarrantyPartners(org):Promise.resolve([]),
    ]).then(([loadedRequests,attachmentResult,documents,stockRows,partnerRows])=>{
      if(!alive)return;
      if(attachmentResult.error)throw attachmentResult.error;
      if(documents.error)throw documents.error;
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
  },[org,orderId,outcome,refresh,cfg.evidence]);

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
    if(!org||!orderId)return;
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
  },[org,orderId,refreshSignatures,step,signedRequests.length]);

  useEffect(()=>{
    setSignatureId(current=>signedRequests.some(x=>x.id===current)?current:(signedRequests[0]?.id||""));
  },[signedRequests]);
  useEffect(()=>{
    setEvidenceId(current=>attachments.some(a=>a.media_id===current)?current:
      (attachments.filter(a=>a.attachment_type?.name?.trim().toLocaleLowerCase("pt-BR")===cfg.evidence)
        .at(-1)?.media_id||""));
  },[attachments,cfg.evidence]);

  const evidenceOptions=attachments.filter(a=>
    a.attachment_type?.name?.trim().toLocaleLowerCase("pt-BR")===cfg.evidence
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
    &&reason.trim().length>=8&&acknowledged&&!invalidStock
    &&(outcome!=="disposal_confirmed"||partnerId));

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
      setEvidenceFile(null);setRefresh(x=>x+1);setEvidenceId(mediaId);
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

  return <AdminDialog open minimizable={false}
    onClose={()=>{if(submitting||uploading||signatureBusy)return;if(step==="form")onClose();else setStep("form");}}
    title={step==="signature"?"Enviar para assinatura":step==="qr"?"Assinatura pronta":cfg.title}
    description={`OS #${order.os_number||""}`}
    className={step==="form"?"w-[calc(100vw-1.5rem)] max-w-3xl":"w-[calc(100vw-1.5rem)] max-w-xl"}
    transitionKey={step}
    preparing={(loading||templatesLoading)&&step==="form"}
    preparingKey={orderId+":"+outcome}
    preparingText={outcome==="disposal_confirmed"?"Preparando descarte...":"Preparando devolução..."}
    headerActions={step==="form" && <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Informações sobre o encerramento" title="Informações sobre o encerramento"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
          <Info size={17}/>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="z-[170] w-[min(22rem,calc(100vw-2rem))] p-4 text-xs leading-relaxed">
        <p className="mb-2 font-bold text-foreground">Encerramento sem cobrança</p>
        <p>A OS será fechada na situação correspondente. O registro ficará em Financeiro → Perdas, sem pagamento nem baixa de caixa.</p>
        <p className="mt-2">Só as peças recuperadas e conferidas fisicamente voltarão ao estoque.</p>
      </PopoverContent>
    </Popover>}
    footer={step==="form" ? <div className="flex flex-wrap justify-end gap-2">
      <AdminButton variant="secondary" disabled={submitting||uploading} onClick={onClose}>Voltar</AdminButton>
      <AdminButton disabled={!canFinish} loading={submitting} onClick={()=>void confirm()}>
        <ShieldCheck size={16}/>{cfg.button}
      </AdminButton>
    </div> : null}>
    {step==="signature" ? <OrderSignatureRequestDialog
      embedded open order={order} templates={templates}
      preferredDocumentType={cfg.docType}
      existingRequests={requests}
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
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">{outcome==="disposal_confirmed"?"Motivo e instituição":"Motivo da devolução"}</h3>
          <FTextarea label={outcome==="disposal_confirmed"?"Motivo do descarte":"Motivo da devolução"} required
            rows={2} value={reason} onChange={(e:any)=>setReason(e.target.value)}
            placeholder="Registre o motivo técnico e as condições verificadas..." disabled={submitting}/>
          {outcome==="disposal_confirmed"&&<FSelect label="Instituição destinatária" required value={partnerId}
            onChange={(e:any)=>setPartnerId(e.target.value)}
            disabled={submitting}
            options={[{value:"",label:"Selecione uma instituição parceira"},
              ...partners.map(item=>({value:item.id,label:item.name}))]}/>}
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">Termo e assinaturas</h3>
          <p className="text-xs text-muted-foreground">{template?.name||"Termo de encerramento"}</p>
          {signedRequests.length>0?<div className="space-y-2">
            <FSelect label="Termo assinado" value={signatureId} onChange={(e:any)=>setSignatureId(e.target.value)}
              options={signedRequests.map(r=>({value:r.id,label:`Assinado em ${new Date(r.signed_at||r.created_at).toLocaleString("pt-BR")} · ${r.external_signer_name||"Cliente"}`}))}/>
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={15}/> Assinatura registrada
            </p>
          </div>:<p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            O termo ainda não possui as duas assinaturas finalizadas.
          </p>}
          <AdminButton variant="secondary" onClick={()=>setStep("signature")} disabled={!template||submitting}>
            <FileSignature size={16}/> {signedRequests.length?"Solicitar outro termo":"Solicitar assinatura do termo"}
          </AdminButton>
          {!template&&<p className="text-xs text-destructive">Modelo não carregado. Verifique os modelos no módulo Documentos.</p>}
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">Evidência de {outcome==="disposal_confirmed"?"descarte":"devolução"}</h3>
          <p className="text-xs text-muted-foreground">Anexe uma foto ou PDF para registrar a {outcome==="disposal_confirmed"?"destinação":"entrega"}.</p>
          {evidenceOptions.length>0&&<FSelect label="Evidência anexada" value={evidenceId}
            onChange={(e:any)=>setEvidenceId(e.target.value)}
            options={evidenceOptions.map((a,i)=>({
              value:a.media_id,label:a.media?.file_name||`Evidência ${i+1}`
            }))}/>}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <ImagePlus size={16}/> Selecionar foto ou PDF
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
          Conferi equipamento, acessórios, termo assinado, evidência e destino das peças.
          Confirmo o encerramento definitivo da OS, com registro de auditoria.
        </label>
      {error&&<p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertTriangle size={15} className="shrink-0"/>{error}
        <button type="button" className="ml-auto underline" onClick={()=>{setError("");setRefresh(x=>x+1)}}>Tentar novamente</button>
      </p>}
    </div>
  </AdminDialog>;
}
