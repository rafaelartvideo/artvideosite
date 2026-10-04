import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import type { PublicPage as Page } from "@/features/public-shell/domain/navigation";
import { PublicShell } from "@/features/public-shell/presentation/PublicShell";
import { QueryRealtimeSync } from "@/infrastructure/query/QueryRealtimeSync";
import { AdminPanelLoader } from "@/shared/ui/admin/AdminPanelLoader";
import { AdminDialogManagerProvider } from "@/shared/ui/admin/AdminDialogManager";

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
const AboutPage = lazy(() => import("@/features/institutional/presentation/AboutPage").then(module => ({ default: module.AboutPage })));
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

function PublicPageFallback() {
  return <div className="min-h-[55vh] bg-[#f5f7fa] flex items-center justify-center text-[#5a6a82] font-semibold text-sm">Carregando página...</div>;
}

function StandaloneFallback({ text }: { text: string }) {
  return <div className="min-h-dvh bg-[#f5f7fa] flex items-center justify-center text-[#5a6a82] font-semibold text-sm">{text}</div>;
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
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [pathname]);
  return null;
}

function AuthenticatedAdminRealtimeSync() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  if (!session || !pathname.startsWith("/admin")) return null;
  return <QueryRealtimeSync />;
}

export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <AuthenticatedAdminRealtimeSync />
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

function PublicApplication() {
  return (
    <Routes>
      <Route path="/marketplace" element={<Suspense fallback={<StandaloneFallback text="Carregando marketplace..." />}><MarketplaceHomePage /></Suspense>} />
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
      <Route path="/marketplace" element={<Suspense fallback={<StandaloneFallback text="Carregando marketplace..." />}><MarketplaceHomePage /></Suspense>} />
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
      <Route path="/marketplace" element={<Suspense fallback={<StandaloneFallback text="Carregando marketplace..." />}><MarketplaceHomePage /></Suspense>} />
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
      <AdminDialogManagerProvider>
        <AdminDashboard
          onBackToSite={handleBackToSite}
          pendingTerms={pendingTerms}
        />
      </AdminDialogManagerProvider>
    </Suspense>
  );
}

function PublicRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageFromPath(location.pathname);
  const setPage = (nextPage: Page) => navigate(PUBLIC_PAGE_PATHS[nextPage]);
  const selectService = (slug: string) => navigate(`/servicos/${encodeURIComponent(slug)}`);
  const selectProduct = (slug: string) => navigate(`/loja/${encodeURIComponent(slug)}`);

  return (
    <PublicShell page={page} setPage={setPage}>
      <Suspense fallback={<PublicPageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage setPage={setPage} onSelectService={selectService} onSelectProduct={selectProduct} trackingSection={<ServiceTrackingSection />} />} />
          <Route path="/loja" element={<StorePage setPage={setPage} onSelectProduct={selectProduct} />} />
          <Route path="/loja/:slug" element={<ProductDetailRoute setPage={setPage} />} />
          <Route path="/servicos" element={<ServicesPage setPage={setPage} onSelectService={selectService} />} />
          <Route path="/servicos/:slug" element={<ServiceDetailRoute setPage={setPage} />} />
          <Route path="/sobre" element={<AboutPage setPage={setPage} />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/orcamento" element={<PublicQuotePage />} />
          <Route path="/assistencia" element={<TechnicalAssistancePage setPage={setPage} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PublicShell>
  );
}

function ProductDetailRoute({ setPage }: { setPage: (page: Page) => void }) {
  const { slug } = useParams();
  return <ProductDetailPage slug={slug || null} setPage={setPage} />;
}

function ServiceDetailRoute({ setPage }: { setPage: (page: Page) => void }) {
  const { slug } = useParams();
  return <ServiceDetailPage slug={slug || null} setPage={setPage} />;
}

function pageFromPath(pathname: string): Page {
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
