import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Loader2, MapPin, MonitorCog, Wrench } from "lucide-react";
import { useBrands } from "@/features/public-catalog/application/usePublicCatalog";
import { submitPublicQuote } from "@/features/public-quotes/application/submit-public-quote";
import { EMPTY_PUBLIC_QUOTE_FORM, formatCpf, formatCnpj, formatPublicDate, isValidCpf, isValidPastOrCurrentDate } from "@/features/public-quotes/domain/public-quote";
import { formatZipCode, emptyAddress } from "@/lib/address";
import { isValidBrazilianMobile, isValidCnpj, isValidEmail, formatPhoneInput } from "@/shared/domain/formatters";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/shared/domain/formatters";

type RepairLocation = "store" | "collect";
const deviceTypes = ["Televisão", "Computador / notebook", "Celular / tablet", "Micro-ondas", "Geladeira / freezer", "Máquina de lavar / lava e seca", "Ar-condicionado", "Som / áudio", "Outro equipamento"];
const stageNames = ["Equipamento", "Seus dados", "Revisão"];
const input = "art-input w-full";
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-[14px] font-medium text-[#24364d]">{label}{required && <span className="text-red-600"> *</span>}<span className="mt-2 block">{children}</span></label>;
}

export function RepairQuoteWizard() {
  const navigate = useNavigate();
  const { brands } = useBrands();
  const [stage, setStage] = useState(0);
  const [device, setDevice] = useState("");
  const [location, setLocation] = useState<RepairLocation | "">("");
  const [address, setAddress] = useState({ ...emptyAddress });
  const [form, setForm] = useState({ ...EMPTY_PUBLIC_QUOTE_FORM });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [collectionFee, setCollectionFee] = useState<number | null>(null);
  const [feeStatus, setFeeStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [protocol, setProtocol] = useState("");
  const update = (field: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  const brandName = brands.find(brand => brand.id === form.marca)?.name || form.outraMarca.trim() || "Não informada";
  const locationName = location === "store" ? "Levar o equipamento à loja" : "Coletar o equipamento no endereço";
  useEffect(() => {
    const cep = address.zip_code.replace(/\D/g, "");
    setCollectionFee(null);
    if (location !== "collect" || cep.length !== 8) { setFeeStatus("idle"); return; }
    let active = true;
    setFeeStatus("loading");
    const timer = window.setTimeout(async () => {
      const { data, error: lookupError } = await supabase.rpc("artvideo_shipping_quote_v1", { p_cep: cep });
      if (!active) return;
      const price = Number(data?.price);
      if (lookupError || !data || !Number.isFinite(price) || price < 0) { setFeeStatus("unavailable"); return; }
      setCollectionFee(price);
      setFeeStatus("ready");
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [location, address.zip_code]);

  function validate(current: number) {
    if (current === 0) {
      if (!device) return "Selecione o tipo de equipamento.";
      if (form.marca === "Outra marca" && !form.outraMarca.trim()) return "Informe o nome da marca.";
      if (!form.descricao.trim()) return "Descreva o defeito ou o serviço necessário.";
      if (!location) return "Escolha como deseja realizar o atendimento.";
      if (location === "collect") {
        if (address.zip_code.replace(/\D/g, "").length !== 8) return "Informe um CEP válido para a coleta.";
        if (feeStatus === "loading") return "Aguarde o cálculo da taxa de coleta.";
        if (feeStatus !== "ready") return "Coleta indisponível para este CEP. Informe outro ou leve à loja.";
      }
    }
    if (current === 1) {
      if (form.customerType === "PF" && (!form.nome.trim() || !isValidCpf(form.cpf) || !isValidPastOrCurrentDate(form.birthDate))) return "Informe nome completo, CPF e data de nascimento válidos.";
      if (form.customerType === "PJ" && (!form.tradeName.trim() || !isValidCnpj(form.cnpj))) return "Informe o nome da empresa e um CNPJ válido.";
      if (!isValidBrazilianMobile(form.whatsapp)) return "Informe um WhatsApp válido com DDD.";
      if (form.email.trim() && !isValidEmail(form.email)) return "Informe um e-mail válido ou deixe o campo vazio.";
    }
    return "";
  }

  function advance(event: FormEvent) {
    event.preventDefault();
    const message = validate(stage);
    if (message) { setError(message); return; }
    setError("");
    if (stage < 2) { setStage(stage + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else void send();
  }
  async function send() {
    if (busy) return;
    for (let i = 0; i < 2; i++) {
      const message = validate(i);
      if (message) { setStage(i); setError(message); return; }
    }
    setBusy(true); setError("");
    try {
      const notes = [
        "Tipo de solicitação: Conserto / manutenção de equipamento",
        "Equipamento: " + device,
        "Marca: " + brandName,
        form.modelo.trim() ? "Modelo: " + form.modelo.trim() : null,
        "Atendimento solicitado: " + locationName,
        location === "collect" && collectionFee !== null ? "Taxa de coleta para o CEP " + address.zip_code + ": " + formatCurrency(collectionFee) : null,
        location === "collect" ? "CEP informado para coleta: " + address.zip_code : null,
        "Problema relatado: " + form.descricao.trim(),
      ].filter(Boolean).join("\n");
      // Reuse the existing public quote RPC. The equipment and requested location are
      // recorded in the quote itself, including when the customer already exists.
      const reference = await submitPublicQuote({
        ...form, servico: "", modelo: "",
        descricao: notes,
      }, address);
      setProtocol(reference);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar. Tente novamente.");
    } finally { setBusy(false); }
  }

  if (protocol) return <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:py-20">
    <CheckCircle2 size={56} className="mx-auto text-emerald-600" strokeWidth={1.5}/>
    <h2 className="mt-5 text-3xl font-semibold">Solicitação recebida!</h2>
    <p className="mt-4 text-[15px] leading-7 text-slate-600">Recebemos os detalhes do equipamento. A Artvideo entrará em contato para avaliar o conserto e informar as condições do orçamento.</p>
    <div className="my-8 rounded-xl bg-slate-50 p-6"><p className="text-sm text-slate-500">Seu protocolo</p><p className="mt-2 break-all font-mono text-xl font-semibold">{protocol}</p></div>
    <PublicButton onClick={() => navigate("/assistencia")}>Ver assistência técnica</PublicButton>
  </section>;

  return <section className="art-booking mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-8 sm:py-14">
    <button type="button" onClick={() => { if (stage > 0) { setStage(stage - 1); setError(""); } else navigate("/orcamento"); }}
      className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)] hover:underline"><ArrowLeft size={18}/> Voltar</button>
    <nav aria-label="Etapas do orçamento de conserto" className="mb-9">
      <div className="mb-3 flex items-center justify-between gap-4 text-sm"><span><strong>{stage + 1} de {stageNames.length}</strong> — {stageNames[stage]}</span><span className="hidden text-slate-500 sm:block">Conserto de equipamento</span></div>
      <ol className="flex gap-2">{stageNames.map((item, index) => <li key={item} aria-current={stage === index ? "step" : undefined}
        className={`h-1.5 flex-1 rounded-full ${index <= stage ? "bg-[var(--art-primary)]" : "bg-slate-200"}`}><span className="sr-only">{item}</span></li>)}</ol>
    </nav>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)] lg:gap-12">
      <form id="repair-quote-form" onSubmit={advance} className="min-w-0 space-y-5">
        <h2 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">
          {stage === 0 ? "Conte sobre o equipamento" : stage === 1 ? "Como podemos falar com você?" : "Confira antes de enviar"}
        </h2>
        {stage === 0 && <>
          <FormField label="Tipo de equipamento" required><select className={input} value={device} onChange={event => setDevice(event.target.value)}>
            <option value="">Selecione o equipamento</option>{deviceTypes.map(type => <option value={type} key={type}>{type}</option>)}
          </select></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Marca (se souber)"><select className={input} value={form.marca} onChange={event => { update("marca", event.target.value); if (event.target.value !== "Outra marca") update("outraMarca", ""); }}>
              <option value="">Não sei informar</option>{brands.map(brand => <option value={brand.id} key={brand.id}>{brand.name}</option>)}<option value="Outra marca">Outra marca</option>
            </select></FormField>
            <FormField label="Modelo (se souber)"><input className={input} value={form.modelo} onChange={event => update("modelo", event.target.value)} placeholder="Ex.: modelo do aparelho"/></FormField>
          </div>
          {form.marca === "Outra marca" && <FormField label="Nome da marca" required><input className={input} value={form.outraMarca} onChange={event => update("outraMarca", event.target.value)} placeholder="Digite a marca"/></FormField>}
          <FormField label="Qual é o problema?" required><textarea className={input + " min-h-36 resize-y"} maxLength={5000} value={form.descricao} onChange={event => update("descricao", event.target.value)} placeholder="Descreva o defeito, os sintomas e o que deseja reparar."/></FormField>
          <fieldset className="space-y-3"><legend className="text-sm font-semibold text-[#24364d]">Como prefere o atendimento? <span className="text-red-600">*</span></legend>
            <label className={`art-choice ${location === "store" ? "is-selected" : ""}`}><input type="radio" name="repair-location" checked={location === "store"} onChange={() => { setLocation("store"); setAddress({ ...emptyAddress }); }}/>
              <div><strong className="block font-semibold">Levar o equipamento à loja</strong><p className="mt-1 text-xs leading-5 text-slate-600">A equipe informará como proceder após a solicitação.</p></div></label>
            <label className={`art-choice ${location === "collect" ? "is-selected" : ""}`}><input type="radio" name="repair-location" checked={location === "consult"} onChange={() => setLocation("collect")}/>
              <div><strong className="block font-semibold">Solicitar coleta no endereço</strong><p className="mt-1 text-xs leading-5 text-slate-600">A coleta tem custo de deslocamento, calculado pelo CEP e incluído no seu orçamento.</p></div></label>
          </fieldset>
          {location === "consult" && <FormField label="CEP para coleta" required>
            <input className={input} inputMode="numeric" autoComplete="postal-code" value={address.zip_code} maxLength={9} onChange={event => setAddress(previous => ({ ...previous, zip_code: formatZipCode(event.target.value) }))} placeholder="00000-000"/>
          </FormField>}
          {location === "collect" && address.zip_code.replace(/\D/g, "").length === 8 &&
            <p role="status" aria-live="polite" className={"rounded-lg px-4 py-3 text-sm " + (feeStatus === "ready" ? "bg-blue-50 text-[#244567]" : feeStatus === "unavailable" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600")}>
              {feeStatus === "loading" ? "Calculando a taxa de coleta..." : feeStatus === "ready" && collectionFee !== null ? "Taxa de coleta: " + formatCurrency(collectionFee) : "Não há tarifa para este CEP. Escolha outro ou leve o equipamento à loja."}
            </p>}
        </>}
        {stage === 1 && <>
          <div className="flex flex-wrap gap-3">{(["PF", "PJ"] as const).map(type => <button key={type} type="button" aria-pressed={form.customerType === type}
            onClick={() => update("customerType", type)} className={`rounded-lg border px-5 py-3 text-sm font-semibold ${form.customerType === type ? "border-[var(--art-primary)] bg-blue-50 text-[var(--art-primary)]" : "border-slate-200 hover:border-blue-300"}`}>{type === "PF" ? "Pessoa física" : "Pessoa jurídica"}</button>)}</div>
          {form.customerType === "PF" ? <>
            <FormField label="Nome completo" required><input className={input} autoComplete="name" value={form.nome} onChange={event => update("nome", event.target.value)}/></FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="CPF" required><input className={input} inputMode="numeric" value={form.cpf} onChange={event => update("cpf", formatCpf(event.target.value))}/></FormField>
              <FormField label="Data de nascimento" required><input className={input} inputMode="numeric" autoComplete="bday" placeholder="DD/MM/AAAA" value={form.birthDate} onChange={event => update("birthDate", formatPublicDate(event.target.value))}/></FormField>
            </div>
          </> : <>
            <FormField label="Nome da empresa" required><input className={input} autoComplete="organization" value={form.tradeName} onChange={event => update("tradeName", event.target.value)}/></FormField>
            <FormField label="CNPJ" required><input className={input} inputMode="numeric" value={form.cnpj} onChange={event => update("cnpj", formatCnpj(event.target.value))}/></FormField>
          </>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="WhatsApp com DDD" required><input className={input} type="tel" autoComplete="tel-national" placeholder="(79) 9 9999-9999" value={form.whatsapp} onChange={event => update("whatsapp", formatPhoneInput(event.target.value, form.whatsapp, event.target.selectionStart))}/></FormField>
            <FormField label="E-mail (opcional)"><input className={input} type="email" autoComplete="email" value={form.email} onChange={event => update("email", event.target.value)}/></FormField>
          </div>
          <p className="text-xs leading-5 text-slate-500">Seus dados serão utilizados para registrar a solicitação e entrar em contato sobre o atendimento.</p>
        </>}
        {stage === 2 && <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6"><h3 className="font-semibold">Equipamento e defeito</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">{device} · {brandName}{form.modelo ? " · " + form.modelo : ""}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{form.descricao}</p>
            <button type="button" onClick={() => setStage(0)} className="mt-4 text-sm font-semibold text-[var(--art-primary)] hover:underline">Alterar equipamento</button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6"><h3 className="font-semibold">Forma de atendimento</h3><p className="mt-2 text-sm text-slate-600">{locationName}{location === "consult" ? " · " + address.zip_code : ""}</p>
            <p className="mt-2 text-xs text-slate-500">Atendimento sujeito à confirmação da equipe. A taxa informada está registrada na solicitação.</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-6"><h3 className="font-semibold">Contato</h3>
            <p className="mt-2 text-sm text-slate-600">{form.customerType === "PF" ? form.nome : form.tradeName} · {form.whatsapp}</p>
            <button type="button" onClick={() => setStage(1)} className="mt-4 text-sm font-semibold text-[var(--art-primary)] hover:underline">Alterar dados</button>
          </div>
          <p className="rounded-lg bg-blue-50 p-5 text-sm leading-6 text-[#244567]">O envio registra um pedido de orçamento, sem cobrança ou agendamento confirmado. A Artvideo entrará em contato para orientar o próximo passo.</p>
        </div>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        <div className="lg:hidden"><PublicButton type="submit" disabled={busy} className="w-full">{busy ? <Loader2 size={17} className="animate-spin"/> : stage === 2 ? <CheckCircle2 size={17}/> : <ArrowRight size={17}/>} {busy ? "Enviando..." : stage === 2 ? "Solicitar orçamento" : "Continuar"}</PublicButton></div>
      </form>
      <aside className="rounded-2xl bg-[#f5f7fa] p-6 lg:sticky lg:top-28 lg:p-8">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seu orçamento</h3>
        <p className="mt-5 flex items-center gap-3 text-[17px] font-semibold"><MonitorCog size={22} className="text-[var(--art-primary)]"/> Conserto de equipamento</p>
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
          <p className="flex items-start gap-2"><Wrench size={17} className="mt-1 shrink-0"/>{device || "Equipamento a informar"}</p>
          <p className="flex items-start gap-2"><MapPin size={17} className="mt-1 shrink-0"/>{location ? locationName : "Forma de atendimento a escolher"}</p>
          <p className="flex items-start gap-2"><ClipboardList size={17} className="mt-1 shrink-0"/>Orçamento e disponibilidade a confirmar</p>
          {location === "collect" && <p className="text-sm font-semibold text-[#172b45]">Taxa de coleta: {feeStatus === "ready" && collectionFee !== null ? formatCurrency(collectionFee) : "A calcular pelo CEP"}</p>}
        </div>
        <div className="mt-6 border-t border-slate-200 pt-5"><p className="flex items-center justify-between text-sm"><span>Pagamento agora</span><strong>Sem cobrança</strong></p></div>
        <div className="mt-6 hidden lg:block"><PublicButton type="submit" form="repair-quote-form" disabled={busy} className="w-full">{busy ? <Loader2 size={17} className="animate-spin"/> : stage === 2 ? <CheckCircle2 size={17}/> : <ArrowRight size={17}/>} {busy ? "Enviando..." : stage === 2 ? "Solicitar orçamento" : "Continuar"}</PublicButton></div>
      </aside>
    </div>
  </section>;
}
