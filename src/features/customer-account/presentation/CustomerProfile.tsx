import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Check, CheckCircle2, IdCard, Mail, Pencil, RefreshCw, UserRound, X } from "lucide-react";
import { formatCpf, isValidCpf } from "@/shared/domain/formatters";
import { supabase } from "@/lib/supabase";
import { formatSitePhone, loadSiteProfile, updateSiteProfile, type SiteProfile } from "../infrastructure/customer-account-settings.repository";
import { CustomerFeedbackToast, type CustomerFeedback } from "./CustomerFeedbackToast";
import { CustomerWhatsAppIcon } from "./CustomerWhatsAppIcon";

const inputClass = "mt-1.5 h-11 w-full rounded-lg border border-[#dce5f1] bg-white px-3.5 text-[13px] text-[#19334f] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";

export function CustomerProfile({ userId, email, emailVerified, crmAccess = false, onSaved }: { userId: string; email: string; emailVerified: boolean; crmAccess?: boolean; onSaved: (name: string, pendingReview: boolean) => void }) {
  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [changingPassword,setChangingPassword]=useState(false);
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [passwordBusy,setPasswordBusy]=useState(false);
  const hasEmail=Boolean(email?.trim()) && !email.toLowerCase().endsWith("@auth.unionworld.app");
  const [draft, setDraft] = useState({ name: "", cpf: "", whatsapp: "", email });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<CustomerFeedback | null>(null);
  const feedbackCounter = useRef(0);
  const dismissFeedback = useCallback(() => setFeedback(null), []);
  function notify(message: string, type: CustomerFeedback["type"] = "success") {
    setFeedback({ message, type, id: ++feedbackCounter.current });
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadSiteProfile(userId).then(data => {
      if (!active) return;
      setProfile(data);
      setDraft({ name: data?.full_name || "", cpf: data?.cpf || "", whatsapp: data?.phone || "", email: hasEmail ? email : "" });
    }).catch(() => { if (active) notify("Não foi possível carregar seus dados.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, email]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isValidCpf(draft.cpf)) { notify("Informe um CPF válido.", "error"); return; }
    const rawDigits = draft.whatsapp.replace(/\D/g, "");
    const digits = rawDigits.startsWith("55") && (rawDigits.length === 12 || rawDigits.length === 13) ? rawDigits.slice(2) : rawDigits;
    if (digits.length !== 10 && digits.length !== 11) { notify("Informe um WhatsApp válido com DDD.", "error"); return; }
    setBusy(true);setFeedback(null);
    try {
      const result = await updateSiteProfile({ ...draft, whatsapp: digits });
      let notice = result.pending_review ? "Seus dados foram salvos e estão em análise." : "Seus dados foram atualizados.";
      let noticeType: CustomerFeedback["type"] = "success";
      const newEmail = draft.email.trim().toLowerCase();
      if (newEmail && newEmail !== email.toLowerCase()) {
        const { error: changeError } = await supabase.auth.updateUser({ email: newEmail }, {
          emailRedirectTo: window.location.origin + "/minha-conta",
        });
        if (changeError) {
          notice = "Seus dados foram salvos, mas não foi possível solicitar a troca de e-mail: " + changeError.message;
          noticeType = "error";
        } else {
          notice += " Enviamos a confirmação da alteração para seu e-mail. Verifique sua caixa de entrada.";
        }
      }
      setProfile({ full_name: draft.name.trim(), cpf: draft.cpf.replace(/\D/g, ""), phone: digits });
      setEditing(false);
      onSaved(draft.name.trim(), result.pending_review);
      notify(notice, noticeType);
    } catch(e) { notify(e instanceof Error ? e.message : "Não foi possível salvar seus dados.", "error"); }
    finally { setBusy(false); }
  }

  async function savePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(newPassword.length<8)return notify("A senha precisa de pelo menos 8 caracteres.","error");
    if(newPassword!==confirmPassword)return notify("As senhas não coincidem.","error");
    setPasswordBusy(true);setFeedback(null);
    try{
      const {error}=await supabase.auth.updateUser({password:newPassword});
      if(error)throw error;
      setNewPassword("");setConfirmPassword("");setChangingPassword(false);
      notify("Senha atualizada com sucesso.");
    }catch(e){notify(e instanceof Error?e.message:"Não foi possível alterar a senha.","error");}
    finally{setPasswordBusy(false);}
  }

  const displayed = profile;
  return <>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-bold tracking-tight text-[#183250]">Meus dados</h2>
        <p className="mt-1 text-[13px] text-[#72849b]">Gerencie suas informações de contato.</p>
      </div>
      {!editing && !loading && <button type="button" onClick={() => {setEditing(true);setFeedback(null);}} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#c8dafa] bg-[#f7faff] px-3 text-xs font-semibold text-[var(--art-primary)] transition-colors hover:border-[var(--art-primary)] hover:bg-[#edf3ff]"><Pencil size={15}/> Editar</button>}
    </div>
    <section className="rounded-xl border border-[#e2e8f1] bg-white p-5 sm:p-6">
      <CustomerFeedbackToast feedback={feedback} onDismiss={dismissFeedback}/>
    {loading && <div className="mt-2 text-sm text-[#72849b]"><RefreshCw size={16} className="mr-2 inline animate-spin"/>Carregando...</div>}
    {!loading && !editing && <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="min-w-0 border-b border-[#eff2f6] pb-3 sm:border-0 sm:pb-0">
        <span className="flex items-center gap-2 text-[11px] font-medium text-[#8a9bb0]"><UserRound size={14}/>Nome completo</span>
        <strong className="mt-1.5 block break-words text-[13px] font-semibold text-[#263e59]">{displayed?.full_name || "Não informado"}</strong>
      </div>
      <div className="min-w-0 border-b border-[#eff2f6] pb-3 sm:border-0 sm:pb-0">
        <span className="flex items-center gap-2 text-[11px] font-medium text-[#8a9bb0]"><IdCard size={14}/>CPF</span>
        <strong className="mt-1.5 block text-[13px] font-semibold text-[#263e59]">{displayed?.cpf ? formatCpf(displayed.cpf) : "Não informado"}</strong>
      </div>
      <div className="min-w-0 border-b border-[#eff2f6] pb-3 sm:border-0 sm:pb-0">
        <span className="flex items-center gap-2 text-[11px] font-medium text-[#8a9bb0]"><CustomerWhatsAppIcon size={15} className="text-[#23a566]"/>WhatsApp</span>
        <strong className="mt-1.5 block text-[13px] font-semibold text-[#263e59]">{displayed?.phone ? formatSitePhone(displayed.phone) : "Não informado"}</strong>
      </div>
      <div className="min-w-0 border-b border-[#eff2f6] pb-3 sm:border-0 sm:pb-0">
        <span className="flex items-center gap-2 text-[11px] font-medium text-[#8a9bb0]"><Mail size={14}/>E-mail</span>
        <strong className="mt-1.5 block break-all text-[13px] font-semibold text-[#263e59]">{hasEmail?email:"Não informado"}</strong>
        {hasEmail&&<span className={"mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold " + (emailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          {emailVerified ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>}
          {emailVerified ? "Verificado" : "Não verificado"}
        </span>}
      </div>
    </div>}
    {!loading && editing && <form onSubmit={event => void save(event)} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[#354b67] sm:col-span-2">Nome completo
          <input className={inputClass} value={draft.name} onChange={e => setDraft(d => ({...d,name:e.target.value}))} required maxLength={120}/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67]">CPF
          <input className={inputClass} value={formatCpf(draft.cpf)} disabled={crmAccess} inputMode="numeric" maxLength={14} onChange={e => setDraft(d => ({...d,cpf:e.target.value.replace(/\D/g,"").slice(0,11)}))} required/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67]"><span className="inline-flex items-center gap-1.5"><CustomerWhatsAppIcon size={15} className="text-[#23a566]"/> WhatsApp</span>
          <input className={inputClass} value={formatSitePhone(draft.whatsapp)} disabled={crmAccess} inputMode="tel" onChange={e => setDraft(d => ({...d,whatsapp:e.target.value.replace(/\D/g,"").slice(0,11)}))} required placeholder="(00) 00000-0000"/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67] sm:col-span-2"><span className="inline-flex flex-wrap items-center gap-2">E-mail {hasEmail&&<span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " + (emailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{emailVerified ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>} {emailVerified ? "Verificado" : "Não verificado"}</span>}</span>
          <input className={inputClass} type="email" value={draft.email} onChange={e => setDraft(d => ({...d,email:e.target.value}))} placeholder="Opcional"/>
          {Boolean(draft.email.trim()) && draft.email.trim().toLowerCase() !== email.toLowerCase() && <span className="mt-1.5 block text-[11px] font-normal text-[#67809b]">Para trocar o e-mail, você precisará confirmar o novo endereço.</span>}
        </label>
      </div>
      <p className="text-[11px] text-[#788aa0]">{crmAccess?"Para alterar CPF ou WhatsApp confirmado, entre em contato com a Artvideo para nova verificação.":"A alteração de informações de identificação poderá precisar de confirmação pela nossa equipe."}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => {setEditing(false);setDraft({name:profile?.full_name || "",cpf:profile?.cpf || "",whatsapp:profile?.phone || "",email:hasEmail?email:""});setFeedback(null);}} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#c8dafa] bg-[#f7faff] px-4 text-xs font-semibold text-[var(--art-primary)] transition-colors hover:border-[var(--art-primary)] hover:bg-[#edf3ff]"><X size={15}/> Cancelar</button>
        <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? <RefreshCw size={15} className="animate-spin"/> : <Check size={15}/>} Salvar alterações</button>
      </div>
    </form>}
    </section>
    <section className="mt-4 rounded-xl border border-[#e2e8f1] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-semibold text-[#173450]">Senha de acesso</h3>
          <p className="mt-1 text-xs text-[#72849b]">Crie ou altere sua senha sem precisar de um e-mail.</p></div>
        {!changingPassword&&<button type="button" onClick={()=>setChangingPassword(true)}
          className="rounded-lg border border-[#c8dafa] px-3 py-2 text-xs font-semibold text-[var(--art-primary)]">Alterar senha</button>}
      </div>
      {changingPassword&&<form onSubmit={event=>void savePassword(event)} className="mt-4 space-y-3">
        <label className="block text-xs font-semibold text-[#354b67]">Nova senha
          <input className={inputClass} type="password" minLength={8} autoComplete="new-password"
            value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67]">Confirme a nova senha
          <input className={inputClass} type="password" minLength={8} autoComplete="new-password"
            value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={()=>{setChangingPassword(false);setNewPassword("");setConfirmPassword("");}}
            className="rounded-lg border border-[#d8e2f0] px-4 py-2 text-xs font-semibold text-[#576d86]">Cancelar</button>
          <button type="submit" disabled={passwordBusy}
            className="rounded-lg bg-[var(--art-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {passwordBusy?"Salvando...":"Salvar senha"}</button>
        </div>
      </form>}
    </section>
  </>;
}
