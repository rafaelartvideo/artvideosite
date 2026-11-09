import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin, Search, UserPlus } from "lucide-react";
import { fetchAddressByZipCode, formatZipCode, validateCustomerAddress, type Address } from "@/lib/address";
import { isValidCnpj, isValidCpf, isValidEmail } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import {
  createSalesQuickCustomer,type QuickSalesCustomer,
} from "../infrastructure/sales-operations.repository";

export function SalesQuickCustomerDialog({organizationId,onClose,onSaved}:{
  organizationId:string;onClose:()=>void;onSaved:(customer:QuickSalesCustomer)=>void;
}) {
  const [type,setType]=useState<"PF"|"PJ">("PF");
  const [name,setName]=useState("");
  const [document,setDocument]=useState("");
  const [whatsapp,setWhatsapp]=useState("");
  const [email,setEmail]=useState("");
  const [address,setAddress]=useState<Partial<Address>>({
    zip_code:"",street:"",number:"",neighborhood:"",city:"",state:"",
  });
  const [cepLoading,setCepLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const validation=validateCustomerAddress(address);
  const invalid=Boolean(name.trim().length<3 ||
    (type==="PF"?!isValidCpf(document):!isValidCnpj(document)) ||
    whatsapp.replace(/\D/g,"").length<10||
    (email.trim()&&!isValidEmail(email))||
    Object.keys(validation).length>0);
  const changeAddress=(key:keyof Address,value:string)=>
    setAddress(previous=>({...previous,[key]:value}));

  const lookupCep=async()=>{
    setError(null);
    setCepLoading(true);
    try{
      const result=await fetchAddressByZipCode(address.zip_code||"");
      if(!result)throw new Error("CEP não encontrado.");
      setAddress(previous=>({...previous,...result}));
    }catch(e){
      setError(systemErrorMessage(e,"Não foi possível consultar o CEP."));
    }finally{setCepLoading(false);}
  };
  const mutation=useMutation({
    mutationFn:()=>createSalesQuickCustomer(organizationId,{
      type,name:name.trim(),document,whatsapp,email:email.trim(),
      address:{
        zip_code:address.zip_code||"",
        street:address.street||"",
        number:address.number||"",
        neighborhood:address.neighborhood||"",
        city:address.city||"",
        state:address.state||"",
        complement:address.complement||"",
        reference:address.reference||"",
      },
    }),
    onSuccess:onSaved,
    onError:e=>setError(systemErrorMessage(e,"Não foi possível cadastrar o cliente.")),
  });

  return <AdminDialog open onClose={()=>!mutation.isPending&&onClose()}
    title="Cadastro rápido de cliente"
    description="Cadastre sem sair da venda. CPF/CNPJ, WhatsApp e endereço são obrigatórios."
    className="w-[calc(100vw-1.25rem)] max-w-2xl"
    bodyClassName="max-h-[min(74dvh,690px)] overflow-y-auto"
    footer={<div className="flex w-full justify-end gap-2">
      <AdminButton variant="secondary" size="sm" disabled={mutation.isPending} onClick={onClose}>Voltar</AdminButton>
      <AdminButton size="sm" disabled={invalid||mutation.isPending||cepLoading}
        loading={mutation.isPending} onClick={()=>{setError(null);mutation.mutate();}}>
        <UserPlus size={15}/> Cadastrar e selecionar
      </AdminButton>
    </div>}>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["PF","PJ"] as const).map(item=><button type="button" key={item}
          onClick={()=>{setType(item);setDocument("");}}
          className={"rounded-lg border p-2.5 text-xs font-semibold "+
            (item===type?"border-primary bg-primary/5 text-primary":"border-border")}>
          {item==="PF"?"Pessoa física":"Pessoa jurídica"}
        </button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold">
          <span>{type==="PF"?"Nome completo":"Nome da empresa"} *</span>
          <input value={name} maxLength={180} onChange={e=>setName(e.target.value)}
            className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
        </label>
        <label className="space-y-1 text-xs font-semibold">
          <span>{type==="PF"?"CPF":"CNPJ"} *</span>
          <input value={document} inputMode="numeric" maxLength={18}
            onChange={e=>setDocument(e.target.value)}
            className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
        </label>
        <label className="space-y-1 text-xs font-semibold">
          <span>WhatsApp com DDD *</span>
          <input value={whatsapp} inputMode="tel" maxLength={20}
            onChange={e=>setWhatsapp(e.target.value)}
            className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
        </label>
        <label className="space-y-1 text-xs font-semibold">
          <span>E-mail (opcional)</span>
          <input value={email} type="email" maxLength={160}
            onChange={e=>setEmail(e.target.value)}
            className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
        </label>
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin size={15}/> Endereço</h3>
        <div className="grid gap-3 sm:grid-cols-[170px_minmax(0,1fr)]">
          <label className="space-y-1 text-xs font-semibold"><span>CEP *</span>
            <div className="flex gap-1">
              <input value={address.zip_code||""} inputMode="numeric" maxLength={9}
                onChange={e=>changeAddress("zip_code",formatZipCode(e.target.value))}
                onBlur={()=>{if((address.zip_code||"").replace(/\D/g,"").length===8)void lookupCep();}}
                className={INPUT+" h-[42px] px-2 md:h-9 md:py-1.5 md:text-xs"}/>
              <button type="button" onClick={()=>void lookupCep()} disabled={cepLoading}
                aria-label="Consultar CEP" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                <Search size={16}/>
              </button>
            </div>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Rua / logradouro *</span>
            <input value={address.street||""} onChange={e=>changeAddress("street",e.target.value)}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-semibold"><span>Número *</span>
            <input value={address.number||""} onChange={e=>changeAddress("number",e.target.value)}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Complemento</span>
            <input value={address.complement||""} onChange={e=>changeAddress("complement",e.target.value)}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Bairro *</span>
            <input value={address.neighborhood||""} onChange={e=>changeAddress("neighborhood",e.target.value)}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Cidade *</span>
            <input value={address.city||""} onChange={e=>changeAddress("city",e.target.value)}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Estado (UF) *</span>
            <input value={address.state||""} maxLength={2}
              onChange={e=>changeAddress("state",e.target.value.toUpperCase())}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
          <label className="space-y-1 text-xs font-semibold"><span>Referência</span>
            <input value={address.reference||""} onChange={e=>changeAddress("reference",e.target.value)}
              className={INPUT+" h-[42px] md:h-9 md:py-1.5 md:text-xs"}/>
          </label>
        </div>
      </div>
      {cepLoading&&<p className="text-xs text-muted-foreground">Consultando CEP...</p>}
      {error&&<p role="alert" className="rounded-lg border border-destructive/20 p-3 text-xs text-destructive">
        {error}
      </p>}
      {invalid&&!error&&<p className="text-xs text-muted-foreground">
        Preencha os campos obrigatórios para cadastrar e selecionar o cliente automaticamente.
      </p>}
    </div>
  </AdminDialog>;
}
