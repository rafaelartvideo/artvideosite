import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { listSiteAddresses, loadSiteProfile, saveSiteAddress, type SiteAddress } from '@/features/customer-account/infrastructure/customer-account-settings.repository';
import { SiteAddressSelector, type SiteAddressChoice } from '@/features/customer-account/presentation/SiteAddressSelector';
import { CustomerFeedbackToast, type CustomerFeedback } from '@/features/customer-account/presentation/CustomerFeedbackToast';
import { scrollToQuoteStep } from "@/features/public-quotes/application/quote-scroll";
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, Check, CheckCircle2, MapPin, Trash2, Wrench, Loader2 } from 'lucide-react';
import { emptyAddress, type Address } from '@/lib/address';
import { EMPTY_PUBLIC_QUOTE_FORM, formatCpf, formatCnpj, formatPublicDate, isValidCpf, isValidPastOrCurrentDate } from '@/features/public-quotes/domain/public-quote';
import { formatPhoneInput, isValidBrazilianMobile, isValidEmail, isValidCnpj, formatCurrency } from '@/shared/domain/formatters';
import { PublicButton } from '@/features/public-shell/presentation/PublicUi';
import { bookingConfig, bookingDates, slotsForDate, displayBookingDate, mergeResolvedAddress } from '../domain/service-booking.mjs';
import { ServiceCepLookup } from './ServiceCepLookup';
import { useBrands } from '@/features/public-catalog/application/usePublicCatalog';
import { submitServiceBooking, type SiteQuotePhotos } from '../infrastructure/service-booking.repository';
import { reservePublicQuoteProtocol } from '@/features/public-quotes/infrastructure/quote-protocol.repository';

