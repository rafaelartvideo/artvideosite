import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, MapPin, Paperclip, Phone, Instagram } from "lucide-react";
import { AdminButton, AdminDialog, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCpf, formatCnpj, formatPhone } from "@/shared/domain/formatters";
import { getAddressMapUrl } from "@/lib/address";
import {
  listProviderAttachments, openProviderAttachment, type PlatformProvider,
} from "../infrastructure/platform-providers.repository";

const formatDate=(value:string|null)=>{
  if(!value)return "";
  const s=value.slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+"/"+s.slice(5,7)+"/"+s.slice(0,4):s;
};
function Detail({label,value}:{label:string;value:string|null|undefined}){
  if(!value?.trim())return null;
  return <div className="min-w-0">
    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
  </div>;
}
function whatsappLink(value:string){
  const digits=value.replace(/\D/g,"");
  return "https://wa.me/"+(digits.length<=11?"55"+digits:digits);
}
function instagramLink(raw:string) {
  const clean=raw.trim();
  const value=clean.replace(/^@/,"");
  if(!value)return null;
  if(/^https?:\/\//i.test(value)){
    try {
      const url=new URL(value);
      return /(^|\.)instagram\.com$/i.test(url.hostname)?url.href:null;
    }catch{return null;}
  }
  return /^[a-zA-Z0-9._]{1,30}$/.test(value)?"https://www.instagram.com/"+value+"/":null;
}
export function ProviderDetailsDialog({provider,organizationId,onClose}:{
  provider:PlatformProvider|null;organizationId:string;onClose:()=>void;
}) {
  const files=useQuery({
    queryKey:["union-provider-attachments",organizationId,provider?.id],
    queryFn:()=>listProviderAttachments(organizationId,provider!.id),
    enabled:Boolean(provider?.id&&organizationId),
    staleTime:15000,
  });
  if(!provider)return null;
  const address={
    street:provider.street||"",number:provider.street_number||"",complement:provider.complement||"",
    neighborhood:provider.neighborhood||"",city:provider.city,state:provider.state,
    zip_code:provider.zip_code||"",
  };
  const mapUrl=getAddressMapUrl(address);
  const documentDigits=(provider.document||"").replace(/\D/g,"");
  const formattedDocument=provider.person_type==="PJ"?formatCnpj(documentDigits):formatCpf(documentDigits);
  return <AdminDialog open onClose={onClose} title={provider.name}
    description="Detalhes do prestador" className="w-[min(96vw,800px)] max-w-3xl"
    footer={<div className="flex justify-end"><AdminButton variant="secondary" onClick={onClose}>Fechar</AdminButton></div>}>
    <div className="space-y-4">
      <Section title="Dados pessoais" contentClassName="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <Detail label="Tipo" value={provider.person_type==="PJ"?"Pessoa Jurídica":"Pessoa Física"}/>
        <Detail label={provider.person_type==="PJ"?"CNPJ":"CPF"} value={documentDigits?formattedDocument:null}/>
        <Detail label={provider.person_type==="PJ"?"Nome fantasia":"Nome completo"} value={provider.name}/>
        {provider.person_type==="PJ"?<Detail label="Razão social" value={provider.legal_name}/>:
          <><Detail label="Data de nascimento" value={formatDate(provider.birth_date)}/>
          <Detail label="Gênero" value={provider.gender==="M"?"Masculino":provider.gender==="F"?"Feminino":provider.gender==="I"?"Outro / Indefinido":null}/></>}
        <Detail label="Telefone" value={provider.phone?formatPhone(provider.phone):null}/>
        <Detail label="WhatsApp" value={provider.whatsapp?formatPhone(provider.whatsapp):null}/>
        <Detail label="E-mail de contato" value={provider.email}/>
        <Detail label="Instagram" value={provider.instagram}/>
      </Section>
      <Section title="Endereço">
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Detail label="CEP" value={provider.zip_code}/>
          <Detail label="Estado" value={provider.state}/>
          <Detail label="Cidade" value={provider.city}/>
          <Detail label="Bairro" value={provider.neighborhood}/>
          <Detail label="Rua / Logradouro" value={provider.street}/>
          <Detail label="Número" value={provider.street_number}/>
          <Detail label="Complemento" value={provider.complement}/>
        </div>
        {mapUrl&&<a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline">
          <MapPin size={15}/> Abrir mapa <ExternalLink size={13}/>
        </a>}
      </Section>
      <Section title="Serviços prestados">
        <div className="grid grid-cols-3 gap-2">
          {provider.service_names.map(service=><div key={service}
            className="flex min-w-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 px-2 py-2 text-center text-[11px] font-semibold text-primary">
            <span className="break-words">{service}</span>
          </div>)}
        </div>
      </Section>
      <Section title="Anexos" description="Documentos privados da Union">
        {files.isPending?<LoadingState text="Carregando anexos"/>:files.isError?
          <p className="text-xs text-destructive">{systemErrorMessage(files.error)}</p>:
          files.data?.length?<div className="space-y-2">
            {files.data.map(file=><button key={file.id} type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-xs font-semibold text-primary hover:bg-primary/5"
              onClick={()=>void openProviderAttachment(file).catch(error=>notifyAdmin(systemErrorMessage(error,"Não foi possível abrir o documento."),"error"))}>
              <Paperclip size={14} className="shrink-0"/><span className="min-w-0 flex-1 truncate">{file.file_name}</span><ExternalLink size={13}/>
            </button>)}
          </div>:<p className="text-xs text-muted-foreground">Nenhum anexo cadastrado.</p>}
      </Section>
      {provider.notes&&<Section title="Observações">
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{provider.notes}</p>
      </Section>}
      <div className="flex flex-wrap justify-end gap-2">
        {provider.phone&&<a href={"tel:"+provider.phone.replace(/[^\d+]/g,"")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
          <Phone size={15}/> Ligar
        </a>}
        {provider.whatsapp&&<a href={whatsappLink(provider.whatsapp)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
          <Phone size={15}/> WhatsApp
        </a>}
        {provider.instagram&&instagramLink(provider.instagram)&&<a href={instagramLink(provider.instagram)!}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
          <Instagram size={15}/> Instagram
        </a>}
      </div>
    </div>
  </AdminDialog>;
}
