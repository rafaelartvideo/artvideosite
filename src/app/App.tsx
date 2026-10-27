import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { LoaderCircle } from "lucide-react";
import { CustomerAccountLoading } from "@/features/customer-account/presentation/CustomerAccountLoading";
import { CustomerAccountPage } from "@/features/customer-account/presentation/CustomerAccountPage";
import { AuthProvider, useAuth } from "@/lib/auth";
import type { PublicPage as Page } from "@/features/public-shell/domain/navigation";
// A estrutura completa do site público não entra no bundle inicial do CRM.
const PublicShell = lazy(() => import("@/features/public-shell/presentation/PublicShell").then(({ PublicShell }) => ({ default: PublicShell })));
import { QueryRealtimeSync } from "@/infrastructure/query/QueryRealtimeSync";
import { AdminPanelLoader } from "@/shared/ui/admin/AdminPanelLoader";
import { AdminDialogManagerProvider } from "@/shared/ui/admin/AdminDialogManager";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";

declare const __APP_TARGET__: "site" | "crm" | "combined";
declare const __PUBLIC_SITE_URL__: string;

const APP_TARGET = __APP_TARGET__;
const PUBLIC_SITE_URL = __PUBLIC_SITE_URL__.replace(/\/+$/, "");

const AdminLogin = lazy(() =>
  import("@/app/Admin").then(({ AdminLogin }) => ({ default: AdminLogin })),
);
const AdminDashboard = lazy(() =>
  import("@/app/Admin").then(({ AdminDashboard }) => ({ default: AdminDashboard })),
);
const HomePage = lazy(() => import("@/features/home/presentation/HomePage").then(module => ({ default: module.HomePage })));
const ServicesPage = lazy(() => import("@/features/public-services/presentation/ServicesPage").then(module => ({ default: module.ServicesPage })));
const ServiceDetailPage = lazy(() => import("@/features/public-services/presentation/ServiceDetailPage").then(module => ({ default: module.ServiceDetailPage })));
const StorePage = lazy(() => import("@/features/public-store/presentation/StorePage").then(module => ({ default: module.StorePage })));
const ProductDetailPage = lazy(() => import("@/features/public-store/presentation/ProductDetailPage").then(module => ({ default: module.ProductDetailPage })));
const StoreCheckoutPage = lazy(() => import("@/features/public-store/presentation/StoreCheckoutPage").then(module => ({ default: module.StoreCheckoutPage })));
const StoreCartPage = lazy(() => import("@/features/public-store/presentation/StoreCartPage").then(module => ({ default: module.StoreCartPage })));
const AboutPage = lazy(() => import("@/features/institutional/presentation/AboutPage").then(module => ({ default: module.AboutPage })));
const PrivacyPolicyPage = lazy(() => import("@/features/institutional/presentation/PrivacyAndRightsPages").then(module => ({ default: module.PrivacyPolicyPage })));
const DataDeletionPage = lazy(() => import("@/features/institutional/presentation/PrivacyAndRightsPages").then(module => ({ default: module.DataDeletionPage })));
const UnsubscribePage = lazy(() => import("@/features/institutional/presentation/PrivacyAndRightsPages").then(module => ({ default: module.UnsubscribePage })));
const ContactPage = lazy(() => import("@/features/contact-public/presentation/ContactPage").then(module => ({ default: module.ContactPage })));
const TechnicalAssistancePage = lazy(() => import("@/features/technical-assistance/presentation/TechnicalAssistancePage").then(module => ({ default: module.TechnicalAssistancePage })));
const ServiceTrackingSection = lazy(() => import("@/features/service-tracking/presentation/ServiceTrackingSection").then(module => ({ default: module.ServiceTrackingSection })));
const PublicQuotePage = lazy(() => import("@/features/public-quotes/presentation/PublicQuotePage").then(module => ({ default: module.PublicQuotePage })));

