import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminLogin, AdminDashboard } from "@/app/Admin";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoIcon from "@/imports/ChatGPT_Image_12_de_ago._de_2026__08_15_02.png";
import {
  ShoppingCart, Menu, X, Tv, Wind, Monitor, Headphones, Cpu, Plug,
  Package, Gamepad2, Wrench, Settings, ArrowRight, Phone, Instagram,
  ChevronRight, Zap, CheckCircle, MessageCircle, ChevronDown, Search,
  MapPin, Mail, Clock, Star, Shield, Users, Layers,
} from "lucide-react";

/* ─── types ─── */
type Page = "home" | "servicos" | "servico-ac" | "sobre" | "contato" | "orcamento" | "assistencia";

/* ─── shared data ─── */
const NAV_LINKS = ["Início", "Loja", "Serviços", "Assistência Técnica", "Sobre nós", "Contato"];
const NAV_MAP: Record<string, Page> = { "Serviços": "servicos", "Assistência Técnica": "assistencia", "Sobre nós": "sobre", "Contato": "contato", "Início": "home" };

/* ─── services data ─── */
const SVC_CATS = [
  { label: "Ar-condicionado", icon: Wind },
  { label: "TVs", icon: Tv },
  { label: "Eletrodomésticos", icon: Package },
  { label: "Eletrônicos", icon: Cpu },
  { label: "Informática", icon: Monitor },
  { label: "Instalação", icon: Plug },
  { label: "Manutenção e reparos", icon: Wrench },
];

