import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Loader2, RotateCcw, RotateCw, X } from "lucide-react";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, validateCustomerAddress } from "@/lib/address";
import { isValidCpf, isValidCnpj, isValidBrazilianPhone, formatPhoneInput } from "@/shared/domain/formatters";
import { openIntake, listIntakeModels, submitIntake, type IntakeCatalog, type IntakePayload, type IntakePhoto } from "./order-intake.repository";

const field="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
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
  const [photos,setPhotos]=useState<PhotoPreview[]>([]),[pending,setPending]=useState<{file:File;kind:IntakePhoto["kind"];url:string}|null>(null),[rotation,setRotation]=useState(0);
  const [modelsByBrand,setModelsByBrand]=useState<Record<string,{id:string;name:string}[]>>({});
  const [busy,setBusy]=useState(false),[zipBusy,setZipBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[done,setDone]=useState(false);
  const zipVersion=useRef(0),photoRef=useRef(photos),pendingRef=useRef(pending),gate=useRef(false);photoRef.current=photos;pendingRef.current=pending;
  useEffect(()=>()=>{photoRef.current.forEach(p=>URL.revokeObjectURL(p.url));if(pendingRef.current)URL.revokeObjectURL(pendingRef.current.url);},[]);
  useEffect(()=>{let current=true;if(!token){setError("Link inválido. Peça outro à assistência.");return;}openIntake(token).then(c=>{if(current){setCatalog(c);if(c.status==="received")setDone(true);}}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[token]);
  useEffect(()=>{
    const brand=payload.brand_id;
    if(!brand||!token||modelsByBrand[brand])return;
    let active=true;
    listIntakeModels(token,brand).then(r=>{if(active)setModelsByBrand(old=>({...old,[brand]:r.models||[]}));}).catch(()=>{if(active)setModelsByBrand(old=>({...old,[brand]:[]}));});
    return()=>{active=false;};
  },[payload.brand_id,token,modelsByBrand]);
  const update=(key:keyof IntakePayload,value:string|null)=>setPayload(p=>({...p,[key]:value}));
  const address=(key:string,value:string)=>setPayload(p=>({...p,address:{...p.address,[key]:value}}));
  const lookupZip=async(value:string)=>{
    const zip=formatZipCode(value),v=++zipVersion.current;address("zip_code",zip);setZipBusy(false);
    if(zip.replace(/\D/g,"").length!==8)return;
    setZipBusy(true);
    try{const result=await fetchAddressByZipCode(zip);if(v!==zipVersion.current)return;if(result)setPayload(p=>({...p,address:{...p.address,...result}}));else setError("CEP não encontrado. Preencha o endereço manualmente.");}
    catch{if(v===zipVersion.current)setError("Não foi possível consultar o CEP. Você pode preencher manualmente.");}
    finally{if(v===zipVersion.current)setZipBusy(false);}
  };
  const closePhoto=()=>{if(pending)URL.revokeObjectURL(pending.url);setPending(null);setRotation(0);};
  const savePhoto=async()=>{if(!pending||gate.current)return;gate.current=true;setBusy(true);setError("");try{const file=await encodePhoto(pending.file,rotation,pending.kind);setPhotos(p=>[...p,{file,kind:pending.kind,url:URL.createObjectURL(file)}]);closePhoto();}catch(e){setError(e instanceof Error?e.message:"Foto indisponível.");}finally{gate.current=false;setBusy(false);}};
  const hasPhoto=(kind:IntakePhoto["kind"])=>photos.some(p=>p.kind===kind);
  const validation=(currentStep=step)=>{
    if(currentStep===0&&(payload.name.trim().length<3||!(isValidCpf(payload.document)||isValidCnpj(payload.document))))return "Informe seu nome e um CPF ou CNPJ válido.";
    if(currentStep===0&&payload.phone&&!isValidBrazilianPhone(payload.phone))return "Informe um telefone válido com DDD ou deixe em branco.";
    if(currentStep===1&&Object.keys(validateCustomerAddress(payload.address)).length)return "Complete os campos obrigatórios do endereço.";
    if(currentStep===2&&!payload.type_id)return "Selecione o tipo de equipamento.";
    if(currentStep===2&&!hasPhoto("label"))return "Adicione uma foto da etiqueta do equipamento.";
    if(currentStep===3&&payload.problem.trim().length<5)return "Descreva o problema em algumas palavras.";
    if(currentStep===3&&!hasPhoto("problem"))return "Adicione uma foto do defeito ou da parte afetada.";
    return "";
  };
  const next=()=>{const e=validation();setError(e);if(!e){setStep(s=>Math.min(4,s+1));window.scrollTo(0,0);}};
  const send=async()=>{if(!confirmed||gate.current)return;for(let i=0;i<4;i++){const e=validation(i);if(e){setStep(i);setError(e);setConfirmed(false);return;}}gate.current=true;setBusy(true);setError("");try{const r=await submitIntake(token,payload,photos);if(r.status==="received")setDone(true);else throw new Error("Envio não confirmado.");}catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar.");}finally{gate.current=false;setBusy(false);}};
  const input=(label:string,value:string,onChange:(v:string)=>void,placeholder="",mode?:"numeric"|"tel")=><label className="block space-y-1.5 text-sm font-semibold text-slate-800">{label}<input className={field} value={value} placeholder={placeholder} inputMode={mode} aria-required={!label.includes("opcional")&&!label.includes("se souber")} onChange={e=>{setError("");onChange(e.target.value);}}/></label>;
  const photoLimit=(kind:IntakePhoto["kind"])=>photos.length+1+Number(kind!=="label"&&!hasPhoto("label"))+Number(kind!=="problem"&&!hasPhoto("problem"))>5;
  const photoButton=(kind:IntakePhoto["kind"],label:string)=><label className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
    <span className="flex items-center gap-2 text-sm font-bold text-[#0131cd]"><Camera size={19}/>{label}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{hints[kind]}</span>
    {photoLimit(kind)&&<span className="mt-2 block text-xs text-amber-700">Limite de fotos atingido. Remova uma foto para continuar, reservando espaço para as obrigatórias.</span>}
    <input type="file" accept="image/*" capture="environment" className="mt-3 block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-800" disabled={photoLimit(kind)||Boolean(pending)||busy} onChange={e=>{const f=e.target.files?.[0];e.currentTarget.value="";if(f){setPending({file:f,kind,url:URL.createObjectURL(f)});setRotation(0);}}}/>
  </label>;
  return <main className="min-h-dvh bg-[#f4f6fa] px-4 py-6 text-slate-900">
    <div className="mx-auto max-w-lg space-y-4">
      <header className="rounded-2xl bg-white p-5 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-[#0131cd]">{catalog?.company||"Assistência técnica"}</p><h1 className="mt-2 text-xl font-bold">Solicitar atendimento</h1><p className="mt-1 text-sm text-slate-600">Preencha apenas o necessário. Nossa equipe dará continuidade pelo WhatsApp.</p></header>
      {done?<section className="rounded-2xl bg-white p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42}/><h2 className="mt-3 text-lg font-bold">Solicitação recebida!</h2><p className="mt-2 text-sm text-slate-600">Você pode voltar para o WhatsApp. A equipe irá conferir os dados antes de abrir sua OS.</p></section>:!catalog?<section className="rounded-2xl bg-white p-6 text-center text-sm">{error||<span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={18}/> Carregando...</span>}</section>:<>
        <div className="flex gap-1">{["Identificação","Endereço","Equipamento","Problema","Revisão"].map((s,i)=><div key={s} className={"h-1.5 flex-1 rounded-full "+(i<=step?"bg-[#0131cd]":"bg-slate-200")}/>)}</div>
        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Etapa {step+1} de 5</p>
          {step===0&&<><h2 className="text-lg font-bold">Quem precisa de atendimento?</h2>{input("Nome completo ou razão social *",payload.name,v=>update("name",v),"Como está no documento")}{input("CPF ou CNPJ *",payload.document,v=>update("document",v.replace(/\D/g,"").slice(0,14)),"Somente números","numeric")}<div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="shrink-0"/> Seu WhatsApp já está preenchido automaticamente.</div>{input("Telefone (opcional)",payload.phone||"",v=>update("phone",formatPhoneInput(v,payload.phone||"")),"(00) 00000-0000","tel")}<p className="text-xs text-slate-600">Informe outro telefone apenas se houver. Se deixar em branco, usaremos o mesmo número do WhatsApp.</p></>}
          {step===1&&<><h2 className="text-lg font-bold">Seu endereço</h2>{input("CEP *",payload.address.zip_code,v=>void lookupZip(v),"00000-000","numeric")}{zipBusy&&<p className="text-xs text-blue-700">Buscando endereço...</p>}{input("Rua *",payload.address.street,v=>address("street",v))}<div className="grid grid-cols-2 gap-3">{input("Número *",payload.address.number,v=>address("number",v),"Ex.: 1190")}{input("Complemento (opcional)",payload.address.complement,v=>address("complement",v))}</div>{input("Bairro *",payload.address.neighborhood,v=>address("neighborhood",v))}<div className="grid grid-cols-[1fr_85px] gap-3">{input("Cidade *",payload.address.city,v=>address("city",v))}{input("UF *",payload.address.state,v=>address("state",v.toUpperCase().slice(0,2)))}</div></>}
          {step===2&&<><h2 className="text-lg font-bold">Qual é o aparelho?</h2><label className="block space-y-1.5 text-sm font-semibold">Equipamento *<select className={field} value={payload.type_id} onChange={e=>setPayload(p=>({...p,type_id:e.target.value,brand_id:null,brand_text:"",model:""}))}><option value="">Selecione</option>{catalog.types?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="block space-y-1.5 text-sm font-semibold">Marca<select className={field} value={payload.brand_id||""} disabled={!payload.type_id} onChange={e=>setPayload(p=>({...p,brand_id:e.target.value||null,model:""}))}><option value="">Não sei / outra</option>{catalog.brands?.filter(b=>b.equipment_type_id===payload.type_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{!payload.brand_id&&input("Outra marca (opcional)",payload.brand_text||"",v=>update("brand_text",v))}<label className="block space-y-1.5 text-sm font-semibold">Modelo (se souber)<input list="pre-os-models" className={field} value={payload.model} onChange={e=>update("model",e.target.value)} placeholder="Escolha ou digite o modelo"/><datalist id="pre-os-models">{(modelsByBrand[payload.brand_id||""]||[]).map(m=><option key={m.id} value={m.name}/>)}</datalist></label>{input("Número de série (se souber)",payload.serial,v=>update("serial",v))}{photoButton("label","Foto da etiqueta *")}{photoButton("equipment","Foto do equipamento (opcional)")}</>}
          {step===3&&<><h2 className="text-lg font-bold">O que aconteceu?</h2><label className="block space-y-1.5 text-sm font-semibold">Descreva o problema *<textarea aria-required="true" rows={5} maxLength={2500} className={field} value={payload.problem} onChange={e=>update("problem",e.target.value)} placeholder="Ex.: Liga, mas não aparece imagem."/></label>{photoButton("problem","Foto do defeito *")}</>}
          {step===4&&<><h2 className="text-lg font-bold">Confira antes de enviar</h2><p className="text-sm">{payload.name} · {payload.document.replace(/.(?=.{4})/g,"•")}</p><p className="text-sm text-slate-600">WhatsApp: identificado automaticamente<br/>Telefone: {payload.phone||"Mesmo número do WhatsApp"}</p><p className="text-sm text-slate-600">{[payload.address.street,payload.address.number,payload.address.neighborhood,payload.address.city,payload.address.state].join(", ")}</p><p className="text-sm font-semibold">{catalog.types?.find(t=>t.id===payload.type_id)?.name} · {catalog.brands?.find(b=>b.id===payload.brand_id)?.name||payload.brand_text||"Marca não informada"} · {payload.model}</p><p className="whitespace-pre-wrap text-sm">{payload.problem}</p><label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/><span>Confirmo os dados e autorizo seu uso para identificar meu cadastro e prestar o atendimento solicitado.</span></label></>}
          {photos.length>0&&step>=2&&<div className="grid grid-cols-3 gap-2">{photos.map((p,i)=><div key={p.url} className="relative"><img src={p.url} alt={p.kind==="label"?"Etiqueta":p.kind==="problem"?"Defeito":"Foto do aparelho"} className="aspect-square w-full rounded-lg object-cover"/><span className="block text-center text-xs text-slate-600">{p.kind==="label"?"Etiqueta":p.kind==="problem"?"Defeito":"Equipamento"}</span><button type="button" aria-label="Remover foto" disabled={busy} className="absolute right-1 top-1 rounded-full bg-white p-1" onClick={()=>{URL.revokeObjectURL(p.url);setPhotos(a=>a.filter((_,j)=>i!==j));}}><X size={15}/></button></div>)}</div>}
          {pending&&<div className="space-y-3 rounded-xl border p-3"><p className="text-sm font-bold">Confira a foto antes de salvar</p><div className="flex aspect-square items-center justify-center overflow-hidden bg-slate-900"><img src={pending.url} alt="Prévia" style={{transform:"rotate("+rotation+"deg)"}} className="max-h-full max-w-full object-contain"/></div><div className="flex gap-2"><button className="flex-1 rounded-lg border p-2" onClick={()=>setRotation(r=>r-90)} disabled={busy}><RotateCcw className="mx-auto" size={18}/></button><button className="flex-1 rounded-lg border p-2" onClick={()=>setRotation(r=>r+90)} disabled={busy}><RotateCw className="mx-auto" size={18}/></button></div><div className="flex gap-2"><button className="flex-1 rounded-lg border p-2 text-sm" disabled={busy} onClick={closePhoto}>Descartar</button><button className={button+" flex-1"} disabled={busy} onClick={()=>void savePhoto()}>Salvar foto</button></div></div>}
          {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <div className="flex gap-2">{step>0&&<button className="inline-flex items-center gap-1 rounded-xl border px-4" disabled={busy||Boolean(pending)} onClick={()=>{setError("");setStep(s=>s-1);}}><ArrowLeft size={16}/> Voltar</button>}{step<4?<button className={button+" flex-1"} disabled={busy||zipBusy||Boolean(pending)} onClick={next}>Continuar <ArrowRight size={16}/></button>:<button className={button+" flex-1"} disabled={!confirmed||busy||Boolean(pending)} onClick={()=>void send()}>{busy?"Enviando...":"Enviar solicitação"}</button>}</div>
        </section></>}
      <footer className="text-center text-xs text-slate-500">Tecnologia Union World</footer>
    </div>
  </main>;
}
