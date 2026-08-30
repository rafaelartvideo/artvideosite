import { lazy, Suspense, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
const AdminLogin = lazy(() =>
  import("@/app/Admin").then(({ AdminLogin }) => ({ default: AdminLogin })),
);
const AdminDashboard = lazy(() =>
  import("@/app/Admin").then(({ AdminDashboard }) => ({ default: AdminDashboard })),
);
import type { PublicPage as Page } from "@/features/public-shell/domain/navigation";
import { PublicShell } from "@/features/public-shell/presentation/PublicShell";

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

function PublicPageFallback() {
  return <div className="min-h-[55vh] bg-[#f5f7fa] flex items-center justify-center text-[#5a6a82] font-semibold text-sm">Carregando página...</div>;
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
      <Suspense fallback={<PublicPageFallback />}>
        {page === "home" && <HomePage setPage={setPage} onSelectService={onSelectService} onSelectProduct={onSelectProduct} trackingSection={<ServiceTrackingSection />} />}
        {page === "loja" && <StorePage setPage={setPage} onSelectProduct={onSelectProduct} />}
        {page === "produto" && <ProductDetailPage slug={productSlug} setPage={setPage} />}
        {page === "servicos" && <ServicesPage setPage={setPage} onSelectService={onSelectService} />}
        {page === "servico" && <ServiceDetailPage slug={serviceSlug} setPage={setPage} />}
        {page === "sobre" && <AboutPage setPage={setPage} />}
        {page === "contato" && <ContactPage />}
        {page === "orcamento" && <PublicQuotePage />}
        {page === "assistencia" && <TechnicalAssistancePage setPage={setPage} />}
      </Suspense>
    </PublicShell>
  );
}
