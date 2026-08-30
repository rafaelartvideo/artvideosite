import { lazy, Suspense, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useServices, useServiceCategories, useFeaturedProducts, useBrands, useServiceDetailBySlug, useProductDetailBySlug, useSiteSettings, useProducts } from "@/lib/hooks";
const AdminLogin = lazy(() =>
  import("@/app/Admin").then(({ AdminLogin }) => ({ default: AdminLogin })),
);
const AdminDashboard = lazy(() =>
  import("@/app/Admin").then(({ AdminDashboard }) => ({ default: AdminDashboard })),
);
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress } from "@/lib/address";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { formatPhone } from "@/app/admin/shared";
import logoIcon from "@/imports/ChatGPT_Image_12_de_ago._de_2026__08_15_02.png";
import { getBusinessHours, getSettingText } from "@/features/public-shell/application/site-settings";
import type { PublicPage as Page } from "@/features/public-shell/domain/navigation";
import { PublicShell, WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import {
  Tv, Wind, Monitor, Headphones, Cpu, Plug,
  Package, Gamepad2, Wrench, Settings, ArrowRight, Phone, Instagram,
  ChevronRight, Zap, CheckCircle, ChevronDown, Search,
  MapPin, Mail, Clock, Star, Shield, Users, Layers, AlertCircle,
} from "lucide-react";

/* ─── Constants (UI-only, not content) ─── */
const HOME_STEPS = [
  { n: "01", title: "Solicite", desc: "Conte o que aconteceu com seu equipamento." },
  { n: "02", title: "Avaliamos", desc: "Nossa equipe analisa o problema." },
  { n: "03", title: "Orçamento", desc: "Você recebe as informações antes do serviço." },
  { n: "04", title: "Reparo", desc: "Após aprovação, realizamos o serviço." },
];
const ASSIST_CATS = ["TVs", "Computadores", "Eletrodomésticos", "Videogames", "Eletrônicos"];

/* ─── shared components ─── */
function inlineMediaUrl(media: { bucket_id?: string | null; bucket_name?: string | null; storage_path: string } | null | undefined): string | null {
  const bucketName = media?.bucket_id ?? media?.bucket_name;
  if (!bucketName || !media?.storage_path) return null;
  const { data } = supabase.storage.from(bucketName).getPublicUrl(media.storage_path);
  return data.publicUrl;
}

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
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, os_number, tracking_token, customer_id, service_id, status_id, created_at, updated_at, customer_notes, internal_notes, customer:customers(full_name), order_status:order_statuses(name)")
        .or(`os_number.eq.${cleanOs},tracking_token.eq.${cleanOs}`)
        .maybeSingle();

      if (error) {
        // If query fails or format is invalid UUID/id
        console.error("Error fetching order:", error);
        setErrorMsg("Não foi possível localizar a OS informada. Verifique o número e tente novamente.");
      } else if (data) {
        const { data: history, error: historyError } = await supabase
          .from("service_order_status_history")
          .select("created_at, notes, order_status:order_statuses(name)")
          .eq("service_order_id", data.id)
          .eq("is_visible_to_customer", true)
          .order("created_at", { ascending: true });
        if (historyError) throw historyError;
        setOrder({ ...data, status: (data.order_status as any)?.name || "Em andamento", history: history || [] });
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
                <span className="font-bold text-[#0d1b2e]">{order.title || order.description || "Assistência Técnica / Manutenção"}</span>
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
            {order.history?.some((entry: any) => entry.notes) && (
              <div className="pt-6">
                <h4 className="text-sm font-bold text-[#0d1b2e] uppercase tracking-wide mb-2">Observações ao cliente</h4>
                <div className="bg-white border border-[#0d1b2e]/10 rounded-lg p-4 text-xs text-[#3a4a5e] leading-relaxed">
                  {order.history.filter((entry: any) => entry.notes).map((entry: any) => <p key={entry.created_at} className="mb-2 last:mb-0">{entry.notes}</p>)}
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
function HomePage({ setPage, onSelectService, onSelectProduct }: { setPage: (p: Page) => void; onSelectService: (slug: string) => void; onSelectProduct: (slug: string) => void }) {
  // Buscar dados reais do Supabase
  const { products: featuredProducts, loading: productsLoading } = useFeaturedProducts();
  const { brands, loading: brandsLoading } = useBrands();
  const { services, loading: servicesLoading } = useServices();

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

      {/* Loja */}
      <section className="py-16 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionLabel>Destaques</SectionLabel>
          <div className="flex items-end justify-between mb-6 gap-4">
            <H2>Destaques da loja</H2>
            <Btn variant="ghost" className="flex-shrink-0">Ver todos <ArrowRight size={15} /></Btn>
          </div>
          {productsLoading ? (
            <div className="text-center py-12 text-[#5a6a82]">Carregando produtos...</div>
          ) : featuredProducts.length === 0 ? (
            <div className="text-center py-12 text-[#5a6a82]">Nenhum produto em destaque no momento.</div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {featuredProducts.slice(0, 6).map((p) => (
                  <ProductCard key={p.id} product={p} onSelectProduct={onSelectProduct} />
                ))}
              </div>
              <div className="mt-8 text-center"><button type="button" onClick={() => setPage("loja")} className="inline-flex items-center justify-center gap-2 font-semibold rounded-md px-8 py-3 text-base bg-[#0057e7] text-white hover:bg-[#0046c0] active:scale-[0.98] transition-all">Ver todos os produtos</button></div>
            </>
          )}
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
          {servicesLoading ? <div className="text-center py-10 text-[#5a6a82]">Carregando serviços...</div> : services.length > 0 && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{services.slice(0, 6).map((service) => <ServiceCard key={service.id} service={service} onSelectService={onSelectService} />)}</div>}
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
          {brandsLoading ? (
            <div className="text-center py-6 text-[#5a6a82]">Carregando marcas...</div>
          ) : brands.length === 0 ? (
            <div className="text-center py-6 text-[#5a6a82]">Nenhuma marca cadastrada no momento.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {brands.map((b) => (
                <BrandCard key={b.id} brand={b} />
              ))}
            </div>
          )}
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

/* ─── Brand Card Component ─── */
function BrandCard({ brand }: { brand: any }) {
  const logoUrl = inlineMediaUrl(brand.logo_media);

  return (
    <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-lg h-14 flex items-center justify-center hover:border-[#0057e7]/40 transition-colors group">
      {logoUrl ? (
        <img src={logoUrl} alt={brand.name} className="max-h-10 max-w-[90%] object-contain" />
      ) : (
        <span className="text-xs font-bold text-[#5a6a82]">{brand.name}</span>
      )}
    </div>
  );
}

/* ─── Product Card Component ─── */
function ProductCard({ product, onSelectProduct }: { product: any; onSelectProduct: (slug: string) => void }) {
  const imageUrl = inlineMediaUrl(product.cover_media);

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-[#0d1b2e]/10 shadow-sm hover:shadow-md transition-shadow group">
      <div className="bg-[#f5f7fa] h-44 overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#5a6a82]"><Package size={32} /></div>
        )}
      </div>
      <div className="p-4">
        <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wide">Produto</span>
        <h3 className="font-semibold text-[#0d1b2e] mt-1 mb-3 text-sm leading-snug">{product.name}</h3>
        <div className="flex items-center justify-between">
          <span className="text-lg font-black text-[#0d1b2e]">{product.price != null ? `R$ ${Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte"}</span>
          <button type="button" onClick={() => onSelectProduct(product.slug)} className="inline-flex items-center justify-center gap-2 font-semibold rounded-md px-3 py-1.5 text-xs border-2 border-[#0057e7] text-[#0057e7] hover:bg-[#0057e7] hover:text-white active:scale-[0.98] transition-all">Ver produto</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Service Card Component ─── */
function ServiceCard({ service, onSelectService }: { service: any; onSelectService: (slug: string) => void }) {
  const imageUrl = inlineMediaUrl(service.cover_media);
  const cardPrice = service.price_mode === "HIDDEN" ? null : service.price_mode === "STARTING_FROM" && service.base_price ? `A partir de R$ ${Number(service.base_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : service.price_mode === "FIXED" && service.base_price ? `R$ ${Number(service.base_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte o valor";

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all group">
      <div className="h-40 overflow-hidden bg-[#e8eef8]">
        {imageUrl ? (
          <img src={imageUrl} alt={service.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#5a6a82]"><Package size={32} /></div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2">
        <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wide">Serviço</span>
        <h3 className="font-bold text-[#0d1b2e] text-sm leading-snug">{service.title}</h3>
        <p className="text-xs text-[#5a6a82] leading-relaxed flex-1">{service.short_description || service.description}</p>
        <div className="flex items-center justify-between pt-2 border-t border-[#0d1b2e]/8 mt-1">
          {cardPrice && <span className="text-xs font-semibold text-[#5a6a82]">{cardPrice}</span>}
          <button
            onClick={() => onSelectService(service.slug)}
            className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:gap-2 transition-all"
          >
            Ver detalhes <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Serviços Page ─── */
function ServicosPage({ setPage, onSelectService }: { setPage: (p: Page) => void; onSelectService: (slug: string) => void }) {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");

  // Buscar dados do Supabase
  const { services, loading: servicesLoading } = useServices();
  const { categories, loading: categoriesLoading } = useServiceCategories();

  // Filtrar serviços por categoria e busca
  const filtered = services.filter((s) => {
    const category = categories.find((c) => c.id === s.category_id);
    const categoryName = category?.name || "Sem categoria";
    const matchCat = filter === "Todos" || categoryName === filter;
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.short_description?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      categoryName.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Agrupar por categoria
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach((s) => {
    const category = categories.find((c) => c.id === s.category_id);
    const categoryName = category?.name || "Sem categoria";
    if (!grouped[categoryName]) grouped[categoryName] = [];
    grouped[categoryName].push(s);
  });

  const categoryLabels = ["Todos", ...Array.from(new Set(categories.map((c) => c.name)))];

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
          {categoryLabels.map((f, i) => (
            <button key={`filter-${i}-${f}`} onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-all whitespace-nowrap flex-shrink-0 ${filter === f ? "bg-[#0057e7] border-[#0057e7] text-white" : "bg-[#f5f7fa] border-[#0d1b2e]/15 text-[#0d1b2e] hover:border-[#0057e7]/50"}`}>
              {f}
            </button>
          ))}
        </div>
      </section>

      {/* services grid */}
      <section className="py-12 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          {servicesLoading ? (
            <div className="text-center py-20 text-[#5a6a82]">Carregando serviços...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-20 text-[#5a6a82]">
              {search ? `Nenhum serviço encontrado para "${search}".` : "Nenhum serviço disponível."}
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items], i) => (
              <div key={`group-${i}-${cat}`}>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-[#0057e7] font-bold">◆</span>
                  <h2 className="text-xs font-black tracking-widest uppercase text-[#0057e7]">{cat}</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {items.map((s) => (
                    <ServiceCard key={s.id} service={s} onSelectService={onSelectService} />
                  ))}
                </div>
              </div>
            ))
          )}
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

function LojaPage({ setPage, onSelectProduct }: { setPage: (p: Page) => void; onSelectProduct: (slug: string) => void }) {
  const { products, loading } = useProducts();

  return (
    <>
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Loja Artvideo</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Produtos e eletrônicos para sua casa e seu trabalho
          </h1>
          <p className="text-white/70 text-lg mb-8 max-w-2xl mx-auto">Confira os produtos disponíveis em nossa loja com atendimento técnico e suporte especializado.</p>
        </div>
      </section>

      <section className="py-12 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="text-center py-20 text-[#5a6a82]">Carregando produtos...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-[#5a6a82]">Nenhum produto disponível no momento.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ProdutoDetalhePage({ slug, setPage }: { slug: string | null; setPage: (p: Page) => void }) {
  const { detail, loading, error } = useProductDetailBySlug(slug);
  const imageUrl = inlineMediaUrl(detail?.media);

  if (loading) return <div className="min-h-[55vh] flex items-center justify-center text-[#5a6a82] text-sm"><Clock size={20} className="animate-spin mr-2 text-[#0057e7]" /> Carregando produto...</div>;
  if (error) return <section className="py-20 bg-[#f5f7fa]"><div className="max-w-xl mx-auto px-4 text-center"><AlertCircle size={34} className="mx-auto mb-4 text-red-500" /><H2 className="mb-3">Não foi possível carregar este produto</H2><p className="text-sm text-[#5a6a82] mb-6">{error}</p><Btn onClick={() => setPage("loja")}>Voltar para a loja</Btn></div></section>;
  if (!detail) return <section className="py-20 bg-[#f5f7fa]"><div className="max-w-xl mx-auto px-4 text-center"><Package size={34} className="mx-auto mb-4 text-[#0057e7]" /><H2 className="mb-3">Produto não encontrado</H2><p className="text-sm text-[#5a6a82] mb-6">O produto solicitado não existe ou não está disponível no momento.</p><Btn onClick={() => setPage("loja")}>Ver produtos disponíveis</Btn></div></section>;

  const { product, brand } = detail;
  const priceLabel = product.price != null ? `R$ ${Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte o valor";

  return (
    <>
      <div className="bg-white border-b border-[#0d1b2e]/10"><div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-xs text-[#5a6a82]"><button onClick={() => setPage("home")} className="hover:text-[#0057e7]">Início</button><ChevronRight size={12} /><button onClick={() => setPage("loja")} className="hover:text-[#0057e7]">Loja</button><ChevronRight size={12} /><span className="font-medium text-[#0d1b2e] truncate">{product.name}</span></div></div>
      <section className="bg-[#f5f7fa] py-12 sm:py-16"><div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-start"><div className="rounded-2xl overflow-hidden border border-[#0d1b2e]/10 bg-white p-3"><div className="bg-[#f5f7fa] rounded-xl overflow-hidden h-[420px]">{imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#5a6a82]"><Package size={40} /></div>}</div></div><div><SectionLabel>Produto</SectionLabel><h1 className="text-4xl sm:text-5xl font-black text-[#0d1b2e] leading-tight mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{product.name}</h1>{brand?.name && <p className="text-sm text-[#5a6a82] mb-3">Marca: {brand.name}</p>}<p className="text-3xl font-black text-[#0057e7] mb-6">{priceLabel}</p>{product.short_description && <p className="text-[#5a6a82] leading-relaxed mb-6">{product.short_description}</p>}<div className="flex flex-wrap gap-3"><Btn variant="primary" className="px-6 py-3 text-base" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn><WhatsAppAction className="px-6 py-3 text-base" /></div></div></div></section>
      {(product.description || product.sku) && <section className="py-14 bg-white"><div className="max-w-5xl mx-auto px-4 sm:px-6"><SectionLabel>Detalhes</SectionLabel><H2 className="mb-5">Informações do produto</H2>{product.sku && <p className="text-sm text-[#5a6a82] mb-4"><span className="font-bold text-[#0d1b2e]">SKU:</span> {product.sku}</p>}{product.description && <p className="text-sm text-[#5a6a82] leading-relaxed whitespace-pre-line">{product.description}</p>}</div></section>}
      <section className="py-20 bg-[#0057e7]"><div className="max-w-3xl mx-auto px-4 text-center"><h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Quer saber mais sobre este produto?</h2><div className="flex flex-wrap justify-center gap-4"><Btn className="bg-white text-[#0057e7] hover:bg-[#f0f6ff]" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn><WhatsAppAction /></div></div></section>
    </>
  );
}

function ServicoDetalhePage({ slug, setPage }: { slug: string | null; setPage: (p: Page) => void }) {
  const { detail, loading, error } = useServiceDetailBySlug(slug);
  const imageUrl = inlineMediaUrl(detail?.media);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  if (loading) return <div className="min-h-[55vh] flex items-center justify-center text-[#5a6a82] text-sm"><Clock size={20} className="animate-spin mr-2 text-[#0057e7]" /> Carregando serviço...</div>;
  if (error) return <section className="py-20 bg-[#f5f7fa]"><div className="max-w-xl mx-auto px-4 text-center"><AlertCircle size={34} className="mx-auto mb-4 text-red-500" /><H2 className="mb-3">Não foi possível carregar este serviço</H2><p className="text-sm text-[#5a6a82] mb-6">{error}</p><Btn onClick={() => setPage("servicos")}>Voltar para serviços</Btn></div></section>;
  if (!detail) return <section className="py-20 bg-[#f5f7fa]"><div className="max-w-xl mx-auto px-4 text-center"><Package size={34} className="mx-auto mb-4 text-[#0057e7]" /><H2 className="mb-3">Serviço não encontrado</H2><p className="text-sm text-[#5a6a82] mb-6">O serviço solicitado não existe ou não está disponível no momento.</p><Btn onClick={() => setPage("servicos")}>Ver serviços disponíveis</Btn></div></section>;

  const { service, category, brand, product, variants, inclusions, exclusions, priceFactors, faqs, sections, filters } = detail;
  const formattedBasePrice = service.base_price ? `R$ ${Number(service.base_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null;
  const priceLabel = service.price_mode === "HIDDEN" ? null : service.price_mode === "STARTING_FROM" && formattedBasePrice ? `A partir de ${formattedBasePrice}` : service.price_mode === "FIXED" && formattedBasePrice ? formattedBasePrice : "Consulte o valor";

  return <>
    <div className="bg-white border-b border-[#0d1b2e]/10"><div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-xs text-[#5a6a82]"><button onClick={() => setPage("home")} className="hover:text-[#0057e7]">Início</button><ChevronRight size={12} /><button onClick={() => setPage("servicos")} className="hover:text-[#0057e7]">Serviços</button><ChevronRight size={12} /><span className="font-medium text-[#0d1b2e] truncate">{service.title}</span></div></div>
    <section className="bg-[#0d1b2e] py-12 sm:py-16"><div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center"><div><SectionLabel light>{category?.name || "Serviço"}</SectionLabel><h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{service.title}</h1>{service.short_description && <p className="text-white/70 text-base leading-relaxed mb-5">{service.short_description}</p>}{priceLabel && <p className="text-2xl font-black text-white mb-6">{priceLabel}</p>}<div className="flex flex-wrap gap-3"><Btn onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn><WhatsAppAction /></div>{(brand?.name || product?.name) && <p className="text-xs text-white/60 mt-5">{brand?.name && `Marca: ${brand.name}`}{brand?.name && product?.name && " · "}{product?.name && `Produto: ${product.name}`}</p>}</div>{imageUrl && <div className="rounded-xl overflow-hidden border border-white/10"><img src={imageUrl} alt={service.title} className="w-full h-64 sm:h-80 object-cover" /></div>}</div></section>
    {(service.description || inclusions.length > 0 || exclusions.length > 0) && <section className="py-14 bg-[#f5f7fa]"><div className="max-w-5xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-10"><div>{service.description && <><SectionLabel>Sobre o serviço</SectionLabel><H2 className="mb-4">Sobre este serviço</H2><p className="text-sm text-[#5a6a82] leading-relaxed whitespace-pre-line">{service.description}</p></>}</div><div className="space-y-7">{inclusions.length > 0 && <div><SectionLabel>Incluso</SectionLabel><H2 className="mb-4">O que está incluso</H2><ul className="space-y-3">{inclusions.map((item: any) => <li key={item.id} className="flex gap-2 text-sm text-[#3a4a5e]"><CheckCircle size={16} className="text-[#0057e7] mt-0.5 shrink-0" />{item.description}</li>)}</ul></div>}{exclusions.length > 0 && <div><SectionLabel>Não incluso</SectionLabel><H2 className="mb-4">O que não está incluso</H2><ul className="space-y-3">{exclusions.map((item: any) => <li key={item.id} className="flex gap-2 text-sm text-[#3a4a5e]"><X size={16} className="text-red-500 mt-0.5 shrink-0" />{item.description}</li>)}</ul></div>}</div></div></section>}
    {variants.length > 0 && <section className="py-14 bg-white"><div className="max-w-5xl mx-auto px-4 sm:px-6"><SectionLabel>Variações</SectionLabel><H2 className="mb-8">Opções e valores</H2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{variants.map((variant: any) => <div key={variant.id} className="border border-[#0d1b2e]/10 rounded-xl p-5"><p className="font-bold text-[#0d1b2e]">{variant.title}</p>{variant.description && <p className="text-xs text-[#5a6a82] mt-2">{variant.description}</p>}<p className="text-lg font-black text-[#0057e7] mt-4">{variant.price ? `R$ ${Number(variant.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte"}</p></div>)}</div></div></section>}
    {priceFactors.length > 0 && <section className="py-14 bg-[#f5f7fa]"><div className="max-w-5xl mx-auto px-4 sm:px-6"><SectionLabel>Transparência</SectionLabel><H2 className="mb-8">O que pode alterar o valor?</H2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{priceFactors.map((factor: any) => <div key={factor.id} className="bg-white border border-[#0d1b2e]/10 rounded-xl p-4"><p className="font-bold text-[#0d1b2e] text-sm">{factor.name}</p>{factor.description && <p className="text-xs text-[#5a6a82] mt-1">{factor.description}</p>}</div>)}</div></div></section>}
    {filters.length > 0 && <section className="py-10 bg-white"><div className="max-w-5xl mx-auto px-4 sm:px-6"><SectionLabel>Características</SectionLabel><div className="flex flex-wrap gap-2">{filters.map((filter: any) => <span key={filter.id} className="bg-[#e8eef8] text-[#0d1b2e] text-xs font-semibold px-3 py-1.5 rounded-md">{filter.name || filter.value}</span>)}</div></div></section>}
    {sections.map((section: any) => <section key={section.id} className="py-14 bg-white"><div className="max-w-5xl mx-auto px-4 sm:px-6"><SectionLabel>Informações</SectionLabel><H2 className="mb-4">{section.title}</H2><p className="text-sm text-[#5a6a82] leading-relaxed whitespace-pre-line">{section.content}</p></div></section>)}
    {faqs.length > 0 && <section className="py-14 bg-white"><div className="max-w-3xl mx-auto px-4 sm:px-6"><SectionLabel>Dúvidas</SectionLabel><H2 className="mb-8">Dúvidas frequentes</H2><div className="space-y-3">{faqs.map((faq: any, index: number) => <div key={faq.id} className="border border-[#0d1b2e]/10 rounded-xl overflow-hidden"><button onClick={() => setOpenFaq(openFaq === index ? null : index)} className="w-full flex justify-between gap-4 px-5 py-4 text-left hover:bg-[#f5f7fa]"><span className="font-semibold text-sm text-[#0d1b2e]">{faq.question}</span><ChevronDown size={16} className={openFaq === index ? "rotate-180 text-[#0057e7]" : "text-[#0057e7]"} /></button>{openFaq === index && <p className="px-5 pb-4 text-sm text-[#5a6a82] leading-relaxed">{faq.answer}</p>}</div>)}</div></div></section>}
    <section className="py-16 bg-[#0057e7]"><div className="max-w-3xl mx-auto px-4 text-center"><h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Precisa deste serviço?</h2><div className="flex flex-wrap justify-center gap-4"><Btn className="bg-white text-[#0057e7] hover:bg-[#f0f6ff]" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn><WhatsAppAction /></div></div></section>
  </>;
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
              <WhatsAppAction className="px-6 py-3 text-base" />
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
            <WhatsAppAction className="px-7 py-3 text-base" />
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

function normalizeCpf(v: string) { return v.replace(/\D/g, ""); }
function formatCpf(v: string) {
  const d = normalizeCpf(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}
function normalizeCnpj(v: string) { return v.replace(/\D/g, ""); }
function formatCnpj(v: string) {
  const d = normalizeCnpj(v).slice(0, 14);
  return d.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}
function formatFoundationDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}
function foundationDateToIso(v: string) {
  const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}
function birthDateToIso(v: string) { return foundationDateToIso(v); }
function isValidBirthDate(v: string) {
  const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date <= today;
}
function validateCpf(cpf: string) {
  const d = normalizeCpf(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

function generateProtocol() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORC-${y}${m}${day}-${rand}`;
}

function OrcamentoPage() {
  const { services, loading: servicesLoading } = useServices();
  const { categories } = useServiceCategories();
  const { brands, loading: brandsLoading } = useBrands();
  const [f, setF] = useState({ customerType: "PF" as "PF" | "PJ", servico: "", marca: "", outraMarca: "", modelo: "", descricao: "", nome: "", cpf: "", tradeName: "", legalName: "", cnpj: "", stateRegistration: "", foundationDate: "", whatsapp: "", phone: "", birthDate: "", email: "" });
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
    const cpfRaw = normalizeCpf(f.cpf);
    const cnpjRaw = normalizeCnpj(f.cnpj);
    if (f.customerType === "PF" && cpfRaw.length === 0) {
      setSubmitError("Informe o CPF.");
      return;
    }
    if (f.customerType === "PF" && !validateCpf(cpfRaw)) {
      setSubmitError("CPF inválido. Verifique o número informado.");
      return;
    }
    if (f.customerType === "PJ" && !f.tradeName.trim()) { setSubmitError("Informe o nome fantasia."); return; }
    if (f.customerType === "PJ" && cnpjRaw.length !== 14) { setSubmitError("Informe um CNPJ válido."); return; }
    if (!f.whatsapp.trim()) { setSubmitError("Informe o telefone ou WhatsApp principal."); return; }
    if (f.customerType === "PF" && !isValidBirthDate(f.birthDate)) { setSubmitError("Informe uma data de nascimento válida e que não seja futura."); return; }

    setSubmitting(true);
    try {
      const newProtocol = generateProtocol();
      const brandNote = f.marca === "Outra marca" && f.outraMarca ? `Marca: ${f.outraMarca}` : null;
      const modelNote = f.modelo ? `Modelo: ${f.modelo}` : null;
      const extraNotes = [brandNote, modelNote].filter(Boolean).join(" | ");
      const fullMessage = [f.descricao, extraNotes].filter(Boolean).join("\n") || null;

      const { data, error } = await supabase.rpc("submit_public_quote_request", {
        p_customer_type:   f.customerType,
        p_full_name:        (f.customerType === "PJ" ? f.tradeName : f.nome).trim(),
        p_whatsapp:         f.whatsapp.replace(/\D/g, "") || null,
        p_phone:            f.phone.replace(/\D/g, "") || null,
        p_birth_date:       f.customerType === "PF" ? birthDateToIso(f.birthDate) : null,
        p_email:            f.email || null,
        p_document:         f.customerType === "PF" && cpfRaw.length === 11 ? cpfRaw : null,
        p_trade_name:       f.customerType === "PJ" ? f.tradeName.trim() : null,
        p_legal_name:       f.customerType === "PJ" ? f.legalName.trim() || null : null,
        p_cnpj:             f.customerType === "PJ" ? cnpjRaw : null,
        p_state_registration: f.customerType === "PJ" ? f.stateRegistration.trim() || null : null,
        p_foundation_date:  f.customerType === "PJ" ? foundationDateToIso(f.foundationDate) : null,
        p_service_id:       f.servico || null,
        p_brand_id:         f.marca && f.marca !== "Outra marca" ? f.marca : null,
        p_customer_message: fullMessage,
        p_protocol:         newProtocol,
        p_zip_code:         address.zip_code || null,
        p_street:           address.street || null,
        p_number:           address.number || null,
        p_complement:       address.complement || null,
        p_neighborhood:     address.neighborhood || null,
        p_city:             address.city || null,
        p_state:            address.state || null,
      });

      if (error) throw new Error(`Erro ao enviar solicitação: ${error.message}`);
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Erro ao processar solicitação.");

      setProtocol(newProtocol);
      setSent(true);
    } catch (err) {
      console.error("[PUBLIC] Quote request error:", err);
      setSubmitError(err instanceof Error ? err.message : "Erro ao enviar solicitação. Tente novamente.");
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
          <Btn variant="primary" className="px-7 py-3 text-base" onClick={() => { setSent(false); setProtocol(null); setF({ customerType: "PF", servico: "", marca: "", outraMarca: "", modelo: "", descricao: "", nome: "", cpf: "", tradeName: "", legalName: "", cnpj: "", stateRegistration: "", foundationDate: "", whatsapp: "", phone: "", birthDate: "", email: "" }); setAddress({ ...emptyAddress }); }}>Nova solicitação</Btn>
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
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Data de nascimento *</label><input className={inputCls} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10} value={f.birthDate} onChange={e => up("birthDate", formatFoundationDate(e.target.value))} required /></div>
              </div> : <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Nome fantasia *</label><input className={inputCls} placeholder="Nome comercial da empresa" value={f.tradeName} onChange={e => up("tradeName", e.target.value)} required /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Tipo *</label><input className={inputCls} value="Pessoa Jurídica" readOnly /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">CNPJ *</label><input className={inputCls} placeholder="00.000.000/0000-00" value={f.cnpj} maxLength={18} onChange={e => up("cnpj", formatCnpj(e.target.value))} required /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Razão social</label><input className={inputCls} value={f.legalName} onChange={e => up("legalName", e.target.value)} /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Inscrição estadual</label><input className={inputCls} placeholder="Deixe em branco se não for contribuinte · ISENTO se isento" value={f.stateRegistration} onChange={e => up("stateRegistration", e.target.value)} /></div>
                <div><label className="text-xs font-bold text-[#5a6a82] uppercase tracking-wide block mb-1.5">Fundação</label><input className={inputCls} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10} value={f.foundationDate} onChange={e => up("foundationDate", formatFoundationDate(e.target.value))} /></div>
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
  const { brands, loading: brandsLoading } = useBrands();

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
              <WhatsAppAction className="px-6 py-3 text-base" />
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
          {brandsLoading ? (
            <div className="text-center py-12 text-[#5a6a82]">Carregando marcas...</div>
          ) : brands.length === 0 ? (
            <div className="text-center py-12 text-[#5a6a82]">Nenhuma marca cadastrada no momento.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {brands.map((b) => (
                <BrandCard key={b.id} brand={b} />
              ))}
            </div>
          )}
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
            <WhatsAppAction className="px-7 py-3 text-base" />
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── App ─── */
export default function App() {
  const [page, setPageState] = useState<Page>("home");
  const [serviceSlug, setServiceSlug] = useState<string | null>(null);
  const [productSlug, setProductSlug] = useState<string | null>(null);
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname;
      if (path.startsWith("/admin")) {
        setIsAdminRoute(true);
      } else {
        setIsAdminRoute(false);
        const serviceMatch = path.match(/^\/servicos\/([^/]+)$/);
        if (serviceMatch) {
          setServiceSlug(decodeURIComponent(serviceMatch[1]));
          setProductSlug(null);
          setPageState("servico");
          return;
        }

        const productMatch = path.match(/^\/loja\/([^/]+)$/);
        if (productMatch) {
          setProductSlug(decodeURIComponent(productMatch[1]));
          setServiceSlug(null);
          setPageState("produto");
          return;
        }

        setServiceSlug(null);
        setProductSlug(null);
        if (path === "/loja") setPageState("loja");
        else if (path === "/servicos") setPageState("servicos");
        else if (path === "/sobre") setPageState("sobre");
        else if (path === "/contato") setPageState("contato");
        else if (path === "/orcamento") setPageState("orcamento");
        else if (path === "/assistencia") setPageState("assistencia");
        else setPageState("home");
      }
    };
    handleLocation();
    window.addEventListener("popstate", handleLocation);
    return () => window.removeEventListener("popstate", handleLocation);
  }, []);

  const setPage = (p: Page) => {
    setIsAdminRoute(false);
    setPageState(p);
    if (p !== "servico" && p !== "produto") {
      const route = p === "home" ? "/" : `/${p}`;
      window.history.pushState({}, "", route);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectService = (slug: string) => {
    setServiceSlug(slug);
    setProductSlug(null);
    setPageState("servico");
    window.history.pushState({}, "", `/servicos/${encodeURIComponent(slug)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectProduct = (slug: string) => {
    setProductSlug(slug);
    setServiceSlug(null);
    setPageState("produto");
    window.history.pushState({}, "", `/loja/${encodeURIComponent(slug)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AuthProvider>
      <AppContent
        isAdminRoute={isAdminRoute}
        page={page}
        setPage={setPage}
        serviceSlug={serviceSlug}
        productSlug={productSlug}
        onSelectService={selectService}
        onSelectProduct={selectProduct}
        setIsAdminRoute={setIsAdminRoute}
      />
    </AuthProvider>
  );
}

function AppContent({
  isAdminRoute,
  page,
  setPage,
  serviceSlug,
  productSlug,
  onSelectService,
  onSelectProduct,
  setIsAdminRoute,
}: {
  isAdminRoute: boolean;
  page: Page;
  setPage: (p: Page) => void;
  serviceSlug: string | null;
  productSlug: string | null;
  onSelectService: (slug: string) => void;
  onSelectProduct: (slug: string) => void;
  setIsAdminRoute: (val: boolean) => void;
}) {
  const { session, loading } = useAuth();

  if (isAdminRoute) {
    const adminFallback = (
      <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center text-white font-bold text-sm">
        Carregando painel...
      </div>
    );

    if (loading) return adminFallback;

    return (
      <Suspense fallback={adminFallback}>
        {!session ? (
          <AdminLogin onLoginSuccess={() => setIsAdminRoute(true)} />
        ) : (
          <AdminDashboard
            onBackToSite={() => {
              window.history.pushState({}, "", "/");
              setIsAdminRoute(false);
            }}
          />
        )}
      </Suspense>
    );
  }

  return (
    <PublicShell page={page} setPage={setPage}>
        {page === "home" && <HomePage setPage={setPage} onSelectService={onSelectService} onSelectProduct={onSelectProduct} />}
        {page === "loja" && <LojaPage setPage={setPage} onSelectProduct={onSelectProduct} />}
        {page === "produto" && <ProdutoDetalhePage slug={productSlug} setPage={setPage} />}
        {page === "servicos" && <ServicosPage setPage={setPage} onSelectService={onSelectService} />}
        {page === "servico" && <ServicoDetalhePage slug={serviceSlug} setPage={setPage} />}
        {page === "sobre" && <SobrePage setPage={setPage} />}
        {page === "contato" && <ContatoPage />}
        {page === "orcamento" && <OrcamentoPage />}
        {page === "assistencia" && <AssistenciaPage setPage={setPage} />}
    </PublicShell>
  );
}
