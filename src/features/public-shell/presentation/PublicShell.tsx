import { useState, type ReactNode } from "react";
import { Instagram, Menu, MessageCircle, Phone, ShoppingCart, X } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { formatPhone } from "@/app/admin/shared";
import { useSiteSettings } from "@/lib/hooks";
import logoIcon from "@/imports/ChatGPT_Image_12_de_ago._de_2026__08_15_02.png";
import { getBusinessHours, getSettingText, getWhatsAppNumber } from "../application/site-settings";
import { PUBLIC_NAV_LINKS, PUBLIC_NAV_MAP, type PublicPage } from "../domain/navigation";

const WHATSAPP_MESSAGE = "Olá! Gostaria de saber mais sobre os serviços da Artvideo.";

export function WhatsAppAction({ className = "" }: { className?: string }) {
  const { settings } = useSiteSettings();
  const number = getWhatsAppNumber(settings);
  if (!number) return null;

  return (
    <a href={`https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center justify-center gap-2 bg-[#25d366] text-white font-semibold rounded-md px-5 py-2.5 text-sm hover:bg-[#1db954] transition-all ${className}`}>
      <MessageCircle size={16} /> Falar pelo WhatsApp
    </a>
  );
}

function WhatsAppFloat() {
  const { settings } = useSiteSettings();
  const number = getWhatsAppNumber(settings);
  if (!number) return null;

  return (
    <a href={`https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`} target="_blank" rel="noopener noreferrer" className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 bg-[#25d366] text-white rounded-full shadow-lg shadow-[#25d366]/40 hover:shadow-[#25d366]/60 hover:pr-5 px-4 py-4 transition-all duration-300 overflow-hidden" aria-label="Fale conosco pelo WhatsApp">
      <MessageCircle size={24} className="flex-shrink-0" />
      <span className="max-w-0 group-hover:max-w-[120px] overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300">Fale conosco</span>
    </a>
  );
}

function PublicHeader({ page, setPage }: { page: PublicPage; setPage: (page: PublicPage) => void }) {
  const [open, setOpen] = useState(false);
  const navigate = (label: (typeof PUBLIC_NAV_LINKS)[number]) => {
    setPage(PUBLIC_NAV_MAP[label]);
    setOpen(false);
  };
  const primaryButton = "inline-flex items-center justify-center gap-2 font-semibold rounded-md px-5 py-2.5 text-sm transition-all duration-200 cursor-pointer bg-[#0057e7] text-white hover:bg-[#0046c0] active:scale-[0.98]";

  return (
    <header className="sticky top-0 z-40 bg-[#0d1b2e] border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <button onClick={() => setPage("home")} className="flex items-center gap-2 flex-shrink-0">
          <ImageWithFallback src={logoIcon} alt="Eletrônica Artvideo" className="h-9 w-auto object-contain" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#00b4ff]">Eletrônica</span>
            <span className="text-xl font-black text-white tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
          </div>
        </button>
        <nav className="hidden lg:flex items-center gap-6">
          {PUBLIC_NAV_LINKS.map(label => (
            <button key={label} onClick={() => navigate(label)} className={`text-sm font-medium transition-colors ${PUBLIC_NAV_MAP[label] === page ? "text-white" : "text-white/70 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          <button className={`${primaryButton} text-sm`} onClick={() => setPage("orcamento")}>Solicitar orçamento</button>
          <button className="text-white/75 hover:text-white p-1"><ShoppingCart size={20} /></button>
        </div>
        <button className="lg:hidden text-white p-1" onClick={() => setOpen(current => !current)}>{open ? <X size={24} /> : <Menu size={24} />}</button>
      </div>
      {open && (
        <div className="lg:hidden bg-[#0d1b2e] border-t border-white/10 px-4 py-4 flex flex-col gap-3">
          {PUBLIC_NAV_LINKS.map(label => <button key={label} onClick={() => navigate(label)} className="text-white/80 hover:text-white font-medium py-1 text-left">{label}</button>)}
          <button className={`${primaryButton} mt-2 self-start`} onClick={() => setPage("orcamento")}>Solicitar orçamento</button>
        </div>
      )}
    </header>
  );
}

function PublicFooter({ setPage }: { setPage: (page: PublicPage) => void }) {
  const { settings } = useSiteSettings();
  const contactItems = [
    ["Telefone", formatPhone(getSettingText(settings.phone) || getSettingText(settings.telefone))],
    ["WhatsApp", formatPhone(getSettingText(settings.whatsapp) || getSettingText(settings.whatsapp_number))],
    ["E-mail", getSettingText(settings.email)],
    ["Endereço", getSettingText(settings.address) || [settings.street, settings.number, settings.complement, settings.neighborhood, settings.city, settings.state].map(getSettingText).filter(Boolean).join(", ")],
  ].filter(([, value]) => Boolean(value));
  const businessHours = getBusinessHours(settings.business_hours);

  return (
    <footer className="bg-[#0d1b2e] pt-12 pb-6 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ImageWithFallback src={logoIcon} alt="Artvideo" className="h-8 w-auto object-contain" />
              <div className="flex flex-col leading-none">
                <span className="text-[9px] font-bold tracking-widest uppercase text-[#00b4ff]">Eletrônica</span>
                <span className="text-lg font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
              </div>
            </div>
            <p className="text-white/50 text-sm leading-relaxed">Tecnologia, assistência e instalação em um só lugar.</p>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Navegação</h4>
            <ul className="space-y-2">
              {PUBLIC_NAV_LINKS.filter(label => label !== "Início").map(label => <li key={label}><button onClick={() => setPage(PUBLIC_NAV_MAP[label])} className="text-white/50 text-sm hover:text-white transition-colors">{label}</button></li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Informações</h4>
            <ul className="space-y-2 text-sm text-white/50">
              {contactItems.map(([label, value]) => <li key={String(label)}>{label}: {value}</li>)}
              {businessHours.map((hours, index) => <li key={hours}>{index === 0 ? "Horário: " : ""}{hours}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Contato</h4>
            <div className="flex gap-3">
              <button onClick={() => setPage("contato")} className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-colors"><Phone size={16} /></button>
              {getSettingText(settings.instagram) && <a href={getSettingText(settings.instagram).startsWith("http") ? getSettingText(settings.instagram) : `https://instagram.com/${getSettingText(settings.instagram).replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-colors"><Instagram size={16} /></a>}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between gap-2 text-xs text-white/30">
          <span>© {new Date().getFullYear()} Eletrônica Artvideo. Todos os direitos reservados.</span>
          <a href="#" className="hover:text-white/60 transition-colors">Política de privacidade</a>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ page, setPage, children }: { page: PublicPage; setPage: (page: PublicPage) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader page={page} setPage={setPage} />
      <main>{children}</main>
      <PublicFooter setPage={setPage} />
      <WhatsAppFloat />
    </div>
  );
}