const ALL_SERVICES = [
  { id: "ac-inst", cat: "Ar-condicionado", name: "Instalação de ar-condicionado", desc: "Instalação profissional de aparelhos split com segurança e organização.", img: "https://images.unsplash.com/photo-1631567091966-fce555d05d93?w=600&h=400&fit=crop&auto=format", page: "servico-ac" as Page },
  { id: "ac-hig", cat: "Ar-condicionado", name: "Higienização de ar-condicionado", desc: "Limpeza profunda para eliminar fungos, bactérias e impurezas.", img: "https://images.unsplash.com/photo-1631567091966-fce555d05d93?w=600&h=400&fit=crop&auto=format&sat=-100" },
  { id: "ac-prev", cat: "Ar-condicionado", name: "Manutenção preventiva", desc: "Verificação periódica para prevenir falhas e garantir eficiência.", img: "https://images.unsplash.com/photo-1581092160562-40aa08e16b4e?w=600&h=400&fit=crop&auto=format" },
  { id: "ac-cor", cat: "Ar-condicionado", name: "Manutenção corretiva", desc: "Diagnóstico e reparo de falhas no seu ar-condicionado.", img: "https://images.unsplash.com/photo-1581092160562-40aa08e16b4e?w=600&h=400&fit=crop&auto=format&sat=-50" },
  { id: "tv-inst", cat: "TVs", name: "Instalação de TV", desc: "Fixação profissional com suporte adequado e cabeamento organizado.", img: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&h=400&fit=crop&auto=format" },
  { id: "tv-conf", cat: "TVs", name: "Configuração de TV", desc: "Smart TV configurada com redes, streaming e ajuste de imagem.", img: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&h=400&fit=crop&auto=format&sat=-50" },
  { id: "tv-sup", cat: "TVs", name: "Suporte técnico para TV", desc: "Atendimento especializado para resolver problemas na sua televisão.", img: "https://images.unsplash.com/photo-1584905066893-7d5c142ba4e1?w=600&h=400&fit=crop&auto=format" },
  { id: "tv-rep", cat: "TVs", name: "Diagnóstico e reparo de TV", desc: "Análise completa e reparo de defeitos em televisores.", img: "https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=600&h=400&fit=crop&auto=format" },
  { id: "el-man", cat: "Eletrodomésticos", name: "Manutenção de eletrodomésticos", desc: "Manutenção preventiva e corretiva para linha branca.", img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format" },
  { id: "el-diag", cat: "Eletrodomésticos", name: "Diagnóstico de eletrodomésticos", desc: "Análise técnica para identificar a causa do problema.", img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format&sat=-50" },
  { id: "el-rep", cat: "Eletrodomésticos", name: "Reparo eletrônico", desc: "Reparo de componentes eletrônicos após aprovação do orçamento.", img: "https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=600&h=400&fit=crop&auto=format" },
  { id: "ex-diag", cat: "Eletrônicos", name: "Diagnóstico eletrônico", desc: "Análise técnica de equipamentos eletrônicos para identificar falhas.", img: "https://images.unsplash.com/photo-1563770660941-20978e870e26?w=600&h=400&fit=crop&auto=format" },
  { id: "ex-plac", cat: "Eletrônicos", name: "Reparo de placas", desc: "Diagnóstico e reparo de placas eletrônicas por técnicos especializados.", img: "https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=600&h=400&fit=crop&auto=format" },
  { id: "ex-man", cat: "Eletrônicos", name: "Manutenção eletrônica", desc: "Verificação e manutenção de equipamentos eletrônicos gerais.", img: "https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=600&h=400&fit=crop&auto=format&sat=-30" },
  { id: "in-comp", cat: "Informática", name: "Manutenção de computadores", desc: "Limpeza, atualização e reparo em desktops.", img: "https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=600&h=400&fit=crop&auto=format" },
  { id: "in-note", cat: "Informática", name: "Manutenção de notebooks", desc: "Limpeza, troca de pasta térmica e verificação de hardware.", img: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&h=400&fit=crop&auto=format" },
  { id: "in-conf", cat: "Informática", name: "Configuração de equipamentos", desc: "Configuração completa de sistemas, redes e softwares.", img: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&h=400&fit=crop&auto=format" },
  { id: "inst-tv", cat: "Instalação", name: "Instalação de TV", desc: "Fixação e organização profissional com suporte adequado.", img: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&h=400&fit=crop&auto=format" },
  { id: "inst-eq", cat: "Instalação", name: "Instalação de equipamentos", desc: "Instalação de diversos tipos de equipamentos eletrônicos.", img: "https://images.unsplash.com/photo-1581092160562-40aa08e16b4e?w=600&h=400&fit=crop&auto=format" },
  { id: "inst-cf", cat: "Instalação", name: "Configuração de equipamentos", desc: "Configuração e parametrização pós-instalação.", img: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&h=400&fit=crop&auto=format&sat=-30" },
  { id: "mr-prev", cat: "Manutenção e reparos", name: "Manutenção preventiva", desc: "Verificação periódica para prevenir falhas em equipamentos.", img: "https://images.unsplash.com/photo-1581092160562-40aa08e16b4e?w=600&h=400&fit=crop&auto=format&sat=-20" },
  { id: "mr-cor", cat: "Manutenção e reparos", name: "Manutenção corretiva", desc: "Diagnóstico e reparo de defeitos em equipamentos eletrônicos.", img: "https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=600&h=400&fit=crop&auto=format&sat=-20" },
  { id: "mr-diag", cat: "Manutenção e reparos", name: "Diagnóstico técnico", desc: "Análise técnica para identificar o problema no seu equipamento.", img: "https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=600&h=400&fit=crop&auto=format&sat=-30" },
];

/* home data */
const PRODUCTS = [
  { name: 'Smart TV 55" 4K UHD', category: "TVs", price: "R$ 2.499,00", img: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400&h=300&fit=crop&auto=format" },
  { name: "Ar-condicionado Split 12.000 BTUs", category: "Ar-condicionado", price: "R$ 1.349,00", img: "https://images.unsplash.com/photo-1631567091966-fce555d05d93?w=400&h=300&fit=crop&auto=format" },
  { name: "Notebook Core i5 16GB", category: "Informática", price: "R$ 3.199,00", img: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=300&fit=crop&auto=format" },
  { name: "Soundbar 2.1 Bluetooth", category: "Áudio", price: "R$ 799,00", img: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=300&fit=crop&auto=format" },
  { name: "Console de Videogame", category: "Videogames", price: "R$ 4.299,00", img: "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop&auto=format" },
  { name: "Fritadeira Elétrica 5L", category: "Eletrodomésticos", price: "R$ 449,00", img: "https://images.unsplash.com/photo-1648170519786-3a45e7c01c0a?w=400&h=300&fit=crop&auto=format" },
];
const BRANDS = ["AOC", "Britânia", "Electrolux", "Genis Fitness", "LG", "Panasonic", "Philco", "Philips", "Semp", "TCL", "Walita", "Samsung"];
const ASSIST_CATS = ["TVs", "Computadores", "Eletrodomésticos", "Videogames", "Eletrônicos"];
const HOME_STEPS = [
  { n: "01", title: "Solicite", desc: "Conte o que aconteceu com seu equipamento." },
  { n: "02", title: "Avaliamos", desc: "Nossa equipe analisa o problema." },
  { n: "03", title: "Orçamento", desc: "Você recebe as informações antes do serviço." },
  { n: "04", title: "Reparo", desc: "Após aprovação, realizamos o serviço." },
];
const HOME_CATS = [
  { label: "TVs", icon: Tv }, { label: "Ar-condicionado", icon: Wind },
  { label: "Eletrodomésticos", icon: Package }, { label: "Informática", icon: Monitor },
  { label: "Áudio", icon: Headphones }, { label: "Eletrônicos", icon: Cpu },
  { label: "Acessórios", icon: Plug }, { label: "Videogames", icon: Gamepad2 },
];
const HOME_SVCS = [
  { icon: Wind, name: "Instalação de Ar-condicionado", desc: "Instalação profissional com organização dos dutos e configuração para funcionamento correto." },
  { icon: Tv, name: "Instalação de TV", desc: "Suporte, cabeamento e configuração para você aproveitar sua TV da melhor forma." },
  { icon: Wrench, name: "Manutenção Preventiva", desc: "Limpeza e verificação de componentes para prolongar a vida útil dos seus equipamentos." },
  { icon: Settings, name: "Configuração de Equipamentos", desc: "Setup completo de redes, dispositivos e sistemas para uso doméstico ou comercial." },
  { icon: Zap, name: "Reparos Eletrônicos", desc: "Diagnóstico e reparo de circuitos, placas-mãe, fontes e outros componentes eletrônicos." },
];

/* ─── shared components ─── */
function Btn({ children, variant = "primary", className = "", ...props }: {
  children: React.ReactNode; variant?: "primary" | "outline" | "ghost" | "whatsapp"; className?: string; [k: string]: unknown;
}) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-md px-5 py-2.5 text-sm transition-all duration-200 cursor-pointer";
  const v = {
    primary: "bg-[#0057e7] text-white hover:bg-[#0046c0] active:scale-[0.98]",
    outline: "border-2 border-[#0057e7] text-[#0057e7] hover:bg-[#0057e7] hover:text-white active:scale-[0.98]",
    ghost: "text-[#0057e7] hover:underline underline-offset-2 px-0",
    whatsapp: "bg-[#25d366] text-white hover:bg-[#1db954] active:scale-[0.98]",
  };
  return <button className={`${base} ${v[variant]} ${className}`} {...props}>{children}</button>;
}

function SectionLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <span className={`text-xs font-bold tracking-widest uppercase block mb-3 ${light ? "text-[#00b4ff]" : "text-[#0057e7]"}`}>{children}</span>;
}

function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-3xl sm:text-4xl font-black text-[#0d1b2e] ${className}`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{children}</h2>;
}

/* ─── WhatsApp floating button ─── */
function WhatsAppFloat() {
  return (
    <a
      href="https://wa.me/55"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 bg-[#25d366] text-white rounded-full shadow-lg shadow-[#25d366]/40 hover:shadow-[#25d366]/60 hover:pr-5 px-4 py-4 transition-all duration-300 overflow-hidden"
      aria-label="Fale conosco pelo WhatsApp"
    >
      <MessageCircle size={24} className="flex-shrink-0" />
      <span className="max-w-0 group-hover:max-w-[120px] overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300">Fale conosco</span>
    </a>
  );
}

/* ─── Header ─── */
function Header({ cur, setPage }: { cur: Page; setPage: (p: Page) => void; }) {
  const [open, setOpen] = useState(false);
  const go = (l: string) => { setPage(NAV_MAP[l] ?? "home"); setOpen(false); };

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
          {NAV_LINKS.map((l) => {
            const active = (NAV_MAP[l] ?? "home") === cur;
            return <button key={l} onClick={() => go(l)} className={`text-sm font-medium transition-colors ${active ? "text-white" : "text-white/70 hover:text-white"}`}>{l}</button>;
          })}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          <Btn variant="primary" className="text-sm" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
          <button className="text-white/75 hover:text-white p-1"><ShoppingCart size={20} /></button>
        </div>
        <button className="lg:hidden text-white p-1" onClick={() => setOpen(o => !o)}>{open ? <X size={24} /> : <Menu size={24} />}</button>
      </div>
      {open && (
        <div className="lg:hidden bg-[#0d1b2e] border-t border-white/10 px-4 py-4 flex flex-col gap-3">
          {NAV_LINKS.map((l) => <button key={l} onClick={() => go(l)} className="text-white/80 hover:text-white font-medium py-1 text-left">{l}</button>)}
          <Btn variant="primary" className="mt-2 self-start" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
        </div>
      )}
    </header>
  );
}

/* ─── Footer ─── */
function Footer({ setPage }: { setPage: (p: Page) => void }) {
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
              {(["Loja", "Serviços", "Assistência Técnica", "Sobre nós", "Contato"] as const).map((l) => (
                <li key={l}><button onClick={() => setPage(NAV_MAP[l] ?? "home")} className="text-white/50 text-sm hover:text-white transition-colors">{l}</button></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Informações</h4>
            <ul className="space-y-2 text-sm text-white/50">
              <li>Endereço: <span className="italic">em breve</span></li>
              <li>Telefone: <span className="italic">em breve</span></li>
              <li>WhatsApp: <span className="italic">em breve</span></li>
              <li>Horário: <span className="italic">em breve</span></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">Contato</h4>
            <div className="flex gap-3">
              <button onClick={() => setPage("contato")} className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-colors"><Phone size={16} /></button>
              <a href="#" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-colors"><Instagram size={16} /></a>
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

/* ─── Tracking Section ─── */
function ServiceTrackingSection() {
  const [osNumber, setOsNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOs = osNumber.trim();
    if (!cleanOs) return;

    setLoading(true);
    setSearched(true);
    setOrder(null);
    setErrorMsg("");

    try {
      // Direct exact or prefix/id search on orders
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total, created_at, updated_at, description, service_name, public_notes, history")
        .or(`id.eq.${cleanOs},id.ilike.${cleanOs}%`)
        .maybeSingle();

      if (error) {
        // If query fails or format is invalid UUID/id
        console.error("Error fetching order:", error);
        setErrorMsg("Não foi possível localizar a OS informada. Verifique o número e tente novamente.");
      } else if (data) {
        setOrder(data);
      } else {
        setErrorMsg("Ordem de Serviço não encontrada. Por favor, verifique o número digitado e tente novamente.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Ocorreu um erro ao consultar a OS. Tente novamente em alguns instantes.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to map status to friendly label and step index
  const statusSteps = [
    "Solicitação recebida",
    "Em análise",
    "Aguardando aprovação",
    "Em manutenção",
    "Pronto",
    "Finalizado"
  ];

  const getStatusIndex = (st: string) => {
    if (!st) return 0;
    const lower = st.toLowerCase();
    if (lower.includes("receb") || lower.includes("abert") || lower.includes("pend")) return 0;
    if (lower.includes("anál") || lower.includes("anal")) return 1;
    if (lower.includes("aprov") || lower.includes("orç")) return 2;
    if (lower.includes("manuten") || lower.includes("exec") || lower.includes("anda")) return 3;
    if (lower.includes("pront") || lower.includes("conclu")) return 4;
    if (lower.includes("finaliz") || lower.includes("entreg")) return 5;
    return 0;
  };

  const currentStepIdx = order ? getStatusIndex(order.status) : 0;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <section id="acompanhar-servico" className="py-16 bg-white border-y border-[#0d1b2e]/10 scroll-mt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <SectionLabel>Consulta de OS</SectionLabel>
          <H2 className="mb-3">Acompanhe seu serviço</H2>
          <p className="text-[#5a6a82] text-sm sm:text-base max-w-xl mx-auto">
            Consulte o andamento do seu serviço ou pedido usando o número da OS.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleTrack} className="max-w-xl mx-auto mb-10">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
              <input
                type="text"
                value={osNumber}
                onChange={(e) => setOsNumber(e.target.value)}
                placeholder="Digite o número da OS (ex: OS-12345)"
                className="w-full bg-[#f5f7fa] border border-[#0d1b2e]/15 rounded-md pl-10 pr-4 py-3 text-sm font-semibold text-[#0d1b2e] placeholder-[#5a6a82]/70 focus:outline-none focus:ring-2 focus:ring-[#0057e7] focus:border-transparent transition-all"
                required
              />
            </div>
            <Btn variant="primary" className="py-3 px-7 text-sm whitespace-nowrap" disabled={loading}>
              {loading ? (
                <>
                  <Clock size={16} className="animate-spin" /> Buscando...
                </>
              ) : (
                "Acompanhar"
              )}
            </Btn>
          </div>
        </form>

        {/* Loading state */}
        {loading && (
          <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-8 text-center">
            <Clock size={32} className="animate-spin text-[#0057e7] mx-auto mb-3" />
            <p className="font-semibold text-[#0d1b2e] text-sm">Consultando informações da sua Ordem de Serviço...</p>
          </div>
        )}

        {/* Error / Not found state */}
        {!loading && searched && errorMsg && (
          <div className="bg-[#fff5f5] border border-[#f87171]/30 rounded-xl p-6 text-center max-w-xl mx-auto">
            <div className="w-12 h-12 bg-[#fee2e2] text-[#ef4444] rounded-full flex items-center justify-center mx-auto mb-3">
              <X size={24} />
            </div>
            <h3 className="font-bold text-[#0d1b2e] text-base mb-1">OS não encontrada</h3>
            <p className="text-sm text-[#5a6a82] leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Result state */}
        {!loading && order && (
          <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-6 sm:p-8 shadow-sm">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#0d1b2e]/10 gap-4">
              <div>
                <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wider block mb-1">Ordem de Serviço</span>
                <h3 className="text-2xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  #{order.id}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 bg-[#0057e7]/10 text-[#0057e7] font-bold text-xs px-3 py-1.5 rounded-full border border-[#0057e7]/20">
                  <CheckCircle size={14} />
                  Status: {order.status || "Em andamento"}
                </span>
              </div>
            </div>

            {/* General details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-6 border-b border-[#0d1b2e]/10 text-sm">
              <div>
                <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Serviço / Produto</span>
                <span className="font-bold text-[#0d1b2e]">{order.service_name || order.description || "Assistência Técnica / Manutenção"}</span>
              </div>
              <div>
                <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Data da solicitação</span>
                <span className="font-medium text-[#0d1b2e]">{formatDate(order.created_at)}</span>
              </div>
              <div>
                <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Última atualização</span>
                <span className="font-medium text-[#0d1b2e]">{formatDate(order.updated_at || order.created_at)}</span>
              </div>
              {order.estimated_delivery && (
                <div>
                  <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Previsão de conclusão</span>
                  <span className="font-medium text-[#0d1b2e]">{formatDate(order.estimated_delivery)}</span>
                </div>
              )}
            </div>

            {/* Status Timeline */}
            <div className="py-6 border-b border-[#0d1b2e]/10">
              <h4 className="text-sm font-bold text-[#0d1b2e] uppercase tracking-wide mb-6">Andamento do serviço</h4>
              
              {/* Desktop timeline */}
              <div className="hidden md:block relative">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#0d1b2e]/10 -translate-y-1/2 z-0" />
                <div 
                  className="absolute top-1/2 left-0 h-1 bg-[#0057e7] -translate-y-1/2 z-0 transition-all duration-500"
                  style={{ width: `${(currentStepIdx / (statusSteps.length - 1)) * 100}%` }}
                />
                <div className="grid grid-cols-6 relative z-10 text-center">
                  {statusSteps.map((step, idx) => {
                    const isDone = idx <= currentStepIdx;
                    const isCurrent = idx === currentStepIdx;
                    return (
                      <div key={step} className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors mb-2 ${
                          isCurrent
                            ? "bg-[#0057e7] text-white ring-4 ring-[#0057e7]/20"
                            : isDone
                            ? "bg-[#0057e7] text-white"
                            : "bg-white text-[#5a6a82] border-2 border-[#0d1b2e]/20"
                        }`}>
                          {isDone ? <CheckCircle size={14} /> : idx + 1}
                        </div>
                        <span className={`text-xs font-semibold px-1 leading-tight ${isDone ? "text-[#0d1b2e]" : "text-[#5a6a82]/70"}`}>
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile timeline */}
              <div className="md:hidden space-y-3">
                {statusSteps.map((step, idx) => {
                  const isDone = idx <= currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                        isCurrent
                          ? "bg-[#0057e7] text-white ring-2 ring-[#0057e7]/20"
                          : isDone
                          ? "bg-[#0057e7] text-white"
                          : "bg-white text-[#5a6a82] border border-[#0d1b2e]/20"
                      }`}>
                        {isDone ? <CheckCircle size={12} /> : idx + 1}
                      </div>
                      <span className={`text-xs font-semibold ${isDone ? "text-[#0d1b2e]" : "text-[#5a6a82]/70"}`}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Public messages / Custom History if present */}
            {order.public_notes && (
              <div className="pt-6">
                <h4 className="text-sm font-bold text-[#0d1b2e] uppercase tracking-wide mb-2">Observações ao cliente</h4>
                <div className="bg-white border border-[#0d1b2e]/10 rounded-lg p-4 text-xs text-[#3a4a5e] leading-relaxed">
                  {order.public_notes}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Home Page ─── */
function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-16 sm:py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionLabel light>Eletrônica Artvideo · Aracaju, SE</SectionLabel>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Tecnologia, produtos e serviços em um só lugar.
            </h1>
            <p className="text-white/70 text-lg mb-8 max-w-lg leading-relaxed">Produtos eletrônicos, assistência técnica, instalações e manutenção para sua casa ou negócio.</p>
            <div className="flex flex-wrap gap-3">
              <Btn variant="primary" className="text-base px-6 py-3">Comprar na loja</Btn>
              <Btn variant="outline" className="text-base px-6 py-3 border-white/40 text-white hover:bg-white/15 hover:border-white" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1761494296583-99b15e9063c5?w=800&h=520&fit=crop&auto=format" alt="Loja de eletrônicos Artvideo" className="w-full h-72 sm:h-80 lg:h-96 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 3 Caminhos */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atendimento completo</SectionLabel>
          <H2 className="mb-10">O que você precisa?</H2>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { label: "COMPRAR", icon: ShoppingCart, desc: "Encontre produtos eletrônicos, acessórios e equipamentos.", cta: "Ver loja", dark: false, dest: "home" as const },
              { label: "CONSERTAR", icon: Wrench, desc: "Diagnóstico, manutenção e reparo para seus equipamentos.", cta: "Conhecer assistência", dark: true, dest: "servicos" as const },
              { label: "ACOMPANHAR SERVIÇO", icon: Search, desc: "Consulte o andamento do seu serviço ou pedido usando o número da OS.", cta: "Acompanhar serviço", dark: false, dest: "tracking" as const },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className={`${c.dark ? "bg-[#0d1b2e]" : "bg-white"} rounded-xl p-8 flex flex-col gap-4 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md transition-shadow`}>
                  <Icon size={32} className={c.dark ? "text-[#00b4ff]" : "text-[#0057e7]"} />
                  <h3 className={`text-2xl font-black ${c.dark ? "text-white" : "text-[#0d1b2e]"}`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{c.label}</h3>
                  <p className={`text-sm leading-relaxed ${c.dark ? "text-white/70" : "text-[#5a6a82]"}`}>{c.desc}</p>
                  {c.dest === "tracking" ? (
                    <a href="#acompanhar-servico" className={`flex items-center gap-1 text-sm font-semibold mt-auto ${c.dark ? "text-[#00b4ff]" : "text-[#0057e7]"} hover:gap-2 transition-all`}>
                      {c.cta} <ChevronRight size={16} />
                    </a>
                  ) : (
                    <button onClick={() => setPage(c.dest as Page)} className={`flex items-center gap-1 text-sm font-semibold mt-auto ${c.dark ? "text-[#00b4ff]" : "text-[#0057e7]"} hover:gap-2 transition-all`}>
                      {c.cta} <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Acompanhe seu Serviço */}
      <ServiceTrackingSection />

      {/* Categorias */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Loja Artvideo</SectionLabel>
          <H2 className="mb-10">Encontre o que você precisa</H2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {HOME_CATS.map(({ label, icon: Icon }) => (
              <button key={label} className="flex items-center gap-3 bg-[#f5f7fa] hover:bg-[#e8eef8] border border-[#0d1b2e]/10 rounded-lg px-4 py-4 text-sm font-semibold text-[#0d1b2e] transition-colors text-left">
                <Icon size={18} className="text-[#0057e7] flex-shrink-0" />{label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Loja */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Destaques</SectionLabel>
          <div className="flex items-end justify-between mb-6 gap-4">
            <H2>Destaques da loja</H2>
            <Btn variant="ghost" className="flex-shrink-0">Ver todos <ArrowRight size={15} /></Btn>
          </div>
          <div className="mb-6 flex items-center gap-2 text-xs text-[#5a6a82] bg-white border border-[#0d1b2e]/10 rounded-lg px-4 py-2">
            <Package size={14} className="text-[#0057e7]" />
            Produtos de exemplo — serão substituídos pelos produtos reais da Nuvemshop.
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PRODUCTS.map((p) => (
              <div key={p.name} className="bg-white rounded-xl overflow-hidden border border-[#0d1b2e]/10 shadow-sm hover:shadow-md transition-shadow group">
                <div className="bg-[#f5f7fa] h-44 overflow-hidden">
                  <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-4">
                  <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wide">{p.category}</span>
                  <h3 className="font-semibold text-[#0d1b2e] mt-1 mb-3 text-sm leading-snug">{p.name}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-[#0d1b2e]">{p.price}</span>
                    <Btn variant="outline" className="text-xs px-3 py-1.5">Ver produto</Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center"><Btn variant="primary" className="px-8 py-3 text-base">Ver todos os produtos</Btn></div>
        </div>
      </section>

      {/* Serviços home preview */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Para sua casa e seus equipamentos</SectionLabel>
          <div className="flex items-end justify-between mb-10 gap-4">
            <H2>Serviços para sua casa e seus equipamentos</H2>
            <button onClick={() => setPage("servicos")} className="flex items-center gap-1 text-sm font-semibold text-[#0057e7] hover:gap-2 transition-all flex-shrink-0">Ver todos <ArrowRight size={15} /></button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {HOME_SVCS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="bg-[#f5f7fa] rounded-xl p-6 border border-[#0d1b2e]/10 hover:border-[#0057e7]/40 transition-colors group">
                  <div className="w-10 h-10 bg-[#0057e7]/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#0057e7]/20 transition-colors">
                    <Icon size={20} className="text-[#0057e7]" />
                  </div>
                  <h3 className="font-bold text-[#0d1b2e] mb-2">{s.name}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed mb-4">{s.desc}</p>
                  <button onClick={() => setPage("servicos")} className="flex items-center gap-1 text-sm font-semibold text-[#0057e7] hover:gap-2 transition-all">
                    Ver detalhes <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-8 text-center"><Btn variant="outline" className="px-8 py-3 text-base" onClick={() => setPage("servicos")}>Ver todos os serviços</Btn></div>
        </div>
      </section>

      {/* Assistência */}
      <section className="py-16 bg-[#0d1b2e] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel light>Assistência técnica em Aracaju</SectionLabel>
            <H2 className="!text-white mb-5">Seu equipamento apresentou algum problema?</H2>
            <p className="text-white/70 text-base leading-relaxed mb-8">Conte com nossa assistência técnica para diagnóstico, manutenção e reparo de equipamentos eletrônicos.</p>
            <div className="flex flex-wrap gap-2 mb-8">{ASSIST_CATS.map((c) => <span key={c} className="bg-white/10 text-white/90 text-sm font-semibold rounded-md px-3 py-1.5 border border-white/10">{c}</span>)}</div>
            <Btn variant="primary" className="px-7 py-3 text-base">Conhecer nossa assistência</Btn>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=800&h=520&fit=crop&auto=format" alt="Bancada de assistência técnica" className="w-full h-72 sm:h-80 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Marcas */}
      <section className="py-14 bg-white border-y border-[#0d1b2e]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-bold tracking-widest uppercase text-[#5a6a82] mb-8">Marcas que atendemos</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {BRANDS.map((b) => (
              <div key={b} className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-lg h-14 flex items-center justify-center hover:border-[#0057e7]/40 transition-colors">
                <span className="text-xs font-bold text-[#5a6a82]">{b}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-[#5a6a82] mt-4 italic">Logos oficiais a serem inseridos</p>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Processo simples</SectionLabel>
          <H2 className="mb-12">Precisa de assistência? É fácil.</H2>
          <div className="relative">
            <div className="hidden lg:block absolute top-8 left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] h-px bg-[#0057e7]/30 z-0" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {HOME_STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <div className="w-14 h-14 bg-[#0057e7] rounded-xl flex items-center justify-center shadow-md shadow-[#0057e7]/30"><span className="text-white font-black text-sm">{s.n}</span></div>
                  <h3 className="font-bold text-[#0d1b2e] text-lg">{s.title}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de um produto ou de um reparo?</h2>
          <p className="text-white/80 text-lg mb-10">Encontre o que procura na nossa loja ou fale com nossa equipe.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Comprar na loja</button>
            <button className="border-2 border-white text-white font-bold rounded-md px-7 py-3 text-base hover:bg-white/10 transition-colors">Solicitar orçamento</button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Serviços Page ─── */
function ServicosPage({ setPage }: { setPage: (p: Page) => void }) {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");

  const filtered = ALL_SERVICES.filter((s) => {
    const matchCat = filter === "Todos" || s.cat === filter;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.cat.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped: Record<string, typeof ALL_SERVICES> = {};
  filtered.forEach((s) => { if (!grouped[s.cat]) grouped[s.cat] = []; grouped[s.cat].push(s); });

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Serviços Artvideo</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Serviços para sua casa e seus equipamentos
          </h1>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">Instalação, manutenção, configuração e reparos com atendimento profissional em Aracaju e região.</p>
          {/* search */}
          <div className="relative max-w-lg mx-auto">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input
              type="text"
              placeholder="Qual serviço você procura?"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white rounded-xl pl-11 pr-4 py-3.5 text-[#0d1b2e] text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-[#0057e7]"
            />
          </div>
        </div>
      </section>

      {/* filter strip */}
      <section className="bg-white border-b border-[#0d1b2e]/10 py-4 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {["Todos", ...SVC_CATS.map((c) => c.label)].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-all whitespace-nowrap flex-shrink-0 ${filter === f ? "bg-[#0057e7] border-[#0057e7] text-white" : "bg-[#f5f7fa] border-[#0d1b2e]/15 text-[#0d1b2e] hover:border-[#0057e7]/50"}`}>
              {f}
            </button>
          ))}
        </div>
      </section>

      {/* services grid */}
      <section className="py-12 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-20 text-[#5a6a82]">Nenhum serviço encontrado para "{search}".</div>
          )}
          {Object.entries(grouped).map(([cat, items]) => {
            const CatIcon = SVC_CATS.find((c) => c.label === cat)?.icon ?? Wrench;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-6">
                  <CatIcon size={18} className="text-[#0057e7]" />
                  <h2 className="text-xs font-black tracking-widest uppercase text-[#0057e7]">{cat}</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {items.map((s) => (
                    <div key={s.id} className="bg-white rounded-xl overflow-hidden border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all group">
                      <div className="h-40 overflow-hidden bg-[#e8eef8]">
                        <img src={s.img} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                      <div className="p-4 flex flex-col gap-2">
                        <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wide">{s.cat}</span>
                        <h3 className="font-bold text-[#0d1b2e] text-sm leading-snug">{s.name}</h3>
                        <p className="text-xs text-[#5a6a82] leading-relaxed flex-1">{s.desc}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-[#0d1b2e]/8 mt-1">
                          <span className="text-xs font-semibold text-[#5a6a82]">Consulte o valor</span>
                          <button
                            onClick={() => setPage(s.page ?? "servicos")}
                            className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:gap-2 transition-all"
                          >
                            Ver detalhes <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de ajuda com seu equipamento?</h2>
          <p className="text-white/80 text-lg mb-10">Não encontrou exatamente o serviço que procura? Entre em contato com nossa equipe.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <button onClick={() => setPage("contato")} className="border-2 border-white text-white font-bold rounded-md px-7 py-3 text-base hover:bg-white/10 transition-colors">Falar com a Artvideo</button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Service Detail: Instalação de Ar-condicionado ─── */
function ServicoACPage({ setPage }: { setPage: (p: Page) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const BTU_OPTIONS = [
    { label: "Até 9.000 BTUs" },
    { label: "12.000 BTUs" },
    { label: "18.000 BTUs" },
    { label: "24.000 BTUs" },
    { label: "30.000 BTUs ou mais", consulte: true },
  ];

  const INCLUDED = [
    "Instalação do equipamento",
    "Fixação das unidades interna e externa",
    "Conexões necessárias conforme as condições previstas",
    "Teste de funcionamento",
    "Verificação da instalação",
    "Organização do local após o serviço",
  ];

  const VARIANT_FACTORS = [
    { icon: Zap, label: "Capacidade do aparelho" },
    { icon: ArrowRight, label: "Distância entre as unidades" },
    { icon: Layers, label: "Quantidade de tubulação" },
    { icon: ChevronDown, label: "Dificuldade de acesso" },
    { icon: Zap, label: "Trabalho em altura" },
    { icon: Plug, label: "Infraestrutura elétrica" },
    { icon: Package, label: "Materiais adicionais" },
    { icon: MapPin, label: "Características do ambiente" },
  ];

  const STEPS = [
    { n: "01", title: "Solicitação", desc: "Você informa o equipamento e o serviço desejado." },
    { n: "02", title: "Avaliação", desc: "Nossa equipe verifica as condições necessárias." },
    { n: "03", title: "Orçamento", desc: "Você recebe as informações e o valor do serviço." },
    { n: "04", title: "Execução", desc: "Após sua aprovação, realizamos o serviço." },
  ];

  const FAQS = [
    { q: "O preço da instalação é fixo?", a: "O valor pode variar conforme a capacidade do aparelho e as condições do local. Antes da execução, nossa equipe informa o valor completo." },
    { q: "O que está incluso na instalação?", a: "A instalação inclui fixação das unidades, conexões necessárias dentro das condições previstas, teste de funcionamento e organização do local. Materiais ou adaptações adicionais serão informados antes da execução." },
    { q: "A tubulação está inclusa?", a: "A metragem básica de tubulação prevista para a instalação está contemplada no serviço. Metragem adicional será informada e orçada antes da execução." },
    { q: "É necessário avaliar o local antes?", a: "Em alguns casos nossa equipe pode solicitar informações sobre o local para um orçamento mais preciso. Qualquer custo adicional é informado antes do serviço." },
    { q: "Vocês atendem quais marcas?", a: "Atendemos as principais marcas do mercado. Entre em contato para confirmar a disponibilidade para o seu equipamento específico." },
    { q: "O serviço possui garantia?", a: "Informações sobre garantia serão fornecidas no momento do orçamento, conforme o tipo de serviço realizado." },
  ];

  return (
    <>
      {/* breadcrumb */}
      <div className="bg-white border-b border-[#0d1b2e]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-xs text-[#5a6a82]">
          <button onClick={() => setPage("home")} className="hover:text-[#0057e7]">Início</button>
          <ChevronRight size={12} />
          <button onClick={() => setPage("servicos")} className="hover:text-[#0057e7]">Serviços</button>
          <ChevronRight size={12} />
          <span className="text-[#0d1b2e] font-medium">Instalação de ar-condicionado</span>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-[#0d1b2e] py-12 sm:py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionLabel light>Ar-condicionado</SectionLabel>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Instalação de ar-condicionado
            </h1>
            <p className="text-white/70 text-base leading-relaxed mb-6">
              Instalação profissional para garantir segurança, organização e funcionamento adequado do seu equipamento.
            </p>
            {/* price highlight */}
            <div className="bg-white/10 border border-white/15 rounded-xl px-5 py-4 mb-6 inline-block">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-1">A partir de</p>
              <p className="text-3xl font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>R$ XXX,XX</p>
              <p className="text-white/50 text-xs mt-1">Valor pode variar conforme capacidade e condições do local.</p>
            </div>
            <div className="flex flex-wrap gap-3 mb-4">
              <Btn variant="primary" className="px-6 py-3 text-base" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
              <Btn variant="whatsapp" className="px-6 py-3 text-base"><MessageCircle size={16} /> Falar pelo WhatsApp</Btn>
            </div>
            <CepChecker />
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1631567091966-fce555d05d93?w=800&h=520&fit=crop&auto=format" alt="Instalação de ar-condicionado" className="w-full h-64 sm:h-80 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* BTU options */}
      <section className="py-14 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <SectionLabel>Variação de preço</SectionLabel>
          <H2 className="mb-3">Escolha a capacidade do seu aparelho</H2>
          <p className="text-[#5a6a82] mb-8 text-sm">Selecione a capacidade para ver o valor de referência. Condições do local podem alterar o valor final.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {BTU_OPTIONS.map((opt) => (
              <div key={opt.label} className="border-2 border-[#0d1b2e]/10 hover:border-[#0057e7] rounded-xl p-5 flex flex-col gap-3 transition-colors group cursor-pointer">
                <Wind size={20} className="text-[#0057e7]" />
                <p className="font-bold text-[#0d1b2e] text-sm leading-snug">{opt.label}</p>
                <p className={`text-sm font-black ${opt.consulte ? "text-[#5a6a82]" : "text-[#0d1b2e]"} mt-auto`}>
                  {opt.consulte ? "Consulte" : "R$ XXX,XX"}
                </p>
                {!opt.consulte && <p className="text-xs text-[#5a6a82]">valor a preencher</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About + Included */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-10">
          <div>
            <SectionLabel>Sobre o serviço</SectionLabel>
            <H2 className="mb-4">Sobre este serviço</H2>
            <p className="text-[#5a6a82] leading-relaxed text-sm">
              A instalação de um ar-condicionado deve ser realizada de acordo com as características do equipamento e do ambiente. Nossa equipe realiza a instalação buscando organização, segurança e funcionamento adequado do aparelho.
            </p>
          </div>
          <div>
            <SectionLabel>Incluso</SectionLabel>
            <H2 className="mb-4">O que está incluso</H2>
            <ul className="space-y-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#3a4a5e]">
                  <CheckCircle size={16} className="text-[#0057e7] mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-4 bg-[#e8eef8] rounded-lg p-3 text-xs text-[#5a6a82] leading-relaxed">
              Os itens inclusos podem variar conforme o tipo de instalação. Eventuais materiais ou adaptações adicionais serão informados antes da execução.
            </div>
          </div>
        </div>
      </section>

      {/* Variant factors */}
      <section className="py-14 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <SectionLabel>Transparência</SectionLabel>
          <H2 className="mb-3">O que pode alterar o valor?</H2>
          <p className="text-[#5a6a82] mb-8 text-sm">Antes da execução, nossa equipe avalia as condições do local e informa qualquer custo adicional.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {VARIANT_FACTORS.map(({ icon: Icon, label }) => (
              <div key={label} className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-4 flex items-center gap-3">
                <Icon size={16} className="text-[#0057e7] flex-shrink-0" />
                <span className="text-xs font-semibold text-[#3a4a5e] leading-snug">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <SectionLabel>Processo</SectionLabel>
          <H2 className="mb-10">Como funciona</H2>
          <div className="relative">
            <div className="hidden lg:block absolute top-7 left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] h-px bg-[#0057e7]/20 z-0" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <div className="w-14 h-14 bg-[#0057e7] rounded-xl flex items-center justify-center shadow-md shadow-[#0057e7]/25"><span className="text-white font-black text-sm">{s.n}</span></div>
                  <p className="font-bold text-[#0d1b2e]">{s.title}</p>
                  <p className="text-sm text-[#5a6a82] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <SectionLabel>Dúvidas</SectionLabel>
          <H2 className="mb-8">Dúvidas frequentes</H2>
          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <div key={i} className="border border-[#0d1b2e]/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-white hover:bg-[#f5f7fa] transition-colors"
                >
                  <span className="font-semibold text-[#0d1b2e] text-sm">{f.q}</span>
                  <ChevronDown size={16} className={`text-[#0057e7] flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 pt-0 bg-white">
                    <p className="text-sm text-[#5a6a82] leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa instalar seu ar-condicionado?</h2>
          <p className="text-white/80 text-lg mb-10">Informe os detalhes do seu equipamento e receba orientação da nossa equipe.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <button className="bg-[#25d366] text-white font-bold rounded-md px-7 py-3 text-base hover:bg-[#1db954] transition-colors flex items-center gap-2"><MessageCircle size={18} /> Falar pelo WhatsApp</button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Sobre Nós Page ─── */
function SobrePage({ setPage }: { setPage: (p: Page) => void }) {
  const WHAT_WE_DO = [
    { icon: ShoppingCart, label: "Loja de produtos", desc: "Eletrônicos, eletrodomésticos e acessórios." },
    { icon: Plug, label: "Instalações", desc: "TVs, ar-condicionado e equipamentos." },
    { icon: Wrench, label: "Manutenção", desc: "Preventiva e corretiva para seus equipamentos." },
    { icon: Zap, label: "Assistência técnica", desc: "Diagnóstico e reparo especializado." },
    { icon: Monitor, label: "Diagnóstico", desc: "Identificação de falhas e soluções." },
    { icon: Settings, label: "Suporte técnico", desc: "Configuração e orientação ao cliente." },
  ];
  const WHY_US = [
    { icon: Users, label: "Atendimento próximo", desc: "Equipe local, focada em você." },
    { icon: Shield, label: "Transparência", desc: "Orçamento antes de qualquer execução." },
    { icon: Star, label: "Conhecimento técnico", desc: "Experiência em eletrônicos e instalações." },
    { icon: Layers, label: "Variedade de soluções", desc: "Loja, serviços e assistência em um só lugar." },
    { icon: CheckCircle, label: "Orçamento prévio", desc: "Você aprova antes de realizarmos o serviço." },
  ];

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Eletrônica Artvideo</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Tecnologia, experiência e atendimento próximo.
          </h1>
          <p className="text-white/70 text-lg leading-relaxed">
            A Eletrônica Artvideo atua com produtos, serviços, instalações, manutenção e assistência técnica, oferecendo soluções para equipamentos eletrônicos em Aracaju e região.
          </p>
        </div>
      </section>

      {/* Quem somos */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel>Quem somos</SectionLabel>
            <H2 className="mb-5">Uma empresa completa para suas necessidades</H2>
            <p className="text-[#5a6a82] leading-relaxed mb-4">
              A Artvideo reúne loja de produtos, serviços de instalação, manutenção e assistência técnica em um único lugar. Atendemos pessoas físicas e empresas que buscam soluções para seus equipamentos eletrônicos em Aracaju e região.
            </p>
            <p className="text-[#5a6a82] leading-relaxed">
              Nossa proposta é simples: oferecer atendimento próximo, técnico e transparente, para que o cliente saiba exatamente o que está contratando.
            </p>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-[#0d1b2e]/10">
            <img src="https://images.unsplash.com/photo-1761494296583-99b15e9063c5?w=800&h=500&fit=crop&auto=format" alt="Loja Eletrônica Artvideo" className="w-full h-64 sm:h-80 object-cover" />
          </div>
        </div>
      </section>

      {/* O que fazemos */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atuação</SectionLabel>
          <H2 className="mb-10">O que fazemos</H2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHAT_WE_DO.map((w) => {
              const Icon = w.icon;
              return (
                <div key={w.label} className="bg-white rounded-xl p-6 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all">
                  <div className="w-10 h-10 bg-[#0057e7]/10 rounded-lg flex items-center justify-center mb-4"><Icon size={20} className="text-[#0057e7]" /></div>
                  <h3 className="font-bold text-[#0d1b2e] mb-1">{w.label}</h3>
                  <p className="text-sm text-[#5a6a82]">{w.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Por que escolher */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div className="relative rounded-xl overflow-hidden border border-[#0d1b2e]/10">
            <img src="https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=800&h=500&fit=crop&auto=format" alt="Técnico Artvideo" className="w-full h-64 sm:h-80 object-cover" />
          </div>
          <div>
            <SectionLabel>Diferenciais</SectionLabel>
            <H2 className="mb-8">Por que escolher a Artvideo?</H2>
            <div className="space-y-4">
              {WHY_US.map((w) => {
                const Icon = w.icon;
                return (
                  <div key={w.label} className="flex items-start gap-4 bg-[#f5f7fa] rounded-xl p-4 border border-[#0d1b2e]/8">
                    <div className="w-9 h-9 bg-[#0057e7]/10 rounded-lg flex items-center justify-center flex-shrink-0"><Icon size={16} className="text-[#0057e7]" /></div>
                    <div>
                      <p className="font-bold text-[#0d1b2e] text-sm">{w.label}</p>
                      <p className="text-xs text-[#5a6a82]">{w.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de ajuda?</h2>
          <p className="text-white/80 text-lg mb-10">Fale com nossa equipe ou visite nossa loja.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => setPage("contato")} className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <button className="border-2 border-white text-white font-bold rounded-md px-7 py-3 text-base hover:bg-white/10 transition-colors">Visitar loja</button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Contato Page ─── */
function ContatoPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ nome: "", whatsapp: "", email: "", assunto: "", mensagem: "" });
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls = "w-full bg-[#f5f7fa] border border-[#0d1b2e]/15 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#0057e7] focus:border-transparent transition-all";

  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Contato</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Fale com a Eletrônica Artvideo
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
              <a href="https://wa.me/55" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-[#25d366] font-bold rounded-lg px-5 py-3 text-sm hover:bg-[#f0fff4] transition-colors">
                <MessageCircle size={16} /> Falar pelo WhatsApp
              </a>
            </div>

            {/* Info cards */}
            {[
              { icon: MessageCircle, label: "WhatsApp", value: "Número será preenchido posteriormente" },
              { icon: Phone, label: "Telefone", value: "Número será preenchido posteriormente" },
              { icon: Instagram, label: "Instagram", value: "@eletronica_artvideo" },
              { icon: MapPin, label: "Localização", value: "Aracaju — Sergipe" },
              { icon: Clock, label: "Horário de atendimento", value: "A preencher posteriormente" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white border border-[#0d1b2e]/10 rounded-xl px-5 py-4 flex items-center gap-4">
                <div className="w-9 h-9 bg-[#0057e7]/10 rounded-lg flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-[#0057e7]" /></div>
                <div>
                  <p className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-semibold text-[#0d1b2e]">{value}</p>
                </div>
              </div>
            ))}

            {/* Map placeholder */}
            <div>
              <h3 className="font-bold text-[#0d1b2e] mb-3">Onde estamos</h3>
              <div className="bg-white border border-[#0d1b2e]/10 rounded-xl h-48 flex flex-col items-center justify-center gap-2 text-[#5a6a82]">
                <MapPin size={28} className="text-[#0057e7]/40" />
                <p className="font-semibold text-sm">Aracaju — Sergipe</p>
                <p className="text-xs italic">Endereço completo será inserido posteriormente</p>
              </div>
            </div>
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
                    <input className={inputCls} placeholder="(79) 9 9999-9999" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
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

/* ─── CepChecker (reusable) ─── */
function CepChecker() {
  const [cep, setCep] = useState("");
  const [status, setStatus] = useState<"idle" | "available" | "unavailable">("idle");

  const fmt = (v: string) => v.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9);

  const check = () => {
    if (cep.replace(/\D/g, "").length < 8) return;
    // placeholder — integrate real CEP API here
    setStatus("available");
  };

  return (
    <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-5">
      <p className="font-bold text-[#0d1b2e] text-sm mb-1">Verifique a disponibilidade na sua região</p>
      <p className="text-xs text-[#5a6a82] mb-4">Informe seu CEP para verificarmos a disponibilidade deste serviço no seu endereço.</p>
      {status === "idle" && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-white border border-[#0d1b2e]/15 rounded-lg px-4 py-2.5 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#0057e7]"
            placeholder="00000-000"
            value={cep}
            maxLength={9}
            onChange={(e) => { setCep(fmt(e.target.value)); setStatus("idle"); }}
          />
          <Btn variant="primary" className="text-xs px-4 py-2.5 whitespace-nowrap" onClick={check}>
            Verificar disponibilidade
          </Btn>
        </div>
      )}
      {status === "available" && (
        <div className="flex items-center gap-2 text-sm font-semibold text-[#16a34a] bg-[#f0fdf4] border border-[#16a34a]/20 rounded-lg px-4 py-3">
          <CheckCircle size={16} /> Serviço disponível para este CEP.
          <button onClick={() => { setStatus("idle"); setCep(""); }} className="ml-auto text-xs text-[#5a6a82] font-normal hover:underline">Alterar</button>
        </div>
      )}
      {status === "unavailable" && (
        <div className="flex items-center gap-2 text-sm font-semibold text-[#dc2626] bg-[#fef2f2] border border-[#dc2626]/20 rounded-lg px-4 py-3">
          <X size={16} /> Infelizmente, este serviço ainda não está disponível para este CEP.
          <button onClick={() => { setStatus("idle"); setCep(""); }} className="ml-auto text-xs text-[#5a6a82] font-normal hover:underline">Tentar outro</button>
        </div>
      )}
    </div>
  );
}

/* ─── Orçamento Page ─── */
const SVC_OPTIONS = [
  "Instalação de ar-condicionado", "Higienização de ar-condicionado", "Manutenção de ar-condicionado",
  "Instalação de TV", "Configuração de TV", "Suporte técnico para TV", "Diagnóstico e reparo de TV",
  "Manutenção de eletrodomésticos", "Diagnóstico de eletrodomésticos", "Reparo eletrônico",
  "Diagnóstico eletrônico", "Reparo de placas", "Manutenção de computadores",
  "Manutenção de notebooks", "Configuração de equipamentos", "Outro serviço",
];
const MARCAS_OPTIONS = ["AOC", "Britânia", "Electrolux", "Genis Fitness", "LG", "Panasonic", "Philco", "Philips", "Semp", "TCL", "Walita", "Samsung", "Outra marca"];

function OrcamentoPage() {
  const [f, setF] = useState({ servico: "", marca: "", outraMarca: "", modelo: "", descricao: "", cep: "", nome: "", whatsapp: "", email: "" });
  const [sent, setSent] = useState(false);
  const up = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const fmtCep = (v: string) => v.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9);

  const inputCls = "w-full bg-[#f5f7fa] border border-[#0d1b2e]/15 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#0057e7] transition-all";
  const selectCls = inputCls + " cursor-pointer";

  if (sent) return (
    <>
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-16 h-16 bg-[#0057e7] rounded-2xl flex items-center justify-center mx-auto mb-6"><CheckCircle size={32} className="text-white" /></div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Solicitação enviada!</h1>
          <p className="text-white/70 text-base mb-8">Nossa equipe entrará em contato para avaliar sua solicitação.</p>
          <Btn variant="primary" className="px-7 py-3 text-base" onClick={() => setSent(false)}>Nova solicitação</Btn>
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
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>

            {/* 1 — Serviço */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-4 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">1</span>
                Sobre o serviço
              </h2>
              <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Selecione o serviço *</label>
              <select className={selectCls} value={f.servico} onChange={e => up("servico", e.target.value)} required>
                <option value="">Escolha um serviço...</option>
                {SVC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
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
                    {MARCAS_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
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

            {/* 3 — CEP */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-4 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">3</span>
                Local do serviço
              </h2>
              <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">CEP *</label>
              <input className={inputCls} placeholder="00000-000" value={f.cep} onChange={e => up("cep", fmtCep(e.target.value))} required />
              <p className="text-xs text-[#5a6a82] mt-2">Utilizaremos o CEP para verificar a disponibilidade do serviço na sua região.</p>
            </div>

            {/* 4 — Dados */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6 space-y-4">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-1 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#0057e7] rounded-md flex items-center justify-center text-white text-xs font-black">4</span>
                Seus dados
              </h2>
              {/* WhatsApp em destaque */}
              <div className="bg-[#f0fdf4] border-2 border-[#25d366]/40 rounded-xl p-4">
                <label className="text-xs font-black text-[#16a34a] uppercase tracking-wide block mb-1.5 flex items-center gap-1"><MessageCircle size={12} /> WhatsApp * — principal canal de contato</label>
                <input className="w-full bg-white border border-[#25d366]/40 rounded-lg px-4 py-3 text-sm text-[#0d1b2e] outline-none focus:ring-2 focus:ring-[#25d366] transition-all" placeholder="(79) 9 9999-9999" value={f.whatsapp} onChange={e => up("whatsapp", e.target.value)} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Nome completo *</label>
                  <input className={inputCls} placeholder="Seu nome" value={f.nome} onChange={e => up("nome", e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">E-mail</label>
                  <input type="email" className={inputCls} placeholder="seu@email.com" value={f.email} onChange={e => up("email", e.target.value)} />
                </div>
              </div>
            </div>

            {/* 5 — Fotos */}
            <div className="bg-white rounded-2xl border border-[#0d1b2e]/10 p-6">
              <h2 className="text-lg font-black text-[#0d1b2e] mb-1 flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span className="w-6 h-6 bg-[#eef1f6] rounded-md flex items-center justify-center text-[#5a6a82] text-xs font-black">5</span>
                Fotos do equipamento <span className="text-xs font-normal text-[#5a6a82] normal-case" style={{ fontFamily: "'Inter', sans-serif" }}>(opcional)</span>
              </h2>
              <p className="text-xs text-[#5a6a82] mb-4">Se quiser, envie fotos do equipamento ou do local para ajudar nossa equipe a entender melhor o serviço.</p>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="aspect-square border-2 border-dashed border-[#0d1b2e]/20 rounded-xl flex flex-col items-center justify-center gap-1 text-[#5a6a82] hover:border-[#0057e7]/50 hover:bg-[#f5f7fa] transition-colors cursor-pointer">
                    <Package size={20} className="text-[#0057e7]/40" />
                    <span className="text-xs">Adicionar foto</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 6 — Resumo */}
            <div className="bg-[#0d1b2e] rounded-2xl p-6">
              <h2 className="text-lg font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Revise sua solicitação</h2>
              <div className="space-y-2">
                {[
                  { label: "Serviço", val: f.servico || "—" },
                  { label: "Marca", val: f.marca === "Outra marca" ? f.outraMarca || "Outra marca" : f.marca || "—" },
                  { label: "Modelo", val: f.modelo || "—" },
                  { label: "CEP", val: f.cep || "—" },
                  { label: "Descrição", val: f.descricao ? f.descricao.slice(0, 80) + (f.descricao.length > 80 ? "…" : "") : "—" },
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
              <Btn variant="primary" className="w-full py-4 text-base" onClick={() => {}}>Solicitar orçamento</Btn>
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

/* ─── Assistência Técnica Page ─── */
const ASSIST_CARDS = [
  { icon: Tv, title: "TVs", desc: "Diagnóstico e reparo de televisores de diversas marcas e modelos." },
  { icon: Monitor, title: "Computadores e notebooks", desc: "Manutenção, diagnóstico e reparo em desktops e notebooks." },
  { icon: Package, title: "Eletrodomésticos", desc: "Avaliação e reparo de eletrodomésticos da linha branca." },
  { icon: Cpu, title: "Eletrônicos", desc: "Diagnóstico e manutenção de equipamentos eletrônicos gerais." },
  { icon: Zap, title: "Placas e componentes", desc: "Reparo de placas eletrônicas e componentes especializados." },
];
const ASSIST_STEPS = [
  { n: "01", title: "Solicitação", desc: "Você informa o equipamento e o problema." },
  { n: "02", title: "Diagnóstico", desc: "Nossa equipe avalia o equipamento." },
  { n: "03", title: "Orçamento", desc: "Você recebe as informações antes da execução." },
  { n: "04", title: "Reparo", desc: "Após aprovação, realizamos o serviço." },
];

function AssistenciaPage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <>
      {/* Hero */}
      <section className="bg-[#0d1b2e] py-12 sm:py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionLabel light>Assistência Técnica Artvideo</SectionLabel>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Seu equipamento precisa de atenção?
            </h1>
            <p className="text-white/70 text-base leading-relaxed mb-8">Conte com nossa equipe para diagnóstico, manutenção e reparo de equipamentos eletrônicos.</p>
            <div className="flex flex-wrap gap-3">
              <Btn variant="primary" className="px-6 py-3 text-base" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn>
              <Btn variant="whatsapp" className="px-6 py-3 text-base"><MessageCircle size={16} /> Falar pelo WhatsApp</Btn>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#0057e7]/20 rounded-2xl blur-2xl" />
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1550041473-d296a3a8a18a?w=800&h=520&fit=crop&auto=format" alt="Bancada de assistência técnica" className="w-full h-64 sm:h-80 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* O que atendemos */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Atendimento</SectionLabel>
          <H2 className="mb-10">O que atendemos</H2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ASSIST_CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="bg-white rounded-xl p-6 border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all group">
                  <div className="w-10 h-10 bg-[#0057e7]/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#0057e7]/20 transition-colors">
                    <Icon size={20} className="text-[#0057e7]" />
                  </div>
                  <h3 className="font-bold text-[#0d1b2e] mb-2">{c.title}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed mb-4">{c.desc}</p>
                  <button onClick={() => setPage("servicos")} className="flex items-center gap-1 text-sm font-semibold text-[#0057e7] hover:gap-2 transition-all">
                    Ver serviços <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Marcas autorizadas */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Parceiros</SectionLabel>
          <H2 className="mb-2">Marcas autorizadas</H2>
          <p className="text-[#5a6a82] mb-10">Confira algumas das marcas atendidas pela nossa assistência técnica.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {BRANDS.map((b) => (
              <div key={b} className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-5 flex flex-col items-center gap-3 hover:border-[#0057e7]/40 hover:shadow-sm transition-all">
                <div className="w-14 h-14 bg-white rounded-xl border border-[#0d1b2e]/10 flex items-center justify-center">
                  <span className="text-xs font-black text-[#0057e7] tracking-wide text-center leading-tight px-1">{b}</span>
                </div>
                <span className="text-sm font-bold text-[#0d1b2e]">{b}</span>
                <span className="text-xs text-[#5a6a82] italic">logo a inserir</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-14 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Processo</SectionLabel>
          <H2 className="mb-10">Como funciona</H2>
          <div className="relative">
            <div className="hidden lg:block absolute top-8 left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] h-px bg-[#0057e7]/30 z-0" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {ASSIST_STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <div className="w-14 h-14 bg-[#0057e7] rounded-xl flex items-center justify-center shadow-md shadow-[#0057e7]/30"><span className="text-white font-black text-sm">{s.n}</span></div>
                  <h3 className="font-bold text-[#0d1b2e] text-lg">{s.title}</h3>
                  <p className="text-sm text-[#5a6a82] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0057e7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa de assistência?</h2>
          <p className="text-white/80 text-lg mb-10">Solicite um orçamento e conte para nossa equipe o que aconteceu com seu equipamento.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => setPage("orcamento")} className="bg-white text-[#0057e7] font-bold rounded-md px-7 py-3 text-base hover:bg-[#f0f6ff] transition-colors">Solicitar orçamento</button>
            <button className="bg-[#25d366] text-white font-bold rounded-md px-7 py-3 text-base hover:bg-[#1db954] transition-colors flex items-center gap-2"><MessageCircle size={18} /> Falar pelo WhatsApp</button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── App ─── */
export default function App() {
  const [page, setPageState] = useState<Page>("home");
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname;
      if (path.startsWith("/admin")) {
        setIsAdminRoute(true);
      } else {
        setIsAdminRoute(false);
      }
    };
    handleLocation();
    window.addEventListener("popstate", handleLocation);
    return () => window.removeEventListener("popstate", handleLocation);
  }, []);

  const setPage = (p: Page) => {
    setIsAdminRoute(false);
    setPageState(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AuthProvider>
      <AppContent
        isAdminRoute={isAdminRoute}
        page={page}
        setPage={setPage}
        setIsAdminRoute={setIsAdminRoute}
      />
    </AuthProvider>
  );
}

function AppContent({
  isAdminRoute,
  page,
  setPage,
  setIsAdminRoute,
}: {
  isAdminRoute: boolean;
  page: Page;
  setPage: (p: Page) => void;
  setIsAdminRoute: (val: boolean) => void;
}) {
  const { session, loading } = useAuth();

  if (isAdminRoute) {
    if (loading) {
      return (
        <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center text-white font-bold text-sm">
          Carregando painel...
        </div>
      );
    }
    if (!session) {
      return <AdminLogin onLoginSuccess={() => setIsAdminRoute(true)} />;
    }
    return <AdminDashboard onBackToSite={() => { window.history.pushState({}, "", "/"); setIsAdminRoute(false); }} />;
  }

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Header cur={page} setPage={setPage} />
      <main>
        {page === "home" && <HomePage setPage={setPage} />}
        {page === "servicos" && <ServicosPage setPage={setPage} />}
        {page === "servico-ac" && <ServicoACPage setPage={setPage} />}
        {page === "sobre" && <SobrePage setPage={setPage} />}
        {page === "contato" && <ContatoPage />}
        {page === "orcamento" && <OrcamentoPage />}
        {page === "assistencia" && <AssistenciaPage setPage={setPage} />}
      </main>
      <Footer setPage={setPage} />
      <WhatsAppFloat />
    </div>
  );
}
