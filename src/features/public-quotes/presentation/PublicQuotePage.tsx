import { useState } from "react";
import { CheckCircle, MessageCircle } from "lucide-react";
import { AddressFields } from "@/app/components/AddressFields";
import { formatPhone } from "@/shared/domain/formatters";
import { emptyAddress } from "@/lib/address";
import { useBrands, useServiceCategories, useServices } from "@/lib/hooks";
import { submitPublicQuote } from "../application/submit-public-quote";
import { EMPTY_PUBLIC_QUOTE_FORM, formatCnpj, formatCpf, formatPublicDate } from "../domain/public-quote";
import { PublicButton as Btn, SectionLabel } from "@/features/public-shell/presentation/PublicUi";

export function PublicQuotePage() {
  const { services, loading: servicesLoading } = useServices();
  const { categories } = useServiceCategories();
  const { brands, loading: brandsLoading } = useBrands();
  const [f, setF] = useState({ ...EMPTY_PUBLIC_QUOTE_FORM });
  const [address, setAddress] = useState({ ...emptyAddress });
  const [sent, setSent] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const up = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const inputCls = "w-full bg-[#f5f7fa] border border-[#0d1b2e]/15 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#0057e7] transition-all";
  const selectCls = inputCls + " cursor-pointer";
  const selectedService = services.find((service) => service.id === f.servico);
  const selectedBrand = brands.find(b => b.id === f.marca);

  const submitQuote = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const newProtocol = await submitPublicQuote(f, address);
      setProtocol(newProtocol);
      setSent(true);
    } catch (error) {
      console.error("[PUBLIC] Quote request error:", error);
      setSubmitError(error instanceof Error ? error.message : "Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) return (
    <>
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-16 h-16 bg-[#0057e7] rounded-2xl flex items-center justify-center mx-auto mb-6"><CheckCircle size={32} className="text-white" /></div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Solicitação enviada!</h1>
          {protocol && (
            <div className="bg-white/10 border border-white/20 rounded-xl px-6 py-4 mb-6">
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Protocolo</p>
              <p className="text-2xl font-black text-white font-mono">{protocol}</p>
              <p className="text-white/50 text-xs mt-1">Guarde este número para acompanhar sua solicitação.</p>
            </div>
          )}
          <p className="text-white/70 text-base mb-8">Nossa equipe entrará em contato para avaliar sua solicitação.</p>
          <Btn variant="primary" className="px-7 py-3 text-base" onClick={() => { setSent(false); setProtocol(null); setF({ ...EMPTY_PUBLIC_QUOTE_FORM }); setAddress({ ...emptyAddress }); }}>Nova solicitação</Btn>
        </div>
      </section>
    </>
  );

  return (
    <>
      <section className="bg-[#0d1b2e] py-12 sm:py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Solicitação de orçamento</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Conte o que você precisa</h1>
          <p className="text-white/70 text-base">Preencha as informações abaixo e nossa equipe poderá entender melhor o serviço que você precisa.</p>
        </div>
      </section>

      <section className="py-12 bg-[#f5f7fa]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <form className="space-y-6" onSubmit={submitQuote}>

            {/* 1 — Serviço */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-4 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">1</span>
                Sobre o serviço
              </h2>
              <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Selecione o serviço *</label>
              <select className={selectCls} value={f.servico} onChange={e => up("servico", e.target.value)} required>
                <option value="">{servicesLoading ? "Carregando serviços..." : "Escolha um serviço..."}</option>
                {services.map((service) => {
                  const category = categories.find((item) => item.id === service.category_id);
                  return <option key={service.id} value={service.id}>{service.title}{category ? ` - ${category.name}` : ""}</option>;
                })}
              </select>
            </div>

            {/* 2 — Equipamento */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6 space-y-4">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-1 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">2</span>
                Sobre o equipamento
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Marca</label>
                  <select className={selectCls} value={f.marca} onChange={e => up("marca", e.target.value)}>
                    <option value="">Selecione a marca...</option>
                    {brands.filter(brand => brand.is_active).map(brand => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                    <option value="Outra marca">Outra marca</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Modelo</label>
                  <input className={inputCls} placeholder="Ex: Split 12.000 BTUs" value={f.modelo} onChange={e => up("modelo", e.target.value)} />
                </div>
              </div>
              {f.marca === "Outra marca" && (
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Informe a marca</label>
                  <input className={inputCls} placeholder="Nome da marca" value={f.outraMarca} onChange={e => up("outraMarca", e.target.value)} />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Descreva o problema ou o que você precisa</label>
                <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Conte brevemente o que aconteceu ou o que você precisa realizar." value={f.descricao} onChange={e => up("descricao", e.target.value)} />
              </div>
            </div>

            {/* 3 — Dados pessoais */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6 space-y-4">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-1 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">3</span>
                Seus dados
              </h2>
              <div>
                <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Tipo de cliente</label>
                <div className="grid grid-cols-2 rounded-lg border border-[#0d1b2e]/15 overflow-hidden">
                  {[{ value: "PF", label: "PESSOA FÍSICA" }, { value: "PJ", label: "PESSOA JURÍDICA" }].map(option => (
                    <button key={option.value} type="button" onClick={() => up("customerType", option.value)} className={`px-3 py-3 text-xs font-black tracking-wide transition-colors ${f.customerType === option.value ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]"}`} aria-pressed={f.customerType === option.value}>{option.label}</button>
                  ))}
                </div>
              </div>
              {/* WhatsApp em destaque */}
              <div className="bg-[#f0fdf4] border-2 border-[#25d366]/40 rounded-xl p-4">
                <label className="text-xs font-black text-[#16a34a] uppercase tracking-wide block mb-1.5 flex items-center gap-1"><MessageCircle size={12} /> WhatsApp * — principal canal de contato</label>
                <input className="w-full bg-white border border-[#25d366]/40 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#25d366] transition-all" placeholder="(79) 9 9999-9999" value={f.whatsapp} onChange={e => up("whatsapp", formatPhone(e.target.value))} required />
              </div>
              {f.customerType === "PF" ? <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Nome completo *</label><input className={inputCls} placeholder="Seu nome" value={f.nome} onChange={e => up("nome", e.target.value)} required /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">CPF *</label><input className={inputCls} placeholder="000.000.000-00" value={f.cpf} maxLength={14} onChange={e => up("cpf", formatCpf(e.target.value))} required /><p className="text-xs text-[#5a6a82] mt-1">Usado para identificar seu cadastro.</p></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Telefone</label><input className={inputCls} placeholder="(79) 3333-3333" value={f.phone} onChange={e => up("phone", formatPhone(e.target.value))} /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Data de nascimento *</label><input className={inputCls} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10} value={f.birthDate} onChange={e => up("birthDate", formatPublicDate(e.target.value))} required /></div>
              </div> : <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Nome fantasia *</label><input className={inputCls} placeholder="Nome comercial da empresa" value={f.tradeName} onChange={e => up("tradeName", e.target.value)} required /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Tipo *</label><input className={inputCls} value="Pessoa Jurídica" readOnly /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">CNPJ *</label><input className={inputCls} placeholder="00.000.000/0000-00" value={f.cnpj} maxLength={18} onChange={e => up("cnpj", formatCnpj(e.target.value))} required /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Razão social</label><input className={inputCls} value={f.legalName} onChange={e => up("legalName", e.target.value)} /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Inscrição estadual</label><input className={inputCls} placeholder="Deixe em branco se não for contribuinte · ISENTO se isento" value={f.stateRegistration} onChange={e => up("stateRegistration", e.target.value)} /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Fundação</label><input className={inputCls} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10} value={f.foundationDate} onChange={e => up("foundationDate", formatPublicDate(e.target.value))} /></div>
              </div>}
              <div>
                <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">E-mail</label>
                <input type="email" className={inputCls} placeholder="seu@email.com" value={f.email} onChange={e => up("email", e.target.value)} />
              </div>
            </div>

            {/* 4 — Dados de endereço */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6 space-y-4">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-1 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">4</span>
                Dados de endereço
              </h2>
              <AddressFields value={address} onChange={setAddress} inputClassName={inputCls} />
            </div>

            {/* 5 — Resumo */}
            <div className="bg-[#0d1b2e] rounded-2xl p-6">
              <h2 className="text-lg font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Revise sua solicitação</h2>
              <div className="space-y-2">
                {[
                  { label: "Serviço", val: selectedService?.title || "—" },
                  { label: "Marca", val: f.marca === "Outra marca" ? f.outraMarca || "Outra marca" : selectedBrand?.name || "—" },
                  { label: "Modelo", val: f.modelo || "—" },
                  { label: "Descrição", val: f.descricao ? f.descricao.slice(0, 80) + (f.descricao.length > 80 ? "…" : "") : "—" },
                  { label: f.customerType === "PJ" ? "Nome fantasia" : "Nome", val: f.customerType === "PJ" ? f.tradeName || "—" : f.nome || "—" },
                  { label: "WhatsApp", val: f.whatsapp || "—" },
                  { label: "Telefone", val: f.phone || "—" },
                  ...(f.customerType === "PF" ? [{ label: "Nascimento", val: f.birthDate || "—" }] : []),
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-start gap-3 text-sm">
                    <span className="text-white/40 w-20 flex-shrink-0 font-semibold">{label}:</span>
                    <span className="text-white/85">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="text-center space-y-3">
              {submitError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{submitError}</p>}
              <Btn variant="primary" className="w-full py-4 text-base" disabled={submitting}>
                {submitting ? "Enviando..." : "Solicitar orçamento"}
              </Btn>
              <p className="text-xs text-[#5a6a82]">Após o envio, nossa equipe entrará em contato para avaliar sua solicitação.</p>
              <p className="text-xs text-[#5a6a82] bg-white border border-[#0d1b2e]/10 rounded-lg px-4 py-3 leading-relaxed">
                Os valores apresentados ou informados previamente podem variar conforme as condições do equipamento, local e serviço necessário. O orçamento final será confirmado pela equipe.
              </p>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
