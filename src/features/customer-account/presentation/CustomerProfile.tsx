import { useEffect, useState, type FormEvent } from "react";
import { Check, IdCard, Mail, Pencil, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { formatCpf, isValidCpf } from "@/shared/domain/formatters";
import { supabase } from "@/lib/supabase";
import { formatSitePhone, loadSiteProfile, updateSiteProfile, type SiteProfile } from "../infrastructure/customer-account-settings.repository";

const inputClass = "mt-1.5 h-11 w-full rounded-lg border border-[#dce5f1] bg-white px-3.5 text-[13px] text-[#19334f] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";

export function CustomerProfile({ userId, email, onSaved }: { userId: string; email: string; onSaved: () => void }) {
  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [draft, setDraft] = useState({ name: "", cpf: "", whatsapp: "", email });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadSiteProfile(userId).then(data => {
      if (!active) return;
      setProfile(data);
      setDraft({ name: data?.full_name || "", cpf: data?.cpf || "", whatsapp: data?.phone || "", email });
    }).catch(() => { if (active) setError("Não foi possível carregar os dados."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, email]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isValidCpf(draft.cpf)) { setError("Informe um CPF válido."); return; }
    const digits = draft.whatsapp.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) { setError("Informe um WhatsApp válido com DDD."); return; }
    setBusy(true);setError("");setMessage("");
    try {
      const result = await updateSiteProfile(draft);
      let notice = result.pending_review ? "Seus dados foram salvos e estão em análise." : "Seus dados foram atualizados.";
      const newEmail = draft.email.trim().toLowerCase();
      if (newEmail !== email.toLowerCase()) {
        const { error: changeError } = await supabase.auth.updateUser({ email: newEmail }, {
          emailRedirectTo: window.location.origin + "/minha-conta",
        });
        if (changeError) {
          notice += " Não foi possível solicitar a troca de e-mail: " + changeError.message;
        } else {
          notice += " Enviamos a confirmação da alteração para seu e-mail. Verifique sua caixa de entrada.";
        }
      }
      setProfile({ full_name: draft.name.trim(), cpf: draft.cpf.replace(/\D/g, ""), phone: digits });
      setMessage(notice);
      setEditing(false);
      onSaved();
    } catch(e) { setError(e instanceof Error ? e.message : "Não foi possível salvar seus dados."); }
    finally { setBusy(false); }
  }

  const displayed = profile;
  return <section className="rounded-xl border border-[#e2e8f1] bg-white p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="text-[16px] font-bold text-[#203d5e]">Meus dados</h3>
        <p className="mt-1 text-xs text-[#71849a]">Gerencie suas informações de contato.</p></div>
      {!editing && !loading && <button type="button" onClick={() => {setEditing(true);setError("");setMessage("");}} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dce5f1] px-3 text-xs font-semibold text-[#244d8d] hover:bg-[#f1f5ff]"><Pencil size={15}/> Editar</button>}
    </div>
    {loading && <div className="mt-5 text-sm text-[#72849b]"><RefreshCw size={16} className="mr-2 inline animate-spin"/>Carregando...</div>}
    {message && <div role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-[12px] leading-5 text-emerald-800">{message}</div>}
    {error && <div role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div>}
    {!loading && !editing && <div className="mt-5 grid gap-5 sm:grid-cols-2">
      {[
        {label: "Nome completo", value: displayed?.full_name || "Não informado", icon: UserRound},
        {label: "CPF", value: displayed?.cpf ? formatCpf(displayed.cpf) : "Não informado", icon: IdCard},
        {label: "WhatsApp", value: displayed?.phone ? formatSitePhone(displayed.phone) : "Não informado", icon: ShieldCheck},
        {label: "E-mail", value: email, icon: Mail},
      ].map(({label,value,icon:Icon})=><div key={label} className="min-w-0 border-b border-[#eff2f6] pb-3 sm:border-0 sm:pb-0">
        <span className="flex items-center gap-2 text-[11px] font-medium text-[#8a9bb0]"><Icon size={14}/>{label}</span>
        <strong className="mt-1.5 block break-words text-[13px] font-semibold text-[#263e59]">{value}</strong>
      </div>)}
    </div>}
    {!loading && editing && <form onSubmit={event => void save(event)} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[#354b67] sm:col-span-2">Nome completo
          <input className={inputClass} value={draft.name} onChange={e => setDraft(d => ({...d,name:e.target.value}))} required maxLength={120}/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67]">CPF
          <input className={inputClass} value={formatCpf(draft.cpf)} inputMode="numeric" maxLength={14} onChange={e => setDraft(d => ({...d,cpf:e.target.value.replace(/\D/g,"").slice(0,11)}))} required/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67]">WhatsApp
          <input className={inputClass} value={formatSitePhone(draft.whatsapp)} inputMode="tel" onChange={e => setDraft(d => ({...d,whatsapp:e.target.value.replace(/\D/g,"").slice(0,11)}))} required placeholder="(00) 00000-0000"/>
        </label>
        <label className="block text-xs font-semibold text-[#354b67] sm:col-span-2">E-mail
          <input className={inputClass} type="email" value={draft.email} onChange={e => setDraft(d => ({...d,email:e.target.value}))} required/>
          {draft.email.trim().toLowerCase() !== email.toLowerCase() && <span className="mt-1.5 block text-[11px] font-normal text-[#67809b]">Para trocar o e-mail, você precisará confirmar o novo endereço.</span>}
        </label>
      </div>
      <p className="text-[11px] text-[#788aa0]">A alteração de informações de identificação poderá precisar de confirmação pela nossa equipe.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => {setEditing(false);setDraft({name:profile?.full_name || "",cpf:profile?.cpf || "",whatsapp:profile?.phone || "",email});setError("");}} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dce5f1] px-4 text-xs font-semibold text-[#526985]"><X size={15}/> Cancelar</button>
        <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? <RefreshCw size={15} className="animate-spin"/> : <Check size={15}/>} Salvar alterações</button>
      </div>
    </form>}
  </section>;
}
