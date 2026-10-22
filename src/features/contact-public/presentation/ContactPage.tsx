import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { useState } from "react";
import { CheckCircle, Clock, ExternalLink, Instagram, Mail, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { formatPhone, formatPhoneInput } from "@/shared/domain/formatters";
import { getBusinessHours, getSettingText } from "@/features/public-shell/application/site-settings";
import { PublicButton as Btn, PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";

export function ContactPage() {
  const { settings, loading: settingsLoading } = useSiteSettings();
  const [sent, setSent] = useState(false);
  const [mapView, setMapView] = useState<"street" | "map">("street");
  const [form, setForm] = useState({ nome: "", whatsapp: "", email: "", assunto: "", mensagem: "" });
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls = "w-full bg-[#f5f7fa] border border-[#0d1b2e]/15 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#0057e7] focus:border-transparent transition-all";
  const rawWhatsApp = getSettingText(settings.whatsapp) || getSettingText(settings.whatsapp_number);
  const whatsappDigits = rawWhatsApp.replace(/\D/g, "");
  const whatsappNumber = whatsappDigits.startsWith("55") ? whatsappDigits : whatsappDigits ? `55${whatsappDigits}` : "";

  const address = "Rua Laranjeiras, 1190 - Getúlio Vargas, Aracaju - SE, 49055-380";
  const mapSearch = "Eletrônica Artvideo, Rua Laranjeiras, 1190, Getúlio Vargas, Aracaju, SE";
  const mapQuery = encodeURIComponent(mapSearch);
  const mapEmbedUrl = "https://maps.google.com/maps?q=" + mapQuery + "&z=17&output=embed";
  // Este panorama depende da cobertura do Google; há alternativa de mapa e link externo.
  const streetViewUrl = "https://maps.google.com/maps?q=" + mapQuery + "&layer=c&output=svembed";
  const mapsUrl = "https://www.google.com/maps/search/?api=1&query=" + mapQuery + "&query_place_id=ChIJu4y_S5WzGgcR2nYuRXkfPpo";
  const directionsUrl = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(address) + "&destination_place_id=ChIJu4y_S5WzGgcR2nYuRXkfPpo";
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
      <PublicPageHeader title="Fale com a ARTVIDEO" description="Precisa de informações sobre produtos, serviços ou assistência técnica? Entre em contato com nossa equipe."/>

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
                    <input className={inputCls} placeholder="(79) 9 9999-9999" value={form.whatsapp} onChange={(e) => update("whatsapp", formatPhoneInput(e.target.value, form.whatsapp, e.target.selectionStart))} />
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

      <section className="bg-white py-12 sm:py-16" aria-labelledby="artvideo-location-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-6">
            <SectionLabel>Visite nossa loja</SectionLabel>
            <H2>Onde estamos</H2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#637187]">Conheça nossa localização, explore a vista da rua e trace sua rota até a Eletrônica Artvideo.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-2xl border border-[#dce3eb] bg-[#edf1f5] shadow-[0_14px_38px_rgba(20,38,62,.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce3eb] bg-white px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#17283a]"><MapPin size={17} className="text-[#2563eb]"/> Eletrônica Artvideo</span>
                <div className="inline-flex rounded-lg bg-[#edf2f7] p-1" aria-label="Tipo de visualização">
                  <button type="button" onClick={() => setMapView("street")} aria-pressed={mapView === "street"}
                    className={"rounded-md px-3 py-2 text-xs font-semibold transition-colors " + (mapView === "street" ? "bg-white text-[#122c4e] shadow-sm" : "text-[#637187] hover:text-[#13263d]")}>Fachada · Street View</button>
                  <button type="button" onClick={() => setMapView("map")} aria-pressed={mapView === "map"}
                    className={"rounded-md px-3 py-2 text-xs font-semibold transition-colors " + (mapView === "map" ? "bg-white text-[#122c4e] shadow-sm" : "text-[#637187] hover:text-[#13263d]")}>Mapa</button>
                </div>
              </div>
              <iframe key={mapView}
                src={mapView === "street" ? streetViewUrl : mapEmbedUrl}
                title={mapView === "street" ? "Vista da rua em frente à Eletrônica Artvideo no Google Maps" : "Mapa interativo da Eletrônica Artvideo"}
                className="h-[330px] w-full border-0 sm:h-[440px]" loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>
              <div className="border-t border-[#dce3eb] bg-white px-4 py-3 text-xs text-[#66758a]">
                Imagens fornecidas pelo Google Maps. A vista da fachada depende da cobertura do Street View.
              </div>
            </div>
            <div className="flex flex-col justify-between gap-5 rounded-2xl border border-[#dce3eb] bg-[#f7f9fc] p-6">
              <div>
                <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6eef8] text-[#21466e]"><MapPin size={23}/></span>
                <h3 id="artvideo-location-heading" className="text-xl font-extrabold text-[#17283a]">Visite a Artvideo</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#293d55]">Rua Laranjeiras, 1190</p>
                <p className="text-sm leading-6 text-[#5f7084]">Getúlio Vargas, Aracaju – SE</p>
                <p className="text-sm leading-6 text-[#5f7084]">CEP 49055-380</p>
                <p className="mt-5 border-t border-[#dce3eb] pt-4 text-xs leading-relaxed text-[#6d7d91]">Explore a região e consulte fotos da loja e a vista panorâmica em tela cheia pelo Google Maps.</p>
              </div>
              <div className="space-y-3">
                <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#21466e] px-4 text-sm font-bold text-white transition-colors hover:bg-[#183551]">
                  <Navigation size={17}/> Como chegar
                </a>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#ccd7e3] bg-white px-4 text-sm font-semibold text-[#21466e] transition-colors hover:bg-[#edf2f7]">
                  <ExternalLink size={17}/> Ver fachada no Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
