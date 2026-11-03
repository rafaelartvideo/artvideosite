import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { FileText, MapPin, Paperclip, X } from "lucide-react";
import { AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FPhoneInput, FEmailInput, FCpfInput, FCnpjInput, FGenderRadio, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { getAddressMapUrl, validateCustomerAddress, type Address } from "@/lib/address";
import { isValidCpf, isValidCnpj } from "@/shared/domain/formatters";
import { lookupCpf } from "@/features/customers/infrastructure/cpf.gateway";
import { fetchCnpjData } from "@/features/customers/infrastructure/cnpj.gateway";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { openProviderAttachment, type PlatformProvider, type PlatformProviderDraft, type PlatformProviderAttachment } from "../infrastructure/platform-providers.repository";

type EditorProps = {
  editing: PlatformProvider | null;
  organizationId: string;
  draft: PlatformProviderDraft;
  setDraft: Dispatch<SetStateAction<PlatformProviderDraft>>;
  servicesContent: ReactNode;
  batchContent: ReactNode;
  serviceCount: number;
  pendingFiles: File[];
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
  attachments: PlatformProviderAttachment[];
  attachmentsLoading: boolean;
  saving: boolean;
  onDeleteAttachment: (item: PlatformProviderAttachment) => void;
  onClose: () => void;
  onSave: () => void;
};

export function PlatformProviderEditor({
  editing, organizationId, draft, setDraft, servicesContent, batchContent, serviceCount,
  pendingFiles, setPendingFiles, attachments, attachmentsLoading,
  saving, onDeleteAttachment, onClose, onSave,
}: EditorProps) {
  const [lookupCpfLoading,setLookupCpfLoading] = useState(false);
  const [lookupCnpjLoading,setLookupCnpjLoading] = useState(false);
  const [cpfError,setCpfError] = useState("");
  const [cnpjError,setCnpjError] = useState("");
  const [addressErrorsVisible,setAddressErrorsVisible] = useState(false);

  const update = (fields: Partial<PlatformProviderDraft>) =>
    setDraft(current => ({...current,...fields}));

  const address = useMemo<Address>(()=>({
    zip_code:draft.zip_code, street:draft.street, number:draft.street_number,
    complement:draft.complement, neighborhood:draft.neighborhood,
    city:draft.city, state:draft.state,
  }),[draft.zip_code,draft.street,draft.street_number,draft.complement,
    draft.neighborhood,draft.city,draft.state]);

  const lookupDocument = async () => {
    if(draft.person_type==="PF"){
      if(!isValidCpf(draft.document)){
        setCpfError("CPF inválido. Verifique os números informados.");return;
      }
      setCpfError("");setLookupCpfLoading(true);
      try{
        const result = await lookupCpf(draft.document,organizationId,null,{checkExisting:false});
        update({name:result.name || draft.name,
          birth_date:result.birthDate || draft.birth_date,
          gender:result.gender || draft.gender});
        notifyAdmin("Dados do CPF preenchidos conforme a consulta do CRM.","success");
      }catch(error){
        setCpfError(systemErrorMessage(error,"Não foi possível consultar o CPF."));
      }finally{setLookupCpfLoading(false);}
      return;
    }
    if(!isValidCnpj(draft.document)){
      setCnpjError("CNPJ inválido. Verifique os números informados.");return;
    }
    setCnpjError("");setLookupCnpjLoading(true);
    try{
      const company=await fetchCnpjData(draft.document);
      update({
        name:String(company.nome_fantasia||company.razao_social||draft.name),
        legal_name:String(company.razao_social||draft.legal_name),
        email:draft.email||String(company.email||""),
        phone:draft.phone||String(company.ddd_telefone_1||""),
        zip_code:String(company.cep||draft.zip_code),
        state:String(company.uf||draft.state),
        city:String(company.municipio||draft.city),
        neighborhood:String(company.bairro||draft.neighborhood),
        street:String(company.logradouro||draft.street),
        street_number:String(company.numero||draft.street_number),
        complement:draft.complement||String(company.complemento||""),
      });
      notifyAdmin("Dados empresariais preenchidos conforme a consulta de CNPJ.","success");
    }catch(error){
      setCnpjError(systemErrorMessage(error,"Não foi possível consultar o CNPJ."));
    }finally{setLookupCnpjLoading(false);}
  };

  const save = () => {
    if(!draft.name.trim()){
      notifyAdmin("Informe o nome do prestador.","error");return;
    }
    if(!editing && !draft.document.trim()){
      notifyAdmin("Informe o "+(draft.person_type==="PF"?"CPF":"CNPJ")+" do prestador.","error");return;
    }
    if(draft.document.trim() && !(draft.person_type==="PF"?isValidCpf(draft.document):isValidCnpj(draft.document))){
      notifyAdmin("Informe um "+(draft.person_type==="PF"?"CPF":"CNPJ")+" válido.","error");return;
    }
    if(!editing){
      const errors=validateCustomerAddress(address);
      if(Object.keys(errors).length){
        setAddressErrorsVisible(true);
        notifyAdmin("Complete os campos obrigatórios do endereço antes de cadastrar.","error");
        return;
      }
    }
    onSave();
  };

  return <AdminPage open onClose={onClose} breadcrumb="Prestadores de Serviços"
    title={editing ? "Editar prestador" : "Novo prestador"}
    subtitle={editing ? "Atualize dados pessoais, endereço, serviços e documentos." : "Cadastre um prestador com os mesmos campos e consultas do CRM."}
    maxW="max-w-6xl">
    <div className="space-y-5 p-4 sm:p-5">
      <Section title="Tipo de prestador">
        <div className="grid gap-3 sm:grid-cols-2">
          {([{value:"PF",label:"Pessoa Física",description:"CPF, nome completo e contatos."},
             {value:"PJ",label:"Pessoa Jurídica",description:"CNPJ, nome fantasia e dados empresariais."}] as const).map(type=>
            <button key={type.value} type="button" aria-pressed={draft.person_type===type.value}
              onClick={()=>{update({person_type:type.value,document:"",name:"",birth_date:"",gender:"",legal_name:""});setCpfError("");setCnpjError("");}}
              className={"rounded-xl border p-4 text-left transition-colors "+
                (draft.person_type===type.value?"border-primary bg-primary/5":"border-border bg-card hover:border-primary/30")}>
              <span className="block text-sm font-bold text-foreground">{type.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{type.description}</span>
            </button>)}
        </div>
      </Section>

      <Section title={draft.person_type==="PF"?"Dados Pessoais":"Dados da Empresa"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {draft.person_type==="PF"?"CPF":"CNPJ"}
              <span className="ml-0.5 font-black text-red-600 dark:text-red-400">*</span>
            </label>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {draft.person_type==="PF" ?
                  <FCpfInput value={draft.document} error={cpfError} required
                    onChange={(event:any)=>{update({document:event.target.value});setCpfError("");}}/> :
                  <FCnpjInput value={draft.document} error={cnpjError} required
                    onChange={(event:any)=>{update({document:event.target.value});setCnpjError("");}}/>}
              </div>
              <BtnSecondary className="h-[42px] shrink-0 px-4"
                disabled={lookupCpfLoading||lookupCnpjLoading} loading={lookupCpfLoading||lookupCnpjLoading}
                onClick={()=>void lookupDocument()}>Consultar</BtnSecondary>
            </div>
          </div>
          <FInput label={draft.person_type==="PF"?"Nome completo":"Nome fantasia"} required
            value={draft.name} onChange={(event:any)=>update({name:event.target.value})}/>
          {draft.person_type==="PF"?<>
            <FInput type="date" label="Data de nascimento" value={draft.birth_date}
              max={new Date().toISOString().slice(0,10)}
              onChange={(event:any)=>update({birth_date:event.target.value})}/>
            <FEmailInput label="E-mail de contato" value={draft.email}
              onChange={(event:any)=>update({email:event.target.value})}/>
            <FGenderRadio value={draft.gender} onChange={gender=>update({gender})}/>
          </>:<>
            <FInput label="Razão social" value={draft.legal_name}
              onChange={(event:any)=>update({legal_name:event.target.value})}/>
            <FEmailInput label="E-mail de contato" value={draft.email}
              onChange={(event:any)=>update({email:event.target.value})}/>
          </>}
          <FPhoneInput label="Telefone" value={draft.phone} required={!draft.whatsapp}
            copyFromWhatsapp={draft.whatsapp} onCopyWhatsapp={phone=>update({phone})}
            onChange={(event:any)=>update({phone:event.target.value})}/>
          <FPhoneInput label="WhatsApp" mobile value={draft.whatsapp}
            copyFromPhone={draft.phone} onCopyPhone={whatsapp=>update({whatsapp})}
            onChange={(event:any)=>update({whatsapp:event.target.value})}/>
          <FInput label="Instagram" value={draft.instagram} maxLength={160}
            placeholder="@usuario ou link do perfil"
            onChange={(event:any)=>update({instagram:event.target.value})}/>
        </div>
      </Section>

      <Section title="Endereço" description="Preencha o CEP para buscar o endereço automaticamente, como nos cadastros do CRM.">
        <AddressFields value={address} inputClassName={INPUT} required={!editing}
          errors={addressErrorsVisible && !editing ? validateCustomerAddress(address):undefined}
          onChange={next=>update({
            zip_code:next.zip_code,street:next.street,street_number:next.number,
            complement:next.complement,neighborhood:next.neighborhood,
            city:next.city,state:next.state.toUpperCase(),
          })}/>
        {getAddressMapUrl(address)&&<a target="_blank" rel="noopener noreferrer"
          href={getAddressMapUrl(address)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <MapPin size={14}/> Abrir mapa
        </a>}
      </Section>

      <Section title="Serviços Prestados"
        description="Abra o equipamento para marcar as subcategorias desejadas ou selecione uma profissão avulsa.">
        <p className="mb-3 text-xs font-semibold text-primary">{serviceCount} selecionado{serviceCount===1?"":"s"}</p>
        {servicesContent}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Não encontrou o serviço desejado?</p>
          {batchContent}
        </div>
      </Section>

      <Section title="Anexos" description="Documentos opcionais com acesso restrito à Union.">
        <p className="mb-3 text-xs text-muted-foreground">PDF, foto, TXT, DOC ou DOCX. Até 10 MB por arquivo.</p>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx"
          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:font-semibold file:text-primary"
          onChange={event=>{const picked=Array.from(event.target.files||[]);
            setPendingFiles(current=>[...current,...picked]);event.target.value="";}}/>
        <div className="mt-3 space-y-2">
          {pendingFiles.map((file,index)=><div key={index} className="flex items-center gap-2 text-xs">
            <FileText size={14} className="shrink-0 text-primary"/>
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button type="button" aria-label={"Remover "+file.name}
              onClick={()=>setPendingFiles(current=>current.filter((_,i)=>i!==index))}><X size={14}/></button>
          </div>)}
          {attachmentsLoading&&<LoadingState text="Carregando anexos"/>}
          {attachments.map(attachment=><div key={attachment.id}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
            <Paperclip size={14} className="shrink-0"/>
            <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold text-primary hover:underline"
              onClick={()=>void openProviderAttachment(attachment).catch(error=>notifyAdmin(systemErrorMessage(error),"error"))}>
              {attachment.file_name}</button>
            <button type="button" aria-label={"Excluir "+attachment.file_name} className="p-1 text-destructive"
              onClick={()=>onDeleteAttachment(attachment)}><X size={15}/></button>
          </div>)}
        </div>
      </Section>

      <Section title="Observações">
        <FTextarea label="Informações adicionais" rows={3} maxLength={3000}
          value={draft.notes} onChange={(event:any)=>update({notes:event.target.value})}
          placeholder="Experiência, disponibilidade e informações relevantes para a contratação."/>
      </Section>
    </div>
    <AdminStickyToolbar className="flex-wrap justify-end gap-2">
      <BtnSecondary disabled={saving} onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary loading={saving}
        disabled={!draft.name.trim()||!draft.city.trim()||!draft.state||serviceCount===0}
        onClick={save}>{editing?"Salvar alterações":"Cadastrar prestador"}</BtnPrimary>
    </AdminStickyToolbar>
  </AdminPage>;
}
