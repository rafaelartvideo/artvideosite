import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { fetchAddressByZipCode, formatZipCode, type Address } from '@/lib/address';
import { coverageForCep } from '../domain/service-booking.mjs';

export function ServiceCepLookup({config,value,onChange,onResolved}:{config:any;value:string;onChange:(value:string)=>void;onResolved:(address:Partial<Address>|null,status:string)=>void}) {
 const [state,setState]=useState<{status:string;address:Partial<Address>|null;message:string}>({status:'idle',address:null,message:''});
 const resolveRef=useRef(onResolved); resolveRef.current=onResolved;
 const configKey=JSON.stringify(config);
 useEffect(()=>{
  let active=true; const code=value.replace(/\D/g,'');
  setState({status:'idle',address:null,message:''});
  if(code.length!==8) {resolveRef.current(null,'idle');return;}
  resolveRef.current(null,'loading');
  const timer=setTimeout(async()=>{
   const coverage=coverageForCep(config,code);
   if(coverage==='invalid'||coverage==='unavailable') {
    if(active) {setState({status:coverage,address:null,message:coverage==='invalid'?'Informe um CEP válido.':'Ainda não atendemos este CEP para este serviço.'});resolveRef.current(null,coverage);} return;
   }
   setState({status:'loading',address:null,message:''});
   try {
    const address=await fetchAddressByZipCode(code); if(!active)return;
    if(!address) {setState({status:'invalid',address:null,message:'CEP não encontrado. Confira o número.'});resolveRef.current(null,'invalid');return;}
    setState({status:coverage,address,message:coverage==='consult'?'A equipe confirmará a cobertura deste endereço.':'Atendimento disponível para este CEP.'});resolveRef.current(address,coverage);
   } catch {if(active){setState({status:'error',address:null,message:'Não foi possível consultar o CEP. Tente novamente.'});resolveRef.current(null,'error');}}
  },400);
  return ()=>{active=false;clearTimeout(timer);};
 },[value,configKey]);
 return <div className="space-y-3"><label className="block text-sm font-medium">CEP <span className="text-red-600">*</span><div className="relative mt-2"><input aria-label="CEP do atendimento" inputMode="numeric" autoComplete="postal-code" value={value} onChange={e=>{setState({status:'idle',address:null,message:''});onChange(formatZipCode(e.target.value));}} placeholder="00000-000" maxLength={9} className="art-input pr-12"/>{state.status==='loading'&&<Loader2 size={19} className="absolute right-4 top-4 animate-spin text-[var(--art-primary)]"/>}</div></label>
 {state.message && <div role="status" className={`flex gap-2 text-sm leading-6 ${['available','consult'].includes(state.status)?'text-[#42556c]':'text-red-600'}`}>{state.status==='available'?<CheckCircle2 size={18} className="mt-1 shrink-0 text-emerald-600"/>:<MapPin size={18} className="mt-1 shrink-0"/>}<div>{state.address&&<p className="font-semibold text-[#172b45]">{state.address.street || state.address.neighborhood} · {state.address.city}/{state.address.state}</p>}{state.message}{state.status==='error'&&<button type="button" className="ml-2 underline" onClick={()=>{onChange('');}}>Consultar novamente</button>}</div></div>}
 </div>;
}
