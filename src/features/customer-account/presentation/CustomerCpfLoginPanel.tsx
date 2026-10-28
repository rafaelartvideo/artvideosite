import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { customerAccessRequest } from "@/lib/customer-access";
import { formatCpf, isValidCpf } from "@/shared/domain/formatters";

const inputClass="mt-1.5 h-11 w-full rounded-lg border border-[#dbe3ee] bg-white px-3.5 text-[13px] text-[#1b3353] outline-none focus:border-[var(--art-primary)]";
const buttonClass="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60";
type Mode="code"|"password";
async function call(action:string,payload:Record<string,unknown>) {
  return customerAccessRequest(action,payload);
}
export function CustomerCpfLoginPanel(){
  const [cpf,setCpf]=useState("");
  const [mode,setMode]=useState<Mode>("code");
  const [password,setPassword]=useState("");
  const [code,setCode]=useState("");
  const [challenge,setChallenge]=useState("");
  const [wait,setWait]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(wait<=0)return;
    const timer=window.setInterval(()=>setWait(t=>Math.max(0,t-1)),1000);
    return ()=>window.clearInterval(timer);
  },[wait>0]);
  async function requestCode(){
    if(!isValidCpf(cpf)){setError("Informe um CPF válido.");return;}
    setBusy(true);setError("");
    try{
      const result=await call("login_send",{cpf});
      setChallenge(result.challenge_id);
      setCode("");
      setWait(60);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar o código.");}
    finally{setBusy(false);}
  }
  async function resend(){
    if(!challenge||wait>0)return;
    setBusy(true);setError("");
    try{
      await call("resend",{challenge_id:challenge});
      setCode("");setWait(60);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível reenviar.");}
    finally{setBusy(false);}
  }
  async function login(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!isValidCpf(cpf))return setError("Informe um CPF válido.");
    setBusy(true);setError("");
    try{
      if(mode==="password"){
        const result=await call("login_password",{cpf,password});
        const {error:e}=await supabase.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});
        if(e)throw e;
      }else if(!challenge){
        await requestCode();
      }else{
        if(!/^\d{6}$/.test(code))throw new Error("Informe os 6 dígitos.");
        const result=await call("verify",{challenge_id:challenge,code});
        const {error:e}=await supabase.auth.verifyOtp({token_hash:result.token_hash,type:"magiclink"});
        if(e)throw e;
      }
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível entrar.");}
    finally{setBusy(false);}
  }
  return <form onSubmit={event=>void login(event)} className="space-y-4">
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#f0f4fb] p-1">
      <button type="button" onClick={()=>{setMode("code");setChallenge("");setError("");}} className={"rounded-md px-2 py-2 text-xs font-semibold "+(mode==="code"?"bg-white text-[var(--art-primary)] shadow-sm":"text-[#68809b]")}>Código WhatsApp</button>
      <button type="button" onClick={()=>{setMode("password");setChallenge("");setError("");}} className={"rounded-md px-2 py-2 text-xs font-semibold "+(mode==="password"?"bg-white text-[var(--art-primary)] shadow-sm":"text-[#68809b]")}>Senha</button>
    </div>
    <label className="block text-xs font-semibold text-[#344d6a]">CPF
      <input className={inputClass} value={formatCpf(cpf)} onChange={e=>{setCpf(e.target.value.replace(/\D/g,"").slice(0,11));setChallenge("");}} inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" required/>
    </label>
    {mode==="password"?
      <label className="block text-xs font-semibold text-[#344d6a]">Senha
        <input className={inputClass} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/>
      </label>:
      challenge?<div className="space-y-2">
        <label className="block text-xs font-semibold text-[#344d6a]">Código recebido pelo WhatsApp
          <input className={inputClass} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required/>
        </label>
        <p className="text-xs text-[#657c98]">O código expira em 30 minutos.</p>
        <button type="button" disabled={wait>0||busy} onClick={()=>void resend()} className="text-xs font-semibold text-[var(--art-primary)] disabled:text-[#889aaf]">
          {wait>0?"Reenviar código em "+wait+"s":"Reenviar código"}
        </button>
      </div>:
      <p className="text-xs leading-5 text-[#657c98]">Enviaremos um código de segurança para o WhatsApp confirmado na ativação da sua conta.</p>}
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
    <button className={buttonClass} disabled={busy||(mode==="code"&&!!challenge&&code.length!==6)}>
      {busy?<RefreshCw size={17} className="animate-spin"/>:mode==="code"?<WhatsAppBrandIcon size={17}/>:<LockKeyhole size={17}/>}
      {mode==="code"?(challenge?"Confirmar código":"Enviar código"):"Entrar com senha"}
      {!busy&&<ArrowRight size={16}/>}
    </button>
    <p className="text-center text-[11px] leading-5 text-[#8a9baf]">Disponível para clientes que ativaram o acesso com convite da Artvideo.</p>
  </form>;
}
