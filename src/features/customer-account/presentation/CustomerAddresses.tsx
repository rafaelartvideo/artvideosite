import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, House, LoaderCircle, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { formatSiteZip, listSiteAddresses, removeSiteAddress, saveSiteAddress, type SiteAddress, type SiteAddressInput } from "../infrastructure/customer-account-settings.repository";
import { CustomerFeedbackToast, type CustomerFeedback } from "./CustomerFeedbackToast";
import { CustomerSectionLoading } from "./CustomerSectionLoading";

const emptyAddress: SiteAddressInput = { label: "Casa", postal_code: "", street: "", number: "",
  complement: "", district: "", city: "", state: "", is_default: false };
const fieldClass = "mt-1.5 h-10 w-full rounded-lg border border-[#dce5f1] bg-white px-3 text-[13px] text-[#19334f] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";
const labelClass = "block text-xs font-semibold text-[#405672]";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[12px] font-semibold transition-colors";
const tertiaryClass = "border border-[#c8dafa] bg-[#f7faff] text-[var(--art-primary)] hover:border-[var(--art-primary)] hover:bg-[#edf3ff]";

export function CustomerAddresses({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["site-customer-addresses", userId],
    queryFn: () => listSiteAddresses(userId), staleTime: 20_000 });
  const addresses = query.data || [];
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteAddressInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingZip, setLoadingZip] = useState(false);
  const [feedback, setFeedback] = useState<CustomerFeedback | null>(null);
  const feedbackCounter = useRef(0);
  const dismissFeedback = useCallback(() => setFeedback(null), []);
  function notify(message: string, type: CustomerFeedback["type"] = "success") {
    setFeedback({ message, type, id: ++feedbackCounter.current });
  }
  useEffect(() => { setForm(null); setEditId(null); }, [userId]);

  function openForm(address?: SiteAddress) {
    setFeedback(null);
    setEditId(address?.id || null);
    setForm(address ? {
      label: address.label, postal_code: address.postal_code, street: address.street,
      number: address.number, complement: address.complement || "", district: address.district,
      city: address.city, state: address.state, is_default: address.is_default,
    } : { ...emptyAddress, is_default: addresses.length === 0 });
  }
  function change<K extends keyof SiteAddressInput>(field: K, value: SiteAddressInput[K]) {
    setForm(current => current ? { ...current, [field]: value } : current);
  }
  async function fillZip() {
    const zip = form?.postal_code.replace(/\D/g, "") || "";
    if (zip.length !== 8) { notify("Informe um CEP válido.", "error"); return; }
    setLoadingZip(true); setFeedback(null);
    try {
      const response = await fetch("https://viacep.com.br/ws/" + zip + "/json/", { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.erro) throw new Error();
      setForm(current => current ? { ...current, street: data.logradouro || current.street,
        district: data.bairro || current.district, city: data.localidade || current.city,
        state: data.uf || current.state } : current);
    } catch { notify("Não foi possível localizar o CEP. Preencha o endereço manualmente.", "error"); }
    finally { setLoadingZip(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);setFeedback(null);setFeedback(null);
    try {
      await saveSiteAddress(userId,form,editId || undefined);
      await queryClient.invalidateQueries({ queryKey: ["site-customer-addresses",userId] });
      setForm(null);setEditId(null);notify("Endereço salvo com sucesso.");
    } catch(e) { notify(e instanceof Error ? e.message : "Não foi possível salvar o endereço.", "error"); }
    finally { setBusy(false); }
  }
  async function remove(address: SiteAddress) {
    if (busy || !window.confirm("Excluir este endereço salvo?")) return;
    setBusy(true);setFeedback(null);setFeedback(null);
    try {
      await removeSiteAddress(userId,address.id);
      await queryClient.invalidateQueries({ queryKey: ["site-customer-addresses",userId] });
      notify("Endereço excluído.");
    } catch { notify("Não foi possível excluir o endereço.", "error"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <CustomerFeedbackToast feedback={feedback} onDismiss={dismissFeedback}/>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-bold tracking-tight text-[#183250]">Meus endereços</h2>
        <p className="mt-1 text-[13px] text-[#72849b]">Salve seus endereços para facilitar suas próximas compras.</p>
      </div>
      {!form && <button type="button" className={buttonClass+" shrink-0 bg-[var(--art-primary)] text-white hover:bg-blue-800"} onClick={() => openForm()}><Plus size={16}/> Novo endereço</button>}
    </div>
    {query.isLoading && <CustomerSectionLoading label="Carregando meus endereços..."/>}
    {query.isError && <button type="button" onClick={() => void query.refetch()} className="text-[13px] text-[var(--art-primary)]">Tentar novamente</button>}
    {!query.isLoading && !query.isError && !form && addresses.length === 0 && <div className="rounded-xl border border-dashed border-[#dbe5f1] bg-white px-5 py-10 text-center">
      <MapPin size={27} className="mx-auto mb-3 text-[#93a9c4]"/>
      <p className="text-sm font-semibold text-[#223e5c]">Você ainda não salvou nenhum endereço.</p>
      <p className="mt-1 text-xs text-[#7489a1]">Adicione um endereço para agilizar suas compras.</p>
    </div>}
    {!form && addresses.map(address => <article key={address.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#e3eaf3] bg-white p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef4ff] text-[var(--art-primary)]"><House size={17}/></span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#1b3858]">{address.label}
            {address.is_default && <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-[var(--art-primary)]">Principal</span>}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[#627893]">{address.street}, {address.number}{address.complement ? " · "+address.complement : ""}<br/>{address.district} · {address.city}/{address.state} · CEP {formatSiteZip(address.postal_code)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} aria-label={"Editar "+address.label} onClick={() => openForm(address)} className={"inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors "+tertiaryClass}><Pencil size={15}/><span>Editar</span></button>
        <button type="button" disabled={busy} aria-label={"Excluir "+address.label} onClick={() => void remove(address)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={15}/><span>Excluir</span></button>
      </div>
    </article>)}
    {form && <form onSubmit={event => void save(event)} className="space-y-4 rounded-xl border border-[#e3eaf3] bg-white p-5">
      <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-[#173450]">{editId ? "Editar endereço" : "Novo endereço"}</h4>
        <button type="button" aria-label="Fechar" onClick={() => {setForm(null);setFeedback(null);}} className="text-[#7b90a9]"><X size={18}/></button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Identificação (Casa, Trabalho...)
          <input className={fieldClass} value={form.label} maxLength={45} onChange={event => change("label",event.target.value)} required/>
        </label>
        <label className={labelClass}>CEP
          <div className="mt-1.5 flex gap-2">
            <input className={fieldClass+" !mt-0 min-w-0 flex-1"} inputMode="numeric" maxLength={9} value={formatSiteZip(form.postal_code)} onChange={e => change("postal_code",e.target.value.replace(/\D/g,"").slice(0,8))} placeholder="00000-000" required/>
            <button type="button" disabled={loadingZip} onClick={() => void fillZip()} className="shrink-0 rounded-lg border border-[#dce5f1] px-3 text-xs font-semibold text-[var(--art-primary)]">{loadingZip ? <LoaderCircle size={16} className="mx-auto animate-spin text-[#1032DC]" aria-label="Buscando CEP..."/> : "Buscar"}</button>
          </div>
        </label>
        <label className={labelClass+" sm:col-span-2"}>Rua / Avenida
          <input className={fieldClass} value={form.street} onChange={e => change("street",e.target.value)} required maxLength={160}/>
        </label>
        <label className={labelClass}>Número
          <input className={fieldClass} value={form.number} onChange={e => change("number",e.target.value)} required maxLength={30}/>
        </label>
        <label className={labelClass}>Complemento
          <input className={fieldClass} value={form.complement || ""} onChange={e => change("complement",e.target.value)} maxLength={100}/>
        </label>
        <label className={labelClass}>Bairro
          <input className={fieldClass} value={form.district} onChange={e => change("district",e.target.value)} required maxLength={100}/>
        </label>
        <label className={labelClass}>Cidade
          <input className={fieldClass} value={form.city} onChange={e => change("city",e.target.value)} required maxLength={100}/>
        </label>
        <label className={labelClass}>UF
          <input className={fieldClass} value={form.state} onChange={e => change("state",e.target.value.toUpperCase().slice(0,2))} required maxLength={2}/>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-[#3c546f]"><input type="checkbox" className="accent-blue-700" checked={form.is_default} onChange={e => change("is_default",e.target.checked)}/> Definir como endereço principal</label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setForm(null)} className={buttonClass+" "+tertiaryClass}>Cancelar</button>
        <button type="submit" disabled={busy} className={buttonClass+" bg-[var(--art-primary)] text-white disabled:opacity-60"}>{busy ? <LoaderCircle size={17} className="animate-spin" aria-label="Salvando..."/> : "Salvar endereço"}</button>
      </div>
    </form>}
  </section>;
}