const MobileDeviceCapturePage = lazy(() => import("@/features/device-capture/presentation/MobileDeviceCapturePage").then(module => ({ default: module.MobileDeviceCapturePage })));
const MobileOrderEditPage = lazy(() => import("@/features/device-capture/presentation/MobileOrderEditPage").then(module => ({ default: module.MobileOrderEditPage })));
const MobileOrderChecklistPage = lazy(() => import("@/features/checklists/presentation/MobileOrderChecklistPage").then(module => ({ default: module.MobileOrderChecklistPage })));
const PublicDocumentSignaturePage = lazy(() => import("@/features/document-signature-public/presentation/PublicDocumentSignaturePage").then(module => ({ default: module.PublicDocumentSignaturePage })));
const PublicDocumentVerificationPage = lazy(() => import("@/features/document-signature-public/presentation/PublicDocumentVerificationPage").then(module => ({ default: module.PublicDocumentVerificationPage })));
const FieldTrackerDevicePage = lazy(() => import("@/features/field-tracking/presentation/FieldTrackerDevicePage").then(module => ({ default: module.FieldTrackerDevicePage })));
const MarketplaceHomePage = lazy(() => import("@/features/marketplace/presentation/MarketplaceHomePage").then(module => ({ default: module.MarketplaceHomePage })));

const PUBLIC_PAGE_PATHS: Record<Page, string> = {
  home: "/",
  loja: "/loja",
  produto: "/loja",
  servicos: "/servicos",
  servico: "/servicos",
  sobre: "/sobre",
  contato: "/contato",
  orcamento: "/orcamento",
  assistencia: "/assistencia",
};

// Este indicador permanece montado entre o carregamento do chunk, catálogo e imagens.
function CartPageLoading() {
  return <div role="status" aria-live="polite" aria-busy="true" className="fixed inset-0 z-[90] flex min-h-dvh flex-col items-center justify-center gap-4 bg-white text-sm font-semibold text-[#53647b]">
    <LoaderCircle size={34} className="animate-spin text-[#1032dc]" />
    <span>Carregando seu carrinho...</span>
  </div>;
}

function PublicPageFallback({ withinShell = false }: { withinShell?: boolean }) {
  const { pathname } = useLocation();
  if (pathname === "/minha-conta") return <CustomerAccountLoading/>;
  if (pathname.startsWith("/checkout/")) {
    return <div role="status" aria-live="polite" className="flex min-h-[75vh] flex-col items-center justify-center gap-4 bg-white px-4 text-center text-sm font-semibold text-[#53647b]">
      <LoaderCircle size={34} className="animate-spin text-[var(--art-primary)]" />
      <span>Preparando seu pedido...</span>
    </div>;
  }
  const home = pathname === "/" || pathname === "/acompanhar-pedido";
  return <div role="status" aria-label={home ? "Preparando página inicial" : "Carregando conteúdo"} aria-busy="true" className="min-h-[55vh] bg-white">
    {!withinShell && <div className="h-[76px] bg-gradient-to-r from-[#102c60] to-[#193e78] sm:h-[84px] xl:h-[96px]"/>}
    {home ? <>
      <div className="bg-gradient-to-r from-[#08182f] via-[#0b2450] to-[#17447b]">
        <div className="mx-auto flex min-h-[390px] max-w-7xl flex-col justify-center gap-5 px-4 py-12 sm:px-6 lg:min-h-[428px] lg:px-8">
          <div className="h-10 w-full max-w-[560px] animate-pulse rounded-md bg-white/15 sm:h-12"/>
          <div className="h-4 w-full max-w-[460px] animate-pulse rounded bg-white/10"/>
          <div className="h-4 w-full max-w-[330px] animate-pulse rounded bg-white/10"/>
          <div className="mt-3 flex gap-3"><div className="h-11 w-36 animate-pulse rounded-md bg-white/20"/><div className="h-11 w-36 animate-pulse rounded-md bg-white/10"/></div>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 md:grid-cols-3 lg:px-8">
        {Array.from({length:3},(_,i)=><div key={i} className="h-36 animate-pulse rounded-lg border border-[#e8edf4] bg-[#f3f6fb]"/>)}
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8"><div className="h-24 animate-pulse rounded-lg bg-[#e7effb]"/></div>
    </> : <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-5 w-44 animate-pulse rounded bg-slate-100"/>
      <div className="h-9 w-64 max-w-full animate-pulse rounded bg-slate-200"/>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:4},(_,i)=><div key={i} className="h-56 animate-pulse rounded-lg bg-slate-100"/>)}</div>
    </div>}
  </div>;
}

