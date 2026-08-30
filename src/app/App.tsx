import { lazy, Suspense, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
const AdminLogin = lazy(() =>
  import("@/app/Admin").then(({ AdminLogin }) => ({ default: AdminLogin })),
);
const AdminDashboard = lazy(() =>
  import("@/app/Admin").then(({ AdminDashboard }) => ({ default: AdminDashboard })),
);
import type { PublicPage as Page } from "@/features/public-shell/domain/navigation";
import { PublicShell, WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { PublicButton as Btn, PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";
import { HomePage } from "@/features/home/presentation/HomePage";
import { ServicesPage } from "@/features/public-services/presentation/ServicesPage";
import { ServiceDetailPage } from "@/features/public-services/presentation/ServiceDetailPage";
import { StorePage } from "@/features/public-store/presentation/StorePage";
import { ProductDetailPage } from "@/features/public-store/presentation/ProductDetailPage";
import { AboutPage } from "@/features/institutional/presentation/AboutPage";
import { ContactPage } from "@/features/contact-public/presentation/ContactPage";
import { TechnicalAssistancePage } from "@/features/technical-assistance/presentation/TechnicalAssistancePage";
import { ServiceTrackingSection } from "@/features/service-tracking/presentation/ServiceTrackingSection";
import { PublicQuotePage } from "@/features/public-quotes/presentation/PublicQuotePage";
import {
  Wind, Plug, Package, ArrowRight, ChevronRight, Zap, CheckCircle,
  ChevronDown, MapPin, Layers, X,
} from "lucide-react";

/* ─── shared components ─── */
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
        {page === "home" && <HomePage setPage={setPage} onSelectService={onSelectService} onSelectProduct={onSelectProduct} trackingSection={<ServiceTrackingSection />} />}
        {page === "loja" && <StorePage setPage={setPage} onSelectProduct={onSelectProduct} />}
        {page === "produto" && <ProductDetailPage slug={productSlug} setPage={setPage} />}
        {page === "servicos" && <ServicesPage setPage={setPage} onSelectService={onSelectService} />}
        {page === "servico" && <ServiceDetailPage slug={serviceSlug} setPage={setPage} />}
        {page === "sobre" && <AboutPage setPage={setPage} />}
        {page === "contato" && <ContactPage />}
        {page === "orcamento" && <PublicQuotePage />}
        {page === "assistencia" && <TechnicalAssistancePage setPage={setPage} />}
    </PublicShell>
  );
}
