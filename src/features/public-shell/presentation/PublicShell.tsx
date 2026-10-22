import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { PublicBreadcrumb } from "./PublicPageHeader";
import { Clock3, Facebook, FileText, Instagram, Mail, MapPin, Menu, Phone, ShoppingCart, X, Youtube } from "lucide-react";
import { ImageWithFallback } from "@/shared/ui/media/ImageWithFallback";
import { formatPhone } from "@/shared/domain/formatters";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import logoIcon from "@/imports/LogoSoloSemFundo.png";
import { getBusinessHours, getSettingText, getWhatsAppNumber } from "../application/site-settings";
import { PUBLIC_NAV_LINKS, PUBLIC_NAV_MAP, type PublicPage } from "../domain/navigation";
import { useStoreCart } from "@/features/public-store/application/store-cart";

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

function WhatsAppIcon({ size = 23, className = "" }: { size?: number; className?: string }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.669.15-.198.296-.768.965-.94 1.163-.173.198-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.476-.883-.788-1.48-1.761-1.653-2.058-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.173.198-.297.297-.495.099-.198.05-.372-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.015-1.04 2.479s1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.711.226 1.359.194 1.87.118.571-.085 1.758-.719 2.005-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.004 2a9.94 9.94 0 0 0-9.968 9.963c0 1.756.462 3.472 1.343 4.984L2 22l5.168-1.356a9.951 9.951 0 0 0 4.832 1.232h.004c5.493 0 9.966-4.473 9.968-9.969A9.902 9.902 0 0 0 19.05 4.9 9.91 9.91 0 0 0 12.004 2zm0 18.195h-.003a8.27 8.27 0 0 1-4.215-1.154l-.302-.18-3.125.819.834-3.046-.197-.312a8.282 8.282 0 0 1-1.27-4.414c.002-4.572 3.724-8.295 8.3-8.295a8.247 8.247 0 0 1 5.868 2.431 8.241 8.241 0 0 1 2.43 5.875c-.003 4.574-3.725 8.296-8.32 8.296z"/>
  </svg>;
}

export function WhatsAppAction({ className = "" }: { className?: string }) {
  const { settings } = useSiteSettings();
  const number = getWhatsAppNumber(settings);
  if (!number) return null;
  return <a href={`https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
    target="_blank" rel="noopener noreferrer"
    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#25d366] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#1db954] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${className}`}>
    <WhatsAppIcon size={19} /> Falar pelo WhatsApp
  </a>;
}