const steps=['Atendimento','Equipamento e local','Seus dados','Revisão'];
function Field({label,required=false,error,children}:{label:string;required?:boolean;error?:string;children:React.ReactNode}) {return <label className="block text-sm font-medium">{label}{required&&<span className="text-red-600"> *</span>}<span className="mt-2 block">{children}</span>{error&&<span role="alert" className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}</label>;}
export function ServiceQuoteWizard({detail,initialCep='',initialVariant='',backTo}:{detail:any;initialCep?:string;initialVariant?:string;backTo?:string}) {
 const navigate=useNavigate(); const queryClient=useQueryClient(); const {session}=useAuth(); const customerId=session?.user?.id||null;
 const addressesQuery=useQuery({queryKey:['site-customer-addresses',customerId],queryFn:()=>listSiteAddresses(customerId!),enabled:Boolean(customerId),staleTime:30_000});
 const profileQuery=useQuery({queryKey:['site-quote-profile',customerId],queryFn:()=>loadSiteProfile(customerId!),enabled:Boolean(customerId),staleTime:60_000});
 const filledProfile=useRef<string|null>(null);
 const c=bookingConfig(detail.service.public_booking),service=detail.service;
 const variants=detail.variants.filter((v:any)=>v.is_active!==false);
 const {brands}=useBrands();
 const [attendance,setAttendance]=useState<'onsite'|'store'>('onsite');
 const onsite=attendance==='onsite';
 const scheduling=onsite&&c.schedule_enabled;
 const [photos,setPhotos]=useState<SiteQuotePhotos>({});
 const changePhoto=(kind:keyof SiteQuotePhotos,event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024||!file.size){
   setError('Envie fotos JPG, PNG ou WebP de até 6 MB.');event.target.value='';return;
  }
  setError('');setPhotos(old=>({...old,[kind]:file}));
 };
 const [dateCount,setDateCount]=useState(6);
 const [step,setStep]=useState(0),[date,setDate]=useState(''),[slot,setSlot]=useState(''),[variant,setVariant]=useState(initialVariant),[quantity,setQuantity]=useState(1);
 const [address,setAddress]=useState<Address>({...emptyAddress,zip_code:initialCep});
 const [addressChoice,setAddressChoice]=useState<SiteAddressChoice>('other');
 const [selectedAddressId,setSelectedAddressId]=useState<string|null>(null);
 const [addressLabel,setAddressLabel]=useState('Casa');
 const [savingAddress,setSavingAddress]=useState(false);
 const autoSelectRef=useRef<string|null>(null);
 const [addressFeedback,setAddressFeedback]=useState<CustomerFeedback|null>(null);
 const dismissAddressFeedback=useCallback(()=>setAddressFeedback(null),[]);
 useEffect(()=>{
  if(!customerId||!addressesQuery.data||autoSelectRef.current===customerId)return;
  autoSelectRef.current=customerId;
  const main=addressesQuery.data.find(item=>item.is_default)||addressesQuery.data[0];
  if(!main)return;
  setSelectedAddressId(main.id);
  setAddressChoice('saved');
  setAddress({zip_code:main.postal_code,street:main.street,number:main.number,
    complement:main.complement||'',neighborhood:main.district,city:main.city,state:main.state});
  setNoNumber(main.number==='S/N');
  setCoverage('idle');
 },[customerId,addressesQuery.data]);

 const [coverage,setCoverage]=useState('idle'); const [noNumber,setNoNumber]=useState(false);
 const [form,setForm]=useState({...EMPTY_PUBLIC_QUOTE_FORM,servico:service.id});
 useEffect(()=>{
  if(!customerId||!profileQuery.data||filledProfile.current===customerId)return;
  filledProfile.current=customerId;
  setForm(current=>({...current,nome:current.nome||profileQuery.data!.full_name||'',
    cpf:current.cpf||formatCpf(profileQuery.data!.cpf||''),
    whatsapp:current.whatsapp||formatPhoneInput(profileQuery.data!.phone||''),
    email:current.email||session?.user?.email||''}));
 },[customerId,profileQuery.data,session?.user?.email]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[protocol,setProtocol]=useState('');
 const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
 const sending=useRef(false); const requestProtocol=useRef("");
 const mediaSecret=useRef(crypto.randomUUID());
 const heading=useRef<HTMLHeadingElement>(null);
 const selected=variants.find((v:any)=>v.id===variant); const dates=bookingDates(c).filter((d:string)=>slotsForDate(c,d).length>0);
 const times=slotsForDate(c,date); const up=(key:string,value:string)=>setForm(f=>({...f,[key]:value}));
 function selectSavedAddress(item:SiteAddress){
  setAddressChoice('saved');setSelectedAddressId(item.id);
  setAddress({zip_code:item.postal_code,street:item.street,number:item.number,
    complement:item.complement||'',neighborhood:item.district,city:item.city,state:item.state});
  setNoNumber(item.number==='S/N');setCoverage('idle');setError('');setFieldErrors({});
 }
 function useOtherAddress(choice:'other'|'new'){
  setAddressChoice(choice);setSelectedAddressId(null);setAddress({...emptyAddress});
  setNoNumber(false);setCoverage('idle');setError('');setFieldErrors({});
 }
 async function saveNewAddress(){
  if(!customerId||savingAddress)return;
  if(!['available','consult'].includes(coverage)){
   setError('Consulte um CEP atendido antes de salvar o endereço.');return;
  }
  if(address.zip_code.replace(/\D/g,'').length!==8||!address.street.trim()||
    !address.number.trim()||!address.neighborhood.trim()||!address.city.trim()||
    !/^[A-Z]{2}$/.test(address.state.trim().toUpperCase())||!addressLabel.trim()){
   setError('Preencha o CEP e todos os dados do endereço para salvá-lo.');return;
  }
  setSavingAddress(true);setError('');
  try{
   const id=await saveSiteAddress(customerId,{
    label:addressLabel.trim(),postal_code:address.zip_code,street:address.street,
    number:address.number,complement:address.complement,district:address.neighborhood,
    city:address.city,state:address.state,is_default:!(addressesQuery.data?.length),
   });
   setSelectedAddressId(id);setAddressChoice('saved');
   await queryClient.invalidateQueries({queryKey:['site-customer-addresses',customerId]});
   setAddressFeedback({id:Date.now(),message:'Endereço salvo e selecionado.',type:'success'});
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o endereço.');}
  finally{setSavingAddress(false);}
 }

 const brandName=form.marca==='Outra marca'?form.outraMarca.trim():brands.find((brand:any)=>brand.id===form.marca)?.name||'';
 const go=(value:number)=>{setError('');setStep(value);requestAnimationFrame(()=>{scrollToQuoteStep();heading.current?.focus({preventScroll:true});});};
 function validate(stage:number) {
  const issues:Record<string,string>={};
  if(stage===0) {
   if(variants.length&&!selected) issues.variant='Selecione a opção do serviço.';
   if(onsite&&!date) issues.date='Escolha uma data disponível.';
   if(scheduling&&date&&!times.some((item:any)=>`${item.start}–${item.end}`===slot)) issues.slot='Selecione um horário disponível.';
   if(onsite&&!scheduling&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})))issues.date='Escolha uma data de hoje em diante.';
   if(onsite&&!scheduling&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot))issues.slot='Escolha o horário de preferência.';
  }
  if(stage===1) {
   if(onsite&&!['available','consult'].includes(coverage)) issues.cep='Consulte um CEP válido dentro da área atendida.';
   if(onsite&&!address.street.trim()) issues.street='Informe a rua ou avenida.';
   if(onsite&&!address.number.trim()) issues.number='Informe o número ou marque S/N.';
   if(onsite&&!address.city.trim()) issues.city='Informe a cidade.';
   if(onsite&&address.state.trim().length!==2) issues.state='Informe a UF com duas letras.';
  }
  if(stage===2) {
   if(!form.descricao.trim())issues.descricao='Descreva o serviço ou o problema do equipamento.';
   if(form.marca==='Outra marca'&&!form.outraMarca.trim())issues.marca='Informe a marca.';
   if(form.customerType==='PF') {
    if(!form.nome.trim()) issues.nome='Informe seu nome completo.';
    if(!isValidCpf(form.cpf)) issues.cpf='Informe um CPF válido.';
    if(!isValidPastOrCurrentDate(form.birthDate)) issues.birthDate='Informe uma data de nascimento válida.';
   } else {
    if(!form.tradeName.trim()) issues.tradeName='Informe o nome da empresa.';
    if(!isValidCnpj(form.cnpj)) issues.cnpj='Informe um CNPJ válido.';
   }
   if(!isValidBrazilianMobile(form.whatsapp)) issues.whatsapp='Informe um WhatsApp válido com DDD.';
   if(form.email.trim()&&!isValidEmail(form.email)) issues.email='Informe um e-mail válido ou deixe em branco.';
  }
  setFieldErrors(issues);
  return Object.values(issues)[0]||'';
 }
 const next=(event:React.FormEvent)=>{event.preventDefault();if(step===3){void send();return;}const message=validate(step);if(message){setError('');return;}setFieldErrors({});go(step+1);};
 async function send() {
  if(sending.current)return;
  for(let i=0;i<3;i++){const message=validate(i);if(message){go(i);setError('');return;}}
  sending.current=true;setBusy(true);setError('');
  try {if(!requestProtocol.current)requestProtocol.current=await reservePublicQuoteProtocol();setProtocol(await submitServiceBooking(form,address,{variant_id:variant,quantity,date:onsite?date:'',slot:onsite?slot:'',attendance_mode:attendance,brand_name:brandName},requestProtocol.current,photos,mediaSecret.current));requestAnimationFrame(scrollToQuoteStep);}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar. Tente novamente.');}
  finally{sending.current=false;setBusy(false);}
 }
 if(protocol) return <section data-quote-scroll-anchor className="mx-auto max-w-2xl px-5 py-20 text-center"><span className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 motion-safe:animate-[bounce_650ms_ease-out_1]"><CheckCircle2 size={56} strokeWidth={1.5}/></span><h1 className="text-3xl font-semibold">Orçamento solicitado!</h1><p className="mt-4 leading-7 text-slate-600">A Artvideo entrará em contato pelo WhatsApp para avaliar o serviço, informar o orçamento e confirmar o atendimento.</p><div className="my-8 rounded-xl bg-slate-50 p-6"><p className="text-sm text-slate-500">Seu protocolo</p><p className="mt-2 font-mono text-2xl font-bold tracking-wide">{protocol}</p></div>{date&&<p className="mb-6 text-sm text-slate-600">Preferência: {displayBookingDate(date)} · {slot}. Aguarde a confirmação da equipe.</p>}<PublicButton onClick={()=>navigate(`/servicos/${service.slug}`)}>Voltar ao serviço</PublicButton></section>;
 return <div data-quote-scroll-anchor className="art-booking mx-auto max-w-5xl px-5 py-9 sm:py-14">
   <CustomerFeedbackToast feedback={addressFeedback} onDismiss={dismissAddressFeedback}/>
  <button type="button" onClick={()=>step?go(step-1):navigate(backTo || `/servicos/${service.slug}`)} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)]"><ArrowLeft size={18}/> Voltar</button>
  <nav aria-label="Etapas da solicitação" className="mb-10"><div className="mb-3 flex justify-between gap-4 text-sm"><p><strong>{step+1} de {steps.length}</strong> — {steps[step]}</p><p className="hidden text-slate-500 sm:block">{step<3?`Próximo passo: ${steps[step+1]}`:'Confira antes de enviar'}</p></div><ol className="flex gap-2">{steps.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={`h-1.5 flex-1 rounded-full ${i<=step?'bg-[var(--art-primary)]':'bg-slate-200'}`}><span className="sr-only">{label}</span></li>)}</ol></nav>
  <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
   <form id="service-quote-step" noValidate onChangeCapture={()=>setFieldErrors({})} onSubmit={next} className="min-w-0 space-y-6">
    <h1 ref={heading} tabIndex={-1} className="text-[26px] font-semibold leading-tight tracking-tight outline-none">{['Escolha seu atendimento','Sobre o equipamento e o local','Como podemos falar com você?','Confira sua solicitação'][step]}</h1>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {step===0&&<>
     <fieldset><legend className="mb-3 text-sm font-semibold">Onde será o atendimento? *</legend>
      <div className="grid gap-3 sm:grid-cols-2">
       <label className={"art-choice "+(onsite?"is-selected":"")}>
        <input type="radio" name="attendance" checked={onsite} onChange={()=>setAttendance('onsite')}/>
        <span><strong className="block">No local</strong><small className="mt-1 block text-slate-500">Informar endereço e preferência de horário</small></span>
       </label>
       <label className={"art-choice "+(!onsite?"is-selected":"")}>
        <input type="radio" name="attendance" checked={!onsite} onChange={()=>{setAttendance('store');setDate('');setSlot('');setPhotos(current=>({...current,site:null}));}}/>
        <span><strong className="block">Levar à loja</strong><small className="mt-1 block text-slate-500">Sem necessidade de agendar horário</small></span>
       </label>
      </div>
     </fieldset>
     {variants.length>0&&<fieldset><legend className="mb-3 text-sm text-slate-600">Opção do serviço <span className="text-red-600">*</span></legend><div className="space-y-2">{variants.map((v:any)=><label key={v.id} className={`art-choice ${variant===v.id?'is-selected':''}`}><input type="radio" name="service-variant" value={v.id} checked={variant===v.id} onChange={()=>setVariant(v.id)}/><div><span className="font-medium">{v.title}</span>{v.description&&<p className="mt-1 text-xs leading-5 text-slate-500">{v.description}</p>}</div>{service.price_mode!=='HIDDEN'&&v.price!=null&&<span className="ml-auto shrink-0 text-sm font-semibold">{formatCurrency(v.price)}</span>}</label>)}</div>{fieldErrors.variant&&<p role="alert" className="mt-2 text-xs font-medium text-red-600">{fieldErrors.variant}</p>}</fieldset>}
     <Field label="Quantidade"><select className="art-input" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1} {i===0?'unidade':'unidades'}</option>)}</select></Field>
     {scheduling?<><p className="text-sm leading-6 text-slate-600">Escolha uma data e um intervalo de preferência. A equipe confirmará o agendamento ao entrar em contato.</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{dates.slice(0,dateCount).map((d:string)=><button key={d} type="button" aria-pressed={date===d} onClick={()=>{setDate(d);setSlot('');}} className={`rounded-lg border px-2 py-3 text-sm transition-colors ${date===d?'border-[var(--art-primary)] bg-blue-50 text-[var(--art-primary)]':'border-slate-200 hover:border-blue-400'}`}><span className="block text-xs capitalize">{new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR',{weekday:'short',timeZone:'America/Sao_Paulo'})}</span><strong className="mt-1 block">{d.slice(8)}/{d.slice(5,7)}</strong></button>)}</div>
      {dates.length>dateCount&&<button type="button" onClick={()=>setDateCount(n=>n+6)} className="text-sm font-semibold text-[var(--art-primary)]">Mais datas</button>}
      {!dates.length&&<p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Não há horários disponíveis no momento. Entre em contato com a Artvideo para combinar o atendimento.</p>}
      {fieldErrors.date&&<p role="alert" className="mt-2 text-xs font-medium text-red-600">{fieldErrors.date}</p>}
      {fieldErrors.slot&&<p role="alert" className="mt-2 text-xs font-medium text-red-600">{fieldErrors.slot}</p>}
      {date&&<fieldset><legend className="mb-3 text-sm font-medium">Horário de preferência <span className="text-red-600">*</span></legend><div className="space-y-2">{times.map((s:any)=>{const value=`${s.start}–${s.end}`;return <label key={value} className={`art-choice ${slot===value?'is-selected':''}`}><span>{s.start} às {s.end}</span><input className="ml-auto" type="radio" name="time" value={value} checked={slot===value} onChange={()=>setSlot(value)}/></label>;})}</div></fieldset>}
     </>:onsite?<div className="space-y-4 rounded-lg border border-slate-200 p-4">
       <p className="text-sm text-slate-600">Indique um dia e horário de preferência. A equipe confirmará a disponibilidade antes do atendimento.</p>
       <div className="grid gap-3 sm:grid-cols-2">
         <Field label="Data de preferência" required error={fieldErrors.date}>
           <input type="date" className="art-input" value={date}
             min={new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})}
             onChange={event=>setDate(event.target.value)}/>
         </Field>
         <Field label="Horário de preferência" required error={fieldErrors.slot}>
           <input type="time" className="art-input" value={slot}
             onChange={event=>setSlot(event.target.value)}/>
         </Field>
       </div>
     </div>:<p className="rounded-lg bg-slate-50 p-5 text-sm leading-6 text-slate-600">
       Não é necessário agendar horário para levar o equipamento à loja.
     </p>}
     {onsite&&<p className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">Se o atendimento for em condomínio, confira as regras de acesso e os horários permitidos.</p>}
    </>}
    {step===1&&<>
     {!onsite&&<p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#37577c]">
       Você levará o equipamento à loja. Não é necessário preencher endereço nem escolher horário.
     </p>}
     {onsite&&<SiteAddressSelector addresses={addressesQuery.data||[]} choice={addressChoice}
      selectedId={selectedAddressId} canSave={Boolean(customerId)}
      onSelectSaved={selectSavedAddress} onSelectOther={()=>useOtherAddress('other')}
      onAddNew={()=>{useOtherAddress('new');setAddressLabel('Casa');}}/>}
     {onsite&&<div>
      {addressChoice==='new'&&<Field label="Nome do endereço" required>
       <input className="art-input" maxLength={45} value={addressLabel}
        onChange={e=>setAddressLabel(e.target.value)} placeholder="Casa, Trabalho..."/>
      </Field>}
      <ServiceCepLookup config={c} value={address.zip_code}
       hideInput={addressChoice==='saved'}
       onChange={zip=>{setAddress({...emptyAddress,zip_code:zip});setCoverage('idle');setNoNumber(false);}}
       onResolved={(resolved,status)=>{setCoverage(status);if(resolved)setAddress(old=>mergeResolvedAddress(old,resolved));}}/>
      {fieldErrors.cep&&<p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.cep}</p>}
     </div>}
     {onsite&&addressChoice!=='saved'&&['available','consult'].includes(coverage)&&<div className="space-y-5">
      <Field label="Rua / avenida" required error={fieldErrors.street}><input className="art-input" required autoComplete="address-line1" value={address.street} onChange={e=>setAddress(a=>({...a,street:e.target.value}))}/></Field>
      <div className="grid grid-cols-2 gap-4"><Field label="Número" required error={fieldErrors.number}><input className="art-input" required disabled={noNumber} value={address.number} onChange={e=>setAddress(a=>({...a,number:e.target.value}))}/></Field><Field label="Complemento"><input className="art-input" autoComplete="address-line2" value={address.complement} onChange={e=>setAddress(a=>({...a,complement:e.target.value}))}/></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noNumber} onChange={e=>{setNoNumber(e.target.checked);setAddress(a=>({...a,number:e.target.checked?'S/N':''}));}}/> Meu endereço não tem número</label>
      <Field label="Bairro"><input className="art-input" value={address.neighborhood} onChange={e=>setAddress(a=>({...a,neighborhood:e.target.value}))}/></Field>
      <div className="grid grid-cols-[1fr_80px] gap-4"><Field label="Cidade" required error={fieldErrors.city}><input className="art-input" required value={address.city} onChange={e=>setAddress(a=>({...a,city:e.target.value}))}/></Field><Field label="UF" required error={fieldErrors.state}><input className="art-input" required maxLength={2} value={address.state} onChange={e=>setAddress(a=>({...a,state:e.target.value.toUpperCase()}))}/></Field></div>
      {addressChoice==='new'&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce7f6] bg-[#f6f9ff] px-4 py-3">
       <p className="text-[12px] text-[#5d7694]">Salve este endereço para utilizar nas próximas solicitações e compras.</p>
       <button type="button" disabled={savingAddress} onClick={()=>void saveNewAddress()}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50">
        {savingAddress?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>}
        Salvar e usar endereço
       </button>
      </div>}
     </div>}
    </>}
    {step===2&&<>
     <div className="flex gap-3">{['PF','PJ'].map(type=><button key={type} type="button" aria-pressed={form.customerType===type} onClick={()=>up('customerType',type)} className={`rounded-lg border px-4 py-2 text-sm ${form.customerType===type?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200'}`}>{type==='PF'?'Pessoa física':'Pessoa jurídica'}</button>)}</div>
     {form.customerType==='PF'?<><Field label="Nome completo" required error={fieldErrors.nome}><input autoComplete="name" className="art-input" required value={form.nome} onChange={e=>up('nome',e.target.value)}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="CPF" required error={fieldErrors.cpf}><input className="art-input" inputMode="numeric" required value={form.cpf} onChange={e=>up('cpf',formatCpf(e.target.value))}/></Field><Field label="Data de nascimento" required error={fieldErrors.birthDate}><input className="art-input" inputMode="numeric" autoComplete="bday" placeholder="DD/MM/AAAA" required value={form.birthDate} onChange={e=>up('birthDate',formatPublicDate(e.target.value))}/></Field></div></>:<><Field label="Nome da empresa" required error={fieldErrors.tradeName}><input className="art-input" autoComplete="organization" required value={form.tradeName} onChange={e=>up('tradeName',e.target.value)}/></Field><Field label="CNPJ" required error={fieldErrors.cnpj}><input className="art-input" required inputMode="numeric" value={form.cnpj} onChange={e=>up('cnpj',formatCnpj(e.target.value))}/></Field></>}
     <Field label="WhatsApp com DDD" required error={fieldErrors.whatsapp}><input className="art-input" type="tel" autoComplete="tel-national" required placeholder="(79) 9 9999-9999" value={form.whatsapp} onChange={e=>up('whatsapp',formatPhoneInput(e.target.value,form.whatsapp,e.target.selectionStart))}/></Field>
     <Field label="E-mail (opcional)" error={fieldErrors.email}><input className="art-input" type="email" autoComplete="email" value={form.email} onChange={e=>up('email',e.target.value)}/></Field>
     <Field label="Marca do equipamento (se souber)" error={fieldErrors.marca}>
      <select className="art-input" value={form.marca} onChange={e=>up('marca',e.target.value)}>
       <option value="">Não sei / não se aplica</option>
       {brands.map((brand:any)=><option key={brand.id} value={brand.id}>{brand.name}</option>)}
       <option value="Outra marca">Outra marca</option>
      </select>
     </Field>
     {form.marca==='Outra marca'&&<Field label="Informe a marca" required>
       <input className="art-input" value={form.outraMarca} onChange={e=>up('outraMarca',e.target.value)}/>
     </Field>}
     <Field label="Modelo do equipamento (se souber)"><input className="art-input" maxLength={140} value={form.modelo} onChange={e=>up('modelo',e.target.value)}/></Field>
     <Field label="Descreva o serviço ou o problema" required error={fieldErrors.descricao}>
       <textarea className="art-input min-h-28 resize-y" maxLength={3000} value={form.descricao}
         onChange={e=>up('descricao',e.target.value)} placeholder="Explique o que precisa ser feito."/>
     </Field>
     <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold">Fotos (opcionais)</legend>
      <p className="mb-3 text-xs text-slate-500">Fotos do equipamento, da etiqueta e do local do serviço ajudam na avaliação.</p>
      {([['equipment','Equipamento'],['label','Etiqueta (se tiver)'],...(onsite?[['site','Local do serviço'] as const]:[])] as Array<readonly [keyof SiteQuotePhotos,string]>).map(([kind,label])=>
       <div key={kind} className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
        <Camera size={17} className="shrink-0 text-[var(--art-primary)]"/>
        <label className="min-w-0 flex-1 cursor-pointer text-xs font-semibold">
         <span className="block">{label}</span>
         <span className="mt-1 block truncate font-normal text-slate-500">{photos[kind]?.name||'Adicionar foto JPG, PNG ou WebP'}</span>
         <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
           onChange={event=>changePhoto(kind,event)}/>
        </label>
        {photos[kind]&&<button type="button" title="Remover foto"
          onClick={()=>setPhotos(previous=>({...previous,[kind]:null}))}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Trash2 size={16}/></button>}
       </div>)}
     </fieldset>
     <p className="text-xs leading-5 text-slate-500">Usaremos seus dados para identificar a solicitação e entrar em contato sobre este atendimento.</p>
    </>}
    {step===3&&<div className="space-y-5 text-sm leading-6"><div className="art-review"><strong>Serviço e preferência</strong><p>{service.title}{selected?` · ${selected.title}`:''}</p><p>{quantity} {quantity===1?'unidade':'unidades'}</p><p>{onsite?(date?`${displayBookingDate(date)} · ${slot} (a confirmar)`:'Dia e horário a combinar'):'Levar o equipamento à loja, sem agendamento'}</p><button type="button" onClick={()=>go(0)}>Alterar</button></div><div className="art-review"><strong>Local do atendimento</strong>
      {onsite?<><p>{address.street}, {address.number} {address.complement}</p><p>{address.neighborhood} · {address.city}/{address.state} · {address.zip_code}</p></>
       :<p>Equipamento será entregue na loja</p>}
      <p>{Object.values(photos).filter(Boolean).length} foto(s) selecionada(s)</p>
      <button type="button" onClick={()=>go(1)}>Alterar</button></div><div className="art-review"><strong>Seus dados</strong><p>{form.customerType==='PF'?form.nome:form.tradeName}</p><p>{form.whatsapp}{form.email?` · ${form.email}`:""}</p>{form.descricao&&<p className="whitespace-pre-line">{form.descricao}</p>}<button type="button" onClick={()=>go(2)}>Alterar</button></div><p className="rounded-lg bg-blue-50 p-5 text-[#244567]">Ao enviar, você solicita um orçamento. A Artvideo entrará em contato para informar os valores e confirmar o atendimento. Não há cobrança nesta etapa.</p></div>}
    <div className="lg:hidden">{step<3?<PublicButton type="submit" className="w-full">Continuar <ArrowRight size={17}/></PublicButton>:<PublicButton type="button" disabled={busy} onClick={send} className="w-full">{busy?<Loader2 className="animate-spin" size={18}/>:<Check size={18}/>} {busy?'Enviando...':'Solicitar orçamento'}</PublicButton>}</div>
   </form>
   <aside className="space-y-5 rounded-2xl bg-[#f6f7f8] p-6 lg:sticky lg:top-28"><h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumo</h2><div className="flex gap-3"><Wrench size={21} className="shrink-0"/><div><h3 className="font-semibold">{service.title}</h3>{selected&&<p className="mt-1 text-sm text-slate-600">{selected.title}</p>}<p className="text-sm text-slate-600">{quantity} {quantity===1?'unidade':'unidades'} · {onsite?'Atendimento no local':'Levar à loja'}</p></div></div>
    {onsite&&address.zip_code&&<p className="flex gap-3 text-sm leading-6"><MapPin size={18} className="mt-1 shrink-0"/>{[address.zip_code,address.street,address.number].filter(Boolean).join(' · ')}</p>}
    {onsite&&date&&<p className="flex gap-3 text-sm"><CalendarDays size={18} className="shrink-0"/>{displayBookingDate(date)} · {slot||'Escolha o horário'}</p>}
    <div className="border-t border-slate-200 pt-5"><p className="flex justify-between gap-3 text-sm"><span>Pagamento agora</span><strong>Sem cobrança</strong></p><p className="mt-2 text-xs leading-5 text-slate-500">Valor e agendamento confirmados pela equipe após a análise.</p></div>
    <div className="hidden lg:block">{step<3?<PublicButton type="submit" form="service-quote-step" className="w-full">Continuar <ArrowRight size={17}/></PublicButton>:<PublicButton type="button" disabled={busy} onClick={send} className="w-full">{busy?<Loader2 className="animate-spin" size={18}/>:<Check size={18}/>} {busy?'Enviando...':'Solicitar orçamento'}</PublicButton>}</div>
   </aside>
  </div>
 </div>;
}
