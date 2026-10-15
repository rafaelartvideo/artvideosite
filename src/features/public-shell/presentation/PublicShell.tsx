import { useState, type CSSProperties, type ReactNode } from "react";
import { Clock3, Facebook, FileText, Instagram, Mail, MapPin, Menu, MessageCircle, Phone, X, Youtube } from "lucide-react";
import { ImageWithFallback } from "@/shared/ui/media/ImageWithFallback";
import { formatPhone } from "@/shared/domain/formatters";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import logoIcon from "@/imports/LogoSoloSemFundo.png";
import { getBusinessHours, getSettingText, getWhatsAppNumber } from "../application/site-settings";
import { PUBLIC_NAV_LINKS, PUBLIC_NAV_MAP, type PublicPage } from "../domain/navigation";

const WHATSAPP_MESSAGE = "Olá! Gostaria de saber mais sobre os serviços da Artvideo.";

function safeImageUrl(value: unknown): string {
  return typeof value === "string" && (/^https:\/\//i.test(value) || /^\/(?!\/)/.test(value)) ? value : "";
}
function validExternalUrl(value: unknown, base?: string): string {
  const text = getSettingText(value).trim();
  if (!text) return "";
  if (/^https:\/\//i.test(text)) return text;
  return base && /^[\w.@/-]+$/.test(text) ? base + text.replace(/^@/, "") : "";
}
function themeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
}
function PublicLogo({ className = "" }: { className?: string }) {
  const { settings } = useSiteSettings();
  const { url } = useMediaUrl(typeof settings.logo_media_id === "string" ? settings.logo_media_id : undefined);
  return <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <ImageWithFallback src={url || safeImageUrl(settings.logo_url) || logoIcon} alt="" className="h-10 w-auto max-w-12 shrink-0 object-contain" />
    <span className="flex flex-col text-left leading-[1.03] text-white">
      <span className="text-[12px] font-medium tracking-tight sm:text-[13px]">Eletrônica</span>
      <strong className="text-[19px] font-extrabold tracking-[-.055em] sm:text-[21px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>ARTVIDEO</strong>
    </span>
  </span>;
}

export function WhatsAppAction({ className = "" }: { className?: string }) {
  const { settings } = useSiteSettings();
  const number = getWhatsAppNumber(settings);
  if (!number) return null;
  return <a href={`https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
    target="_blank" rel="noopener noreferrer"
    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#25d366] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#1db954] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${className}`}>
    <MessageCircle size={17} /> Falar pelo WhatsApp
  </a>;
}

function WhatsAppFloat() {
  const { settings } = useSiteSettings();
  const number = getWhatsAppNumber(settings);
  if (!number) return null;
  return <a href={`https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
    target="_blank" rel="noopener noreferrer" aria-label="Fale conosco pelo WhatsApp"
    className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 overflow-hidden rounded-full bg-[#25d366] px-3.5 py-3.5 text-white shadow-lg shadow-green-700/20 transition-all duration-200 hover:-translate-y-1 hover:bg-[#1db954] hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
    <MessageCircle size={23} className="shrink-0"/>
    <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:max-w-[125px]">Fale conosco</span>
  </a>;
}

function PublicHeader({ page, setPage }: { page: PublicPage; setPage: (page: PublicPage) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (destination: PublicPage) => {
    setPage(destination);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return <header className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-r from-[#071830] via-[var(--art-dark)] to-[#081a32] text-white shadow-md">
    <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
      <button type="button" onClick={() => navigate("home")} aria-label="Eletrônica Artvideo — início" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400">
        <PublicLogo/>
      </button>
      <nav aria-label="Navegação principal" className="hidden h-full items-center gap-5 lg:flex xl:gap-7">
        {PUBLIC_NAV_LINKS.map(label => {
          const active = PUBLIC_NAV_MAP[label] === page;
          return <button key={label} type="button" onClick={() => navigate(PUBLIC_NAV_MAP[label])}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-full items-center whitespace-nowrap border-b-2 pt-0.5 text-[13px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-blue-400 ${active ? "border-white text-white" : "border-transparent text-white/75 hover:border-white/50 hover:text-white"}`}>{label}</button>;
        })}
      </nav>
      <button type="button" onClick={() => navigate("orcamento")}
        className="hidden min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--art-primary)] px-4 text-[12px] font-bold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-blue-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 lg:inline-flex">
        <FileText size={16} /> Solicitar orçamento
      </button>
      <button type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen}
        onClick={() => setMenuOpen(x => !x)} className="rounded-md p-2 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 lg:hidden">
        {menuOpen ? <X size={23}/> : <Menu size={23}/>}
      </button>
    </div>
    {menuOpen && <nav aria-label="Navegação móvel" className="border-t border-white/10 bg-[var(--art-dark)] px-4 pb-5 pt-2 shadow-xl lg:hidden">
      {PUBLIC_NAV_LINKS.map(label => <button key={label} type="button" onClick={() => navigate(PUBLIC_NAV_MAP[label])}
        className={`block w-full border-b border-white/10 py-3 text-left text-sm font-semibold transition-colors hover:text-blue-300 ${PUBLIC_NAV_MAP[label] === page ? "text-blue-300" : "text-white"}`}>{label}</button>)}
      <button type="button" onClick={() => navigate("orcamento")} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--art-primary)] font-bold text-white hover:brightness-110">
        <FileText size={17} /> Solicitar orçamento
      </button>
    </nav>}
  </header>;
}