function StandaloneFallback({ text }: { text: string }) {
  return <div className="flex min-h-dvh items-center justify-center bg-[#f5f7fa]"><LoadingState text={text} /></div>;
}

function CaptureFallback() {
  return <StandaloneFallback text="Carregando captura..." />;
}

function AdminFallback({ progress = 12, status = "Carregando painel" }: { progress?: number; status?: string }) {
  return <AdminPanelLoader progress={progress} status={status} />;
}

function AdminAccessMessage({
  title,
  message,
  userEmail,
  onRetry,
  onSignOut,
}: {
  title: string;
  message: string;
  userEmail?: string;
  onRetry: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fa] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#d9e1ec] bg-white p-6 text-center shadow-lg shadow-[#0d1b2e]/5 sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8eef8] text-2xl font-black text-[#0057e7]">!</div>
        <h1 className="mt-5 text-xl font-black text-[#0d1b2e]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#5a6a82]">{message}</p>
        {userEmail && <p className="mt-3 truncate rounded-lg bg-[#f5f7fa] px-3 py-2 text-xs font-semibold text-[#5a6a82]">{userEmail}</p>}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void onRetry()}
            className="h-10 rounded-xl bg-[#0057e7] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0046c0]"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="h-10 rounded-xl border border-[#d9e1ec] bg-white px-4 text-sm font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [pathname]);
  useEffect(() => {
    // O convite circula no fragmento (#), nunca em query, para nao chegar
    // aos logs do servidor, navegacao, analytics ou cabecalho Referer.
    if (pathname!=="/loja") return;
    const token=new URLSearchParams(hash.replace(/^#/,"")).get("homologacao")||"";
    if (!/^[a-f0-9]{64}$/i.test(token)) return;
    try { sessionStorage.setItem("artvideo-store-homologation",token.toLowerCase()); }
    catch { return; }
    window.history.replaceState(window.history.state,"",pathname+window.location.search);
  },[pathname,hash]);
  return null;
}

function AuthenticatedAdminRealtimeSync() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  if (!session || !pathname.startsWith("/admin")) return null;
  return <QueryRealtimeSync />;
}

/**
 * Put the SAC operator online once when the user's Union login is ready.
 * Does not execute for Managers, unlinked users or pending terms; the edge
 * function checks the linked OAuth identity again before any provider PATCH.
 */
