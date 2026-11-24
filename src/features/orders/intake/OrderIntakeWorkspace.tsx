import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Copy, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { useAuth } from "@/lib/auth";
import { lookupCpf, type CpfLookupResult } from "@/features/customers/infrastructure/cpf.gateway";
import { findQuickCustomerByTaxId, getOrderCustomerById } from "@/features/orders/infrastructure/orders-customer.repository";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import type { CustomerForm } from "@/features/customers/domain/customer-form";
import { formatPhone } from "@/shared/domain/formatters";
import { cancelIntake, createIntake, listIntakes, reviewIntake, type IntakePrefill, type OrderIntake, type IntakeRow } from "./order-intake.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

const statusLabels:Record<string,string>={sent:"Link gerado",filling:"Em preenchimento",submitting:"Recebendo fotos",received:"Aguardando conferência",converted:"Convertida em OS",cancelled:"Cancelada"};
const norm=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
export function OrderIntakeWorkspace({organizationId,conversationId,onClose,onShare,onConvert}:{organizationId:string;conversationId?:string;onClose:()=>void;onShare?:(message:string)=>void;onConvert:(customerId:string,prefill:IntakePrefill)=>void}){
  const {user,activeOrganizationId,hasPermission}=useAuth();
  const client=useQueryClient();
  const [page,setPage]=useState(0),[link,setLink]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [review,setReview]=useState<OrderIntake|null>(null),[existing,setExisting]=useState<any>(null),[cpf,setCpf]=useState<CpfLookupResult|null>(null),[cpfNotice,setCpfNotice]=useState(""),[quick,setQuick]=useState(false),[confirmed,setConfirmed]=useState(false);
  const gate=useRef(false),scope=useRef(organizationId);scope.current=organizationId;
  const canManage=activeOrganizationId===organizationId&&hasPermission("orders.create")&&hasPermission("orders.view");
  const key=["order-intake",organizationId,user?.id,conversationId||"all",page];
  const list=useQuery({queryKey:key,queryFn:()=>listIntakes(organizationId,conversationId,page),enabled:canManage,staleTime:30_000,refetchOnWindowFocus:false,retry:false});
  const refresh=()=>void client.invalidateQueries({queryKey:["order-intake",organizationId]});
  useEffect(()=>{setReview(null);setLink("");setError("");setConfirmed(false);setQuick(false);setPage(0);},[organizationId,conversationId]);
  const run=async(fn:()=>Promise<void>)=>{if(!canManage||gate.current)return;gate.current=true;setBusy(true);setError("");try{await fn();}catch(e){setError(systemErrorMessage(e,"Não foi possível concluir."));}finally{gate.current=false;setBusy(false);}};
  const generate=()=>run(async()=>{if(!conversationId||!onShare)return;const r=await createIntake(organizationId,conversationId);if(scope.current!==organizationId)return;setLink(new URL("/solicitacao",window.location.origin).href+"#t="+r.token);refresh();});
  const message=link?"Olá! Para agilizar seu atendimento, preencha seus dados e envie as fotos do equipamento neste link:\n"+link+"\nAssim que recebermos, nossa equipe irá conferir e dar continuidade.":"";
  const reviewRow=(row:IntakeRow)=>run(async()=>{
    const response=await reviewIntake(organizationId,row.id);const item=response.intake;
    if(scope.current!==organizationId)return;
    const isCpf=item.payload.document.length===11;
    const result=await findQuickCustomerByTaxId(organizationId,isCpf?"PF":"PJ",item.payload.document);
    if(result.error)throw result.error;
    let current=null;
    if(result.data?.id){const full=await getOrderCustomerById(organizationId,result.data.id);if(full.error)throw full.error;current=full.data;if(!current)throw new Error("Cadastro existente não está disponível para consulta.");}
    let official:CpfLookupResult|null=null,notice="";
    if(isCpf){
      if(hasPermission("customers.create")||hasPermission("customers.edit")){
        try{official=await lookupCpf(item.payload.document,organizationId,null,{checkExisting:false});}
        catch(e){notice="Não foi possível consultar a API de CPF. Confira o documento manualmente antes de continuar.";}
      }else notice="Seu perfil não permite consulta de CPF. Confira o cadastro antes de continuar.";
    }
    if(scope.current!==organizationId)return;
    setReview(item);setExisting(current);setCpf(official);setCpfNotice(notice);setConfirmed(false);
  });
  const convert=(customerId:string)=>{if(!review||!confirmed||!canManage)return;onConvert(customerId,{id:review.id,payload:review.payload,images:review.images});};
  const continueReview=()=>{
    if(!review||!confirmed||!canManage)return;
    if(existing?.id){convert(existing.id);return;}
    if(!hasPermission("customers.create")){setError("Seu perfil não pode cadastrar clientes. Solicite a conferência a um gestor.");return;}
    setQuick(true);
  };
  const name=cpf?.name||review?.payload.name||"";
  const phone=review?formatPhone(review.phone.replace(/^55(?=\d{10,11}$)/,"")):"";
  const initialValues:Partial<CustomerForm>=review?.payload.document.length===14
    ? {customerType:"PJ",cnpj:review.payload.document,full_name:name,trade_name:name,legal_name:name,phone,whatsapp:phone}
    : {customerType:"PF",document:review?.payload.document||"",full_name:name,birth_date:cpf?.birthDate||"",gender:cpf?.gender||"",phone,whatsapp:phone};
  const rows=list.data?.rows||[];
  return <>
    <AdminDialog open onClose={()=>{if(!busy)onClose();}} title={review?"Conferir Pré-OS":"Pré-OS Digital"} description={review?"Confira os dados recebidos antes de iniciar a OS.":"Acompanhe as solicitações e converta em OS."} className="max-w-3xl" draggable floating
      footer={review?<div className="flex w-full justify-between gap-2"><AdminButton variant="secondary" disabled={busy||quick} onClick={()=>{setReview(null);setError("");}}>Voltar</AdminButton><AdminButton disabled={!confirmed||busy||quick} onClick={continueReview}> {existing?"Criar OS":"Conferir e cadastrar cliente"}</AdminButton></div>:undefined}>
      <div className="space-y-4">
      {!canManage?<p className="text-sm">Sem permissão para consultar Pré-OS.</p>:review?<div className="space-y-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Nome informado</p><p className="font-bold">{review.payload.name}</p><p>{review.payload.document}</p><p>{phone}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Conferência CPF</p>{cpf?<><p className="font-bold">{cpf.name}</p><p className={norm(cpf.name)===norm(review.payload.name)?"text-emerald-600":"text-amber-600"}>{norm(cpf.name)===norm(review.payload.name)?"Nome confere":"Nome diferente — confira antes de salvar"}</p><p>Nascimento: {cpf.birthDate||"Não retornado"} · Gênero: {cpf.gender||"Não retornado"}</p></>:<p>{cpfNotice||"Pessoa jurídica — confira o CNPJ."}</p>}</div></div>
        {existing&&<p className="rounded-lg border border-emerald-500/30 p-3">CPF/CNPJ já cadastrado: <strong>{existing.full_name||existing.legal_name}</strong>. O cadastro será reutilizado, sem sobrescrever os dados automaticamente.</p>}
        <div className="rounded-lg border p-3"><p className="font-bold">Endereço informado</p><p>{[review.payload.address.street,review.payload.address.number,review.payload.address.complement,review.payload.address.neighborhood,review.payload.address.city,review.payload.address.state,review.payload.address.zip_code].filter(Boolean).join(", ")}</p></div>
        <div className="rounded-lg border p-3"><p className="font-bold">{[review.payload.type_name,review.payload.brand_name,review.payload.model].filter(Boolean).join(" · ")}</p><p>Série: {review.payload.serial||"Não informada"}</p><p className="mt-2 whitespace-pre-wrap">{review.payload.problem}</p><div className="mt-3 grid grid-cols-3 gap-2">{review.images.map(im=><a key={im.key} href={im.url} target="_blank" rel="noopener noreferrer"><img className="aspect-square w-full rounded-lg object-cover" src={im.url} alt={im.name}/><span className="text-xs">{im.name}</span></a>)}</div></div>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>Conferi a identificação do cliente, endereço e dados do equipamento.</span></label>
      </div>:<>
        {conversationId&&onShare&&<div className="space-y-2 rounded-xl border p-3"><AdminButton disabled={busy||!canManage} onClick={()=>void generate()}><Link2 size={15}/> Gerar link individual</AdminButton><p className="text-xs text-muted-foreground">Válido por 48 horas. O telefone é obtido da conversa.</p>{link&&<><input readOnly aria-label="Link da Pré-OS" value={link} className="w-full rounded-lg border bg-background p-2 text-xs"/><div className="flex flex-wrap gap-2"><AdminButton variant="secondary" onClick={()=>{void navigator.clipboard.writeText(message).then(()=>notifyAdmin("Mensagem copiada.","success")).catch(()=>notifyAdmin("Não foi possível copiar.","error"));}}><Copy size={14}/> Copiar mensagem</AdminButton><AdminButton onClick={()=>onShare(message)}>Inserir no WhatsApp</AdminButton></div></>}</div>}
        <div className="flex items-center justify-between"><p className="font-bold">Solicitações</p><AdminButton variant="tertiary" size="sm" onClick={()=>void list.refetch()} disabled={list.isFetching}><RefreshCw size={15}/> Atualizar</AdminButton></div>
        {list.isPending?<p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>:list.isError?<p role="alert" className="text-sm text-destructive">{systemErrorMessage(list.error)}</p>:!rows.length?<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma solicitação nesta página.</p>:<div className="divide-y rounded-lg border">{rows.map(row=><div key={row.id} className="flex flex-wrap items-center gap-2 p-3"><ClipboardList size={16}/><div className="min-w-0 flex-1"><p className="text-sm font-bold">{["sent","filling"].includes(row.status)&&Date.parse(row.expires_at)<Date.now()?"Link expirado":statusLabels[row.status]||row.status}</p><p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("pt-BR")}</p></div>{row.status==="received"&&<AdminButton size="sm" disabled={busy} onClick={()=>void reviewRow(row)}>Conferir</AdminButton>}{["sent","filling"].includes(row.status)&&<AdminButton variant="secondary" size="sm" disabled={busy} onClick={()=>void run(async()=>{await cancelIntake(organizationId,row.id);refresh();})}>Cancelar link</AdminButton>}{row.status==="converted"&&row.order_id&&<a className="inline-flex gap-1 text-xs text-primary" href={"/admin/orders/"+row.order_id} target="_blank" rel="noopener noreferrer">Abrir OS <ExternalLink size={13}/></a>}</div>)}</div>}
        <div className="flex justify-between"><AdminButton variant="secondary" size="sm" disabled={page===0||list.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</AdminButton><span className="text-xs text-muted-foreground">Página {page+1}</span><AdminButton variant="secondary" size="sm" disabled={rows.length<25||list.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</AdminButton></div>
      </>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </AdminDialog>
    {quick&&review&&<QuickCustomerModal initialValues={initialValues} initialAddress={review.payload.address} initialWhatsappFromConversation description="Dados recebidos na Pré-OS. Confira antes de criar o cadastro." onClose={()=>setQuick(false)} onSaved={customer=>convert(customer.id)}/>}
  </>;
}
