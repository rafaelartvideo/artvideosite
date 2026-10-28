import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/ui/primitives/input-otp";
import { supabase } from "@/lib/supabase";
import { customerAccessRequest } from "@/lib/customer-access";

type Phase="loading"|"ready"|"code"|"password"|"failed";
const field="h-11 w-full rounded-lg border border-[#dbe3ee] px-3.5 text-sm outline-none focus:border-[var(--art-primary)]";
const button="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";
async function action(name:string,payload:Record<string,unknown>) {
  return customerAccessRequest(name,payload);
}
export function CustomerAccessActivatePage(){
  const navigate=useNavigate();
  const [token]=useState(()=>new URLSearchParams(window.location.search).get("convite")||"");
  useEffect(()=>{
    // Evita que o segredo do convite continue visivel no historico/endereco.
    if(token)window.history.replaceState(window.history.state,"",window.location.pathname);
  },[token]);
  const [phase,setPhase]=useState<Phase>("loading");
  const [phone,setPhone]=useState("");
  const [code,setCode]=useState("");
  const [challenge,setChallenge]=useState("");
  const [wait,setWait]=useState(0);
  const [profile,setProfile]=useState<{full_name:string;cpf:string;phone:string;address?:{street:string;number:string;neighborhood:string;city:string;state:string}|null}|null>(null);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const [busyAction,setBusyAction]=useState<"send"|"resend"|"verify"|"password"|null>(null);
  const busy=busyAction!==null;
  const [error,setError]=useState("");
  useEffect(()=>{
    let mounted=true;
    if(!/^[a-f0-9]{64}$/i.test(token)){setPhase("failed");return;}
    action("inspect_invite",{token}).then(data=>{
      if(mounted){setPhone(data.phone_mask||"");setPhase("ready");}
    }).catch(()=>{if(mounted)setPhase("failed");});
    return ()=>{mounted=false;};
  },[token]);
  useEffect(()=>{
    if(wait<=0)return;
    const timer=window.setInterval(()=>setWait(x=>Math.max(0,x-1)),1000);
    return ()=>window.clearInterval(timer);
  },[wait>0]);
  async function send(){
    setBusyAction("send");setError("");
    try{
      const result=await action("activation_send",{token});
      setChallenge(result.challenge_id);setWait(60);setCode("");setPhase("code");
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar o código.");}
    finally{setBusyAction(null);}
  }
  async function resend(){
    if(wait>0||!challenge||busy)return;
    setBusyAction("resend");setError("");
    try{await action("resend",{challenge_id:challenge});setWait(60);setCode("");}
    catch(e){setError(e instanceof Error?e.message:"Não foi possível reenviar.");}
    finally{setBusyAction(null);}
  }
  async function pasteCode(){
    if(busy)return;
    if(!navigator.clipboard?.readText){
      setError("A colagem automática não está disponível. Copie o código no WhatsApp e cole no campo.");
      return;
    }
    try{
      // Aceita tanto somente 6 dígitos quanto a mensagem completa do WhatsApp,
      // desde que contenha um único possível código.
      const text=await navigator.clipboard.readText();
      const candidates=[...text.matchAll(/(?:^|[^0-9])([0-9]{6})(?![0-9])/g)].map(match=>match[1]);
      if(candidates.length!==1){
        setError("Copie apenas o código de 6 dígitos no WhatsApp e tente novamente.");
        return;
      }
      setCode(candidates[0]);
      setError("");
    }catch{
      setError("O navegador não permitiu acessar a área de transferência. Cole o código diretamente no campo.");
    }
  }
  async function verify(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(code.length!==6||busy)return;
    setBusyAction("verify");setError("");
    try{
      const result=await action("verify",{challenge_id:challenge,code});
      const {error:e}=await supabase.auth.verifyOtp({token_hash:result.token_hash,type:"magiclink"});
      if(e)throw e;
      if(result.needs_password){setProfile(result.profile||null);setPhase("password");}
      else navigate("/minha-conta",{replace:true});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível confirmar.");}
    finally{setBusyAction(null);}
  }
  async function setInitialPassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(password.length<8)return setError("A senha deve ter pelo menos 8 caracteres.");
    if(password!==confirm)return setError("As senhas não coincidem.");
    if(busy)return;
    setBusyAction("password");setError("");
    try{
      const {error:e}=await supabase.auth.updateUser({password});
      if(e)throw e;
      setPassword("");setConfirm("");
      navigate("/minha-conta",{replace:true});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar sua senha.");}
    finally{setBusyAction(null);}
  }
  return <main className="mx-auto max-w-lg px-4 py-8 sm:py-16">
    <section className="rounded-2xl border border-[#e2e8f1] bg-white p-5 shadow-sm sm:p-9">
      <div className="mb-7 flex flex-col items-center gap-3 text-center">
        <div className="rounded-2xl bg-blue-50 p-3.5 text-[var(--art-primary)]"><ShieldCheck size={28}/></div>
        <h1 className="text-xl font-bold tracking-tight text-[#142d4e] sm:text-2xl">Ativar Minha Conta</h1>
        <p className="max-w-sm text-sm leading-6 text-[#6c8099]">Confirme seu WhatsApp para acessar suas ordens de serviço e documentos da Artvideo.</p>
      </div>
      {phase==="loading"?<div className="flex items-center justify-center gap-2 py-7 text-sm text-[#667a92]"><LoaderCircle size={18} className="animate-spin"/> Validando convite...</div>:
      phase==="failed"?<div className="space-y-3 text-center">
        <p role="alert" className="text-sm text-red-700">Este convite não está disponível ou expirou. Solicite um novo à recepção da Artvideo.</p>
        <Link to="/minha-conta" className="text-sm font-semibold text-[var(--art-primary)]">Voltar à Minha Conta</Link>
      </div>:
      phase==="ready"?<div className="space-y-4">
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-[#355171]">Enviaremos um código para <strong>{phone}</strong>. O código terá validade de 30 minutos.</p>
        {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
        <button type="button" className={button} onClick={()=>void send()} disabled={busy} aria-busy={busyAction==="send"} aria-label={busyAction==="send"?"Enviando código":undefined}>
          {busyAction==="send"?<LoaderCircle className="animate-spin" size={19} aria-hidden="true"/>:"Enviar código pelo WhatsApp"}
        </button>
      </div>:
      phase==="code"?<form onSubmit={event=>void verify(event)} className="space-y-5">
        <div className="flex flex-col items-center gap-3">
          <InputOTP
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Código de 6 dígitos"
            value={code}
            onChange={value=>{setCode(value.replace(/\D/g,"").slice(0,6));if(error)setError("");}}
            disabled={busy}
            containerClassName="justify-center"
          >
            <InputOTPGroup className="gap-2 sm:gap-3">
              {Array.from({length:6},(_,index)=><InputOTPSlot
                key={index}
                index={index}
                className="!h-11 !w-9 !rounded-none !border-0 !border-b-2 !border-[#cbd5e1] !bg-transparent text-xl font-semibold text-[#142d4e] data-[active=true]:!border-[var(--art-primary)] data-[active=true]:!ring-0 sm:!w-11"
              />)}
            </InputOTPGroup>
          </InputOTP>
          <p className="text-center text-xs text-[#657c98]">Copie o código no WhatsApp e cole-o aqui.</p>
          <button type="button" onClick={()=>void pasteCode()} disabled={busy}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-[#dbe3ee] bg-white px-4 !text-xs font-semibold text-[var(--art-primary)] transition-colors hover:bg-blue-50 disabled:opacity-60">
            Colar código
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs leading-5 text-[#657c98]">
          <span className="shrink-0">Expira em 30 minutos.</span>
          <button type="button" disabled={busy||wait>0} onClick={()=>void resend()}
            aria-busy={busyAction==="resend"} aria-label={busyAction==="resend"?"Reenviando código":undefined}
            className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap !text-xs font-semibold leading-5 text-[var(--art-primary)] hover:underline disabled:cursor-not-allowed disabled:text-[#8d9eaf] disabled:no-underline"
          >
            {busyAction==="resend"?<LoaderCircle size={16} className="animate-spin" aria-hidden="true"/>:wait>0?"Reenviar em "+wait+"s":"Reenviar código"}
          </button>
        </div>
        {error&&<p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
        <button type="submit" className={button} disabled={busy||code.length!==6} aria-busy={busyAction==="verify"} aria-label={busyAction==="verify"?"Confirmando código":undefined}>
          {busyAction==="verify"?<LoaderCircle className="animate-spin" size={19} aria-hidden="true"/>:"Confirmar código"}
        </button>
      </form>:
      <form onSubmit={event=>void setInitialPassword(event)} className="space-y-4">
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">WhatsApp confirmado. Agora crie sua senha de acesso.</p>
        {profile&&<div className="rounded-xl border border-[#e2e8f1] bg-[#f7f9fc] p-4 text-xs leading-6 text-[#4b627e]">
          <p><strong>Nome:</strong> {profile.full_name}</p>
          <p><strong>CPF:</strong> {profile.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4")}</p>
          <p><strong>WhatsApp:</strong> {profile.phone}</p>
          {profile.address&&<p><strong>Endereço:</strong> {profile.address.street}, {profile.address.number} · {profile.address.neighborhood}, {profile.address.city}/{profile.address.state}</p>}
        </div>}
        <label className="block text-xs font-semibold text-[#344d6a]">Criar senha
          <span className="relative mt-1.5 block">
            <input className={field+" pr-11"} value={password} type={showPassword?"text":"password"}
              autoComplete="new-password" minLength={8} onChange={e=>setPassword(e.target.value)} required/>
            <button type="button" onClick={()=>setShowPassword(value=>!value)}
              aria-label={showPassword?"Ocultar senha":"Mostrar senha"} title={showPassword?"Ocultar senha":"Mostrar senha"}
              className="absolute inset-y-0 right-1 flex items-center justify-center px-3 text-[#71839b] transition-colors hover:text-[var(--art-primary)]">
              {showPassword?<EyeOff size={18}/>:<Eye size={18}/>}
            </button>
          </span>
        </label>
        <label className="block text-xs font-semibold text-[#344d6a]">Confirmar senha
          <span className="relative mt-1.5 block">
            <input className={field+" pr-11"} value={confirm} type={showConfirm?"text":"password"}
              autoComplete="new-password" minLength={8} onChange={e=>setConfirm(e.target.value)} required/>
            <button type="button" onClick={()=>setShowConfirm(value=>!value)}
              aria-label={showConfirm?"Ocultar confirmação":"Mostrar confirmação"} title={showConfirm?"Ocultar confirmação":"Mostrar confirmação"}
              className="absolute inset-y-0 right-1 flex items-center justify-center px-3 text-[#71839b] transition-colors hover:text-[var(--art-primary)]">
              {showConfirm?<EyeOff size={18}/>:<Eye size={18}/>}
            </button>
          </span>
        </label>
        {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
        <button type="submit" className={button} disabled={busy} aria-busy={busyAction==="password"} aria-label={busyAction==="password"?"Finalizando cadastro":undefined}>
          {busyAction==="password"?<LoaderCircle className="animate-spin" size={19} aria-hidden="true"/>:"Finalizar cadastro"}
        </button>
      </form>}
    </section>
  </main>;
}
