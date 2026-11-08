import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, ClipboardCopy, MapPin, PackageCheck, Truck } from "lucide-react";
import { formatSalesDate } from "../domain/sales-order-display";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { uploadMediaFile } from "@/shared/infrastructure/media.repository";
import {
  completeSalesDelivery, configureSalesDelivery, getSalesDelivery,
} from "../infrastructure/sales-operations.repository";

export function SalesDeliveryDialog({
  organizationId,orderId,ready,onClose,onSaved,
}: {
  organizationId:string;
  orderId:string;
  ready:boolean;
  onClose:()=>void;
  onSaved:(message:string)=>void;
}) {
  const query=useQuery({
    queryKey:["sales",organizationId,"delivery",orderId],
    queryFn:()=>getSalesDelivery(organizationId,orderId),
    enabled:Boolean(organizationId&&orderId),
  });
  const current=query.data;
  const [mode,setMode]=useState<"configure"|"complete">("configure");
  const [method,setMethod]=useState<"pickup"|"delivery">("pickup");
  const [address,setAddress]=useState("");
  const [expectedAt,setExpectedAt]=useState("");
  const [carrier,setCarrier]=useState("");
  const [tracking,setTracking]=useState("");
  const [pin,setPin]=useState("");
  const [regenerate,setRegenerate]=useState(false);
  const [recipient,setRecipient]=useState("");
  const [recipientDocument,setRecipientDocument]=useState("");
  const [enteredPin,setEnteredPin]=useState("");
  const [proofNotes,setProofNotes]=useState("");
  const [proofFile,setProofFile]=useState<File|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [copied,setCopied]=useState(false);
  const [configured,setConfigured]=useState(false);
  useEffect(()=>{
    if(!current)return;
    setMethod(current.method);
    setAddress(current.address_snapshot||"");
    setExpectedAt(current.expected_at?.slice(0,16)||"");
    setCarrier(current.carrier_name||"");
    setTracking(current.tracking_code||"");
    setRecipient(current.recipient_name||"");
    setRecipientDocument(current.recipient_document||"");
    setProofNotes(current.proof_notes||"");
    setConfigured(true);
  },[current]);

  const configMutation=useMutation({
    mutationFn:()=>configureSalesDelivery(organizationId,orderId,{
      method,address,expectedAt:expectedAt?new Date(expectedAt).toISOString():undefined,
      carrier,tracking,regenerate,
    }),
    onSuccess:res=>{
      setError(null);setConfigured(true);
      if(res.pickup_code){
        setPin(res.pickup_code);setCopied(false);
      }else setPin("");
      onSaved("Entrega ou retirada configurada.");
    },
    onError:e=>setError(systemErrorMessage(e,"Não foi possível configurar a entrega.")),
  });
  const completeMutation=useMutation({
    mutationFn:async()=>{
      let mediaId:string|undefined;
      if(proofFile){
        const media=await uploadMediaFile("service-images",proofFile,organizationId);
        mediaId=media.id;
      }
      await completeSalesDelivery(organizationId,orderId,{
        recipient,document:recipientDocument,pin:enteredPin,
        proofMediaId:mediaId,proofNotes,
      });
    },
    onSuccess:()=>{
      setError(null);
      onSaved("Entrega ou retirada confirmada com comprovante.");
      onClose();
    },
    onError:e=>setError(systemErrorMessage(e,"Não foi possível confirmar o recebimento.")),
  });

  const finished=Boolean(current?.completed_at);
  const busy=configMutation.isPending||completeMutation.isPending;
  const close=()=>{if(!busy)onClose();};
  const submit=()=>{
    setError(null);
    if(mode==="configure")configMutation.mutate();
    else completeMutation.mutate();
  };
  const canComplete=recipient.trim().length>=3&&
    (method==="delivery" ? Boolean(proofFile || proofNotes.trim().length>=10) : /^[0-9]{6}$/.test(enteredPin));
  return <AdminDialog open onClose={close}
    title={finished?"Comprovante da entrega":"Entrega ou retirada"}
    description="Configure o pedido e registre quem recebeu, com segurança."
    className="w-[calc(100vw-1.25rem)] max-w-2xl"
    bodyClassName="max-h-[min(75dvh,690px)] overflow-y-auto"
    footer={<div className="flex w-full flex-wrap justify-end gap-2">
      <AdminButton variant="secondary" size="sm" disabled={busy} onClick={close}>Fechar</AdminButton>
      {!finished&&<AdminButton size="sm" loading={busy}
        disabled={busy||query.isPending||
          (mode==="complete"&&!canComplete)||(mode==="configure"&&method==="delivery"&&address.trim().length<8)}
        onClick={submit}>
        {mode==="configure"?"Salvar configuração":"Confirmar recebimento"}
      </AdminButton>}
    </div>}>
    {query.isPending?<LoadingState text="Carregando dados da entrega..."/>
      :query.isError?<p role="alert" className="text-sm text-destructive">
        {systemErrorMessage(query.error,"Não foi possível carregar a entrega.")}
      </p>
      :<div className="space-y-4">
        {finished?<div className="space-y-2 rounded-lg border border-border p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={17}/> Pedido entregue</p>
          <p>Recebido por: <strong>{current?.recipient_name}</strong></p>
          {current?.recipient_document&&<p>Documento: {current.recipient_document}</p>}
          <p>Data: {formatSalesDate(current?.completed_at)}</p>
          {current?.proof_notes&&<p className="whitespace-pre-wrap">Comprovante: {current.proof_notes}</p>}
          {current?.proof_media_id&&<p className="text-xs text-muted-foreground">Fotografia do comprovante anexada ao pedido.</p>}
        </div>:<>
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            <button type="button" onClick={()=>{setMode("configure");setError(null);}}
              className={"rounded-lg px-3 py-2 text-xs font-semibold "+(mode==="configure"?"bg-primary/10 text-primary":"text-muted-foreground")}>
              1. Configuração
            </button>
            <button type="button" onClick={()=>{setMode("complete");setError(null);}}
              disabled={!ready||!configured}
              className={"rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 "+(mode==="complete"?"bg-primary/10 text-primary":"text-muted-foreground")}>
              2. Confirmar entrega
            </button>
          </div>
          {mode==="configure"?<div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={()=>{setMethod("pickup");setRegenerate(false);}}
                className={"flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-semibold "+
                  (method==="pickup"?"border-primary bg-primary/5":"border-border")}>
                <PackageCheck size={16}/> Retirada na loja
              </button>
              <button type="button" onClick={()=>setMethod("delivery")}
                className={"flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-semibold "+
                  (method==="delivery"?"border-primary bg-primary/5":"border-border")}>
                <Truck size={16}/> Entrega
              </button>
            </div>
            {method==="delivery"&&<>
              <label className="block space-y-1 text-xs font-semibold">
                <span>Endereço completo da entrega</span>
                <textarea rows={2} value={address} maxLength={500}
                  onChange={e=>setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade e CEP"
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm"/>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold"><span>Transportadora (opcional)</span>
                  <input value={carrier} maxLength={120} onChange={e=>setCarrier(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/></label>
                <label className="space-y-1 text-xs font-semibold"><span>Rastreio (opcional)</span>
                  <input value={tracking} maxLength={120} onChange={e=>setTracking(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/></label>
              </div>
            </>}
            <label className="block space-y-1 text-xs font-semibold">
              <span>Previsão de {method==="pickup"?"retirada":"entrega"} (opcional)</span>
              <input type="datetime-local" value={expectedAt} onChange={e=>setExpectedAt(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
            </label>
            {method==="pickup"&&<>
              {pin&&<div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold">Código de retirada — mostre ao cliente agora</p>
                <div className="flex items-center gap-3">
                  <strong className="font-mono text-2xl tracking-widest">{pin}</strong>
                  <button type="button" onClick={()=>{
                    void navigator.clipboard.writeText(pin).then(()=>setCopied(true)).catch(()=>setCopied(false));
                  }} className="rounded-md border border-border p-2" aria-label="Copiar código">
                    <ClipboardCopy size={16}/>
                  </button>
                </div>
                {copied&&<p className="text-xs text-emerald-600">Código copiado.</p>}
                <p className="text-xs text-muted-foreground">
                  Por segurança, o código não é recuperável. Se esquecer, gere outro e envie ao cliente.
                </p>
              </div>}
              {configured&&!pin&&<label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={regenerate} onChange={e=>setRegenerate(e.target.checked)}/>
                <span>Gerar um novo PIN de retirada (invalida o código anterior)</span>
              </label>}
            </>}
            {ready&&<button type="button" disabled={!configured} onClick={()=>setMode("complete")}
              className="text-xs font-semibold text-primary disabled:opacity-40">
              <MapPin size={14} className="mr-1 inline"/> Ir para confirmação do recebimento
            </button>}
            {!ready&&<p className="text-xs text-muted-foreground">
              Depois de marcar o pedido como pronto, volte para confirmar a entrega ou retirada.
            </p>}
          </div>:<div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Confirme a identidade do recebedor. O registro fica vinculado ao pedido no histórico.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold"><span>Quem recebeu? *</span>
                <input value={recipient} maxLength={160} onChange={e=>setRecipient(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/></label>
              <label className="space-y-1 text-xs font-semibold"><span>Documento (opcional)</span>
                <input value={recipientDocument} maxLength={30} onChange={e=>setRecipientDocument(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/></label>
            </div>
            {method==="pickup"&&<label className="block space-y-1 text-xs font-semibold">
              <span>PIN apresentado pelo cliente *</span>
              <input inputMode="numeric" autoComplete="off" maxLength={6} value={enteredPin}
                onChange={e=>setEnteredPin(e.target.value.replace(/\D/g,"").slice(0,6))}
                placeholder="000000" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono tracking-widest"/>
            </label>}
            <label className="block space-y-1 text-xs font-semibold">
              <span>Comprovante / observações {method==="delivery"?"(mínimo 10 caracteres sem foto)":""}</span>
              <textarea rows={3} maxLength={1000} value={proofNotes}
                onChange={e=>setProofNotes(e.target.value)}
                placeholder="Ex.: entregue ao próprio titular, identificação conferida..."
                className="w-full rounded-lg border border-border bg-background p-3 text-sm"/>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs font-semibold">
              <Camera size={18}/> {proofFile?"Foto: "+proofFile.name:"Adicionar foto do comprovante (opcional)"}
              <input type="file" accept="image/*" capture="environment" className="sr-only"
                onChange={e=>setProofFile(e.target.files?.[0]||null)}/>
            </label>
            <p className="text-xs text-muted-foreground">A foto será comprimida automaticamente antes do upload.</p>
          </div>}
        </>}
        {error&&<p role="alert" className="rounded-lg border border-destructive/20 p-3 text-xs text-destructive">{error}</p>}
      </div>}
  </AdminDialog>;
}
