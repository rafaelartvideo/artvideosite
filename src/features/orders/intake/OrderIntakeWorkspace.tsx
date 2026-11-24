import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, ClipboardList, Copy, ExternalLink, Link2, LoaderCircle, PanelTop, QrCode, Send, X, XCircle } from "lucide-react";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { useDetachedOrderEditor } from "../presentation/useDetachedOrderEditor";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { useAuth } from "@/lib/auth";
import { lookupCpf, type CpfLookupResult } from "@/features/customers/infrastructure/cpf.gateway";
import { findQuickCustomerByTaxId, getOrderCustomerById } from "@/features/orders/infrastructure/orders-customer.repository";
import type { CustomerForm } from "@/features/customers/domain/customer-form";
import { formatDateTime, formatPhone } from "@/shared/domain/formatters";
import { cancelIntake, createIntake, getIntakeLink, listIntakes, reviewIntake, type IntakePrefill, type IntakeRow } from "./order-intake.repository";
import { QRCodeSVG } from "qrcode.react";
import { systemErrorMessage } from "@/shared/domain/error-message";

const statusLabels:Record<string,string>={sent:"Link gerado",filling:"Em preenchimento",submitting:"Recebendo fotos",received:"Aguardando abertura da OS",converted:"Convertida em OS",cancelled:"Cancelada"};
const localPhone=(v:string)=>formatPhone(v.replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/,""));
const norm=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
export function OrderIntakeWorkspace({organizationId,conversationId,onClose,onShare,onConvert}:{organizationId:string;conversationId?:string;onClose:()=>void;onShare?:(message:string)=>void;onConvert:(customerId:string|null,prefill:IntakePrefill)=>void}){
  const {user,activeOrganizationId,hasPermission}=useAuth();
  const client=useQueryClient();
  const {detached,detach,reintegrate}=useDetachedOrderEditor("Pré-OS Digital");
  const [page,setPage]=useState(0),[link,setLink]=useState(""),[requiresDetails,setRequiresDetails]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [linkMode,setLinkMode]=useState<"list"|"generating"|"ready">("list"),[linkRow,setLinkRow]=useState<IntakeRow|null>(null),[cancelId,setCancelId]=useState<string|null>(null),[reviewId,setReviewId]=useState<string|null>(null);
  const gate=useRef(false),scope=useRef(organizationId);scope.current=organizationId;
  const canManage=activeOrganizationId===organizationId&&hasPermission("orders.create")&&hasPermission("orders.view");
  const key=["order-intake",organizationId,user?.id,conversationId||"all",page];
  const list=useQuery({queryKey:key,queryFn:()=>listIntakes(organizationId,conversationId,page),enabled:canManage,staleTime:30_000,refetchOnWindowFocus:false,retry:false});
  const refresh=()=>void client.invalidateQueries({queryKey:["order-intake",organizationId]});
  useEffect(()=>{setLink("");setLinkMode("list");setLinkRow(null);setError("");setPage(0);},[organizationId,conversationId]);
  const run=async(fn:()=>Promise<void>)=>{if(!canManage||gate.current)return;gate.current=true;setBusy(true);setError("");try{await fn();}catch(e){setError(systemErrorMessage(e,"Não foi possível concluir."));}finally{gate.current=false;setBusy(false);}};
  const backToList=()=>{setLink("");setLinkRow(null);setLinkMode("list");setError("");};
  const reveal=(token:string,requires:boolean|undefined)=>{setRequiresDetails(requires!==false);setLink(new URL("/solicitacao",window.location.origin).href+"#t="+token);setLinkMode("ready");};
  const generate=()=>{if(!conversationId||!onShare||gate.current||!canManage)return;setLinkMode("generating");setLinkRow(null);void run(async()=>{
    try{const r=await createIntake(organizationId,conversationId);if(scope.current!==organizationId)return;reveal(r.token,r.requires_customer_details);refresh();}
    catch(e){setLinkMode("list");throw e;}
  });};
  const reopenLink=(row:IntakeRow)=>{if(gate.current||!canManage)return;setLinkRow(row);setLinkMode("generating");void run(async()=>{
    try{let r=await getIntakeLink(organizationId,row.id);
      if(r.legacy){if(!window.confirm("Este link foi gerado antes da recuperação de QR Code. Substituí-lo invalidará o link anterior. Deseja continuar?")){backToList();return;}
        r=await getIntakeLink(organizationId,row.id,true);}
      if(!r.token)throw new Error("Não foi possível recuperar o link.");
      if(scope.current!==organizationId)return;reveal(r.token,r.requires_customer_details);
    }catch(e){setLinkMode("list");setLinkRow(null);throw e;}
  });};
  const copyValue=(value:string,label:string)=>{void navigator.clipboard.writeText(value).then(()=>notifyAdmin(label+" copiado.","success")).catch(()=>notifyAdmin("Não foi possível copiar.","error"));};
  const cancelRow=(row:IntakeRow)=>{if(gate.current||!canManage)return;setCancelId(row.id);void run(async()=>{
    try{await cancelIntake(organizationId,row.id);
      // Update the visible row immediately after server confirmation, without waiting for a second request.
      await client.cancelQueries({queryKey:key,exact:true});
      client.setQueryData<Awaited<ReturnType<typeof listIntakes>>>(key,old=>old?{...old,active:old.active==null?undefined:Math.max(0,old.active-(old.rows.some(item=>item.id===row.id&&["sent","filling"].includes(item.status))?1:0)),rows:old.rows.map(item=>item.id===row.id?{...item,status:"cancelled"}:item)}:old);
      refresh();
    }finally{setCancelId(null);}
  });};
  const message=link?"Olá! Para agilizar seu atendimento, informe os dados do equipamento e envie as fotos neste link:\n"+link+"\nAssim que recebermos, nossa equipe irá conferir e dar continuidade.":"";
  const reviewRow=(row:IntakeRow)=>{if(gate.current||!canManage)return;setReviewId(row.id);void run(async()=>{try{
    const response=await reviewIntake(organizationId,row.id);const item=response.intake;
    if(scope.current!==organizationId)return;
    const isCpf=item.payload.customer_type?item.payload.customer_type==="PF":item.payload.document.length===11;
    const result=item.bound_customer_id?{data:{id:item.bound_customer_id},error:null}:await findQuickCustomerByTaxId(organizationId,isCpf?"PF":"PJ",item.payload.document);
    if(result.error)throw result.error;
    let current=null;
    if(result.data?.id){const full=await getOrderCustomerById(organizationId,result.data.id);if(full.error)throw full.error;current=full.data;if(!current)throw new Error("Cadastro existente não está disponível para consulta.");}
    let official:CpfLookupResult|null=null,notice="";
    if(isCpf&&(!item.bound_customer_id||!current?.birth_date||!current?.gender)){
      if(hasPermission("customers.create")||hasPermission("customers.edit")){
        try{official=await lookupCpf(item.payload.document,organizationId,null,{checkExisting:false});}
        catch(e){notice="Não foi possível consultar a API de CPF. Confira o documento manualmente antes de continuar.";}
      }else notice="Seu perfil não permite consulta de CPF. Confira o cadastro antes de continuar.";
    }else if(item.bound_customer_id){notice="Cadastro já identificado. Dados pessoais não foram solicitados ao cliente." ;}
    if(scope.current!==organizationId)return;
    const whatsapp=localPhone(item.phone),phone=item.payload.phone?localPhone(item.payload.phone):whatsapp;
    const name=official?.name||item.payload.name||"";
    const values:Partial<CustomerForm>=!isCpf
      ? {customerType:"PJ",cnpj:item.payload.document,full_name:item.payload.trade_name||name,trade_name:item.payload.trade_name||name,legal_name:name,state_registration:item.payload.state_registration||"",foundation_date:item.payload.foundation_date||"",phone,whatsapp}
      : {customerType:"PF",document:item.payload.document,full_name:name,birth_date:official?.birthDate||"",gender:official?.gender||"",phone,whatsapp};
    const customerNotice=official&&norm(official.name)!==norm(item.payload.name)?"Nome informado diverge do CPF: "+item.payload.name+" / "+official.name:notice;
    const verifiedDemographics=official&&current&&(!current.birth_date||!current.gender)?{customerId:current.id,document:item.payload.document,birthDate:current.birth_date?null:official.birthDate,gender:current.gender?null:official.gender}:undefined;
    onConvert(current?.id||null,{id:item.id,payload:item.payload,images:item.images,conversationId:item.conversation_id,customerDraft:{values,address:item.payload.address},customerNotice,verifiedDemographics});
  }finally{setReviewId(null);}});};
  const rows=list.data?.rows||[];
  const total=list.data?.total??rows.length;
  useEffect(()=>{if(list.data?.total!=null){const last=Math.max(0,Math.ceil(list.data.total/25)-1);if(page>last)setPage(last);}},[list.data?.total,page]);
  const activeCount=list.data?.active??rows.filter(row=>["sent","filling","submitting","received"].includes(row.status)).length;
  const completedCount=list.data?.completed??rows.filter(row=>row.status==="converted").length;
  const countStyle=activeCount>0?"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400":completedCount>0?"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":"border-border bg-muted text-muted-foreground";
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const expiry=(list.data?.rows||[]).filter(row=>["sent","filling"].includes(row.status)).map(row=>Date.parse(row.expires_at)).filter(value=>value>now).sort((a,b)=>a-b)[0];
    if(!expiry)return;
    const timer=window.setTimeout(()=>{setNow(Date.now());void client.invalidateQueries({queryKey:["order-intake",organizationId]});},Math.max(1,expiry-Date.now()+20));
    return()=>window.clearTimeout(timer);
  },[list.data,now,client,organizationId]);
  const title=reviewId?"Preparando Nova OS":linkMode==="generating"?"Preparando link":linkMode==="ready"?"Link da Pré-OS":"Pré-OS Digital";
  const description=reviewId||linkMode!=="list"?undefined:"Solicitações de atendimento";
  const close=()=>{if(!busy)onClose();};
  const footer=reviewId?undefined:<div className="flex w-full items-center justify-between gap-2">{linkMode==="ready"?<><span/><AdminButton variant="tertiary" onClick={backToList}><Check size={16}/> Confirmar</AdminButton></>:linkMode==="generating"?<span className="text-xs text-muted-foreground">Preparando solicitação...</span>:<><AdminButton variant="secondary" disabled={busy} onClick={onClose}>Fechar</AdminButton>{conversationId&&onShare&&<AdminButton variant="primary" disabled={busy||!canManage} onClick={generate}><Link2 size={16}/> Gerar link</AdminButton>}</>}</div>;
  const content=<div className="space-y-4">
      {!canManage?<p className="text-sm">Sem permissão para consultar Pré-OS.</p>:reviewId?<div role="status" aria-live="polite" className="flex min-h-[160px] flex-col items-center justify-center gap-4 text-center motion-safe:animate-in motion-safe:fade-in"><p className="text-sm font-semibold text-muted-foreground">Preparando Nova OS...</p><LoaderCircle size={24} className="animate-spin text-primary motion-reduce:animate-none"/></div>:linkMode==="generating"?<div role="status" className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center motion-safe:animate-in motion-safe:fade-in"><div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"><LoaderCircle size={32} className="animate-spin"/></div><p className="text-lg font-semibold">{linkRow?"Recuperando link...":"Gerando link..."}</p><p className="text-sm text-muted-foreground">Preparando o acesso seguro do cliente.</p></div>:linkMode==="ready"?<div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-5 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"><div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 size={30}/></div><div><p className="text-lg font-bold">Link pronto!</p><p className="mt-1 text-xs text-muted-foreground">Válido por até 48 horas a partir da geração.</p><p className="mt-1 text-xs text-muted-foreground">{requiresDetails?"Identificação, endereço e equipamento.":"Cliente cadastrado: somente equipamento, fotos e problema."}</p></div><div className="rounded-xl border border-border bg-white p-3 shadow-sm"><QRCodeSVG value={link} size={208} level="M" marginSize={4}/></div><input readOnly aria-label="Link da Pré-OS" value={link} className="w-full min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"/><div className="flex flex-wrap justify-center gap-2"><AdminButton variant="tertiary" size="sm" onClick={()=>copyValue(link,"Link")}><Copy size={14}/> Copiar link</AdminButton><AdminButton variant="tertiary" size="sm" onClick={()=>copyValue(message,"Mensagem")}><Copy size={14}/> Copiar mensagem</AdminButton>{onShare&&(!linkRow||linkRow.conversation_id===conversationId)&&<AdminButton variant="tertiary" size="sm" onClick={()=>onShare(message)}><Send size={14}/> Inserir no WhatsApp</AdminButton>}</div></div>:<>
        <AdminCard square>
          <AdminCardHeader className="flex-wrap gap-2">
            <div className="min-w-0 flex-1"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">Solicitações <span className={"rounded-md border px-2 py-0.5 text-[11px] tabular-nums tracking-normal "+countStyle}>{total}</span></h3>{!conversationId&&<p className="mt-1 text-xs text-muted-foreground">Todos os atendimentos autorizados. Para gerar um link, abra a conversa do cliente.</p>}</div>
            {list.data?.total!=null&&<div className="min-w-0 max-w-full [&>div]:!border-0 [&>div]:!bg-transparent [&>div]:!p-0"><PaginationBar page={page+1} pageSize={25} totalItems={total} defaultPageSize={25} showPageSizeSelector={false} onPageChange={next=>{if(!busy&&!list.isFetching)setPage(next-1);}} onPageSizeChange={()=>undefined}/></div>}
          </AdminCardHeader>
          <AdminCardContent>

        {list.isPending?<p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>:list.isError?<p role="alert" className="text-sm text-destructive">{systemErrorMessage(list.error)}</p>:!rows.length?<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma solicitação nesta página.</p>:<div className="space-y-4">{rows.map(row=>{
          const expired=["sent","filling"].includes(row.status)&&Date.parse(row.expires_at)<=Math.max(now,Date.now());
          const cancelled=expired||row.status==="cancelled";
          const stage=({sent:0,filling:1,submitting:1,received:2,converted:3} as Record<string,number>)[row.status]??0;
          return <AdminCard key={row.id} square><AdminCardHeader className="flex-wrap gap-3"><div className="min-w-0"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold"><ClipboardList size={15}/>{row.customer_name||"Contato sem nome"}{row.phone&&<span className="font-normal text-muted-foreground">{localPhone(row.phone)}</span>}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p></div><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><span className={"rounded-md border px-2 py-1 text-xs font-semibold "+(cancelled?"border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400":stage===3?"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":stage>=1?"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400":"border-primary/30 bg-primary/10 text-primary")}>{expired?"Link expirado":statusLabels[row.status]||row.status}</span>{row.status==="received"&&<AdminButton variant="tertiary" size="sm" disabled={busy} loading={reviewId===row.id} loadingText="Abrindo OS..." onClick={()=>reviewRow(row)}>Abrir OS <ArrowRight size={14}/></AdminButton>}{["sent","filling"].includes(row.status)&&!expired&&<>{hasPermission("whatsapp.inbox.send")&&<AdminButton variant="tertiary" size="sm" disabled={busy} onClick={()=>reopenLink(row)}><QrCode size={14}/> QR Code</AdminButton>}<AdminButton variant="quaternary" size="sm" disabled={busy} loading={cancelId===row.id} loadingText="Cancelando..." onClick={()=>cancelRow(row)}><XCircle size={14}/> Cancelar link</AdminButton></>}{row.status==="converted"&&row.order_id&&<a className="inline-flex items-center gap-1 text-xs font-semibold text-primary" href={"/admin/orders/"+row.order_id} target="_blank" rel="noopener noreferrer">Abrir OS <ExternalLink size={13}/></a>}</div></AdminCardHeader>
          <AdminCardContent className="!p-4 sm:!p-5">{cancelled?<div className="flex items-center gap-2 text-xs text-muted-foreground"><XCircle size={16}/> Solicitação encerrada</div>:<div className="grid grid-cols-4 gap-1" aria-label="Progresso da solicitação">{["Link gerado","Preenchimento","Recebida","OS criada"].map((label,n)=><div key={label} className="min-w-0 text-center"><div className={"mx-auto flex size-7 items-center justify-center rounded-full border transition-colors duration-300 "+(n<stage||stage===3?"border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400":n===stage?"border-primary bg-primary/10 text-primary":"border-border bg-muted/30 text-muted-foreground")}>{n<stage||stage===3?<Check size={15}/>:n===stage&&row.status==="submitting"?<LoaderCircle size={14} className="motion-safe:animate-spin"/>:<span className={n===stage&&stage<2?"motion-safe:animate-pulse text-xs font-bold":"text-xs"}>{n+1}</span>}</div><div className={"my-1 h-1 rounded-full transition-colors "+(n<stage||stage===3?"bg-emerald-500":n===stage?"bg-primary":"bg-muted")}/><p className="text-[10px] leading-tight text-muted-foreground">{label}</p></div>)}</div>}
          </AdminCardContent></AdminCard>;

        })}</div>}
        {list.data?.total==null&&rows.length>0&&<div className="mt-4 flex justify-between gap-2"><AdminButton variant="secondary" size="sm" disabled={page===0||list.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</AdminButton><span className="text-xs text-muted-foreground">Página {page+1}</span><AdminButton variant="secondary" size="sm" disabled={rows.length<25||list.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</AdminButton></div>}
          </AdminCardContent>
        </AdminCard>
      </>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>;
  return <>
    {detached?createPortal(<section className="flex h-dvh min-h-0 flex-col bg-background text-foreground"><header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h1 className="text-base font-bold">{title}</h1>{description&&<p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div><div className="flex items-center gap-2"><AdminButton variant="secondary" size="sm" disabled={busy} onClick={reintegrate}><PanelTop size={15}/> Reintegrar ao CRM</AdminButton><AdminButton variant="ghost" size="sm" aria-label="Fechar" disabled={busy} onClick={close}><X size={16}/></AdminButton></div></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{content}</div>{footer&&<div className="shrink-0 border-t border-border bg-muted/60 p-4">{footer}</div>}</section>,detached.host):<AdminDialog open onClose={close} title={title} description={description} className="max-w-4xl" draggable floating transitionKey={reviewId?"preparing-review":linkMode} preparing={Boolean(reviewId)} preparingKey={reviewId||"list"} preparingText="Preparando Nova OS..." headerActions={<AdminButton variant="secondary" size="sm" disabled={busy} onClick={detach} className="hidden md:inline-flex"><ExternalLink size={15}/> Destacar janela</AdminButton>} footer={footer}>{content}</AdminDialog>}

  </>;
}
