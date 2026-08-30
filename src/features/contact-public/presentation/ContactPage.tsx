import { useState } from "react";
import { Clock, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { formatPhone } from "@/shared/domain/formatters";
import { getBusinessHours, getSettingText } from "@/features/public-shell/application/site-settings";
import { PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";
import { useSiteSettings } from "@/lib/hooks";

export function ContactPage() {
  const { settings, loading: settingsLoading } = useSiteSettings();
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ nome: "", whatsapp: "", email: "", assunto: "", mensagem: "" });
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls = "w-full bg-[#f5f7fa] border border-[#0d1b2e]/15 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#0057e7] focus:border-transparent transition-all";
  const rawWhatsApp = getSettingText(settings.whatsapp) || getSettingText(settings.whatsapp_number);
  const whatsappDigits = rawWhatsApp.replace(/\D/g, "");
  const whatsappNumber = whatsappDigits.startsWith("55") ? whatsappDigits : whatsappDigits ? `55${whatsappDigits}` : "";
  const address = getSettingText(settings.address) || [settings.street, settings.number, settings.complement, settings.neighborhood, settings.city, settings.state].map(getSettingText).filter(Boolean).join(", ");
  const contactDetails: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: MessageCircle, label: "WhatsApp", value: formatPhone(rawWhatsApp) },
    { icon: Phone, label: "Telefone", value: formatPhone(getSettingText(settings.phone) || getSettingText(settings.telefone)) },
    { icon: Mail, label: "E-mail", value: getSettingText(settings.email) },
    { icon: Instagram, label: "Instagram", value: getSettingText(settings.instagram) },
    { icon: MapPin, label: "Localização", value: address },
    { icon: Clock, label: "Horário de atendimento", value: getBusinessHours(settings.business_hours).join(" · ") },
  ].filter((detail) => Boolean(detail.value));

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Contato</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Fale com a {getSettingText(settings.company_name) || "Eletrônica Artvideo"}
          </h1>
          <p className="text-white/70 text-lg">Precisa de informações sobre produtos, serviços ou assistência técnica? Entre em contato com nossa equipe.</p>
        </div>
      </section>

      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10">

          {/* Contact info */}
          <div className="flex flex-col gap-5">
            {/* WhatsApp highlight */}
            <div className="bg-[#25d366] rounded-2xl p-6 text-white">
              <p className="font-black text-lg mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Prefere falar diretamente com nossa equipe?</p>
              <p className="text-white/85 text-sm mb-4">Atendimento rápido pelo WhatsApp.</p>
              {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Olá! Gostaria de saber mais sobre os serviços da Artvideo.")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-[#25d366] font-bold rounded-lg px-5 py-3 text-sm hover:bg-[#f0fff4] transition-colors"><MessageCircle size={16} /> Falar pelo WhatsApp</a>}
            </div>

            {/* Info cards */}
            {settingsLoading ? <div className="text-sm text-[#5a6a82]">Carregando informações...</div> : contactDetails.map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white border border-[#0d1b2e]/10 rounded-xl px-5 py-4 flex items-center gap-4">
                <div className="w-9 h-9 bg-[#0057e7]/10 rounded-lg flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-[#0057e7]" /></div>
                <div>
                  <p className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-semibold text-[#0d1b2e]">{value}</p>
                </div>
              </div>
            ))}

            {address && <div>
              <h3 className="font-bold text-[#0d1b2e] mb-3">Onde estamos</h3>
              <div className="bg-white border border-[#0d1b2e]/10 rounded-xl h-48 flex flex-col items-center justify-center gap-2 text-[#5a6a82]">
                <MapPin size={28} className="text-[#0057e7]/40" />
                <p className="font-semibold text-sm text-center px-4">{address}</p>
              </div>
            </div>}
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 shadow-sm p-6 sm:p-8">
            <h2 className="text-2xl font-black text-[#0d1b2e] mb-6" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Envie uma mensagem</h2>
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <CheckCircle size={40} className="text-[#0057e7]" />
                <p className="font-bold text-[#0d1b2e]">Mensagem enviada!</p>
                <p className="text-sm text-[#5a6a82]">Nossa equipe entrará em contato em breve.</p>
                <Btn variant="outline" className="mt-2" onClick={() => { setSent(false); setForm({ nome: "", whatsapp: "", email: "", assunto: "", mensagem: "" }); }}>Enviar outra</Btn>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Nome</label>
                    <input className={inputCls} placeholder="Seu nome" value={form.nome} onChange={(e) => update("nome", e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">WhatsApp</label>
                    <input className={inputCls} placeholder="(79) 9 9999-9999" value={form.whatsapp} onChange={(e) => update("whatsapp", formatPhone(e.target.value))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">E-mail</label>
                  <input type="email" className={inputCls} placeholder="seu@email.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Assunto</label>
                  <input className={inputCls} placeholder="Ex: Orçamento para instalação de TV" value={form.assunto} onChange={(e) => update("assunto", e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Mensagem</label>
                  <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Descreva o que você precisa..." value={form.mensagem} onChange={(e) => update("mensagem", e.target.value)} required />
                </div>
                <Btn variant="primary" className="w-full py-3 text-base">Enviar mensagem</Btn>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