function WhatsAppFloat() {
  const { settings } = useSiteSettings();
  const number = getWhatsAppNumber(settings);
  if (!number) return null;
  return <a href={`https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
    target="_blank" rel="noopener noreferrer" aria-label="Fale conosco pelo WhatsApp"
    className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 overflow-hidden rounded-full bg-[#25d366] px-4 py-4 text-white shadow-lg shadow-green-700/20 transition-all duration-200 hover:-translate-y-1 hover:bg-[#1db954] hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
    <WhatsAppIcon size={30} className="shrink-0"/>
    <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:max-w-[125px]">Fale conosco</span>
  </a>;
}


function PublicHeader({ page, setPage }: { page: PublicPage; setPage: (page: PublicPage) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { settings } = useSiteSettings();
  const { count: cartCount } = useStoreCart();
  const { pathname } = useLocation();
  const isLegalPage = ["/politica-de-privacidade", "/exclusao-de-dados", "/descadastramento"].includes(pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname);
  const isCurrent = (destination: PublicPage) => !isLegalPage &&
    (destination === page || (page === "servico" && destination === "servicos") || (page === "produto" && destination === "loja"));
  const instagramUrl = validExternalUrl(settings.instagram, "https://instagram.com/") || "https://www.instagram.com/eletronica_artvideo/";
  const address = getSettingText(settings.address) ||
    [settings.street, settings.number, settings.complement, settings.neighborhood, settings.city, settings.state].map(getSettingText).filter(Boolean).join(", ");
  const locationUrl = validExternalUrl(settings.google_maps_url) || validExternalUrl(settings.maps_url) || validExternalUrl(settings.location_url) ||
    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address || "Eletrônica Artvideo, Aracaju, SE");
  const socialLinks = [
    { label: "Instagram da Eletrônica Artvideo", title: "Instagram", url: instagramUrl, Icon: Instagram },
    { label: "Localização da Eletrônica Artvideo no Google Maps", title: "Localização", url: locationUrl, Icon: MapPin },
  ];
  const socialClass = "inline-flex h-[43px] w-[43px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.065] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300";
  const underlineClass = (active: boolean) => [
    "pointer-events-none absolute -bottom-[7px] left-0 h-[3px] w-full origin-center rounded-full bg-white transition-transform duration-300 ease-out motion-reduce:transition-none",
    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
  ].join(" ");
  const navigate = (destination: PublicPage) => {
    setPage(destination);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  return <header className="art-public-brand-gradient sticky top-0 z-40 border-b border-white/15 text-white shadow-[0_5px_20px_rgba(19,55,125,.22)]">
    <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-3 px-4 sm:h-[84px] sm:px-6 xl:h-[96px] xl:gap-4 lg:px-8">
      <button type="button" onClick={() => navigate("home")} aria-label="Eletrônica Artvideo — início" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400">
        <PublicLogo/>
      </button>
      <nav aria-label="Navegação principal" className="hidden h-full items-center gap-4 xl:flex 2xl:gap-6">
        {PUBLIC_NAV_LINKS.map(label => {
          const active = isCurrent(PUBLIC_NAV_MAP[label]);
          return <button key={label} type="button" onClick={() => navigate(PUBLIC_NAV_MAP[label])}
            aria-current={active ? "page" : undefined}
            className={["group relative flex h-full items-center whitespace-nowrap text-[13px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400", active ? "font-semibold text-white" : "text-white/75 hover:text-white"].join(" ")}>
            <span className="relative inline-flex py-1">{label}<span aria-hidden="true" className={underlineClass(active)}/></span>
          </button>;
        })}
      </nav>
      <div className="hidden shrink-0 items-center gap-2 xl:flex">
        <a href="/carrinho" data-artvideo-cart aria-label={"Meu carrinho, " + cartCount + " produtos"}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white transition-all hover:border-white/40 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400">
          <ShoppingCart size={21}/>
          {cartCount > 0 && <span className="absolute -right-2 -top-2 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[var(--art-primary)] px-1 text-[10px] font-bold text-white">{cartCount > 99 ? "99+" : cartCount}</span>}
        </a>
        <button type="button" onClick={() => navigate("orcamento")} aria-current={page === "orcamento" ? "page" : undefined}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--art-primary)] px-3 text-[12px] font-bold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-blue-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 2xl:px-4">
          <FileText size={16} /> Solicitar orçamento
        </button>
        <div className="ml-1 flex items-center gap-2 border-l border-white/15 pl-3" aria-label="Redes sociais e localização">
          {socialLinks.map(({ label, title, url, Icon }) =>
            <a key={title} href={url} aria-label={label} title={title} target="_blank" rel="noopener noreferrer" className={socialClass}>
              <Icon size={21}/>
            </a>)}
        </div>
      </div>
      <a href="/carrinho" aria-label={"Meu carrinho, " + cartCount + " produtos"}
        className="relative ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 xl:hidden">
        <ShoppingCart size={22}/>
        {cartCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--art-primary)] px-1.5 text-[10px] font-bold">{cartCount > 99 ? "99+" : cartCount}</span>}
      </a>
      <button type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen}
        onClick={() => setMenuOpen(x => !x)} className="rounded-md p-2 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 xl:hidden">
        {menuOpen ? <X size={23}/> : <Menu size={23}/>}
      </button>
    </div>
    {menuOpen && <nav aria-label="Navegação móvel" className="art-public-brand-gradient border-t border-white/15 px-4 pb-5 pt-2 shadow-xl xl:hidden">
      {PUBLIC_NAV_LINKS.map(label => {
        const active = isCurrent(PUBLIC_NAV_MAP[label]);
        return <button key={label} type="button" onClick={() => navigate(PUBLIC_NAV_MAP[label])}
          aria-current={active ? "page" : undefined}
          className={["group flex w-full items-center border-b border-white/10 py-3 text-left text-sm font-semibold transition-colors hover:text-white", active ? "text-white" : "text-white/75"].join(" ")}>
          <span className="relative inline-flex py-1">{label}<span aria-hidden="true" className={underlineClass(active)}/></span>
        </button>;
      })}
      <button type="button" onClick={() => navigate("orcamento")} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--art-primary)] font-bold text-white hover:brightness-110">
        <FileText size={17} /> Solicitar orçamento
      </button>
      <div className="mt-4 flex items-center justify-center gap-3" aria-label="Redes sociais e localização">
        {socialLinks.map(({ label, title, url, Icon }) =>
          <a key={title} href={url} aria-label={label} title={title} target="_blank" rel="noopener noreferrer" className={socialClass}>
            <Icon size={21}/>
          </a>)}
      </div>
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
  return <footer className="bg-gradient-to-b from-[#15366f] to-[#102c60] pt-10 text-white">
    <div className="mx-auto grid max-w-7xl gap-7 px-4 pb-9 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.1fr_1.25fr_.8fr_1fr] lg:gap-8 lg:px-8">
      <div className="lg:pr-7">
        <button type="button" onClick={() => setPage("home")} aria-label="Voltar ao início"><PublicLogo/></button>
        <p className="mt-4 max-w-[215px] text-[13px] leading-relaxed text-white/75">Tecnologia, serviços e confiança para o seu dia a dia.</p>
        {socials.length > 0 && <div className="mt-4 flex gap-3">{socials.map(({ name, url, Icon }) =>
          <a key={name} href={url} aria-label={name} title={name} target="_blank" rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-blue-400">
            <Icon size={19} />
          </a>)}</div>}
      </div>
      <div className="lg:pr-6">
        <h3 className="mb-4 text-sm font-bold text-white">Contato</h3>
        <div className="space-y-2">
          {phone && <a className={contactClass} href={`tel:${phone.replace(/[^\d+]/g,"")}`}><Phone size={17} className="mt-0.5 shrink-0"/> {formatPhone(phone)}</a>}
          {number && <a className={contactClass} href={`https://wa.me/${number}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={17} className="mt-0.5 shrink-0"/> {formatPhone(getSettingText(settings.whatsapp) || getSettingText(settings.whatsapp_number))}</a>}
          {email && <a className={contactClass} href={`mailto:${email}`}><Mail size={17} className="mt-0.5 shrink-0"/> {email}</a>}
          {address && <div className="flex items-start gap-2.5 text-[13px] leading-5 text-white/75"><MapPin size={17} className="mt-0.5 shrink-0"/> <span>{address}</span></div>}
          {!phone && !number && !email && !address && <button type="button" onClick={() => setPage("contato")} className="text-sm text-white/75 underline-offset-2 hover:text-white hover:underline">Ver canais de contato</button>}
        </div>
      </div>
      <div className="lg:pr-6">
        <h3 className="mb-4 text-sm font-bold text-white">Links</h3>
        <div className="flex flex-col items-start gap-2">
          {PUBLIC_NAV_LINKS.map(label => <button key={label} type="button" onClick={() => setPage(PUBLIC_NAV_MAP[label])}
            className="text-[13px] text-white/75 transition-all hover:translate-x-1 hover:text-white">{label}</button>)}
          <a href="/acompanhar-pedido" className="text-[13px] text-white/75 transition-all hover:translate-x-1 hover:text-white">Acompanhar meu pedido</a>
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
    <div className="bg-[#0d2859]/65 py-5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-white/50 sm:px-6 lg:px-8">
        <span>© {new Date().getFullYear()} Eletrônica Artvideo. Todos os direitos reservados.</span>
        <nav aria-label="Informações legais" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/politica-de-privacidade" className="transition-colors hover:text-white">Política de Privacidade</Link>
          <Link to="/exclusao-de-dados" className="transition-colors hover:text-white">Exclusão de Dados</Link>
          <Link to="/descadastramento" className="transition-colors hover:text-white">Descadastramento</Link>
        </nav>
      </div>
    </div>
  </footer>;
}

export function PublicShell({ page, setPage, children }: { page: PublicPage; setPage: (page: PublicPage) => void; children: ReactNode }) {
  const { settings } = useSiteSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const routeLabels: Record<string, string> = {
    "/loja": "Loja", "/servicos": "Serviços", "/assistencia": "Assistência técnica",
    "/sobre": "Sobre nós", "/contato": "Contato", "/orcamento": "Solicitar orçamento",
    "/carrinho": "Meu carrinho", "/acompanhar-pedido": "Acompanhar pedido",
    "/politica-de-privacidade": "Política de Privacidade",
    "/exclusao-de-dados": "Exclusão de Dados",
    "/descadastramento": "Descadastramento",
  };
  const routePath = pathname.replace(/\/+$/, "") || "/";
  const isCheckout = routePath.startsWith("/checkout/");
  const routeLabel = routeLabels[routePath] || (isCheckout ? "Finalizar compra" : "");
  const breadcrumbItems = [
    { label: "Início", onClick: () => setPage("home") },
    ...((isCheckout || routePath === "/carrinho" || routePath === "/acompanhar-pedido") ? [{ label: "Loja", onClick: () => setPage("loja") }] : []),
    ...(isCheckout ? [{ label: "Meu carrinho", onClick: () => navigate("/carrinho") }] : []),
    { label: routeLabel },
  ];
  const themeStyle = {
    "--art-primary": ["#1032dc", "#0057e7"].includes(themeColor(settings.primary_color, "#2459aa").toLowerCase())
      ? "#2459aa" : themeColor(settings.primary_color, "#2459aa"),
    "--art-dark": ["#0b1d37", "#0d1b2e"].includes(themeColor(settings.secondary_color, "#102c60").toLowerCase())
      ? "#102c60" : themeColor(settings.secondary_color, "#102c60"),
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  } as CSSProperties;
  return <div className="artvideo-public min-h-screen bg-white text-[#10213d]" style={themeStyle}>
    <PublicHeader page={page} setPage={setPage}/>
    <main>{routeLabel && <PublicBreadcrumb items={breadcrumbItems}/>}<div className="art-public-page-content">{children}</div></main>
    <PublicFooter setPage={setPage}/>
    <WhatsAppFloat/>
  </div>;
}