function AuthenticatedSacAutoPresence() {
  const { session, activeOrganizationId, permissions, loading, pendingTerms } = useAuth();
  const { pathname } = useLocation();
  const attempted = useRef("");

  useEffect(() => {
    if (!session?.user) {
      attempted.current = "";
      return;
    }
    if (loading || pendingTerms.length > 0 || !activeOrganizationId
      || !pathname.startsWith("/admin")
      || !permissions.some(permission =>
        permission.key === "sac_digital.messages.view" || permission.key === "sac_digital.view")) {
      return;
    }

    const key = `${session.user.id}:${activeOrganizationId}`;
    if (attempted.current === key) return;
    attempted.current = key;
    let cancelled = false;
    void import("@/features/sac-digital/infrastructure/sac-digital.repository")
      .then(({ bringMySacOperatorOnline }) => bringMySacOperatorOnline(activeOrganizationId))
      .then(result => {
        if (cancelled || !result.linked) return;
        if (result.online === true && !result.already_online) {
          notifyAdmin("Seu Operador SAC Digital está online.", "success");
        } else if (result.online !== true) {
          notifyAdmin("A SAC Digital ainda não confirmou seu Operador online. Consulte Configurações > SAC Digital > Operadores.", "error");
        }
      })
      .catch(error => {
        if (!cancelled) {
          notifyAdmin(systemErrorMessage(error,
            "Não foi possível colocar seu Operador SAC online. Confira a autorização em Configurações > SAC Digital."), "error");
        }
      });
    return () => { cancelled = true; };
  }, [session?.user?.id, activeOrganizationId, permissions, loading, pendingTerms.length,
    pathname.startsWith("/admin")]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <AuthenticatedAdminRealtimeSync />
      {APP_TARGET !== "site" && <AuthenticatedSacAutoPresence />}
      {APP_TARGET === "site" ? (
        <PublicApplication />
      ) : APP_TARGET === "crm" ? (
        <CrmApplication />
      ) : (
        <CombinedApplication />
      )}
    </AuthProvider>
  );
}

function MarketplaceRouteContent() {
  return <Suspense fallback={<StandaloneFallback text="Carregando marketplace..." />}>
    <MarketplaceHomePage />
  </Suspense>;
}

function PublicApplication() {
  return (
    <Routes>
      <Route path="/marketplace" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/servico/:listingId" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/produto/:listingId" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/loja/:slug" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/solicitar" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/conta" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/*" element={<Navigate to="/marketplace" replace />} />
      <Route path="/*" element={<PublicRoutes />} />
    </Routes>
  );
}