function PublicFooter({ setPage }: { setPage: (page: PublicPage) => void }) {
  const { settings } = useSiteSettings();
  const phone = getSettingText(settings.phone) || getSettingText(settings.telefone);
  const number = getWhatsAppNumber(settings);
  const email = getSettingText(settings.email);
  const address = getSettingText(settings.address) ||
    [settings.street, settings.number, settings.complement, settings.neighborhood, settings.city, settings.state].map(getSettingText).filter(Boolean).join(", ");
  const hours = getBusinessHours(settings.business_hours);
  const socials = [
    { name: "Facebook", url: validExternalUrl(settings.facebook, "https://facebook.com/"), Icon: Facebook },
    { name: "Instagram", url: validExternalUrl(settings.instagram, "https://instagram.com/"), Icon: Instagram },
    { name: "YouTube", url: validExternalUrl(settings.youtube, "https://youtube.com/"), Icon: Youtube },
  ].filter(item => Boolean(item.url));
  const contactClass = "flex items-start gap-2.5 text-[13px] leading-5 text-white/75 transition-colors hover:text-white";
  return <footer className="bg-gradient-to-b from-[#0b203d] to-[#06162c] pt-10 text-white">
    <div className="mx-auto grid max-w-7xl gap-7 px-4 pb-9 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.1fr_1.25fr_.8fr_1fr] lg:gap-8 lg:px-8">
      <div className="lg:border-r lg:border-white/10 lg:pr-7">
        <button type="button" onClick={() => setPage("home")} aria-label="Voltar ao início"><PublicLogo/></button>
        <p className="mt-4 max-w-[215px] text-[13px] leading-relaxed text-white/75">Tecnologia, serviços e confiança para o seu dia a dia.</p>
        {socials.length > 0 && <div className="mt-4 flex gap-3">{socials.map(({ name, url, Icon }) =>
          <a key={name} href={url} aria-label={name} title={name} target="_blank" rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-blue-400">
            <Icon size={19} />
          </a>)}</div>}
      </div>
      <div className="lg:border-r lg:border-white/10 lg:pr-6">
        <h3 className="mb-4 text-sm font-bold text-white">Contato</h3>
        <div className="space-y-2">
          {phone && <a className={contactClass} href={`tel:${phone.replace(/[^\d+]/g,"")}`}><Phone size={17} className="mt-0.5 shrink-0"/> {formatPhone(phone)}</a>}
          {number && <a className={contactClass} href={`https://wa.me/${number}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} className="mt-0.5 shrink-0"/> {formatPhone(getSettingText(settings.whatsapp) || getSettingText(settings.whatsapp_number))}</a>}
          {email && <a className={contactClass} href={`mailto:${email}`}><Mail size={17} className="mt-0.5 shrink-0"/> {email}</a>}
          {address && <div className="flex items-start gap-2.5 text-[13px] leading-5 text-white/75"><MapPin size={17} className="mt-0.5 shrink-0"/> <span>{address}</span></div>}
          {!phone && !number && !email && !address && <button type="button" onClick={() => setPage("contato")} className="text-sm text-white/75 underline-offset-2 hover:text-white hover:underline">Ver canais de contato</button>}
        </div>
      </div>
      <div className="lg:border-r lg:border-white/10 lg:pr-6">
        <h3 className="mb-4 text-sm font-bold text-white">Links</h3>
        <div className="flex flex-col items-start gap-2">
          {PUBLIC_NAV_LINKS.map(label => <button key={label} type="button" onClick={() => setPage(PUBLIC_NAV_MAP[label])}
            className="text-[13px] text-white/75 transition-all hover:translate-x-1 hover:text-white">{label}</button>)}
        </div>
      </div>
      <div>
        <h3 className="mb-4 text-sm font-bold text-white">Horário de atendimento</h3>
        {hours.length ? <div className="flex items-start gap-2.5 text-[13px] leading-6 text-white/75">
          <Clock3 size={18} className="mt-1 shrink-0"/>
          <div>{hours.map((item, i) => <p key={i}>{item}</p>)}</div>
        </div> : <button type="button" onClick={() => setPage("contato")} className="text-left text-[13px] text-white/75 transition-colors hover:text-white">Consulte nossos horários de atendimento.</button>}
      </div>
    </div>
    <div className="border-t border-white/10 py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-white/50 sm:px-6 lg:px-8">
        <span>© {new Date().getFullYear()} Eletrônica Artvideo. Todos os direitos reservados.</span>
        {validExternalUrl(settings.privacy_url) && <a href={validExternalUrl(settings.privacy_url)} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">Política de privacidade</a>}
      </div>
    </div>
  </footer>;
}

export function PublicShell({ page, setPage, children }: { page: PublicPage; setPage: (page: PublicPage) => void; children: ReactNode }) {
  const { settings } = useSiteSettings();
  const themeStyle = {
    "--art-primary": themeColor(settings.primary_color, "#0866f5"),
    "--art-dark": themeColor(settings.secondary_color, "#0b1d37"),
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  } as CSSProperties;
  return <div className="artvideo-public min-h-screen bg-white text-[#10213d]" style={themeStyle}>
    <PublicHeader page={page} setPage={setPage}/>
    <main>{children}</main>
    <PublicFooter setPage={setPage}/>
    <WhatsAppFloat/>
  </div>;
}
