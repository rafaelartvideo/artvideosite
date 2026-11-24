import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ImagePlus, Loader2, RotateCcw, RotateCw, X } from "lucide-react";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, validateCustomerAddress } from "@/lib/address";
import { isValidCpf, isValidCnpj, isValidBrazilianPhone, formatPhoneInput } from "@/shared/domain/formatters";
import { openIntake, listIntakeModels, validateIntakeIdentity, submitIntake, type IntakeCatalog, type IntakePayload, type IntakePhoto } from "./order-intake.repository";

const field="w-full rounded-xl border bg-white px-3 py-3 text-base text-slate-900 outline-none transition-colors";
const fieldStyle=(invalid:boolean)=>field+(invalid?" border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-100":" border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100");
const photoNames={label:"Foto da etiqueta",problem:"Foto do defeito",equipment:"Foto do equipamento"};
const button="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0131cd] px-5 py-3 text-sm font-bold text-white disabled:opacity-50";
const initial: IntakePayload={name:"",document:"",phone:"",address:{...emptyAddress},type_id:"",brand_id:null,brand_text:"",model:"",serial:"",problem:""};
type PhotoPreview = IntakePhoto & {url:string};
const hints={label:"Procure a etiqueta atrás, embaixo ou na lateral do aparelho. Mostre modelo e número de série, sem reflexos.",equipment:"Fotografe o aparelho inteiro, de frente e com boa iluminação.",problem:"Mostre o defeito. Se não for visível (por exemplo, não liga), fotografe a tela ou a parte afetada. Não desmonte o equipamento."};
async function encodePhoto(file:File,degrees:number,kind:IntakePhoto["kind"]):Promise<File>{
  if(file.size>25_000_000)throw new Error("A foto deve ter até 25 MB.");
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Não foi possível abrir esta foto. Tente outra."));image.src=url;});
    const size=kind==="label"?2000:1500,scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));
    const w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
    const c=document.createElement("canvas"),sideways=degrees%180!==0;c.width=sideways?h:w;c.height=sideways?w:h;
    const ctx=c.getContext("2d");if(!ctx)throw new Error("Seu navegador não conseguiu preparar a foto.");
    ctx.translate(c.width/2,c.height/2);ctx.rotate(degrees*Math.PI/180);ctx.drawImage(image,-w/2,-h/2,w,h);
    for(const quality of [0.86,0.72,0.55]){
      const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,"image/webp",quality));
      if(blob?.type==="image/webp"&&blob.size<=1_500_000){c.width=0;c.height=0;return new File([blob],kind+".webp",{type:"image/webp"});}
    }
    throw new Error("Foto muito grande. Tente outra.");
  }finally{URL.revokeObjectURL(url);}
}
export function PublicOrderIntakePage(){
  const [token]=useState(()=>{const t=new URLSearchParams(window.location.hash.slice(1)).get("t")||"";return /^[a-f0-9]{64}$/.test(t)?t:"";});
  const [catalog,setCatalog]=useState<IntakeCatalog|null>(null),[error,setError]=useState(""),[step,setStep]=useState(0),[payload,setPayload]=useState<IntakePayload>(initial);
  const [photos,setPhotos]=useState<PhotoPreview[]>([]),[pending,setPending]=useState<{file:File;kind:IntakePhoto["kind"];url:string;replaceUrl?:string}|null>(null),[rotation,setRotation]=useState(0);
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [photoSource,setPhotoSource]=useState<{kind:IntakePhoto["kind"];replaceUrl?:string}|null>(null),[viewPhoto,setViewPhoto]=useState<PhotoPreview|null>(null),[photoError,setPhotoError]=useState("");
  const cameraInput=useRef<HTMLInputElement>(null),fileInput=useRef<HTMLInputElement>(null),sourceRef=useRef(photoSource);sourceRef.current=photoSource;
  const [modelsByBrand,setModelsByBrand]=useState<Record<string,{id:string;name:string}[]>>({});
  const [busy,setBusy]=useState(false),[zipBusy,setZipBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[done,setDone]=useState(false);
  const [confirmationPhone,setConfirmationPhone]=useState<string|null>(null);
  const confirmationUrl=confirmationPhone&&/^55[1-9]\d{9,10}$/.test(confirmationPhone)?`https://wa.me/${confirmationPhone}?text=${encodeURIComponent("Olá! Acabei de preencher e enviar minha solicitação de atendimento pelo link. Aguardo a conferência da equipe. Obrigado!")}`:null;
  const identityProof=useRef<{key:string;ticket:string;until:number}|null>(null);
  const zipVersion=useRef(0),photoRef=useRef(photos),pendingRef=useRef(pending),gate=useRef(false);photoRef.current=photos;pendingRef.current=pending;
  useEffect(()=>()=>{photoRef.current.forEach(p=>URL.revokeObjectURL(p.url));if(pendingRef.current)URL.revokeObjectURL(pendingRef.current.url);},[]);
  useEffect(()=>{let current=true;if(!token){setError("Link inválido. Peça outro à assistência.");return;}openIntake(token).then(c=>{if(current){setCatalog(c);if(c.requires_customer_details===false)setStep(2);if(c.status==="received"){setConfirmationPhone(c.confirmation_phone||null);setDone(true);}}}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[token]);
  useEffect(()=>{
    const brand=payload.brand_id;
    if(!brand||!token||modelsByBrand[brand])return;
    let active=true;
    listIntakeModels(token,brand).then(r=>{if(active)setModelsByBrand(old=>({...old,[brand]:r.models||[]}));}).catch(()=>{if(active)setModelsByBrand(old=>({...old,[brand]:[]}));});
    return()=>{active=false;};
  },[payload.brand_id,token,modelsByBrand]);
  const clearField=(key:string)=>setFieldErrors(old=>{const next={...old};delete next[key];return next;});
  const update=(key:keyof IntakePayload,value:string|null)=>{clearField(key);setPayload(p=>({...p,[key]:value}));setConfirmed(false);};
  const address=(key:string,value:string)=>{clearField(key);setPayload(p=>({...p,address:{...p.address,[key]:value}}));setConfirmed(false);};
  const lookupZip=async(value:string)=>{
    const zip=formatZipCode(value),v=++zipVersion.current;address("zip_code",zip);setZipBusy(false);
    if(zip.replace(/\D/g,"").length!==8)return;
    setZipBusy(true);
    try{const result=await fetchAddressByZipCode(zip);if(v!==zipVersion.current)return;if(result){setPayload(p=>({...p,address:{...p.address,...result}}));setFieldErrors(old=>{const next={...old};for(const key of Object.keys(result))delete next[key];return next;});}else setFieldErrors(old=>({...old,zip_code:"CEP não encontrado. Confira ou preencha o endereço manualmente."}));}
    catch{if(v===zipVersion.current)setFieldErrors(old=>({...old,zip_code:"Não foi possível consultar o CEP. Você pode preencher manualmente."}));}
    finally{if(v===zipVersion.current)setZipBusy(false);}
  };
  const closePhoto=()=>{if(pending)URL.revokeObjectURL(pending.url);setPending(null);setRotation(0);setPhotoError("");};
  const savePhoto=async()=>{if(!pending||gate.current)return;gate.current=true;setBusy(true);setPhotoError("");try{
    const file=await encodePhoto(pending.file,rotation,pending.kind);
    const next={file,kind:pending.kind,url:URL.createObjectURL(file)};
    if(pending.replaceUrl)URL.revokeObjectURL(pending.replaceUrl);
    setPhotos(p=>pending.replaceUrl?p.map(item=>item.url===pending.replaceUrl?next:item):[...p,next]);
    clearField(pending.kind==="problem"?"problemPhoto":pending.kind);setConfirmed(false);closePhoto();
  }catch(e){setPhotoError(e instanceof Error?e.message:"Foto indisponível.");}finally{gate.current=false;setBusy(false);}};
  const firstStep=catalog?.requires_customer_details===false?2:0;
  const hasPhoto=(kind:IntakePhoto["kind"])=>photos.some(p=>p.kind===kind);
  const validation=(currentStep=step)=>{
    const errors:Record<string,string>={};
    if(currentStep===0){
      if(payload.name.trim().length<3)errors.name="Informe seu nome completo ou razão social.";
      if(!(isValidCpf(payload.document)||isValidCnpj(payload.document)))errors.document="Informe um CPF ou CNPJ válido.";
      if(payload.phone&&!isValidBrazilianPhone(payload.phone))errors.phone="Informe um telefone válido com DDD ou deixe em branco.";
    }
    if(currentStep===1)Object.assign(errors,validateCustomerAddress(payload.address));
    if(currentStep===2){
      if(!payload.type_id)errors.type_id="Selecione o tipo de equipamento.";
      if(!hasPhoto("label"))errors.label="Adicione uma foto da etiqueta do equipamento.";
    }
    if(currentStep===3){
      if(payload.problem.trim().length<5)errors.problem="Descreva o problema em algumas palavras.";
      if(!hasPhoto("problem"))errors.problemPhoto="Adicione uma foto do defeito ou da parte afetada.";
    }
    return errors;
  };
  const showErrors=(errors:Record<string,string>)=>{setFieldErrors(errors);requestAnimationFrame(()=>document.querySelector('[aria-invalid="true"]')?.scrollIntoView({behavior:"smooth",block:"center"}));};
  const checkIdentity=async()=>{
    if(!catalog?.requires_cpf_identity||firstStep!==0||payload.document.replace(/\D/g,"").length!==11)return "";
    const document=payload.document.replace(/\D/g,""),name=payload.name.trim().replace(/\s+/g," ");
    const key=document+":"+name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const cached=identityProof.current;
    if(cached?.key===key&&cached.until>Date.now())return cached.ticket;
    const result=await validateIntakeIdentity(token,document,name);
    if(!result.required)return "";
    if(!result.ticket)throw new Error("Não foi possível confirmar o CPF. Tente novamente.");
    identityProof.current={key,ticket:result.ticket,until:Date.now()+10*60_000};
    return result.ticket;
  };
  const next=async()=>{
    const e=validation();setError("");if(Object.keys(e).length){showErrors(e);return;}if(gate.current)return;setFieldErrors({});
    if(step===0&&catalog?.requires_cpf_identity&&payload.document.replace(/\D/g,"").length===11){
      gate.current=true;setBusy(true);
      try{await checkIdentity();}catch(error){showErrors({document:error instanceof Error?error.message:"Não foi possível validar o CPF."});return;}
      finally{gate.current=false;setBusy(false);}
    }
    setStep(s=>Math.min(4,s+1));window.scrollTo(0,0);
  };
  const send=async()=>{if(!confirmed||gate.current)return;for(let i=firstStep;i<4;i++){const e=validation(i);if(Object.keys(e).length){setStep(i);showErrors(e);setConfirmed(false);return;}}gate.current=true;setBusy(true);setError("");try{let ticket="";try{ticket=await checkIdentity();}catch(e){setStep(0);setConfirmed(false);showErrors({document:e instanceof Error?e.message:"Não foi possível validar o CPF."});return;}const r=await submitIntake(token,{...payload,cpf_identity_ticket:ticket||undefined},photos);if(r.status==="received"){setConfirmationPhone(r.confirmation_phone||null);setDone(true);window.scrollTo(0,0);}else throw new Error("Envio não confirmado.");}catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar.");}finally{gate.current=false;setBusy(false);}};
  const requiredLabel=(label:string)=><>{label.replace(/\s*\*$/,"")}{label.endsWith("*")&&<span className="ml-1 text-red-600" aria-hidden="true">*</span>}</>;
  const inlineError=(key:string)=>fieldErrors[key]?<p id={"error-"+key} role="alert" className="text-xs font-medium text-red-600">{fieldErrors[key]}</p>:null;
  const input=(key:string,label:string,value:string,onChange:(v:string)=>void,placeholder="",mode?:"numeric"|"tel")=><label className="block space-y-1.5 text-sm font-semibold text-slate-800">{requiredLabel(label)}<input className={fieldStyle(Boolean(fieldErrors[key]))} aria-invalid={Boolean(fieldErrors[key])} aria-describedby={fieldErrors[key]?"error-"+key:undefined} value={value} disabled={busy} placeholder={placeholder} inputMode={mode} aria-required={label.endsWith("*")} onChange={e=>{setError("");onChange(e.target.value);}}/>{inlineError(key)}</label>;
  const photoLimit=(kind:IntakePhoto["kind"])=>photos.length+1+Number(kind!=="label"&&!hasPhoto("label"))+Number(kind!=="problem"&&!hasPhoto("problem"))>5;
  const openSource=(kind:IntakePhoto["kind"],replaceUrl?:string)=>{if(busy||pending||(!replaceUrl&&photoLimit(kind)))return;setViewPhoto(null);setPhotoError("");setPhotoSource({kind,replaceUrl});};
  const pickPhoto=(file?:File)=>{const source=sourceRef.current;if(!file||!source)return;setPhotoSource(null);setPending({...source,file,url:URL.createObjectURL(file)});setRotation(0);};
  const photoButton=(kind:IntakePhoto["kind"],label:string)=>{
    const errorKey=kind==="problem"?"problemPhoto":kind,invalid=Boolean(fieldErrors[errorKey]);
    const group=photos.filter(p=>p.kind===kind);
    return <section aria-invalid={invalid} aria-describedby={invalid?"error-"+errorKey:undefined} className={"space-y-3 rounded-xl border p-4 "+(invalid?"border-red-500 bg-red-50/30":"border-slate-200 bg-slate-50")}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Camera size={18} className="text-[#0131cd]"/><span>{requiredLabel(label)}</span></h3><p className="text-xs leading-5 text-slate-600">{hints[kind]}</p>
      {group.length>0&&<div className="grid grid-cols-2 gap-3">{group.map(p=><div key={p.url} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><button type="button" className="block w-full" aria-label={"Visualizar "+photoNames[kind]} onClick={()=>setViewPhoto(p)}><img src={p.url} alt={photoNames[kind]} className="aspect-square w-full object-cover"/></button><button type="button" disabled={busy} className="w-full border-t border-slate-200 px-2 py-2 text-xs font-semibold text-[#0131cd]" onClick={()=>openSource(kind,p.url)}>Trocar foto</button></div>)}</div>}
      {!photoLimit(kind)&&<button type="button" disabled={busy} onClick={()=>openSource(kind)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#0131cd]/30 bg-white px-3 text-sm font-semibold text-[#0131cd]"><ImagePlus size={18}/>{group.length?"Adicionar outra foto":"Adicionar foto"}</button>}
      {inlineError(errorKey)}
    </section>;
  };
  const reviewField=(label:string,value:string|undefined)=><div className="min-w-0 space-y-1"><p className="text-xs font-medium text-slate-500">{label}</p><p className="break-words whitespace-pre-wrap text-sm font-semibold text-slate-900">{value||"Não informado"}</p></div>;
  return <main style={{fontFamily:"Inter, ui-sans-serif, system-ui, sans-serif"}} className="min-h-dvh bg-[#f4f6fa] px-4 py-6 text-slate-900">
    <div className="mx-auto max-w-lg space-y-4">
      <header className="rounded-2xl bg-white p-5 text-center shadow-sm"><div className="flex items-center justify-center gap-2">{catalog?.company_logo_url&&<img src={catalog.company_logo_url} alt="" className="h-10 w-10 rounded-md object-contain" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display="none";}}/>}<p className="text-sm font-semibold text-[#0131cd]">{catalog?.company||"Assistência técnica"}</p></div><h1 className="mt-2 text-xl font-bold">Solicitar atendimento</h1><p className="mt-1 text-sm text-slate-600">Preencha apenas o necessário. Nossa equipe dará continuidade pelo WhatsApp.</p></header>
      {done?<section className="rounded-2xl bg-white p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42}/><h2 className="mt-3 text-lg font-bold">Solicitação confirmada!</h2><p className="mt-2 text-sm text-slate-600">Seus dados e fotos foram recebidos. A equipe irá conferir as informações antes de abrir sua OS.</p>{confirmationUrl?<><a href={confirmationUrl} referrerPolicy="no-referrer" className={button+" mt-6 w-full"}><CheckCircle2 size={19}/> Confirmar pelo WhatsApp</a><p className="mt-3 text-xs leading-5 text-slate-500">Ao confirmar, o WhatsApp abrirá com uma mensagem pronta para você enviar à empresa.</p></>:<p className="mt-4 text-xs leading-5 text-slate-500">Volte à conversa original no WhatsApp e avise que concluiu a solicitação.</p>}</section>:!catalog?<section className="rounded-2xl bg-white p-6 text-center text-sm">{error||<span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={18}/> Carregando...</span>}</section>:<>
        <nav aria-label="Etapas da solicitação" className="flex items-start gap-1 rounded-xl border border-slate-200 bg-white px-2 py-4">{["Identificação","Endereço","Equipamento","Problema","Revisão"].slice(firstStep).map((s,i)=>{const n=i+firstStep;return <div key={s} className="min-w-0 flex-1 text-center" aria-current={n===step?"step":undefined}><button type="button" disabled={n>=step||busy} onClick={()=>{setError("");setFieldErrors({});setStep(n);setConfirmed(false);}} className={"mx-auto flex size-8 items-center justify-center rounded-full border text-xs font-semibold "+(n<step?"border-emerald-600 bg-emerald-50 text-emerald-700":n===step?"border-[#0131cd] bg-[#0131cd] text-white":"border-slate-200 bg-slate-50 text-slate-500")}>{n<step?<Check size={16}/>:i+1}</button><div className={"mx-1 my-2 h-1 rounded-full "+(n<step?"bg-emerald-500":n===step?"bg-[#0131cd]":"bg-slate-200")}/><p className={"text-[10px] leading-tight "+(n===step?"font-bold text-[#0131cd]":"text-slate-600")}>{s}</p></div>;})}</nav>
        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Etapa {step-firstStep+1} de {5-firstStep}</p>
          {firstStep===0&&step===0&&<><h2 className="text-lg font-bold">Quem precisa de atendimento?</h2>{input("name","Nome completo ou razão social *",payload.name,v=>update("name",v),"Como está no documento")}{input("document","CPF ou CNPJ *",payload.document,v=>update("document",v.replace(/\D/g,"").slice(0,14)),"Somente números","numeric")}<div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="shrink-0"/> Seu WhatsApp já está preenchido automaticamente.</div>{input("phone","Telefone (opcional)",payload.phone||"",v=>update("phone",formatPhoneInput(v,payload.phone||"")),"(00) 00000-0000","tel")}<p className="text-xs text-slate-600">Informe outro telefone apenas se houver. Se deixar em branco, usaremos o mesmo número do WhatsApp.</p></>}
          {firstStep===0&&step===1&&<><h2 className="text-lg font-bold">Seu endereço</h2>{input("zip_code","CEP *",payload.address.zip_code,v=>void lookupZip(v),"00000-000","numeric")}{zipBusy&&<p className="text-xs text-blue-700">Buscando endereço...</p>}{input("street","Rua *",payload.address.street,v=>address("street",v))}<div className="grid grid-cols-2 gap-3">{input("number","Número *",payload.address.number,v=>address("number",v),"Ex.: 1190")}{input("complement","Complemento (opcional)",payload.address.complement,v=>address("complement",v))}</div>{input("neighborhood","Bairro *",payload.address.neighborhood,v=>address("neighborhood",v))}<div className="grid grid-cols-[1fr_85px] gap-3">{input("city","Cidade *",payload.address.city,v=>address("city",v))}{input("state","UF *",payload.address.state,v=>address("state",v.toUpperCase().slice(0,2)))}</div></>}
          {step===2&&<><h2 className="text-lg font-bold">Qual é o aparelho?</h2><label className="block space-y-1.5 text-sm font-semibold">{requiredLabel("Equipamento *")}<select aria-required="true" aria-invalid={Boolean(fieldErrors.type_id)} aria-describedby={fieldErrors.type_id?"error-type_id":undefined} className={fieldStyle(Boolean(fieldErrors.type_id))} value={payload.type_id} onChange={e=>{clearField("type_id");setConfirmed(false);setPayload(p=>({...p,type_id:e.target.value,brand_id:null,brand_text:"",model:""}));}}><option value="">Selecione</option>{catalog.types?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>{inlineError("type_id")}</label><label className="block space-y-1.5 text-sm font-semibold">Marca<select className={fieldStyle(false)} value={payload.brand_id||""} disabled={!payload.type_id} onChange={e=>{setConfirmed(false);setPayload(p=>({...p,brand_id:e.target.value||null,model:""}));}}><option value="">Não sei / outra</option>{catalog.brands?.filter(b=>b.equipment_type_id===payload.type_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{!payload.brand_id&&input("brand_text","Outra marca (opcional)",payload.brand_text||"",v=>update("brand_text",v))}<label className="block space-y-1.5 text-sm font-semibold">Modelo (se souber)<input list="pre-os-models" className={fieldStyle(false)} value={payload.model} onChange={e=>update("model",e.target.value)} placeholder="Escolha ou digite o modelo"/><datalist id="pre-os-models">{(modelsByBrand[payload.brand_id||""]||[]).map(m=><option key={m.id} value={m.name}/>)}</datalist></label>{input("serial","Número de série (se souber)",payload.serial,v=>update("serial",v))}{photoButton("label","Foto da etiqueta *")}</>}
          {step===3&&<><h2 className="text-lg font-bold">O que aconteceu?</h2><label className="block space-y-1.5 text-sm font-semibold">{requiredLabel("Descreva o problema *")}<textarea aria-required="true" aria-invalid={Boolean(fieldErrors.problem)} aria-describedby={fieldErrors.problem?"error-problem":undefined} rows={5} maxLength={2500} className={fieldStyle(Boolean(fieldErrors.problem))} value={payload.problem} onChange={e=>update("problem",e.target.value)} placeholder="Ex.: Liga, mas não aparece imagem."/>{inlineError("problem")}</label>{photoButton("problem","Foto do defeito *")}</>}
          {step===4&&<><h2 className="text-lg font-bold">Confira antes de enviar</h2>
            {firstStep===0&&<section className="space-y-3 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold">Identificação e endereço</h3><div className="grid grid-cols-2 gap-3">{reviewField("Nome",payload.name)}{reviewField("CPF ou CNPJ",payload.document.replace(/.(?=.{4})/g,"•"))}{reviewField("WhatsApp","Identificado automaticamente")}{reviewField("Telefone",payload.phone||"Mesmo número do WhatsApp")}</div>{reviewField("Endereço",[payload.address.street,payload.address.number,payload.address.complement,payload.address.neighborhood,payload.address.city,payload.address.state,payload.address.zip_code].filter(Boolean).join(", "))}</section>}
            <section className="space-y-3 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold">Equipamento</h3><div className="grid grid-cols-2 gap-3">{reviewField("Tipo de equipamento",catalog.types?.find(t=>t.id===payload.type_id)?.name)}{reviewField("Marca",catalog.brands?.find(b=>b.id===payload.brand_id)?.name||payload.brand_text)}{reviewField("Modelo",payload.model)}{reviewField("Número de série",payload.serial)}</div></section>
            <section className="rounded-xl border border-slate-200 p-4">{reviewField("Descrição do problema",payload.problem)}</section>
            {photoButton("label","Foto da etiqueta *")}{photoButton("problem","Foto do defeito *")}
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-5"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 size-4 accent-[#0131cd]"/><span>Confirmo os dados e autorizo seu uso para identificar meu cadastro e prestar o atendimento solicitado.<span className="ml-1 text-red-600">*</span></span></label>
          </>}
          {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <div className="flex gap-2">{step>firstStep&&<button className="inline-flex items-center gap-1 rounded-xl border px-4" disabled={busy||Boolean(pending)} onClick={()=>{setError("");setFieldErrors({});setStep(s=>Math.max(firstStep,s-1));}}><ArrowLeft size={16}/> Voltar</button>}{step<4?<button className={button+" flex-1"} disabled={busy||zipBusy||Boolean(pending)} onClick={()=>void next()}>{busy&&step===0?"Validando CPF...":"Continuar"} <ArrowRight size={16}/></button>:<button className={button+" flex-1"} disabled={!confirmed||busy||Boolean(pending)} onClick={()=>void send()}>{busy?"Enviando...":"Enviar solicitação"}</button>}</div>
        </section></>}
      <footer className="text-center text-xs text-slate-500">Tecnologia Union World</footer>
    </div>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{pickPhoto(e.target.files?.[0]);e.currentTarget.value="";}}/>
    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={e=>{pickPhoto(e.target.files?.[0]);e.currentTarget.value="";}}/>
    {(photoSource||pending||viewPhoto)&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={()=>{if(!busy){setPhotoSource(null);setViewPhoto(null);closePhoto();}}}><section role="dialog" aria-modal="true" aria-label={photoSource?"Selecionar origem da foto":pending?"Conferir foto":"Visualizar foto"} className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={e=>e.stopPropagation()}>
      <header className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{photoSource?"Adicionar foto":pending?"Confira a foto":viewPhoto?photoNames[viewPhoto.kind]:"Foto"}</h2><button type="button" disabled={busy} aria-label="Fechar" onClick={()=>{setPhotoSource(null);setViewPhoto(null);closePhoto();}} className="rounded-lg p-2 text-slate-600"><X size={20}/></button></header>
      {photoSource?<div className="space-y-2"><button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold" onClick={()=>cameraInput.current?.click()}><Camera size={20}/> Abrir câmera</button><button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold" onClick={()=>fileInput.current?.click()}><ImagePlus size={20}/> Selecionar do celular</button></div>:pending?<><div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-slate-900"><img src={pending.url} alt="Prévia" style={{transform:"rotate("+rotation+"deg)"}} className="max-h-full max-w-full object-contain"/></div><div className="flex gap-2"><button type="button" aria-label="Girar à esquerda" className="flex-1 rounded-lg border p-2" onClick={()=>setRotation(r=>r-90)} disabled={busy}><RotateCcw className="mx-auto" size={18}/></button><button type="button" aria-label="Girar à direita" className="flex-1 rounded-lg border p-2" onClick={()=>setRotation(r=>r+90)} disabled={busy}><RotateCw className="mx-auto" size={18}/></button></div>{photoError&&<p role="alert" className="text-sm text-red-600">{photoError}</p>}<div className="flex gap-2"><button type="button" className="flex-1 rounded-lg border p-2 text-sm" disabled={busy} onClick={closePhoto}>Cancelar</button><button type="button" className={button+" flex-1"} disabled={busy} onClick={()=>void savePhoto()}>{busy?"Salvando...":"Salvar foto"}</button></div></>:viewPhoto&&<><img src={viewPhoto.url} alt={photoNames[viewPhoto.kind]} className="max-h-[60dvh] w-full rounded-lg bg-slate-100 object-contain"/><button type="button" className={button+" w-full"} onClick={()=>openSource(viewPhoto.kind,viewPhoto.url)}>Trocar foto</button></>}
    </section></div>}
  </main>;
}
