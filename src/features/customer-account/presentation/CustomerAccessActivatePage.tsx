import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Phase="loading"|"ready"|"code"|"password"|"failed";
const field="h-11 w-full rounded-lg border border-[#dbe3ee] px-3.5 text-sm outline-none focus:border-[var(--art-primary)]";
const button="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60";
async function action(name:string,payload:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke("artvideo-customer-access",{body:{action:name,...payload}});
  if(error||!data?.success)throw new Error(data?.error||"Não foi possível concluir a solicitação.");
  return data;
}
export function CustomerAccessActivatePage(){
  const [params]=useSearchParams();
  const navigate=useNavigate();
  const token=params.get("convite")||"";
  const [phase,setPhase]=useState<Phase>("loading");
  const [phone,setPhone]=useState("");
  const [code,setCode]=useState("");
  const [challenge,setChallenge]=useState("");
  const [wait,setWait]=useState(0);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
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
    setBusy(true);setError("");
    try{
      const result=await action("activation_send",{token});
      setChallenge(result.challenge_id);setWait(60);setCode("");setPhase("code");
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar o código.");}
    finally{setBusy(false);}
  }
  async function resend(){
    if(wait>0||!challenge)return;
    setBusy(true);setError("");
    try{await action("resend",{challenge_id:challenge});setWait(60);setCode("");}
    catch(e){setError(e instanceof Error?e.message:"Não foi possível reenviar.");}
    finally{setBusy(false);}
  }
  async function verify(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(code.length!==6)return;
    setBusy(true);setError("");
    try{
      const result=await action("verify",{challenge_id:challenge,code});
      const {error:e}=await supabase.auth.verifyOtp({token_hash:result.token_hash,type:"magiclink"});
      if(e)throw e;
      if(result.needs_password)setPhase("password");
      else navigate("/minha-conta",{replace:true});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível confirmar.");}
    finally{setBusy(false);}
  }
  async function setInitialPassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(password.length<8)return setError("A senha deve ter pelo menos 8 caracteres.");
    if(password!==confirm)return setError("As senhas não coincidem.");
    setBusy(true);setError("");
    try{
      const {error:e}=await supabase.auth.updateUser({password});
      if(e)throw e;
      setPassword("");setConfirm("");
      navigate("/minha-conta",{replace:true});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar sua senha.");}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-lg px-4 py-12 sm:py-16">
    <section className="rounded-2xl border border-[#e2e8f1] bg-white p-6 shadow-sm sm:p-9">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="rounded-xl bg-blue-50 p-3 text-[var(--art-primary)]"><ShieldCheck size={28}/></div>
        <h1 className="text-xl font-semibold text-[#142d4e]">Ativar Minha Conta</h1>
        <p className="text-sm leading-6 text-[#6c8099]">Confirme seu WhatsApp para acessar suas ordens de serviço e documentos da Artvideo.</p>
      </div>
      {phase==="loading"?<div className="flex items-center justify-center gap-2 py-7 text-sm text-[#667a92]"><RefreshCw size={18} className="animate-spin"/> Validando convite...</div>:
      phase==="failed"?<div className="space-y-3 text-center">
        <p role="alert" className="text-sm text-red-700">Este convite não está disponível ou expirou. Solicite um novo à recepção da Artvideo.</p>
        <Link to="/minha-conta" className="text-sm font-semibold text-[var(--art-primary)]">Voltar à Minha Conta</Link>
      </div>:
      phase==="ready"?<div className="space-y-4">
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-[#355171]">Enviaremos um código para <strong>{phone}</strong>. O código terá validade de 30 minutos.</p>
        {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
        <button className={button} onClick={()=>void send()} disabled={busy}>{busy?<RefreshCw className="animate-spin" size={18}/>:<MessageCircle size={18}/>} Enviar código pelo WhatsApp</button>
      </div>:
      phase==="code"?<form onSubmit={event=>void verify(event)} className="space-y-4">
        <label className="block text-xs font-semibold text-[#344d6a]">Código de 6 dígitos
          <input className={field+" mt-1.5"} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required/>
        </label>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[#657c98]">
          <span>Expira em 30 minutos.</span>
          <button type="button" disabled={busy||wait>0} onClick={()=>void resend()} className="font-semibold text-[var(--art-primary)] disabled:text-[#8d9eaf]">
            {wait>0?"Reenviar em "+wait+"s":"Reenviar código"}
          </button>
        </div>
        {error&&<p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
        <button className={button} disabled={busy||code.length!==6}>{busy?<RefreshCw className="animate-spin" size={18}/>:<CheckCircle2 size={18}/>} Confirmar código</button>
      </form>:
      <form onSubmit={event=>void setInitialPassword(event)} className="space-y-4">
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">WhatsApp confirmado. Agora crie sua senha de acesso.</p>
        <label className="block text-xs font-semibold text-[#344d6a]">Criar senha
          <input className={field+" mt-1.5"} value={password} type="password" autoComplete="new-password" minLength={8} onChange={e=>setPassword(e.target.value)} required/>
        </label>
        <label className="block text-xs font-semibold text-[#344d6a]">Confirmar senha
          <input className={field+" mt-1.5"} value={confirm} type="password" autoComplete="new-password" minLength={8} onChange={e=>setConfirm(e.target.value)} required/>
        </label>
        {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
        <button className={button} disabled={busy}>{busy?<RefreshCw className="animate-spin" size={18}/>:<CheckCircle2 size={18}/>} Finalizar cadastro</button>
      </form>}
    </section>
  </main>;
}
