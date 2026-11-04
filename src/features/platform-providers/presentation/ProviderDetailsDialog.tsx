import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Paperclip, Phone, Instagram } from "lucide-react";
import { AdminButton, AdminDialog, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCpf, formatCnpj, formatPhone } from "@/shared/domain/formatters";
import { getAddressMapUrl } from "@/lib/address";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
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
  const instagramUrl=provider.instagram?instagramLink(provider.instagram):null;
  const headerActionClass="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-card p-0 text-xs font-bold transition-colors hover:bg-muted sm:w-auto sm:px-3";
  const personalActions=(provider.phone||provider.whatsapp||instagramUrl) ? <>
    {provider.phone&&<a href={"tel:"+provider.phone.replace(/[^\d+]/g,"")}
      aria-label="Ligar para o prestador" title="Ligar"
      className={headerActionClass+" border-primary/25 text-primary hover:bg-primary/5"}>
      <Phone size={15} aria-hidden="true"/><span className="hidden sm:inline">Ligar</span>
    </a>}
    {provider.whatsapp&&<a href={whatsappLink(provider.whatsapp)} target="_blank" rel="noopener noreferrer"
      aria-label="Abrir WhatsApp do prestador" title="WhatsApp"
      className={headerActionClass+" border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"}>
      <WhatsAppBrandIcon size={16}/><span className="hidden sm:inline">WhatsApp</span>
    </a>}
    {instagramUrl&&<a href={instagramUrl} target="_blank" rel="noopener noreferrer"
      aria-label="Abrir Instagram do prestador" title="Instagram"
      className={headerActionClass+" border-primary/25 text-primary hover:bg-primary/5"}>
      <Instagram size={15} aria-hidden="true"/><span className="hidden sm:inline">Instagram</span>
    </a>}
  </> : undefined;
  return <AdminDialog open onClose={onClose} title={provider.name}
    description="Detalhes do prestador" className="w-[min(96vw,800px)] max-w-3xl"
    footer={<div className="flex justify-end"><AdminButton variant="secondary" onClick={onClose}>Fechar</AdminButton></div>}>
    <div className="space-y-4">
      <Section title="Dados pessoais" actions={personalActions} contentClassName="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
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
      <Section title="Endereço" actions={mapUrl?<a href={mapUrl} target="_blank" rel="noopener noreferrer"
        aria-label="Abrir endereço do prestador no mapa" title="Abrir mapa"
        className={headerActionClass+" border-primary/25 text-primary hover:bg-primary/5"}>
        <MapPin size={15} aria-hidden="true"/><span className="hidden sm:inline">Abrir mapa</span>
      </a>:undefined}>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Detail label="CEP" value={provider.zip_code}/>
          <Detail label="Estado" value={provider.state}/>
          <Detail label="Cidade" value={provider.city}/>
          <Detail label="Bairro" value={provider.neighborhood}/>
          <Detail label="Rua / Logradouro" value={provider.street}/>
          <Detail label="Número" value={provider.street_number}/>
          <Detail label="Complemento" value={provider.complement}/>
        </div>
      </Section>
      <Section title="Atuação profissional">
        <Detail label="Profissão" value={provider.profession || "Não informada"}/>
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-foreground">Equipamentos e serviços</p>
          {!provider.service_names.length ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum serviço vinculado a este prestador.
          </p> : <div className="space-y-3">
            {Array.from(new Set(provider.service_names.map(name =>
              name.includes(" · ") ? name.split(" · ")[0] : ""))).sort((a,b) =>
              a.localeCompare(b,"pt-BR")).map(equipment => {
              const related=provider.service_names.filter(name => equipment
                ? name.startsWith(equipment+" · ") : !name.includes(" · "));
              return <div key={equipment || "__direct__"} className="overflow-hidden rounded-lg border border-border">
                <div className="bg-muted/30 px-3 py-2 text-xs font-bold text-foreground">
                  {equipment || "Serviços diretos (sem equipamento)"}
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2 md:grid-cols-3">
                  {related.map(name=><div key={name}
                    className="rounded-lg border border-primary/15 bg-primary/5 px-2 py-2 text-center text-xs font-semibold text-primary">
                    {equipment?name.slice(equipment.length+3):name}
                  </div>)}
                </div>
              </div>;
            })}
          </div>}
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
    </div>
  </AdminDialog>;
}
