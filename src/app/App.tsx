import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import type { PublicPage as Page } from "@/features/public-shell/domain/navigation";
import { PublicShell } from "@/features/public-shell/presentation/PublicShell";

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
const PublicDocumentSignaturePage = lazy(() => import("@/features/document-signature-public/presentation/PublicDocumentSignaturePage").then(module => ({ default: module.PublicDocumentSignaturePage })));
const PublicDocumentVerificationPage = lazy(() => import("@/features/document-signature-public/presentation/PublicDocumentVerificationPage").then(module => ({ default: module.PublicDocumentVerificationPage })));

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

function AdminFallback() {
  return (
    <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center text-white font-bold text-sm">
      Carregando painel...
    </div>
  );
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

export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        <Route path="/captura" element={<Suspense fallback={<CaptureFallback />}><MobileDeviceCapturePage /></Suspense>} />
        <Route path="/captura/:sessionId" element={<Suspense fallback={<CaptureFallback />}><MobileDeviceCapturePage /></Suspense>} />
        <Route path="/editar-os-mobile" element={<Suspense fallback={<StandaloneFallback text="Abrindo edição da OS..." />}><MobileOrderEditPage /></Suspense>} />
        <Route path="/assinatura/:token" element={<Suspense fallback={<StandaloneFallback text="Carregando assinatura..." />}><PublicDocumentSignaturePage /></Suspense>} />
        <Route path="/verificar-documento/:verificationCode" element={<Suspense fallback={<StandaloneFallback text="Verificando documento..." />}><PublicDocumentVerificationPage /></Suspense>} />
        <Route path="/admin/*" element={<AdminEntry />} />
        <Route path="/*" element={<PublicRoutes />} />
      </Routes>
    </AuthProvider>
  );
}

function AdminEntry() {
  const { session, loading, activeOrganization, accessError, refreshAccess, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <AdminFallback />;

  return (
    <Suspense fallback={<AdminFallback />}>
      {!session ? (
        <AdminLogin onLoginSuccess={() => undefined} />
      ) : accessError ? (
        <AdminAccessMessage
          title="Não foi possível carregar seu acesso"
          message={accessError}
          userEmail={session.user.email}
          onRetry={refreshAccess}
          onSignOut={signOut}
        />
      ) : !activeOrganization ? (
        <AdminAccessMessage
          title="Acesso à empresa indisponível"
          message="Sua conta não está vinculada a uma empresa ativa ou o acesso foi bloqueado pelo administrador."
          userEmail={session.user.email}
          onRetry={refreshAccess}
          onSignOut={signOut}
        />
      ) : (
        <AdminDashboard onBackToSite={() => navigate("/")} />
      )}
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
