import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, ClipboardList, Copy, ExternalLink, Link2, LoaderCircle, QrCode, Send, XCircle } from "lucide-react";
import { AdminButton, AdminDialog, Section } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { useAuth } from "@/lib/auth";
import { lookupCpf, type CpfLookupResult } from "@/features/customers/infrastructure/cpf.gateway";
import { findQuickCustomerByTaxId, getOrderCustomerById, updateOrderCustomer, createQuickCustomerAddress } from "@/features/orders/infrastructure/orders-customer.repository";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import type { CustomerForm } from "@/features/customers/domain/customer-form";
import { formatCpf, formatCnpj, formatDateOnly, formatDateTime, formatPhone } from "@/shared/domain/formatters";
import { cancelIntake, createIntake, getIntakeLink, listIntakes, reviewIntake, type IntakePrefill, type OrderIntake, type IntakeRow } from "./order-intake.repository";
import { QRCodeSVG } from "qrcode.react";
import { OrderImageLightbox } from "../presentation/OrderImages";
import type { OrderImage } from "../domain/order-image";
import { formatZipCode } from "@/lib/address";
import { systemErrorMessage } from "@/shared/domain/error-message";

const statusLabels:Record<string,string>={sent:"Link gerado",filling:"Em preenchimento",submitting:"Recebendo fotos",received:"Aguardando conferência",converted:"Convertida em OS",cancelled:"Cancelada"};
const localPhone=(v:string)=>formatPhone(v.replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/,""));
const norm=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
export function OrderIntakeWorkspace({organizationId,conversationId,onClose,onShare,onConvert}:{organizationId:string;conversationId?:string;onClose:()=>void;onShare?:(message:string)=>void;onConvert:(customerId:string,prefill:IntakePrefill)=>void}){
  const {user,activeOrganizationId,hasPermission}=useAuth();
  const client=useQueryClient();
  const [page,setPage]=useState(0),[link,setLink]=useState(""),[requiresDetails,setRequiresDetails]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [review,setReview]=useState<OrderIntake|null>(null),[existing,setExisting]=useState<any>(null),[cpf,setCpf]=useState<CpfLookupResult|null>(null),[cpfNotice,setCpfNotice]=useState(""),[quick,setQuick]=useState(false);
  const [linkMode,setLinkMode]=useState<"list"|"generating"|"ready">("list"),[linkRow,setLinkRow]=useState<IntakeRow|null>(null),[cancelId,setCancelId]=useState<string|null>(null),[reviewId,setReviewId]=useState<string|null>(null),[viewImage,setViewImage]=useState<OrderImage|null>(null);
  const [addAddress,setAddAddress]=useState(false),[updatePhone,setUpdatePhone]=useState(false);
  const gate=useRef(false),scope=useRef(organizationId);scope.current=organizationId;
  const canManage=activeOrganizationId===organizationId&&hasPermission("orders.create")&&hasPermission("orders.view");
  const key=["order-intake",organizationId,user?.id,conversationId||"all",page];
  const list=useQuery({queryKey:key,queryFn:()=>listIntakes(organizationId,conversationId,page),enabled:canManage,staleTime:30_000,refetchOnWindowFocus:false,retry:false});
  const refresh=()=>void client.invalidateQueries({queryKey:["order-intake",organizationId]});
  useEffect(()=>{setReview(null);setLink("");setLinkMode("list");setLinkRow(null);setViewImage(null);setError("");setQuick(false);setPage(0);},[organizationId,conversationId]);
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
      client.setQueryData<Awaited<ReturnType<typeof listIntakes>>>(key,old=>old?{...old,active:old.active==null?undefined:Math.max(0,old.active-1),rows:old.rows.map(item=>item.id===row.id?{...item,status:"cancelled"}:item)}:old);
      refresh();
    }finally{setCancelId(null);}
  });};
  const message=link?"Olá! Para agilizar seu atendimento, informe os dados do equipamento e envie as fotos neste link:\n"+link+"\nAssim que recebermos, nossa equipe irá conferir e dar continuidade.":"";
  const reviewRow=(row:IntakeRow)=>{if(gate.current||!canManage)return;setReviewId(row.id);void run(async()=>{try{
    const response=await reviewIntake(organizationId,row.id);const item=response.intake;
    if(scope.current!==organizationId)return;
    const isCpf=item.payload.document.length===11;
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
    setReview(item);setExisting(current);setCpf(official);setCpfNotice(notice);setAddAddress(false);setUpdatePhone(false);
  }finally{setReviewId(null);}});};
  const convert=(customerId:string)=>{if(!review||!canManage)return;onConvert(customerId,{id:review.id,payload:review.payload,images:review.images,conversationId:review.conversation_id,verifiedDemographics:cpf&&existing&&(!existing.birth_date||!existing.gender)?{customerId,document:review.payload.document,birthDate:existing.birth_date?null:cpf.birthDate,gender:existing.gender?null:cpf.gender}:undefined});};
  const addressKey=(a:any)=>[a?.zip_code?.replace(/\D/g,""),a?.street,a?.number,a?.complement,a?.neighborhood,a?.city,a?.state].map(v=>norm(String(v||""))).join("|");
  const addressAlreadySaved=Boolean(review&&existing?.addresses?.some((a:any)=>addressKey(a)===addressKey(review.payload.address)));
  const continueReview=()=>{
    if(!review||!canManage)return;
    if(existing?.id){
      void run(async()=>{
        if(hasPermission("customers.edit")){
          if(!review.bound_customer_id&&updatePhone){const r=await updateOrderCustomer(organizationId,existing.id,{phone:(review.payload.phone||review.phone.replace(/^55(?=\d{10,11}$)/,"")).replace(/\D/g,"")});if(r.error)throw r.error;}
          if(!review.bound_customer_id&&addAddress&&!addressAlreadySaved){
            const r=await createQuickCustomerAddress(organizationId,{...review.payload.address,id:review.id,customer_id:existing.id,is_default:!existing.addresses?.length});
            if(r.error)throw r.error;
          }
        }
        if(scope.current===organizationId)convert(existing.id);
      });return;
    }
    if(!hasPermission("customers.create")){setError("Seu perfil não pode cadastrar clientes. Solicite a conferência a um gestor.");return;}
    setQuick(true);
  };
  const name=cpf?.name||review?.payload.name||"";
  const whatsapp=review?localPhone(review.phone):"";
  const phone=review?.payload.phone?localPhone(review.payload.phone):whatsapp;
  const initialValues:Partial<CustomerForm>=review?.payload.document.length===14
    ? {customerType:"PJ",cnpj:review.payload.document,full_name:name,trade_name:name,legal_name:name,phone,whatsapp}
    : {customerType:"PF",document:review?.payload.document||"",full_name:name,birth_date:cpf?.birthDate||"",gender:cpf?.gender||"",phone,whatsapp};
  const rows=list.data?.rows||[];
  const total=list.data?.total??rows.length;
  const activeCount=list.data?.active??rows.filter(row=>["sent","filling","submitting","received"].includes(row.status)).length;
  const completedCount=list.data?.completed??rows.filter(row=>row.status==="converted").length;
  const countStyle=activeCount>0?"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400":total>0&&completedCount===total?"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":"border-border bg-muted text-muted-foreground";
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const expiry=(list.data?.rows||[]).filter(row=>["sent","filling"].includes(row.status)).map(row=>Date.parse(row.expires_at)).filter(value=>value>now).sort((a,b)=>a-b)[0];
    if(!expiry)return;
    const timer=window.setTimeout(()=>setNow(Date.now()),Math.max(1,expiry-Date.now()+20));
    return()=>window.clearTimeout(timer);
  },[list.data,now]);
  const genderLabel=(value?:string|null)=>(({M:"Masculino",F:"Feminino",I:"Não informado"} as Record<string,string>)[value||""]||"Não informado");
  const field=(label:string,value:ReactNode)=><div className="min-w-0 space-y-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><div className="break-words text-sm font-medium text-foreground">{value||"—"}</div></div>;
  const doc=review?.payload.document||"";
  const photoGroups=[{title:"Etiqueta",test:(im:OrderImage)=>im.kind==="label"},{title:"Equipamento",test:(im:OrderImage)=>im.kind!=="label"&&!/^Problema/i.test(im.name||"")},{title:"Defeito",test:(im:OrderImage)=>/^Problema/i.test(im.name||"")}];
  return <>
    <AdminDialog open onClose={()=>{if(!busy&&!quick)onClose();}} title={review?"Conferir Pré-OS":linkMode==="generating"?"Preparando link":linkMode==="ready"?"Link da Pré-OS":"Pré-OS Digital"} description={review||linkMode!=="list"?undefined:"Solicitações de atendimento"} className="max-w-4xl" draggable floating
      footer={review?<div className="flex w-full justify-between gap-2"><AdminButton variant="secondary" disabled={busy||quick} onClick={()=>{setReview(null);setError("");}}>Voltar</AdminButton><AdminButton variant="tertiary" disabled={busy||quick} loading={busy} onClick={continueReview}>{existing?"Criar OS":"Cadastrar cliente e iniciar OS"}</AdminButton></div>:<div className="flex w-full items-center justify-between gap-2">{linkMode==="ready"?<><span/><AdminButton variant="tertiary" onClick={backToList}><Check size={16}/> Confirmar</AdminButton></>:linkMode==="generating"?<span className="text-xs text-muted-foreground">Preparando solicitação...</span>:<><AdminButton variant="secondary" disabled={busy} onClick={onClose}>Fechar</AdminButton>{conversationId&&onShare&&<AdminButton variant="tertiary" disabled={busy||!canManage} onClick={generate}><Link2 size={16}/> Gerar link</AdminButton>}</>}</div>}>
      <div className="space-y-4">
      {!canManage?<p className="text-sm">Sem permissão para consultar Pré-OS.</p>:review?<div className="space-y-4">
        <Section title="Cliente" actions={existing?<span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Cadastrado</span>:undefined}>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {field("Nome",review.payload.name)}{field(doc.length===14?"CNPJ":"CPF",doc.length===14?formatCnpj(doc):formatCpf(doc))}
            {field("WhatsApp",whatsapp)}{field("Telefone",phone)}
            {field("Data de nascimento",formatDateOnly(existing?.birth_date||cpf?.birthDate,"Não informada"))}
            {field("Gênero",genderLabel(existing?.gender||cpf?.gender))}
          </div>
          {cpf?<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs"><span className={norm(cpf.name)===norm(review.payload.name)?"font-semibold text-emerald-600 dark:text-emerald-400":"font-semibold text-amber-600 dark:text-amber-400"}>{norm(cpf.name)===norm(review.payload.name)?"Nome confere com CPF":"Nome divergente no CPF"}</span>{norm(cpf.name)!==norm(review.payload.name)&&<span>{cpf.name}</span>}</div>:cpfNotice?<p className="mt-3 text-xs text-muted-foreground">{cpfNotice}</p>:null}
          {!review.bound_customer_id&&hasPermission("customers.edit")&&existing&&phone.replace(/\D/g,"")!==String(existing.phone||"").replace(/\D/g,"")&&<label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={updatePhone} onChange={e=>setUpdatePhone(e.target.checked)}/>Atualizar telefone do cadastro</label>}
        </Section>
        <Section title="Endereço">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            {field("CEP",formatZipCode(review.payload.address.zip_code||""))}{field("Rua",review.payload.address.street)}{field("Número",review.payload.address.number)}{field("Complemento",review.payload.address.complement)}{field("Bairro",review.payload.address.neighborhood)}{field("Cidade",review.payload.address.city)}{field("Estado",review.payload.address.state)}
          </div>
          {!review.bound_customer_id&&existing&&hasPermission("customers.edit")&&!addressAlreadySaved&&<label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={addAddress} onChange={e=>setAddAddress(e.target.checked)}/>Adicionar endereço ao cadastro</label>}
        </Section>
        <Section title="Equipamento">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">{field("Tipo",review.payload.type_name)}{field("Marca",review.payload.brand_name)}{field("Modelo",review.payload.model)}{field("Número de série",review.payload.serial)}</div>
        </Section>
        <Section title="Informações do atendimento">{field("Descrição do problema",<p className="whitespace-pre-wrap font-normal">{review.payload.problem}</p>)}</Section>
        <Section title="Fotos">
          <div className="grid gap-4 sm:grid-cols-3">{photoGroups.map(group=><div key={group.title} className="min-w-0 space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.title}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-1">{review.images.filter(group.test).map(im=><button type="button" key={im.key} onClick={()=>setViewImage(im)} aria-label={"Visualizar "+group.title} className="overflow-hidden rounded-lg border border-border bg-muted/20 focus-visible:ring-2 focus-visible:ring-primary"><img className="h-36 w-full object-contain" src={im.url} alt={group.title}/></button>)}</div>{!review.images.some(group.test)&&<p className="text-xs text-muted-foreground">Sem foto</p>}</div>)}</div>
        </Section>
      </div>:linkMode==="generating"?<div role="status" className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center motion-safe:animate-in motion-safe:fade-in"><div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"><LoaderCircle size={32} className="animate-spin"/></div><p className="text-lg font-semibold">{linkRow?"Recuperando link...":"Gerando link..."}</p><p className="text-sm text-muted-foreground">Preparando o acesso seguro do cliente.</p></div>:linkMode==="ready"?<div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-5 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"><div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 size={30}/></div><div><p className="text-lg font-bold">Link pronto!</p><p className="mt-1 text-xs text-muted-foreground">Válido por até 48 horas a partir da geração.</p><p className="mt-1 text-xs text-muted-foreground">{requiresDetails?"Identificação, endereço e equipamento.":"Cliente cadastrado: somente equipamento, fotos e problema."}</p></div><div className="rounded-xl border border-border bg-white p-3 shadow-sm"><QRCodeSVG value={link} size={208} level="M" marginSize={4}/></div><input readOnly aria-label="Link da Pré-OS" value={link} className="w-full min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"/><div className="flex flex-wrap justify-center gap-2"><AdminButton variant="tertiary" size="sm" onClick={()=>copyValue(link,"Link")}><Copy size={14}/> Copiar link</AdminButton><AdminButton variant="tertiary" size="sm" onClick={()=>copyValue(message,"Mensagem")}><Copy size={14}/> Copiar mensagem</AdminButton>{onShare&&(!linkRow||linkRow.conversation_id===conversationId)&&<AdminButton variant="tertiary" size="sm" onClick={()=>onShare(message)}><Send size={14}/> Inserir no WhatsApp</AdminButton>}</div></div>:<>
        <Section title={<span className="flex items-center gap-2">Solicitações <span className={"rounded-md border px-2 py-0.5 text-[11px] tabular-nums tracking-normal "+countStyle}>{total}</span></span>} description={!conversationId?"Todos os atendimentos autorizados. Para gerar um link, abra a conversa do cliente.":undefined}>
        {list.isPending?<p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>:list.isError?<p role="alert" className="text-sm text-destructive">{systemErrorMessage(list.error)}</p>:!rows.length?<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma solicitação nesta página.</p>:<div className="space-y-3">{rows.map(row=>{
          const expired=["sent","filling"].includes(row.status)&&Date.parse(row.expires_at)<=Math.max(now,Date.now());
          const cancelled=expired||row.status==="cancelled";
          const stage=({sent:0,filling:1,submitting:1,received:2,converted:3} as Record<string,number>)[row.status]??0;
          return <div key={row.id} className="space-y-3 rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold"><ClipboardList size={15}/>{row.customer_name||"Contato sem nome"}{row.phone&&<span className="font-normal text-muted-foreground">{localPhone(row.phone)}</span>}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p></div><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><span className={"rounded-md border px-2 py-1 text-xs font-semibold "+(cancelled?"border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400":stage===3?"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":stage>=1?"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400":"border-primary/30 bg-primary/10 text-primary")}>{expired?"Link expirado":statusLabels[row.status]||row.status}</span>{row.status==="received"&&<AdminButton variant="tertiary" size="sm" disabled={busy} loading={reviewId===row.id} loadingText="Conferindo..." onClick={()=>reviewRow(row)}><ArrowRight size={14}/> Conferir</AdminButton>}{["sent","filling"].includes(row.status)&&!expired&&<><AdminButton variant="tertiary" size="sm" disabled={busy} onClick={()=>reopenLink(row)}><QrCode size={14}/> QR Code</AdminButton><AdminButton variant="quaternary" size="sm" disabled={busy} loading={cancelId===row.id} loadingText="Cancelando..." onClick={()=>cancelRow(row)}><XCircle size={14}/> Cancelar link</AdminButton></>}{row.status==="converted"&&row.order_id&&<a className="inline-flex items-center gap-1 text-xs font-semibold text-primary" href={"/admin/orders/"+row.order_id} target="_blank" rel="noopener noreferrer">Abrir OS <ExternalLink size={13}/></a>}</div></div>
          {cancelled?<div className="flex items-center gap-2 text-xs text-muted-foreground"><XCircle size={16}/> Solicitação encerrada</div>:<div className="grid grid-cols-4 gap-1" aria-label="Progresso da solicitação">{["Link gerado","Preenchimento","Recebida","OS criada"].map((label,n)=><div key={label} className="min-w-0 text-center"><div className={"mx-auto flex size-7 items-center justify-center rounded-full border transition-colors duration-300 "+(n<stage||stage===3?"border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400":n===stage?"border-primary bg-primary/10 text-primary":"border-border bg-muted/30 text-muted-foreground")}>{n<stage||stage===3?<Check size={15}/>:n===stage&&row.status==="submitting"?<LoaderCircle size={14} className="motion-safe:animate-spin"/>:<span className={n===stage&&stage<2?"motion-safe:animate-pulse text-xs font-bold":"text-xs"}>{n+1}</span>}</div><div className={"my-1 h-1 rounded-full transition-colors "+(n<stage||stage===3?"bg-emerald-500":n===stage?"bg-primary":"bg-muted")}/><p className="text-[10px] leading-tight text-muted-foreground">{label}</p></div>)}</div>}
          </div>;

        })}</div>}
        <div className="mt-3 flex items-center justify-between"><AdminButton variant="secondary" size="sm" disabled={page===0||list.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</AdminButton><span className="text-xs text-muted-foreground">Página {page+1}{list.data?.total!=null?" de "+Math.max(1,Math.ceil(total/25)):""}</span><AdminButton variant="secondary" size="sm" disabled={(list.data?.total!=null?(page+1)*25>=total:rows.length<25)||list.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</AdminButton></div>
        </Section>
      </>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </AdminDialog>
    {viewImage&&<OrderImageLightbox key={viewImage.key} image={viewImage} onClose={()=>setViewImage(null)}/>}
    {quick&&review&&<QuickCustomerModal initialValues={initialValues} initialAddress={review.payload.address} initialWhatsappFromConversation description="Dados recebidos na Pré-OS. Confira antes de criar o cadastro." onClose={()=>setQuick(false)} onSaved={customer=>convert(customer.id)}/>}
  </>;
}