function CrmApplication() {
  return (
    <Routes>
      <Route path="/captura" element={<Suspense fallback={<CaptureFallback />}><MobileDeviceCapturePage /></Suspense>} />
      <Route path="/captura/:sessionId" element={<Suspense fallback={<CaptureFallback />}><MobileDeviceCapturePage /></Suspense>} />
      <Route path="/editar-os-mobile" element={<Suspense fallback={<StandaloneFallback text="Abrindo edição da OS..." />}><MobileOrderEditPage /></Suspense>} />
      <Route path="/checklist-mobile" element={<Suspense fallback={<StandaloneFallback text="Abrindo checklist da OS..." />}><MobileOrderChecklistPage /></Suspense>} />
      <Route path="/assinatura/:token" element={<Suspense fallback={<StandaloneFallback text="Carregando assinatura..." />}><PublicDocumentSignaturePage /></Suspense>} />
      <Route path="/verificar-documento/:verificationCode" element={<Suspense fallback={<StandaloneFallback text="Verificando documento..." />}><PublicDocumentVerificationPage /></Suspense>} />
      <Route path="/rastreador" element={<Suspense fallback={<StandaloneFallback text="Abrindo rastreador..." />}><FieldTrackerDevicePage /></Suspense>} />
      <Route path="/rastreador/:token" element={<Suspense fallback={<StandaloneFallback text="Abrindo rastreador..." />}><FieldTrackerDevicePage /></Suspense>} />
      <Route path="/marketplace" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/servico/:listingId" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/produto/:listingId" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/loja/:slug" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/solicitar" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/conta" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/*" element={<Navigate to="/marketplace" replace />} />
      <Route path="/admin/*" element={<AdminEntry />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

function CombinedApplication() {
  return (
    <Routes>
      <Route path="/captura" element={<Suspense fallback={<CaptureFallback />}><MobileDeviceCapturePage /></Suspense>} />
      <Route path="/captura/:sessionId" element={<Suspense fallback={<CaptureFallback />}><MobileDeviceCapturePage /></Suspense>} />
      <Route path="/editar-os-mobile" element={<Suspense fallback={<StandaloneFallback text="Abrindo edição da OS..." />}><MobileOrderEditPage /></Suspense>} />
      <Route path="/checklist-mobile" element={<Suspense fallback={<StandaloneFallback text="Abrindo checklist da OS..." />}><MobileOrderChecklistPage /></Suspense>} />
      <Route path="/assinatura/:token" element={<Suspense fallback={<StandaloneFallback text="Carregando assinatura..." />}><PublicDocumentSignaturePage /></Suspense>} />
      <Route path="/verificar-documento/:verificationCode" element={<Suspense fallback={<StandaloneFallback text="Verificando documento..." />}><PublicDocumentVerificationPage /></Suspense>} />
      <Route path="/rastreador" element={<Suspense fallback={<StandaloneFallback text="Abrindo rastreador..." />}><FieldTrackerDevicePage /></Suspense>} />
      <Route path="/rastreador/:token" element={<Suspense fallback={<StandaloneFallback text="Abrindo rastreador..." />}><FieldTrackerDevicePage /></Suspense>} />
      <Route path="/marketplace" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/servico/:listingId" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/produto/:listingId" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/loja/:slug" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/solicitar" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/conta" element={<MarketplaceRouteContent />} />
      <Route path="/marketplace/*" element={<Navigate to="/marketplace" replace />} />
      <Route path="/admin/*" element={<AdminEntry />} />
      <Route path="/*" element={<PublicRoutes />} />
    </Routes>
  );
}

function AdminEntry() {
  const {
    session,
    loading,
    loadingProgress,
    activeOrganization,
    organizations,
    accessError,
    pendingTerms,
    refreshAccess,
    signOut,
    setActiveOrganization,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedOrganizationId = new URLSearchParams(location.search).get("org");
  const canOpenRequestedOrganization = Boolean(
    requestedOrganizationId
    && organizations.some(organization =>
      organization.organization_id === requestedOrganizationId && organization.is_direct_member
    ),
  );
  const shouldSwitchOrganization = Boolean(
    session
    && !loading
    && requestedOrganizationId
    && canOpenRequestedOrganization
    && activeOrganization?.organization_id !== requestedOrganizationId,
  );
  useEffect(() => {
    if (!shouldSwitchOrganization || !requestedOrganizationId) return;
    void setActiveOrganization(requestedOrganizationId);
  }, [shouldSwitchOrganization, requestedOrganizationId, setActiveOrganization]);

  if (loading || shouldSwitchOrganization) {
    return (
      <AdminFallback
        progress={shouldSwitchOrganization ? Math.max(92, loadingProgress) : loadingProgress}
        status={shouldSwitchOrganization ? "Trocando empresa" : "Carregando painel"}
      />
    );
  }

  const handleBackToSite = () => {
    if (APP_TARGET === "crm") {
      window.location.assign(PUBLIC_SITE_URL);
      return;
    }
    navigate("/");
  };

  if (!session) {
    return (
      <Suspense fallback={<AdminFallback progress={100} status="Abrindo acesso" />}>
        <AdminLogin onLoginSuccess={() => undefined} />
      </Suspense>
    );
  }

  if (accessError) {
    return (
      <AdminAccessMessage
        title="Não foi possível carregar seu acesso"
        message={accessError}
        userEmail={session.user.email}
        onRetry={refreshAccess}
        onSignOut={signOut}
      />
    );
  }

  if (!activeOrganization) {
    return (
      <AdminAccessMessage
        title="Acesso à empresa indisponível"
        message="Sua conta não está vinculada a uma empresa ativa ou o acesso foi bloqueado pelo administrador."
        userEmail={session.user.email}
        onRetry={refreshAccess}
        onSignOut={signOut}
      />
    );
  }

  return (
    <Suspense fallback={<AdminFallback progress={99} status="Finalizando painel" />}>
      <AdminDialogManagerProvider key={activeOrganization.organization_id}>
        <AdminDashboard
          onBackToSite={handleBackToSite}
          pendingTerms={pendingTerms}
        />
      </AdminDialogManagerProvider>
    </Suspense>
  );
}

function LegacyOrderTrackingRedirect() {
  const { hash, search } = useLocation();
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("c") || "";
  const safeToken = /^[a-f0-9]{64}$/i.test(token) ? "&c=" + token.toLowerCase() : "";
  return <Navigate to={{ pathname: "/", search, hash: "#acompanhar-servico" + safeToken }} replace />;
}

function PublicRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageFromPath(location.pathname);
  const setPage = (nextPage: Page) => navigate(PUBLIC_PAGE_PATHS[nextPage]);
  const selectService = (slug: string) => navigate(`/servicos/${encodeURIComponent(slug)}`);
  const selectProduct = (slug: string) => navigate(`/loja/${encodeURIComponent(slug)}`);
  const isCartRoute = location.pathname === "/carrinho";
  const [readyCartLocationKey, setReadyCartLocationKey] = useState<string | null>(null);
  const markCartReady = useCallback(() => setReadyCartLocationKey(location.key), [location.key]);

  return (
    <>
      {isCartRoute && readyCartLocationKey !== location.key && <CartPageLoading />}
      <Suspense fallback={isCartRoute ? null : <PublicPageFallback />}>
      <PublicShell page={page} setPage={setPage}>
      <Suspense fallback={isCartRoute ? null : <PublicPageFallback withinShell />}>
        <Routes>
          <Route path="/" element={<HomePage setPage={setPage} onSelectService={selectService} onSelectProduct={selectProduct} trackingSection={<ServiceTrackingSection />} />} />
          <Route path="/loja" element={<StorePage setPage={setPage} onSelectProduct={selectProduct} onSelectService={selectService} />} />
          <Route path="/loja/:slug" element={<ProductDetailRoute setPage={setPage} />} />
          <Route path="/carrinho" element={<StoreCartPage onReady={markCartReady} />} />
          <Route path="/checkout/:slug" element={<StoreCheckoutRoute />} />
          <Route path="/acompanhar-pedido" element={<LegacyOrderTrackingRedirect />} />
          <Route path="/minha-conta" element={<CustomerAccountPage />} />
          <Route path="/servicos" element={<ServicesPage setPage={setPage} onSelectService={selectService} onSelectProduct={selectProduct} />} />
          <Route path="/servicos/:slug" element={<ServiceDetailRoute setPage={setPage} />} />
          <Route path="/sobre" element={<AboutPage setPage={setPage} />} />
          <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
          <Route path="/exclusao-de-dados" element={<DataDeletionPage />} />
          <Route path="/descadastramento" element={<UnsubscribePage />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/orcamento" element={<PublicQuotePage />} />
          <Route path="/assistencia" element={<TechnicalAssistancePage setPage={setPage} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </PublicShell>
      </Suspense>
    </>
  );
}

function ProductDetailRoute({ setPage }: { setPage: (page: Page) => void }) {
  const { slug } = useParams();
  return <ProductDetailPage slug={slug || null} setPage={setPage} />;
}

function StoreCheckoutRoute() {
  const { slug } = useParams();
  return <StoreCheckoutPage slug={slug || null} />;
}

function ServiceDetailRoute({ setPage }: { setPage: (page: Page) => void }) {
  const { slug } = useParams();
  return <ServiceDetailPage slug={slug || null} setPage={setPage} />;
}

function pageFromPath(pathname: string): Page {
  if (pathname === "/carrinho") return "loja";
  if (/^\/checkout\/[^/]+$/.test(pathname)) return "loja";
  if (/^\/loja\/[^/]+$/.test(pathname)) return "produto";
  if (/^\/servicos\/[^/]+$/.test(pathname)) return "servico";
  if (pathname === "/loja") return "loja";
  if (pathname === "/servicos") return "servicos";
  if (pathname === "/sobre") return "sobre";
  if (pathname === "/contato") return "contato";
  if (pathname === "/orcamento") return "orcamento";
  if (pathname === "/assistencia") return "assistencia";
  return "home";
}
