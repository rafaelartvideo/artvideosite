import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import { createEmployee, getEmployees, getGeneralServices, createGeneralService, updateGeneralService, setGeneralServiceActive, setEmployeeActive, updateEmployee } from "@/lib/queries";
import {
  LayoutDashboard, Wrench, FolderTree, Package, Tag, FileText, ClipboardList,
  Users, Settings, Phone, LogOut, Search, Plus, Edit2, Trash2, CheckCircle,
  AlertCircle, Clock, RefreshCw, X, ArrowLeft, Menu, Upload, AlertTriangle,
  Star, Filter, DollarSign, List, HelpCircle, ChevronDown, MessageCircle,
  Mail, MapPin, Instagram, Globe, Hash, Activity, Shield, CalendarDays, Eye, EyeOff,
  ChevronLeft, ChevronRight, ListFilter, CalendarPlus, Check, UserPlus, Eraser,
} from "lucide-react";
import {
  type AdminTab, type AdminPageState, AdminPageContext, AdminBackContext,
  cn, slugify, initialOrderStatus, getWhatsAppUrl, formatPhone, formatCpf, formatCnpj, isValidCpf,
  type CustomerType, type CustomerForm, emptyCustomerForm, customerFormFromCustomer, customerPayload, customerUpdatePayload, validateCustomerForm,
  formatFoundationDate, foundationDateToIso, foundationDateFromCustomer, formatDateOnly, todayDateOnly,
  INPUT, FInput, FTextarea, FSelect, FToggle, CustomerTypeToggle,
  StatusBadge, LoadingState, EmptyState, BtnPrimary, BtnSecondary, Toast, ConfirmDialog,
  PageHeader, Section, AdminPage, PaginationBar, ImageUpload, ProductAdminThumb, BrandAdminLogo,
  supabaseErrorMessage, createMediaRecord, InternalBackButton,
  generateUniqueSlug, isHexColor,
} from "./admin/shared";
import { TabOrders, OSSituationsView } from "./admin/TabOrders";
import type { Appointment, AppointmentPeriod, AppointmentSituation } from "@/lib/database.types";
import logoSolo from "@/imports/LogoSoloSemFundo.png";

function PasswordField({ label, value, onChange, required = false, placeholder, resetKey }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; resetKey?: string | number }) {
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { setShowPassword(false); }, [resetKey]);
  const visibilityLabel = showPassword ? "Ocultar senha" : "Mostrar senha";
  return <div>
    <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}{required && <span className="text-red-400">*</span>}</label>
    <div className="relative">
      <input type={showPassword ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} required={required} placeholder={placeholder} className={cn(INPUT, "pr-11")} />
      <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={visibilityLabel} title={visibilityLabel} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#5a6a82] hover:text-[#0057e7] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40 rounded" tabIndex={0}>
        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}

export function AdminLogin({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const normalizedEmail = String(email).trim().toLowerCase();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    console.log("[AUTH LOGIN]", {
      email: normalizedEmail,
      userId: data?.user?.id,
      error: authErr
        ? {
            message: authErr.message,
            status: authErr.status,
            name: authErr.name,
          }
        : null,
    });

    if (authErr) {
      console.error("[AUTH LOGIN ERROR]", {
        message: authErr.message,
        status: authErr.status,
        name: authErr.name,
      });
      setError("Credenciais inválidas. Verifique seu e-mail e senha.");
      setLoading(false);
      return;
    }
    if (data.user) {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (prof && (prof as any).is_active === false) {
        await supabase.auth.signOut();
        setError("Usuário inativo. Entre em contato com o gestor.");
        setLoading(false);
        return;
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1b2e] via-[#0a1520] to-[#06101a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <img src={logoSolo} alt="" aria-hidden="true" className="h-10 w-10 shrink-0 object-contain" />
            <div className="text-left">
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-[#00b4ff] block">Eletrônica</span>
              <span className="text-xl font-black text-white block" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl border border-white/5">
          <h1 className="text-2xl font-black text-[#0d1b2e] mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Bem-vindo de volta</h1>
          <p className="text-sm text-[#5a6a82] mb-6">Entre com suas credenciais para acessar o painel.</p>
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <FInput label="E-mail" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required placeholder="seu@email.com" />
            <div>
              <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Senha<span className="text-red-400">*</span></label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className={cn(INPUT, "pr-11")} />
                <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} title={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#5a6a82] hover:text-[#0057e7] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40 rounded" tabIndex={0}>
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#0057e7] text-white font-bold py-3 px-6 rounded-xl text-sm hover:bg-[#0046c0] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2">
              {loading ? <Clock size={18} className="animate-spin" /> : null}
              {loading ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ item, active, onClick }: { item: { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button type="button" onClick={onClick} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all text-left", active ? "bg-[#0057e7] text-white shadow-lg shadow-[#0057e7]/25" : "text-white/60 hover:bg-white/8 hover:text-white")}><Icon size={16} className="flex-shrink-0" /><span>{item.label}</span></button>;
}

function AdminHubPage({ title, description, items, onSelect }: { title: string; description: string; items: { id: string; label: string; description: string; icon: React.ComponentType<{ size?: number; className?: string }> }[]; onSelect: (id: string, label: string) => void }) {
  return <div className="space-y-5"><div></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{items.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => onSelect(item.id, item.label)} className="group text-left bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm p-5 hover:border-[#0057e7]/40 hover:shadow-md transition-all"><div className="flex items-start justify-between gap-4"><div className="w-10 h-10 rounded-lg bg-[#e8eef8] text-[#0057e7] flex items-center justify-center group-hover:bg-[#0057e7] group-hover:text-white transition-colors"><Icon size={20} /></div><ArrowLeft size={16} className="rotate-180 text-[#5a6a82] group-hover:text-[#0057e7] transition-colors" /></div><h3 className="mt-5 text-base font-black text-[#0d1b2e]">{item.label}</h3><p className="mt-1.5 text-sm leading-5 text-[#5a6a82]">{item.description}</p><span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span></button>; })}</div></div>;
}

/* ─────────────────────────── ADMIN DASHBOARD WRAPPER ─────────────────────────── */

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");

  const mainItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "quotes", label: "Orçamentos", icon: FileText },
    { id: "orders", label: "Ordens de Serviço", icon: ClipboardList },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
  ];
  const siteItems = [
    { id: "products", label: "Produtos", icon: Package, description: "Cadastre e gerencie os produtos exibidos na loja online.", permissionKey: "products.view" },
    { id: "categories", label: "Categorias", icon: FolderTree, description: "Organize as categorias utilizadas pelos produtos do site.", permissionKey: "categories.view" },
    { id: "brands", label: "Marcas", icon: Tag, description: "Gerencie as marcas utilizadas no catálogo da loja.", permissionKey: "brands.view" },
    { id: "services", label: "Serviços do Site", icon: Wrench, description: "Cadastre e gerencie os serviços apresentados no site público.", permissionKey: "services.view" },
  ];
  const operationItems = [
    { id: "equipment", label: "Equipamentos", icon: Wrench, description: "Cadastre equipamentos, marcas e modelos técnicos.", permissionKey: "equipment.view" },
    { id: "generalServices", label: "Serviços Gerais", icon: ClipboardList, description: "Cadastre os serviços internos da assistência técnica.", permissionKey: "general_services.view" },
    { id: "serviceTypes", label: "Tipos de Atendimento", icon: List, description: "Configure tipos e previsão de atendimento das OS.", permissionKey: "service_types.view" },
    { id: "inventory", label: "Estoque", icon: Package, description: "Controle de itens, movimentações e histórico do estoque atual.", permissionKey: "orders.view" },
    { id: "situations", label: "Situações da OS", icon: Activity, description: "Gerencie as situações disponíveis para as OS.", permissionKey: "orders.view" },
    { id: "orderStatuses", label: "Status da OS", icon: CheckCircle, description: "Gerencie os status do fluxo das ordens de serviço.", permissionKey: "orders.view" },
    { id: "employees", label: "Equipes / Funcionários", icon: Users, description: "Cadastre funcionários, técnicos e gestores da equipe.", permissionKey: "employees.view" },
  ];
  const utilityItems = [
    { id: "settings", label: "Configurações", icon: Settings },
    { id: "contact", label: "Contato", icon: Phone },
  ];
  const permissionForTab: Record<string, string> = {
    dashboard: "dashboard.view", quotes: "quotes.view", orders: "orders.view", customers: "customers.view", agenda: "agenda.view",
    products: "products.view", categories: "categories.view", brands: "brands.view", services: "services.view", equipment: "equipment.view",
    generalServices: "general_services.view", serviceTypes: "service_types.view", inventory: "orders.view", situations: "orders.view", orderStatuses: "orders.view",
    employees: "employees.view", settings: "settings.view", contact: "contact.view",
  };
  const canAccessTab = (tab: string) => hasPermission(permissionForTab[tab] || `${tab}.view`);

  const SidebarContent = () => (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Logo */}
        <div className="flex h-20 items-center justify-center border-b border-white/8 px-3">
          <div className="flex items-center gap-2.5">
            <img src={logoSolo} alt="" aria-hidden="true" className="h-8 w-8 shrink-0 object-contain" />
            <div>
              <span className="text-[8px] font-bold tracking-[0.3em] uppercase text-[#00b4ff] block">Eletrônica</span>
              <span className="text-base font-black text-white block leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
            </div>
          </div>
        </div>
        {/* User footer */}
        <div className="px-4 py-4 border-b border-white/8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-[#0057e7]/30 rounded-full flex items-center justify-center flex-shrink-0">
              <Users size={14} className="text-[#00b4ff]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{profile?.full_name || user?.email?.split("@")[0] || "Admin"}</p>
              <span className="text-[9px] font-bold text-[#00b4ff] bg-[#00b4ff]/10 px-1.5 py-0.5 rounded uppercase tracking-wide">{roleName}</span>
            </div>
          </div>
          <button onClick={() => signOut()} title="Sair" className="p-1.5 text-white/40 hover:text-red-400 hover:bg-white/8 rounded-lg transition-colors flex-shrink-0">
            <LogOut size={16} />
          </button>
        </div>
        {/* Nav */}
        <div className="px-3 py-4 space-y-0.5">
          {mainItems.filter(item => canAccessTab(item.id)).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => { setActiveTab(item.id as AdminTab); setPage(null); setSidebarOpen(false); }}
                className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all text-left",
                  active ? "bg-[#0057e7] text-white shadow-lg shadow-[#0057e7]/25" : "text-white/60 hover:bg-white/8 hover:text-white")}>
                <Icon size={17} className="flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
          {hasPermission("site.view") && <SidebarItem item={{ id: "site", label: "Site", icon: Globe }} active={activeTab === "site"} onClick={() => { setActiveTab("site"); setPage(null); setSidebarOpen(false); }} />}
          {["orders.view", "customers.view", "employees.view", "equipment.view", "service_types.view", "services.view", "general_services.view"].some(hasPermission) && <SidebarItem item={{ id: "operation", label: "Operação", icon: Settings }} active={activeTab === "operation"} onClick={() => { setActiveTab("operation"); setPage(null); setSidebarOpen(false); }} />}
          <div className="pt-3 space-y-0.5">{utilityItems.filter(item => canAccessTab(item.id)).map(item => <SidebarItem key={item.id} item={item} active={activeTab === item.id} onClick={() => { setActiveTab(item.id as AdminTab); setPage(null); setSidebarOpen(false); }} />)}</div>
        </div>
        {/* Back to site */}
        <div className="px-3 pb-3">
          <button onClick={onBackToSite} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
            <ArrowLeft size={16} /> <span>Ver site público</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <AdminPageContext.Provider value={{ page, setPage }}>
    <div className="h-screen overflow-hidden bg-[#f8fafc] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-[#0d1b2e] flex-col fixed left-0 top-0 h-full z-40">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 h-full w-64 bg-[#0d1b2e] flex flex-col z-50 md:hidden">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main */}
      <main className="flex-1 md:ml-60 flex flex-col h-screen min-h-0 overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-[#0d1b2e]/8 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-[#0d1b2e] p-1.5 hover:bg-[#f5f7fa] rounded-lg">
              <Menu size={20} />
            </button>
            <div>
                {page && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#5a6a82] mb-0.5">
                    <button type="button" onClick={page.onBack} className="font-semibold hover:text-[#0057e7] transition-colors">{page.breadcrumb}</button>
                    <span aria-hidden="true">&gt;</span>
                    <span className="truncate max-w-[180px]">{page.title}</span>
                  </div>
                )}
              <h2 className="font-black text-[#0d1b2e] text-[15px]">
                {page?.title || [...mainItems, { id: "site", label: "Site", icon: Globe }, { id: "operation", label: "Operação", icon: Settings }, ...utilityItems].find(m => m.id === activeTab)?.label}
              </h2>
              <p className="hidden sm:block text-[#5a6a82] mt-0.5 text-[14px]">
                {page?.subtitle || ({
                    dashboard: "Visão geral do sistema em tempo real",
                    services: "Gerencie os serviços apresentados no site público",
                    categories: "Organize os serviços e produtos por categoria",
                    products: "Controle o catálogo de produtos da loja",
                    brands: "Administre as marcas cadastradas",
                    quotes: "Acompanhe e responda às solicitações recebidas",
                    orders: "Abertura, acompanhamento e conclusão dos atendimentos",
                    agenda: "Visualize e organize os atendimentos agendados",
                    site: "Conteúdo e configurações do site público",
                    operation: "Configurações internas da assistência técnica",
                    equipment: "Cadastro técnico usado nas ordens de serviço",
                    generalServices: "Serviços técnicos internos utilizados na operação",
                    serviceTypes: "Configuração dos tipos de atendimento",
                    situations: "Etapas de progresso das ordens de serviço",
                    orderStatuses: "Status principais das ordens de serviço",
                    customers: "Consulte clientes e seus dados de atendimento",
                    employees: "Cadastro e gestão dos funcionários da empresa",
                    settings: "Controle as configurações globais do site",
                    contact: "Dados exibidos no site e usados nos contatos",
                  } as Record<AdminTab, string>)[activeTab]}
                </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
            <span className="hidden sm:inline font-medium">Supabase conectado</span>
          </div>
        </header>

        {/* Content */}
        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {activeTab === "dashboard" && canAccessTab("dashboard") && <TabDashboard />}
          {activeTab === "services" && canAccessTab("services") && <TabServices onBack={() => { setActiveTab("site"); setPage(null); }} />}
          {activeTab === "categories" && canAccessTab("categories") && <TabCategories onBack={() => { setActiveTab("site"); setPage(null); }} />}
          {activeTab === "products" && canAccessTab("products") && <TabProducts onBack={() => { setActiveTab("site"); setPage(null); }} />}
          {activeTab === "brands" && canAccessTab("brands") && <TabBrands onBack={() => { setActiveTab("site"); setPage(null); }} />}
          {activeTab === "site" && <AdminHubPage title="Site" description="Conteúdo e cadastros exibidos no site público." items={siteItems.filter(item => hasPermission(item.permissionKey))} onSelect={(id, label) => { setPage({ breadcrumb: "Site", title: label, onBack: () => { setActiveTab("site"); setPage(null); } }); setActiveTab(id as AdminTab); }} />}
          {activeTab === "operation" && <AdminHubPage title="Operação" description="Cadastros e configurações internas da assistência técnica." items={operationItems.filter(item => hasPermission(item.permissionKey))} onSelect={(id, label) => { setPage({ breadcrumb: "Operação", title: label, onBack: () => { setActiveTab("operation"); setPage(null); } }); setActiveTab(id as AdminTab); }} />}
          {activeTab === "equipment" && canAccessTab("equipment") && <EquipmentAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "generalServices" && canAccessTab("generalServices") && <GeneralServicesPanel onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "serviceTypes" && canAccessTab("serviceTypes") && <ServiceTypesAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "inventory" && canAccessTab("inventory") && <TabInventory onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "situations" && canAccessTab("situations") && <OSSituationsView onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "orderStatuses" && canAccessTab("orderStatuses") && <OrderStatusesAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "quotes" && canAccessTab("quotes") && <TabQuotes onNavigate={setActiveTab} />}
          {activeTab === "orders" && canAccessTab("orders") && <TabOrders onNavigate={setActiveTab} initialOrderId={focusedOrderId} onFocused={() => setFocusedOrderId(null)} />}
          {activeTab === "agenda" && canAccessTab("agenda") && <TabAgenda onOpenOrder={(id) => { setFocusedOrderId(id); setActiveTab("orders"); }} />}
          {activeTab === "customers" && canAccessTab("customers") && <TabCustomers onOpenOrder={(id) => { setFocusedOrderId(id); setActiveTab("orders"); }} />}
          {activeTab === "employees" && canAccessTab("employees") && <TabEmployees onBack={() => { setActiveTab("operation"); setPage(null); }} />}
          {activeTab === "settings" && canAccessTab("settings") && <TabSettings />}
          {activeTab === "contact" && canAccessTab("contact") && <TabContact />}
        </div>
      </main>
    </div>
    </AdminPageContext.Provider>
  );
}

/* ─────────────────────────── TAB: DASHBOARD ─────────────────────────── */

function TabDashboard() {
  const [stats, setStats] = useState({ quotesPending: 0, quotesAnalysis: 0, ordersActive: 0, ordersWaiting: 0, servicesActive: 0, productsActive: 0 });
  const [recentQuotes, setRecentQuotes] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [qAll, oAll, sActive, pActive, rQuotes, rOrders] = await Promise.all([
      supabase.from("quote_requests").select("id, status_id, request_status:request_statuses(name)"),
      supabase.from("service_orders").select("id, os_number, tracking_token, status_id, created_at, updated_at, customer_id, order_status:order_statuses(name,color)"),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("quote_requests").select("id, protocol, created_at, customer_id, service_id, brand_id, request_status:request_statuses(name), customer:customers(full_name), service:services(title), brand:brands(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("service_orders").select("id, os_number, service:services(title), created_at, updated_at, status_id, order_status:order_statuses(name,color), customer:customers(full_name)").order("created_at", { ascending: false }).limit(5),
    ]);
    const quotes = qAll.data || [];
    const orders = oAll.data || [];
    setStats({
      quotesPending: quotes.filter((q: any) => ((q.request_status as any)?.name || "").toLowerCase().includes("pend")).length,
      quotesAnalysis: quotes.filter((q: any) => { const n = ((q.request_status as any)?.name || "").toLowerCase(); return n.includes("anál") || n.includes("analise") || n.includes("análise"); }).length,
      ordersActive: orders.filter((o: any) => { const n = ((o.order_status as any)?.name || "").toLowerCase(); return n.includes("manutenç") || n.includes("andamento") || n.includes("execuç"); }).length,
      ordersWaiting: orders.filter((o: any) => { const n = ((o.order_status as any)?.name || "").toLowerCase(); return n.includes("aguard") || n.includes("client"); }).length,
      servicesActive: sActive.count || 0,
      productsActive: pActive.count || 0,
    });
    setRecentQuotes(rQuotes.data || []);
    setRecentOrders(rOrders.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cards = [
    { label: "Orçamentos pendentes", val: stats.quotesPending, icon: FileText, color: "text-amber-600 bg-amber-50 border-amber-100" },
    { label: "Orçamentos em análise", val: stats.quotesAnalysis, icon: Activity, color: "text-blue-600 bg-blue-50 border-blue-100" },
    { label: "OS em andamento", val: stats.ordersActive, icon: ClipboardList, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { label: "OS aguardando cliente", val: stats.ordersWaiting, icon: Clock, color: "text-orange-600 bg-orange-50 border-orange-100" },
    { label: "Serviços ativos", val: stats.servicesActive, icon: Wrench, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { label: "Produtos ativos", val: stats.productsActive, icon: Package, color: "text-purple-600 bg-purple-50 border-purple-100" },
  ];

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Visão geral do sistema em tempo real" actions={
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      } />

      {loading ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-white rounded-xl p-5 border border-[#0d1b2e]/8 shadow-sm flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#5a6a82] mb-1 leading-tight">{c.label}</p>
                    <p className="text-3xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{c.val}</p>
                  </div>
                  <div className={cn("p-3 rounded-xl border flex-shrink-0", c.color)}>
                    <Icon size={22} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Recent Quotes */}
            <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0d1b2e]/8 flex items-center justify-between">
                <h3 className="font-bold text-[#0d1b2e] text-sm">Orçamentos Recentes</h3>
                <FileText size={16} className="text-[#5a6a82]" />
              </div>
              {recentQuotes.length === 0 ? (
                <p className="text-sm text-[#5a6a82] text-center py-8">Nenhuma solicitação.</p>
              ) : (
                <div className="divide-y divide-[#0d1b2e]/5">
                  {recentQuotes.map(q => (
                    <div key={q.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0d1b2e] text-sm truncate">{(q.customer as any)?.full_name || "Cliente"}</p>
                        <p className="text-xs text-[#5a6a82] truncate">{(q.service as any)?.title || (q.brand as any)?.name || q.protocol || "—"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={(q.request_status as any)?.name || "Pendente"} />
                        <p className="text-[10px] text-[#5a6a82] mt-1">{fmtDate(q.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0d1b2e]/8 flex items-center justify-between">
                <h3 className="font-bold text-[#0d1b2e] text-sm">Ordens de Serviço Recentes</h3>
                <ClipboardList size={16} className="text-[#5a6a82]" />
              </div>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-[#5a6a82] text-center py-8">Nenhuma OS cadastrada.</p>
              ) : (
                <div className="divide-y divide-[#0d1b2e]/5">
                  {recentOrders.map(o => (
                    <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0057e7] text-sm">#{typeof o.id === "string" ? o.id.slice(0, 8) : o.id}</p>
                        <p className="text-xs text-[#5a6a82] truncate">{(o.customer as any)?.full_name || (o.service as any)?.title || "Assistência Técnica"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={(o.order_status as any)?.name || "Em andamento"} color={(o.order_status as any)?.color} />
                        <p className="text-[10px] text-[#5a6a82] mt-1">{fmtDate(o.updated_at || o.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: SERVICES ─────────────────────────── */

const SERVICE_STATUSES = ["Solicitação recebida", "Em análise", "Aguardando aprovação", "Em manutenção", "Pronto", "Finalizado"];

function GeneralServicesPanel({ onBack }: { onBack: () => void }) {
  return <AdminBackContext.Provider value={onBack}><GeneralServicesPanelContent onBack={onBack} /></AdminBackContext.Provider>;
}

function GeneralServicesPanelContent({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const load = async () => { setLoading(true); const { data, error } = await getGeneralServices(); if (error) { console.error("[ADMIN] general services load error:", error); setToast({ msg: `Erro ao carregar serviços gerais: ${error.message}`, type: "error" }); } else setItems(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditItem(null); setName(""); setActive(true); setFormOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setName(item.name || ""); setActive(item.is_active !== false); setFormOpen(true); };
  const canCreate = hasPermission("general_services.create");
  const canEdit = hasPermission("general_services.edit");
  const save = async () => { if (!(editItem ? canEdit : canCreate)) return; if (!name.trim()) { setToast({ msg: "Informe o nome do serviço.", type: "error" }); return; } setSaving(true); const result = editItem ? await updateGeneralService(editItem.id, { name: name.trim(), is_active: active }) : await createGeneralService({ name: name.trim(), is_active: active, sort_order: items.length }); setSaving(false); if (result.error) { console.error("[ADMIN] general service save error:", result.error); setToast({ msg: `Erro ao salvar serviço geral: ${result.error.message}`, type: "error" }); return; } setFormOpen(false); setToast({ msg: editItem ? "Serviço geral atualizado." : "Serviço geral criado.", type: "success" }); load(); };
  const toggle = async (item: any) => { if (!canEdit) return; const result = await setGeneralServiceActive(item.id, !item.is_active); if (result.error) { console.error("[ADMIN] general service toggle error:", result.error); setToast({ msg: `Erro ao atualizar serviço: ${result.error.message}`, type: "error" }); return; } load(); };
  return <div className="space-y-5"><InternalBackButton onBack={onBack} />{toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}<PageHeader title="Serviços Gerais" subtitle="Serviços técnicos internos utilizados na operação" actions={canCreate ? <BtnPrimary onClick={openNew}><Plus size={16} /> Novo serviço</BtnPrimary> : null} /><div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Wrench} title="Nenhum serviço geral cadastrado" message="Cadastre um serviço técnico interno." onAdd={canCreate ? openNew : undefined} addLabel="Novo serviço" /> : <div className="divide-y divide-[#0d1b2e]/5">{items.map(item => <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc]"><div><p className="font-bold text-[#0d1b2e]">{item.name}</p><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></div><div className="flex gap-1">{canEdit && <><button onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={15} /></button><button onClick={() => toggle(item)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={item.is_active ? "Desativar" : "Ativar"}>{item.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</button></>}</div></div>)}</div>}</div><AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Operação > Serviços Gerais" title={editItem ? editItem.name : "Novo serviço"} subtitle="Cadastro de serviço técnico interno"><div className="p-5"><Section title="Serviço geral"><FInput label="Nome do serviço" required value={name} onChange={(e: any) => setName(e.target.value)} /><div className="mt-4"><FToggle label="Serviço ativo" checked={active} onChange={setActive} /></div></Section></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div></AdminPage></div>;
}

function TabServices({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [serviceView, setServiceView] = useState<"site" | "general">("site");

  const load = async () => {
    setLoading(true);
    const [sRes, cRes, bRes, pRes] = await Promise.all([
      supabase.from("services").select("*, service_variants(*), service_inclusions(*), service_exclusions(*), service_price_factors(*), service_faqs(*), service_sections(*)").order("sort_order"),
      supabase.from("service_categories").select("id, name").order("sort_order"),
      supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name").eq("is_active", true).order("created_at", { ascending: false }),
    ]);
    if (sRes.error) setToast({ msg: `Erro ao carregar serviços: ${sRes.error.message}`, type: "error" }); else setServices(sRes.data || []);
    if (cRes.error) setToast({ msg: `Erro ao carregar categorias: ${cRes.error.message}`, type: "error" }); else setCategories(cRes.data || []);
    if (bRes.error) setToast({ msg: `Erro ao carregar marcas: ${bRes.error.message}`, type: "error" }); else setBrands(bRes.data || []);
    if (pRes.error) setToast({ msg: `Erro ao carregar produtos: ${pRes.error.message}`, type: "error" }); else setProducts(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (serviceView === "general") return <GeneralServicesPanel onBack={() => setServiceView("site")} />;

  const openNew = () => { setEditItem(null); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditItem(s); setDrawerOpen(true); };

  const handleDelete = async (id: string) => {
    if (!hasPermission("services.delete")) return;
    console.log("[ADMIN] Deleting service:", id);
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      console.error("[ADMIN] Delete error:", error);
      setToast({ msg: `Erro ao excluir: ${error.message}`, type: "error" });
      return;
    }
    setDelId(null);
    setToast({ msg: "Serviço excluído com sucesso.", type: "success" });
    load();
  };

  const toggleActive = async (s: any) => {
    console.log("[ADMIN] Toggling service active status:", s.id);
    const { error } = await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) {
      console.error("[ADMIN] Toggle active error:", error);
      setToast({ msg: `Erro ao atualizar: ${error.message}`, type: "error" });
      return;
    }
    setToast({ msg: "Status atualizado com sucesso.", type: "success" });
    load();
  };

  const filtered = services.filter(s =>
    !search || s.title?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedServices = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este serviço e todos os dados associados?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Serviços do Site" subtitle={`${services.length} serviço${services.length !== 1 ? "s" : ""} cadastrado${services.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("services.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Novo serviço</BtnPrimary>}</div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar serviços..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Wrench} title={search ? "Nenhum resultado" : "Nenhum serviço cadastrado"} message={search ? `Nenhum serviço com "${search}"` : "Clique em Novo serviço para começar."} onAdd={!search && hasPermission("services.create") ? openNew : undefined} addLabel="Novo serviço" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Serviço</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Variações</th>
                  <th className="px-4 py-3 text-left">Destaque</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedServices.map(s => {
                  const cat = categories.find(c => c.id === s.category_id);
                  return (
                    <tr key={s.id} className="hover:bg-[#f8fafc]/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div>
                          <p className="font-bold text-[#0d1b2e]">{s.title}</p>
                          {s.short_description && <p className="text-xs text-[#5a6a82] truncate max-w-xs">{s.short_description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{cat?.name || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{s.service_variants?.length || 0}</td>
                      <td className="px-4 py-3.5">
                        {s.is_featured ? <Star size={15} className="text-amber-400 fill-amber-400" /> : <span className="text-xs text-[#5a6a82]">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={s.is_active ? "Ativo" : "Inativo"} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {hasPermission("services.update") && <button onClick={() => openEdit(s)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors" title="Editar"><Edit2 size={15} /></button>}
                          {hasPermission("services.update") && <button onClick={() => toggleActive(s)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={s.is_active ? "Desativar" : "Ativar"}>
                            {s.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                          </button>}
                          {hasPermission("services.delete") && <button onClick={() => setDelId(s.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      <ServiceDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); load(); }} editItem={editItem} categories={categories} brands={brands} products={products} userId={user?.id || null} onToast={setToast} />
    </div>
  );
}

function ServiceDrawer({ open, onClose, editItem, categories, brands, products, userId, onToast }: {
  open: boolean; onClose: () => void; editItem: any | null; categories: any[]; brands: any[]; products: any[]; userId: string | null; onToast: (t: { msg: string; type: "success" | "error" }) => void;
}) {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState("info");
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [coverMediaId, setCoverMediaId] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [priceMode, setPriceMode] = useState<"FIXED" | "STARTING_FROM" | "QUOTE" | "HIDDEN">("QUOTE");
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  // Variants
  const [variants, setVariants] = useState<{ title: string; description: string; price: string }[]>([]);
  // Features (incluso)
  const [features, setFeatures] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [priceFactors, setPriceFactors] = useState<{ name: string; description: string; impact: "increase" | "decrease"; amount: string; unit: string }[]>([]);
  const [sections, setSections] = useState<{ title: string; content: string }[]>([]);
  // FAQs
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);

  useEffect(() => {
    if (open) {
      setTab("info");
      if (editItem) {
        setName(editItem.title || "");
        setSlug(editItem.slug || "");
        setCategoryId(editItem.category_id || "");
        setBrandId(editItem.brand_id || ""); setProductId(editItem.product_id || ""); setCoverMediaId(editItem.cover_media_id || "");
        setShortDesc(editItem.short_description || "");
        setDescription(editItem.description || "");
        setBasePrice(editItem.base_price == null ? "" : String(editItem.base_price));
        setPriceMode(["FIXED", "STARTING_FROM", "QUOTE", "HIDDEN"].includes(editItem.price_mode) ? editItem.price_mode : "QUOTE");
        setActive(editItem.is_active ?? true);
        setFeatured(editItem.is_featured ?? false);
        setSortOrder(editItem.sort_order ?? 0);
        setVariants((editItem.service_variants || []).map((v: any) => ({ title: v.title || "", description: v.description || "", price: v.price == null ? "" : String(v.price) })));
        setFeatures((editItem.service_inclusions || []).map((f: any) => f.description || ""));
        setExclusions((editItem.service_exclusions || []).map((item: any) => item.description || ""));
        setPriceFactors((editItem.service_price_factors || []).map((factor: any) => ({ name: factor.name || "", description: factor.description || "", impact: factor.impact || "increase", amount: factor.amount == null ? "" : String(factor.amount), unit: factor.unit || "" })));
        setSections((editItem.service_sections || []).map((section: any) => ({ title: section.title || "", content: section.content || "" })));
        setFaqs((editItem.service_faqs || []).map((f: any) => ({ question: f.question || "", answer: f.answer || "" })));
      } else {
        setName(""); setSlug(""); setCategoryId(""); setBrandId(""); setProductId(""); setCoverMediaId(""); setShortDesc(""); setDescription(""); setBasePrice(""); setPriceMode("QUOTE");
        setActive(true); setFeatured(false); setSortOrder(0);
        setVariants([]); setFeatures([]); setExclusions([]); setPriceFactors([]); setSections([]); setFaqs([]);
      }
    }
  }, [open, editItem]);


  const autoSlug = slugify;

  // Generate unique slug by checking for conflicts in Supabase
  const generateUniqueServiceSlug = async (title: string, excludeId?: string): Promise<string> => {
    const baseSlug = autoSlug(title);
    console.log("[ADMIN] Generating slug for title:", title, "base slug:", baseSlug);
    
    // Query all services to find existing slugs
    const { data: existingServices, error: queryError } = await supabase.from("services").select("id, slug");
    if (queryError) {
      console.error("[ADMIN] Error querying services for slug check:", queryError);
      return baseSlug;
    }
    
    // Filter out the current service being edited
    const existingSlugs = existingServices
      ?.filter((s: any) => !excludeId || s.id !== excludeId)
      .map((s: any) => s.slug) || [];
    
    // Check if base slug is available
    if (!existingSlugs.includes(baseSlug)) {
      console.log("[ADMIN] Slug available:", baseSlug);
      return baseSlug;
    }
    
    // Find next available slug with number suffix
    let counter = 2;
    let candidateSlug = `${baseSlug}-${counter}`;
    while (existingSlugs.includes(candidateSlug)) {
      counter++;
      candidateSlug = `${baseSlug}-${counter}`;
    }
    
    console.log("[ADMIN] Slug available (with suffix):", candidateSlug);
    return candidateSlug;
  };

  const handleSave = async () => {
    if (!(editItem ? hasPermission("services.update") : hasPermission("services.create"))) return;
    if (!name.trim()) { onToast({ msg: "Nome do serviço é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      console.log("[ADMIN] Saving service:", { title: name, is_active: active, is_featured: featured });
      
      
      let finalSlug = slug;
      
      // For new services, always generate a unique slug
      if (!editItem) {
        finalSlug = await generateUniqueServiceSlug(name);
        console.log("[ADMIN] Generated unique slug for new service:", finalSlug);
      } else {
        // For edits, only regenerate slug if title changed
        const previousSlug = autoSlug(editItem.title || "");
        const newSlug = autoSlug(name);
        
        if (previousSlug !== newSlug) {
          // Title changed, generate new unique slug (excluding current service)
          finalSlug = await generateUniqueServiceSlug(name, editItem.id);
          console.log("[ADMIN] Title changed, generated new slug:", finalSlug);
        } else {
          // Title unchanged, keep existing slug
          finalSlug = slug;
          console.log("[ADMIN] Title unchanged, keeping existing slug:", finalSlug);
        }
      }
      
      const payload = { title: name.trim(), slug: finalSlug, category_id: categoryId || null, brand_id: brandId || null, product_id: productId || null, cover_media_id: coverMediaId || null, short_description: shortDesc || null, description: description || null, base_price: basePrice ? Number(basePrice) : null, price_mode: priceMode, is_active: active, is_featured: featured, sort_order: sortOrder, updated_by: userId };
      let serviceId = editItem?.id;
      
      // Insert or Update main service
      if (editItem) {
        console.log("[ADMIN] Updating service:", serviceId);
        const { error: updateError } = await supabase.from("services").update(payload).eq("id", serviceId);
        if (updateError) {
          console.error("[ADMIN] Service update error:", updateError);
          onToast({ msg: `Erro ao atualizar serviço: ${updateError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service updated successfully");
      } else {
        console.log("[ADMIN] Creating new service");
        const { data, error: insertError } = await supabase.from("services").insert({ ...payload, created_by: userId }).select().single();
        if (insertError) {
          console.error("[ADMIN] Service insert error:", insertError);
          onToast({ msg: `Erro ao criar serviço: ${insertError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        serviceId = data?.id;
        console.log("[ADMIN] Service created with ID:", serviceId);
      }
      
      if (!serviceId) {
        onToast({ msg: "Erro: ID do serviço não obtido.", type: "error" });
        setSaving(false);
        return;
      }
      
      // Save service variants
      console.log("[ADMIN] Saving service variants:", variants.length);
      const { error: deleteVariantsError } = await supabase.from("service_variants").delete().eq("service_id", serviceId);
      if (deleteVariantsError) {
        console.error("[ADMIN] Error deleting old variants:", deleteVariantsError);
        onToast({ msg: `Erro ao remover variantes antigas: ${deleteVariantsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (variants.length > 0) {
        const { error: insertVariantsError } = await supabase.from("service_variants").insert(
          variants.map((v, i) => ({
            service_id: serviceId,
            title: v.title,
            description: v.description || null,
            price: v.price ? Number(v.price) : null,
            icon: null,

            is_active: true,
            sort_order: i,
          }))
        );
        if (insertVariantsError) {
          console.error("[ADMIN] Error inserting variants:", insertVariantsError);
          onToast({ msg: `Erro ao salvar variantes: ${insertVariantsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service variants saved");
      }
      
      // Save service inclusions (formerly called "features" in the UI)
      console.log("[ADMIN] Saving service inclusions:", features.filter(Boolean).length);
      const { error: deleteInclusionsError } = await supabase.from("service_inclusions").delete().eq("service_id", serviceId);
      if (deleteInclusionsError) {
        console.error("[ADMIN] Error deleting old inclusions:", deleteInclusionsError);
        onToast({ msg: `Erro ao remover inclusões antigas: ${deleteInclusionsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (features.filter(Boolean).length > 0) {
        const { error: insertInclusionsError } = await supabase.from("service_inclusions").insert(
          features.filter(Boolean).map((f, i) => ({
            service_id: serviceId,
            description: f,
            sort_order: i,
          }))
        );
        if (insertInclusionsError) {
          console.error("[ADMIN] Error inserting inclusions:", insertInclusionsError);
          onToast({ msg: `Erro ao salvar inclusões: ${insertInclusionsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service inclusions saved");
      }

      const { error: deleteExclusionsError } = await supabase.from("service_exclusions").delete().eq("service_id", serviceId);
      if (deleteExclusionsError) { onToast({ msg: `Erro ao remover exclusões antigas: ${deleteExclusionsError.message}`, type: "error" }); return; }
      const validExclusions = exclusions.filter(Boolean);
      if (validExclusions.length > 0) {
        const { error } = await supabase.from("service_exclusions").insert(validExclusions.map((description, sort_order) => ({ service_id: serviceId, description, sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar exclusões: ${error.message}`, type: "error" }); return; }
      }

      const { error: deleteFactorsError } = await supabase.from("service_price_factors").delete().eq("service_id", serviceId);
      if (deleteFactorsError) { onToast({ msg: `Erro ao remover fatores antigos: ${deleteFactorsError.message}`, type: "error" }); return; }
      const validFactors = priceFactors.filter((factor) => factor.name.trim());
      if (validFactors.length > 0) {
        const { error } = await supabase.from("service_price_factors").insert(validFactors.map((factor, sort_order) => ({ service_id: serviceId, name: factor.name.trim(), description: factor.description || null, impact: factor.impact, amount: Number(factor.amount) || 0, unit: factor.unit || null, sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar fatores: ${error.message}`, type: "error" }); return; }
      }

      const { error: deleteSectionsError } = await supabase.from("service_sections").delete().eq("service_id", serviceId);
      if (deleteSectionsError) { onToast({ msg: `Erro ao remover seções antigas: ${deleteSectionsError.message}`, type: "error" }); return; }
      const validSections = sections.filter((section) => section.title.trim() && section.content.trim());
      if (validSections.length > 0) {
        const { error } = await supabase.from("service_sections").insert(validSections.map((section, sort_order) => ({ service_id: serviceId, title: section.title.trim(), content: section.content.trim(), sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar seções: ${error.message}`, type: "error" }); return; }
      }
      
      // Save service FAQs
      console.log("[ADMIN] Saving service FAQs:", faqs.filter(f => f.question).length);
      const { error: deleteFaqsError } = await supabase.from("service_faqs").delete().eq("service_id", serviceId);
      if (deleteFaqsError) {
        console.error("[ADMIN] Error deleting old FAQs:", deleteFaqsError);
        onToast({ msg: `Erro ao remover FAQs antigas: ${deleteFaqsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (faqs.filter(f => f.question).length > 0) {
        const { error: insertFaqsError } = await supabase.from("service_faqs").insert(
          faqs.filter(f => f.question).map((f, i) => ({
            service_id: serviceId,
            question: f.question,
            answer: f.answer,
            section_id: null, is_active: true, sort_order: i,
          }))
        );
        if (insertFaqsError) {
          console.error("[ADMIN] Error inserting FAQs:", insertFaqsError);
          onToast({ msg: `Erro ao salvar FAQs: ${insertFaqsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service FAQs saved");
      }
      
      console.log("[ADMIN] Service save completed successfully");
      onToast({ msg: editItem ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!", type: "success" });
      onClose();
    } catch (err) {
      console.error("[ADMIN] Unexpected error saving service:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      onToast({ msg: `Erro ao salvar: ${errorMessage}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "info", label: "Informações", icon: List },
    { id: "price", label: "Preço", icon: DollarSign },
    { id: "features", label: "Incluso", icon: CheckCircle },
    { id: "exclusions", label: "Não incluso", icon: X },
    { id: "factors", label: "Fatores", icon: Activity },
    { id: "faq", label: "FAQ", icon: HelpCircle },
    { id: "sections", label: "Seções", icon: FileText },
    { id: "publish", label: "Publicação", icon: Star },
  ];

  const catOptions = [{ value: "", label: "Selecionar categoria..." }, ...categories.map(c => ({ value: c.id, label: c.name }))];
  const brandOptions = [{ value: "", label: "Sem marca" }, ...brands.map(brand => ({ value: brand.id, label: brand.name }))];
  const productOptions = [{ value: "", label: "Sem produto vinculado" }, ...products.map(product => ({ value: product.id, label: product.name }))];

  return (
    <AdminPage open={open} onClose={onClose} breadcrumb="Serviços" title={editItem ? `Editar: ${editItem.title}` : "Novo serviço"} subtitle="Preencha todas as seções para publicar o serviço" maxW="max-w-3xl">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#0d1b2e]/8 px-4 flex gap-0 overflow-x-auto flex-shrink-0">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap",
                tab === t.id ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-5 space-y-4">
        {/* INFO TAB */}
        {tab === "info" && (
          <>
            <Section title="Identificação">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FInput label="Nome do Serviço" value={name} required onChange={(e: any) => { setName(e.target.value); if (!editItem) setSlug(autoSlug(e.target.value)); }} placeholder="Ex: Instalação de Ar-condicionado" />
                </div>
                <FInput label="Slug (URL)" value={slug} onChange={(e: any) => setSlug(e.target.value)} placeholder="instalacao-ar-condicionado" hint="Gerado automaticamente a partir do nome." />
                <FSelect label="Categoria" value={categoryId} onChange={(e: any) => setCategoryId(e.target.value)} options={catOptions} />
                <FSelect label="Marca" value={brandId} onChange={(e: any) => setBrandId(e.target.value)} options={brandOptions} />
                <FSelect label="Produto relacionado" value={productId} onChange={(e: any) => setProductId(e.target.value)} options={productOptions} />
              </div>
            </Section>
            <Section title="Descrição">
              <div className="space-y-4">
                <FTextarea label="Descrição curta" value={shortDesc} onChange={(e: any) => setShortDesc(e.target.value)} rows={2} placeholder="Frase resumida que aparece nos cards e listagens." />
                <FTextarea label="Descrição completa" value={description} onChange={(e: any) => setDescription(e.target.value)} rows={5} placeholder="Texto completo que aparece na página do serviço." />
              </div>
            </Section>
            <Section title="Imagem de capa">
              <ImageUpload bucket="service-images" currentMediaId={coverMediaId} onUpload={setCoverMediaId} canUpload={editItem ? hasPermission("services.update") : hasPermission("services.create")} label="Imagem do serviço" />
            </Section>
          </>
        )}

        {/* PRICE TAB */}
        {tab === "price" && (
          <>
            <Section title="Preço base">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FInput label="Preço base (R$)" type="number" min="0" step="0.01" value={basePrice} onChange={(e: any) => setBasePrice(e.target.value)} placeholder="Vazio para consultar" />
                <FSelect label="Modo de preço" value={priceMode} onChange={(e: any) => setPriceMode(e.target.value)} options={[{ value: "FIXED", label: "Preço fixo" }, { value: "STARTING_FROM", label: "Preço a partir de" }, { value: "QUOTE", label: "Consultar orçamento" }, { value: "HIDDEN", label: "Não exibir preço" }]} />
              </div>
            </Section>
            <Section title="Variações de Preço">
              <p className="text-xs text-[#5a6a82] mb-3">Adicione variações para mostrar opções diferentes de preço. Deixe em branco o preço para indicar "Consultar".</p>
              {variants.map((v, i) => (
                <div key={i} className="flex gap-3 items-start mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FInput label={i === 0 ? "Título" : undefined} value={v.title} onChange={(e: any) => { const n = [...variants]; n[i].title = e.target.value; setVariants(n); }} placeholder="Ex: 12.000 BTUs" />
                    <FInput label={i === 0 ? "Preço (R$)" : undefined} value={v.price} onChange={(e: any) => { const n = [...variants]; n[i].price = e.target.value; setVariants(n); }} placeholder="Ex: 250.00 (vazio = consultar)" type="number" min="0" step="0.01" />
                    <FInput label={i === 0 ? "Descrição" : undefined} value={v.description} onChange={(e: any) => { const n = [...variants]; n[i].description = e.target.value; setVariants(n); }} placeholder="Descrição da variação" />
                  </div>
                  {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setVariants(variants.filter((_, idx) => idx !== i))} className="mt-5 p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                    <X size={15} />
                  </button>}
                </div>
              ))}
              {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setVariants([...variants, { title: "", description: "", price: "" }])}
                className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center transition-colors">
                <Plus size={14} /> Adicionar variação
              </button>}
            </Section>
          </>
        )}

        {/* FEATURES TAB */}
        {tab === "features" && (
          <Section title="O que está incluso">
            <p className="text-xs text-[#5a6a82] mb-3">Liste os itens inclusos no serviço. Se não houver itens, a seção não aparecerá no site.</p>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                <input value={f} onChange={(e) => { const n = [...features]; n[i] = e.target.value; setFeatures(n); }}
                  className={cn(INPUT, "py-2 text-xs flex-1")} placeholder={`Item ${i + 1}...`} />
                {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                  <X size={14} />
                </button>}
              </div>
            ))}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFeatures([...features, ""])}
              className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center mt-2 transition-colors">
              <Plus size={14} /> Adicionar item
            </button>}
          </Section>
        )}

        {tab === "exclusions" && (
          <Section title="O que não está incluso">
            {exclusions.map((item, index) => <div key={index} className="flex items-center gap-2 mb-2"><X size={14} className="text-red-500" /><input value={item} onChange={(event) => { const next = [...exclusions]; next[index] = event.target.value; setExclusions(next); }} className={cn(INPUT, "py-2 text-xs flex-1")} placeholder={`Item ${index + 1}...`} />{hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setExclusions(exclusions.filter((_, itemIndex) => itemIndex !== index))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X size={14} /></button>}</div>)}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setExclusions([...exclusions, ""])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center mt-2"><Plus size={14} /> Adicionar item</button>}
          </Section>
        )}

        {tab === "factors" && (
          <Section title="Fatores que alteram preço">
            {priceFactors.map((factor, index) => <div key={index} className="mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 grid grid-cols-1 sm:grid-cols-2 gap-3"><FInput label="Título" value={factor.name} onChange={(event: any) => { const next = [...priceFactors]; next[index].name = event.target.value; setPriceFactors(next); }} /><FSelect label="Impacto" value={factor.impact} onChange={(event: any) => { const next = [...priceFactors]; next[index].impact = event.target.value; setPriceFactors(next); }} options={[{ value: "increase", label: "Aumenta" }, { value: "decrease", label: "Reduz" }]} /><FInput label="Valor" type="number" value={factor.amount} onChange={(event: any) => { const next = [...priceFactors]; next[index].amount = event.target.value; setPriceFactors(next); }} /><FInput label="Unidade" value={factor.unit} onChange={(event: any) => { const next = [...priceFactors]; next[index].unit = event.target.value; setPriceFactors(next); }} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={factor.description} onChange={(event: any) => { const next = [...priceFactors]; next[index].description = event.target.value; setPriceFactors(next); }} rows={2} /></div>{hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setPriceFactors(priceFactors.filter((_, factorIndex) => factorIndex !== index))} className="text-xs text-red-600 font-bold">Remover fator</button>}</div>)}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setPriceFactors([...priceFactors, { name: "", description: "", impact: "increase", amount: "", unit: "" }])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center"><Plus size={14} /> Adicionar fator</button>}
          </Section>
        )}

        {/* FAQ TAB */}
        {tab === "faq" && (
          <Section title="Perguntas Frequentes">
            <p className="text-xs text-[#5a6a82] mb-3">Adicione perguntas e respostas frequentes sobre este serviço. Se não houver, a seção não aparecerá no site.</p>
            {faqs.map((f, i) => (
              <div key={i} className="mb-4 p-4 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[#5a6a82] mt-2.5 flex-shrink-0">P.</span>
                  <input value={f.question} onChange={(e) => { const n = [...faqs]; n[i].question = e.target.value; setFaqs(n); }}
                    className={cn(INPUT, "py-2 text-xs flex-1")} placeholder="Pergunta..." />
                  {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 mt-0.5">
                    <X size={14} />
                  </button>}
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[#5a6a82] mt-2.5 flex-shrink-0">R.</span>
                  <textarea value={f.answer} onChange={(e) => { const n = [...faqs]; n[i].answer = e.target.value; setFaqs(n); }}
                    rows={2} className={cn(INPUT, "resize-none text-xs flex-1")} placeholder="Resposta..." />
                </div>
              </div>
            ))}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}
              className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center transition-colors">
              <Plus size={14} /> Adicionar pergunta
            </button>}
          </Section>
        )}

        {tab === "sections" && (
          <Section title="Seções personalizadas">
            {sections.map((section, index) => <div key={index} className="mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 space-y-3"><FInput label="Título" value={section.title} onChange={(event: any) => { const next = [...sections]; next[index].title = event.target.value; setSections(next); }} /><FTextarea label="Conteúdo" value={section.content} onChange={(event: any) => { const next = [...sections]; next[index].content = event.target.value; setSections(next); }} rows={3} />{hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setSections(sections.filter((_, sectionIndex) => sectionIndex !== index))} className="text-xs text-red-600 font-bold">Remover seção</button>}</div>)}
            {hasPermission(editItem ? "services.update" : "services.create") && <button type="button" onClick={() => setSections([...sections, { title: "", content: "" }])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center"><Plus size={14} /> Adicionar seção</button>}
          </Section>
        )}

        {/* PUBLISH TAB */}
        {tab === "publish" && (
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Serviço ativo" description="Serviços inativos não aparecem no site." checked={active} onChange={setActive} />
              <FToggle label="Destaque" description="Exibe o serviço como destaque na Home e na listagem." checked={featured} onChange={setFeatured} />
              <FInput label="Ordem de exibição" type="number" min="0" value={sortOrder} onChange={(e: any) => setSortOrder(Number(e.target.value))} hint="Menor número aparece primeiro." />
            </div>
          </Section>
        )}
      </div>

      {/* Save footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[#5a6a82]">
          {tab !== "publish" ? "Complete todas as seções antes de publicar." : "Revise e salve as alterações."}
        </p>
        <div className="flex gap-3">
          <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("services.update") : hasPermission("services.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>
            {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {saving ? "Salvando..." : "Salvar serviço"}
          </BtnPrimary>}
        </div>
      </div>
    </AdminPage>
  );
}

/* ─────────────────────────── TAB: CATEGORIES ─────────────────────────── */

function TabCategories({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("service_categories").select("*").order("sort_order");
    if (error) setToast({ msg: `Erro ao carregar categorias: ${error.message}`, type: "error" });
    else setCats(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const autoSlug = slugify;

  const openNew = () => { setForm({ name: "", slug: "", is_active: true, sort_order: 0 }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (c: any) => { setForm({ name: c.name || "", slug: c.slug || "", is_active: c.is_active ?? true, sort_order: c.sort_order ?? 0 }); setEditItem(c); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!(editItem ? hasPermission("categories.update") : hasPermission("categories.create"))) return;
    if (!form.name.trim()) { setToast({ msg: "Nome obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("service_categories", form.name, editItem?.id) : editItem.slug;
      const payload = { ...form, name: form.name.trim(), slug: finalSlug };
      const { data, error } = editItem
        ? await supabase.from("service_categories").update(payload).eq("id", editItem.id).select().single()
        : await supabase.from("service_categories").insert(payload).select().single();
      if (error) {
        console.error("[ADMIN] service_categories save error:", error);
        throw error;
      }
      setDrawerOpen(false);
      setToast({ msg: editItem ? "Categoria atualizada!" : "Categoria criada!", type: "success" });
      load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar categoria: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission("categories.delete")) return;
    const { error } = await supabase.from("service_categories").delete().eq("id", id);
    if (error) { console.error("[ADMIN] service_categories delete error:", error); setToast({ msg: `Erro ao excluir categoria: ${error.message}`, type: "error" }); return; }
    setDelId(null); setToast({ msg: "Categoria excluída.", type: "success" }); load();
  };

  const toggleActive = async (category: any) => {
    if (!hasPermission("categories.update")) return;
    const { error } = await supabase.from("service_categories").update({ is_active: !category.is_active }).eq("id", category.id);
    if (error) { console.error("[ADMIN] service_categories toggle error:", error); setToast({ msg: `Erro ao atualizar categoria: ${error.message}`, type: "error" }); return; }
    setToast({ msg: "Status atualizado!", type: "success" }); load();
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir esta categoria? Serviços vinculados perderão a referência." onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Categorias" subtitle={`${cats.length} categoria${cats.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("categories.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Nova categoria</BtnPrimary>}</div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : cats.length === 0 ? (
          <EmptyState icon={FolderTree} title="Nenhuma categoria cadastrada" message="Crie categorias para organizar seus serviços." onAdd={hasPermission("categories.create") ? openNew : undefined} addLabel="Nova categoria" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Ordem</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {cats.map(c => (
                  <tr key={c.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{c.name}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82] font-mono">{c.slug}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{c.sort_order}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={c.is_active ? "Ativo" : "Inativo"} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission("categories.update") && <><button onClick={() => openEdit(c)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors"><Edit2 size={15} /></button><button onClick={() => toggleActive(c)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={c.is_active ? "Desativar" : "Ativar"}>{c.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</button></>}
                        {hasPermission("categories.delete") && <button onClick={() => setDelId(c.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdminPage open={drawerOpen} onClose={() => setDrawerOpen(false)} breadcrumb="Categorias" title={editItem ? "Editar categoria" : "Nova categoria"} maxW="max-w-lg">
        <div className="p-5 space-y-4">
          <Section title="Informações">
            <div className="space-y-4">
              <FInput label="Nome" value={form.name} required onChange={(e: any) => { setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) }); }} placeholder="Ex: Ar-condicionado" />
              <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="ar-condicionado" hint="Gerado automaticamente ao digitar o nome. Pode ser editado manualmente." />
            </div>
          </Section>
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Categoria ativa" description="Categorias inativas ficam ocultas nos filtros do site." checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("categories.update") : hasPermission("categories.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar categoria"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}

type EquipmentDraftModel = { id?: string; name: string; is_active: boolean };
type EquipmentDraftBrand = { id?: string; name: string; is_active: boolean; models: EquipmentDraftModel[] };
type EquipmentDraft = { id?: string; name: string; is_active: boolean; brands: EquipmentDraftBrand[] };

function EquipmentAdminPanel({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [types, setTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<EquipmentDraft[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const [typeRes, brandRes, modelRes] = await Promise.all([
      supabase.from("equipment_types").select("*").order("sort_order").order("name"),
      supabase.from("equipment_brands").select("*").order("sort_order").order("name"),
      supabase.from("equipment_models").select("*").order("sort_order").order("name"),
    ]);
    const error = typeRes.error || brandRes.error || modelRes.error;
    if (error) setToast({ msg: `Erro ao carregar equipamentos: ${error.message}`, type: "error" });
    setTypes(typeRes.data || []); setBrands(brandRes.data || []); setModels(modelRes.data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const makeDraft = (type?: any): EquipmentDraft => ({
    id: type?.id, name: type?.name || "", is_active: type?.is_active ?? true,
    brands: brands.filter(brand => brand.equipment_type_id === type?.id).map(brand => ({
      id: brand.id, name: brand.name, is_active: brand.is_active,
      models: models.filter(model => model.equipment_brand_id === brand.id).map(model => ({ id: model.id, name: model.name, is_active: model.is_active })),
    })),
  });
  const openNew = () => { setDrafts([makeDraft()]); setFormOpen(true); };
  const openEdit = (type: any) => { setDrafts([makeDraft(type)]); setFormOpen(true); };
  const addEquipment = () => setDrafts(current => [...current, makeDraft()]);
  const updateDraft = (index: number, value: Partial<EquipmentDraft>) => setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const addBrand = (typeIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: [...type.brands, { name: "", is_active: true, models: [{ name: "", is_active: true }] }] } : type));
  const updateBrand = (typeIndex: number, brandIndex: number, value: Partial<EquipmentDraftBrand>) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, ...value } : brand) } : type));
  const removeBrand = (typeIndex: number, brandIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.filter((_, childIndex) => childIndex !== brandIndex) } : type));
  const addModel = (typeIndex: number, brandIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, models: [...brand.models, { name: "", is_active: true }] } : brand) } : type));
  const updateModel = (typeIndex: number, brandIndex: number, modelIndex: number, value: Partial<EquipmentDraftModel>) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, models: brand.models.map((model, itemIndex) => itemIndex === modelIndex ? { ...model, ...value } : model) } : brand) } : type));
  const removeModel = (typeIndex: number, brandIndex: number, modelIndex: number) => setDrafts(current => current.map((type, index) => index === typeIndex ? { ...type, brands: type.brands.map((brand, childIndex) => childIndex === brandIndex ? { ...brand, models: brand.models.filter((_, itemIndex) => itemIndex !== modelIndex) } : brand) } : type));

  const save = async () => {
    if (!drafts.every(type => type.id ? hasPermission("equipment.edit") : hasPermission("equipment.create"))) return;
    if (drafts.some(type => !type.name.trim() || type.brands.some(brand => !brand.name.trim() || brand.models.some(model => !model.name.trim())))) { setToast({ msg: "Preencha equipamento, marcas e modelos antes de salvar.", type: "error" }); return; }
    const typeNames = new Set<string>();
    for (const type of drafts) {
      const normalizedType = type.name.trim().toLowerCase();
      if (typeNames.has(normalizedType) || (!type.id && types.some(item => item.name.trim().toLowerCase() === normalizedType))) { setToast({ msg: `O equipamento "${type.name}" já existe.`, type: "error" }); return; }
      typeNames.add(normalizedType);
      const brandNames = new Set<string>();
      for (const brand of type.brands) {
        const normalizedBrand = brand.name.trim().toLowerCase();
        if (brandNames.has(normalizedBrand) || (!brand.id && brands.some(item => item.equipment_type_id === type.id && item.name.trim().toLowerCase() === normalizedBrand))) { setToast({ msg: `A marca "${brand.name}" está duplicada neste equipamento.`, type: "error" }); return; }
        brandNames.add(normalizedBrand);
        const modelNames = new Set<string>();
        for (const model of brand.models) {
          const normalizedModel = model.name.trim().toLowerCase();
          if (modelNames.has(normalizedModel) || (!model.id && models.some(item => item.equipment_brand_id === brand.id && item.name.trim().toLowerCase() === normalizedModel))) { setToast({ msg: `O modelo "${model.name}" está duplicado nesta marca.`, type: "error" }); return; }
          modelNames.add(normalizedModel);
        }
      }
    }
    setSaving(true);
    try {
      for (const type of drafts) {
        const originalType = type.id ? types.find(item => item.id === type.id) : null;
        const originalBrands = originalType ? brands.filter(item => item.equipment_type_id === originalType.id) : [];
        const typePayload = { name: type.name.trim(), slug: slugify(type.name), is_active: type.is_active, sort_order: 0 };
        const typeResult = type.id ? await supabase.from("equipment_types").update(typePayload).eq("id", type.id).select("id").single() : await supabase.from("equipment_types").insert(typePayload).select("id").single();
        if (typeResult.error || !typeResult.data) throw typeResult.error || new Error("Tipo de equipamento não foi salvo.");
        const typeId = typeResult.data.id;
        for (const brand of type.brands) {
          const originalBrand = brand.id ? originalBrands.find(item => item.id === brand.id) : null;
          const originalModels = originalBrand ? models.filter(item => item.equipment_brand_id === originalBrand.id) : [];
          const brandPayload = { name: brand.name.trim(), slug: slugify(brand.name), equipment_type_id: typeId, is_active: brand.is_active, sort_order: 0 };
          const brandResult = brand.id ? await supabase.from("equipment_brands").update(brandPayload).eq("id", brand.id).select("id").single() : await supabase.from("equipment_brands").insert(brandPayload).select("id").single();
          if (brandResult.error || !brandResult.data) throw brandResult.error || new Error("Marca técnica não foi salva.");
          const brandId = brandResult.data.id;
          for (const model of brand.models) {
            const modelPayload = { name: model.name.trim(), slug: slugify(model.name), equipment_brand_id: brandId, is_active: model.is_active, sort_order: 0 };
            const modelResult = model.id ? await supabase.from("equipment_models").update(modelPayload).eq("id", model.id) : await supabase.from("equipment_models").insert(modelPayload);
            if (modelResult.error) throw modelResult.error;
          }
          for (const oldModel of originalModels.filter(item => !brand.models.some(model => model.id === item.id))) {
            const removeModelResult = await supabase.from("equipment_models").delete().eq("id", oldModel.id);
            if (removeModelResult.error) throw removeModelResult.error;
          }
        }
        for (const oldBrand of originalBrands.filter(item => !type.brands.some(brand => brand.id === item.id))) {
          const removeModelsResult = await supabase.from("equipment_models").delete().eq("equipment_brand_id", oldBrand.id);
          if (removeModelsResult.error) throw removeModelsResult.error;
          const removeBrandResult = await supabase.from("equipment_brands").delete().eq("id", oldBrand.id);
          if (removeBrandResult.error) throw removeBrandResult.error;
        }
      }
      setFormOpen(false); setToast({ msg: "Equipamentos salvos com sucesso.", type: "success" }); await load();
    } catch (error) { setToast({ msg: `Erro ao salvar estrutura: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Equipamentos Técnicos" subtitle="Cadastro hierárquico usado nas ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("equipment.create") && <BtnPrimary onClick={openNew}><Plus size={15} /> Novo equipamento</BtnPrimary>}</div>} />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : types.length === 0 ? <EmptyState icon={Wrench} title="Nenhum equipamento cadastrado" message="Cadastre o primeiro equipamento com suas marcas e modelos." onAdd={hasPermission("equipment.create") ? openNew : undefined} addLabel="Novo equipamento" /> : <div className="divide-y divide-[#0d1b2e]/5">{types.map(type => <div key={type.id} className="px-5 py-4 flex items-center justify-between gap-3"><div><p className="font-bold text-[#0d1b2e]">{type.name}</p><p className="text-xs text-[#5a6a82]">{brands.filter(brand => brand.equipment_type_id === type.id).length} marca(s) técnica(s)</p></div><div className="flex items-center gap-2"><StatusBadge status={type.is_active ? "Ativo" : "Inativo"} />{hasPermission("equipment.edit") && <button onClick={() => openEdit(type)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar equipamento"><Edit2 size={14} /></button>}</div></div>)}</div>}
      </div>
      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Equipamentos Técnicos" title="Cadastro de equipamentos" subtitle="Monte equipamento, marcas e modelos antes de salvar">
        <div className="p-5 space-y-5">{drafts.map((type, typeIndex) => <Section key={`${type.id || "new"}-${typeIndex}`} title="Equipamento"><div className="flex items-end gap-2"><div className="flex-1"><FInput label="Nome do equipamento" required value={type.name} onChange={(e: any) => updateDraft(typeIndex, { name: e.target.value })} placeholder="Ex: Televisão" /></div>{drafts.length > 1 && hasPermission("equipment.delete") && <button type="button" onClick={() => setDrafts(current => current.filter((_, index) => index !== typeIndex))} className="p-2.5 text-red-500 hover:bg-red-50 rounded-lg" title="Remover equipamento"><Trash2 size={16} /></button>}</div><div className="mt-5 space-y-4"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-[#0d1b2e]">Marcas e modelos</h4>{hasPermission("equipment.create") && <button type="button" onClick={() => addBrand(typeIndex)} className="p-1.5 text-[#0057e7] hover:bg-[#e8eef8] rounded-lg" title="Adicionar marca"><Plus size={16} /></button>}</div>{type.brands.map((brand, brandIndex) => <div key={`${brand.id || "new-brand"}-${brandIndex}`} className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4"><div className="flex items-end gap-2"><div className="flex-1"><FInput label="Marca" required value={brand.name} onChange={(e: any) => updateBrand(typeIndex, brandIndex, { name: e.target.value })} placeholder="Ex: Samsung" /></div>{hasPermission("equipment.delete") && <button type="button" onClick={() => removeBrand(typeIndex, brandIndex)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-lg" title="Remover marca"><Trash2 size={15} /></button>}</div><div className="mt-3 pl-3 border-l-2 border-[#0057e7]/20 space-y-2"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Modelos</span>{hasPermission("equipment.create") && <button type="button" onClick={() => addModel(typeIndex, brandIndex)} className="p-1 text-[#0057e7] hover:bg-[#e8eef8] rounded-lg" title="Adicionar modelo"><Plus size={15} /></button>}</div>{brand.models.map((model, modelIndex) => <div key={`${model.id || "new-model"}-${modelIndex}`} className="flex items-center gap-2"><FInput value={model.name} required onChange={(e: any) => updateModel(typeIndex, brandIndex, modelIndex, { name: e.target.value })} placeholder="Nome do modelo" />{hasPermission("equipment.delete") && <button type="button" onClick={() => removeModel(typeIndex, brandIndex, modelIndex)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Remover modelo"><Trash2 size={14} /></button>}</div>)}</div></div>)}</div></Section>)}{hasPermission("equipment.create") && <BtnSecondary onClick={addEquipment}><Plus size={15} /> Adicionar equipamento</BtnSecondary>}</div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{drafts.length > 0 && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar estrutura"}</BtnPrimary>}</div>
      </AdminPage>
    </div>
  );
}

/* ─────────────────────────── TAB: PRODUCTS ─────────────────────────── */

function TabProducts({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const [catalogView, setCatalogView] = useState<"store" | "equipment">("store");
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      supabase.from("products").select("*, product_categories(name)").order("created_at", { ascending: false }),
      supabase.from("product_categories").select("id, name").order("sort_order"),
    ]);
    if (pRes.error) setToast({ msg: `Erro ao carregar produtos: ${pRes.error.message}`, type: "error" });
    else setProducts(pRes.data || []);
    if (cRes.error) setToast({ msg: `Erro ao carregar categorias: ${cRes.error.message}`, type: "error" });
    else setCategories(cRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const autoSlug = slugify;
  const catOptions = [{ value: "", label: "Sem categoria" }, ...categories.map(c => ({ value: c.id, label: c.name }))];

  const openNew = () => { setForm({ name: "", slug: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (p: any) => { setForm({ name: p.name || "", slug: p.slug || "", sku: p.sku || "", short_description: p.short_description || "", description: p.description || "", price: p.price == null ? "" : String(p.price), compare_at_price: p.compare_at_price == null ? "" : String(p.compare_at_price), cover_media_id: p.cover_media_id || "", is_active: p.is_active ?? true, is_featured: p.is_featured ?? false, category_id: p.category_id || "", brand_id: p.brand_id || "", external_platform: p.external_platform || "", external_product_id: p.external_product_id || "", external_url: p.external_url || "" }); setEditItem(p); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!(editItem ? hasPermission("products.update") : hasPermission("products.create"))) return;
    if (!form.name.trim()) { setToast({ msg: "Nome do produto é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("products", form.name, editItem?.id) : editItem.slug;
      const payload = { name: form.name.trim(), slug: finalSlug, sku: form.sku || null, short_description: form.short_description || null, description: form.description || null, price: form.price ? Number(form.price) : null, compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null, cover_media_id: form.cover_media_id || null, is_active: form.is_active, is_featured: form.is_featured, category_id: form.category_id || null, brand_id: form.brand_id || null, external_platform: form.external_platform || null, external_product_id: form.external_product_id || null, external_url: form.external_url || null, updated_by: user?.id || null };
      const { data, error } = editItem ? await supabase.from("products").update(payload).eq("id", editItem.id).select().single() : await supabase.from("products").insert({ ...payload, created_by: user?.id || null }).select().single();
      if (error) { console.error("[ADMIN] products save error:", error); throw error; }
      setDrawerOpen(false);
      setToast({ msg: editItem ? "Produto atualizado!" : "Produto criado!", type: "success" });
      load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar produto: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => { if (!hasPermission("products.delete")) return; const { error } = await supabase.from("products").delete().eq("id", id); if (error) { console.error("[ADMIN] products delete error:", error); setToast({ msg: `Erro ao excluir produto: ${error.message}`, type: "error" }); return; } setDelId(null); setToast({ msg: "Produto excluído.", type: "success" }); load(); };
  const toggleActive = async (p: any) => { if (!hasPermission("products.update")) return; const { error } = await supabase.from("products").update({ is_active: !p.is_active, updated_by: user?.id || null }).eq("id", p.id); if (error) { setToast({ msg: `Erro ao atualizar produto: ${error.message}`, type: "error" }); return; } setToast({ msg: "Status atualizado!", type: "success" }); load(); };
  const toggleFeatured = async (p: any) => { if (!hasPermission("products.update")) return; const { error } = await supabase.from("products").update({ is_featured: !p.is_featured, updated_by: user?.id || null }).eq("id", p.id); if (error) { setToast({ msg: `Erro ao atualizar destaque: ${error.message}`, type: "error" }); return; } setToast({ msg: "Destaque atualizado!", type: "success" }); load(); };

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (catalogView === "equipment") return <EquipmentAdminPanel onBack={() => setCatalogView("store")} />;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este produto permanentemente?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Produtos" subtitle={`${products.length} produto${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("products.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Novo produto</BtnPrimary>}</div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar produtos..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Package} title={search ? "Nenhum resultado" : "Nenhum produto cadastrado"} message="Adicione produtos para exibi-los na loja." onAdd={!search && hasPermission("products.create") ? openNew : undefined} addLabel="Novo produto" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Preço</th>
                  <th className="px-4 py-3 text-left">Destaque</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedProducts.map(p => (
                  <tr key={p.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProductAdminThumb mediaId={p.cover_media_id} name={p.name} />
                        <span className="font-bold text-[#0d1b2e]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{p.categories?.name || "—"}</td>
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{p.price ? `R$ ${Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consultar"}</td>
                    <td className="px-4 py-3.5">{hasPermission("products.update") && <button onClick={() => toggleFeatured(p)} title={p.is_featured ? "Remover destaque" : "Destacar produto"}>{p.is_featured ? <Star size={15} className="text-amber-400 fill-amber-400" /> : <Star size={15} className="text-[#5a6a82]" />}</button>}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={p.is_active ? "Ativo" : "Inativo"} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission("products.update") && <><button onClick={() => openEdit(p)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors"><Edit2 size={15} /></button><button onClick={() => toggleActive(p)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><CheckCircle size={15} /></button></>}
                        {hasPermission("products.delete") && <button onClick={() => setDelId(p.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      <AdminPage open={drawerOpen} onClose={() => setDrawerOpen(false)} breadcrumb="Produtos" title={editItem ? "Editar produto" : "Novo produto"} maxW="max-w-xl">
        <div className="p-5 space-y-4">
          <Section title="Informações Principais">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><FInput label="Nome do produto" value={form.name} required onChange={(e: any) => { setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) }); }} placeholder="Nome do produto" /></div>
                <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="slug-do-produto" />
                <FSelect label="Categoria" value={form.category_id} onChange={(e: any) => setForm({ ...form, category_id: e.target.value })} options={catOptions} />
              </div>
              <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descreva o produto..." />
            </div>
          </Section>
          <Section title="Preço e Imagem">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FInput label="Preço (R$)" type="number" min="0" step="0.01" value={form.price} onChange={(e: any) => setForm({ ...form, price: e.target.value })} placeholder="Deixe em branco para consultar" hint="Vazio = 'Consultar preço'" />
              <FInput label="Preço de comparação (R$)" type="number" min="0" step="0.01" value={form.compare_at_price} onChange={(e: any) => setForm({ ...form, compare_at_price: e.target.value })} />
            </div>
            <ImageUpload bucket="product-images" currentMediaId={form.cover_media_id} onUpload={mediaId => setForm({ ...form, cover_media_id: mediaId })} canUpload={editItem ? hasPermission("products.update") : hasPermission("products.create")} label="Imagem do produto" />
          </Section>
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Produto ativo" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FToggle label="Destaque" description="Exibe na Home e em destaques da loja." checked={form.is_featured} onChange={v => setForm({ ...form, is_featured: v })} />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("products.update") : hasPermission("products.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar produto"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}

/* ─────────────────────────── TAB: BRANDS ─────────────────────────── */

function TabBrands({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", logo_media_id: "", website_url: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const { data, error } = await supabase.from("brands").select("*").order("sort_order"); if (error) setToast({ msg: `Erro ao carregar marcas: ${error.message}`, type: "error" }); else setBrands(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);

  const autoSlug = slugify;
  const openNew = () => { setForm({ name: "", slug: "", description: "", logo_media_id: "", website_url: "", is_active: true, sort_order: 0 }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (b: any) => { setForm({ name: b.name || "", slug: b.slug || "", description: b.description || "", logo_media_id: b.logo_media_id || "", website_url: b.website_url || "", is_active: b.is_active ?? true, sort_order: b.sort_order ?? 0 }); setEditItem(b); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!(editItem ? hasPermission("brands.update") : hasPermission("brands.create"))) return;
    if (!form.name.trim()) { setToast({ msg: "Nome da marca é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("brands", form.name, editItem?.id) : editItem.slug;
      const payload = { ...form, name: form.name.trim(), slug: finalSlug, logo_media_id: form.logo_media_id || null, website_url: form.website_url || null, description: form.description || null };
      const { data, error } = editItem ? await supabase.from("brands").update(payload).eq("id", editItem.id).select().single() : await supabase.from("brands").insert(payload).select().single();
      if (error) { console.error("[ADMIN] brands save error:", error); throw error; }
      setDrawerOpen(false);
      setToast({ msg: editItem ? "Marca atualizada!" : "Marca criada!", type: "success" });
      load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar marca: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => { if (!hasPermission("brands.delete")) return; const { error } = await supabase.from("brands").delete().eq("id", id); if (error) { setToast({ msg: `Erro ao excluir marca: ${error.message}`, type: "error" }); return; } setDelId(null); setToast({ msg: "Marca excluída.", type: "success" }); load(); };
  const toggleActive = async (brand: any) => { if (!hasPermission("brands.update")) return; const { error } = await supabase.from("brands").update({ is_active: !brand.is_active }).eq("id", brand.id); if (error) { setToast({ msg: `Erro ao atualizar marca: ${error.message}`, type: "error" }); return; } setToast({ msg: "Status atualizado!", type: "success" }); load(); };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const filteredBrands = brands;
  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBrands = filteredBrands.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [brands.length]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir esta marca?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Marcas" subtitle={`${brands.length} marca${brands.length !== 1 ? "s" : ""}`} actions={
        <div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("brands.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Nova marca</BtnPrimary>}</div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : brands.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhuma marca cadastrada" onAdd={hasPermission("brands.create") ? openNew : undefined} addLabel="Nova marca" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
              {pagedBrands.map(b => (
                <div key={b.id} className={cn("rounded-xl border p-4 flex flex-col items-center gap-3 transition-all hover:shadow-md", b.is_active ? "border-[#0d1b2e]/10 bg-white" : "border-[#0d1b2e]/5 bg-[#f8fafc] opacity-60")}>
                  <BrandAdminLogo mediaId={b.logo_media_id} name={b.name} />
                  <div className="text-center">
                    <p className="font-bold text-[#0d1b2e] text-sm">{b.name}</p>
                    <StatusBadge status={b.is_active ? "Ativo" : "Inativo"} />
                  </div>
                  <div className="flex gap-1">
                    {hasPermission("brands.update") && <><button onClick={() => openEdit(b)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors"><Edit2 size={14} /></button><button onClick={() => toggleActive(b)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">{b.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</button></>}
                    {hasPermission("brands.delete") && <button onClick={() => setDelId(b.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
            <PaginationBar
              page={safePage}
              pageSize={pageSize}
              totalItems={filteredBrands.length}
              onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
              onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
            />
          </>
        )}
      </div>

      <AdminPage open={drawerOpen} onClose={() => setDrawerOpen(false)} breadcrumb="Marcas" title={editItem ? "Editar marca" : "Nova marca"} maxW="max-w-md">
        <div className="p-5 space-y-4">
          <Section title="Informações">
            <div className="space-y-4">
              <FInput label="Nome da marca" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) })} placeholder="Ex: Samsung" />
              <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} />
              <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={2} />
              <FInput label="Site" value={form.website_url} onChange={(e: any) => setForm({ ...form, website_url: e.target.value })} />
              <FToggle label="Marca ativa" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </Section>
          <Section title="Logo">
            <div className="space-y-3">
              <ImageUpload bucket="brand-images" currentMediaId={form.logo_media_id} onUpload={mediaId => setForm({ ...form, logo_media_id: mediaId })} canUpload={editItem ? hasPermission("brands.update") : hasPermission("brands.create")} label="Logo da marca" />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("brands.update") : hasPermission("brands.create")) && <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar marca"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}

/* ─────────────────────────── TAB: QUOTES ─────────────────────────── */

function TabQuotes({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const { user, hasPermission } = useAuth();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const [quotesResult, statusResult] = await Promise.all([
      supabase.from("quote_requests").select("id, protocol, created_at, updated_at, requested_at, assigned_to, status_id, customer_id, service_id, brand_id, product_id, customer_message, estimated_price, final_price, request_status:request_statuses(id,name,color), customer:customers(id,customer_type,full_name,whatsapp,email,document,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,addresses:customer_addresses(*)), service:services(title), brand:brands(name), product:products(name)").order("created_at", { ascending: false }),
      supabase.from("request_statuses").select("id, name, color, sort_order").order("sort_order"),
    ]);
    if (quotesResult.error) setToast({ msg: `Erro ao carregar orçamentos: ${quotesResult.error.message}`, type: "error" });
    else setQuotes((quotesResult.data || []).map((q: any) => ({ ...q, statusName: q.request_status?.name || "Sem status" })));
    if (statusResult.error) setToast({ msg: `Erro ao carregar status: ${statusResult.error.message}`, type: "error" });
    else setStatuses(statusResult.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, statusId: string) => {
    if (!hasPermission("quotes.update") && !hasPermission("quotes.edit")) return;
    const selectedStatus = statuses.find((status) => status.id === statusId);
    const { error: updateError } = await supabase.from("quote_requests").update({ status_id: statusId }).eq("id", id);
    if (updateError) { console.error("[ADMIN] quote status update error:", updateError); setToast({ msg: `Erro ao atualizar status: ${updateError.message}`, type: "error" }); return; }
    const { error: historyError } = await supabase.from("quote_status_history").insert({ quote_request_id: id, status_id: statusId, created_by: user?.id || null });
    if (historyError) console.warn("[ADMIN] quote status history warning:", historyError.message);
    if (detail?.id === id) setDetail({ ...detail, status_id: statusId, statusName: selectedStatus?.name || "Sem status" });
    setToast({ msg: "Status atualizado!", type: "success" });
    load();
  };

  const handleDeleteQuote = async (id: string) => {
    if (!hasPermission("quotes.delete")) return;
    const { error } = await supabase.from("quote_requests").delete().eq("id", id);
    if (error) {
      setToast({ msg: `Não foi possível excluir o orçamento: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "Orçamento excluído.", type: "success" });
    setDeleteId(null);
    setDetail(null);
    await load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filtered = quotes.filter(q => {
    const customerName = (q.customer as any)?.full_name || "";
    const customerWa = (q.customer as any)?.whatsapp || "";
    const customerDoc = (q.customer as any)?.document || (q.customer as any)?.cnpj || "";
    const customerTradeName = (q.customer as any)?.trade_name || "";
    const protocol = q.protocol || "";
    const matchSearch = !search || customerName.toLowerCase().includes(search.toLowerCase()) || customerTradeName.toLowerCase().includes(search.toLowerCase()) || customerWa.includes(search) || customerDoc.includes(search) || protocol.includes(search);
    const matchStatus = !filterStatus || q.status_id === filterStatus;
    return matchSearch && matchStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedQuotes = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, filterStatus]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">{label}</p><p className="text-sm font-medium text-[#0d1b2e] whitespace-pre-line">{value}</p></div> : null;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este orçamento? Esta ação remove o registro da tabela de cotações." onConfirm={() => { void handleDeleteQuote(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <PageHeader title="Orçamentos" subtitle={`${quotes.length} solicitaç${quotes.length !== 1 ? "ões" : "ão"} recebida${quotes.length !== 1 ? "s" : ""}`} actions={
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por cliente, CPF, protocolo..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className={cn(INPUT, "py-2 text-xs sm:w-48")}>
            <option value="">Todos os status</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma solicitação" message="As solicitações de orçamento aparecem aqui." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Tipo / documento</th>
                  <th className="px-4 py-3 text-left">Serviço / Marca</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedQuotes.map(q => (
                  <tr key={q.id} onClick={() => setDetail(q)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2"><span aria-label={`Cor do status ${(q.request_status as any)?.name || "Sem status"}`} className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: (q.request_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-[#0d1b2e] text-sm">{(q.customer as any)?.customer_type === "PJ" ? ((q.customer as any)?.trade_name || (q.customer as any)?.full_name || "—") : ((q.customer as any)?.full_name || "—")}</p>
                      <p className="text-xs text-[#5a6a82]">{formatPhone((q.customer as any)?.whatsapp)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{(q.customer as any)?.customer_type === "PJ" ? "PJ" : "PF"}</span> · {(q.customer as any)?.customer_type === "PJ" ? ((q.customer as any)?.cnpj ? formatCnpj((q.customer as any).cnpj) : "—") : ((q.customer as any)?.document ? formatCpf((q.customer as any).document) : "—")}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">
                      {(q.service as any)?.title && <div className="font-medium text-[#0d1b2e]">{(q.service as any).title}</div>}
                      {(q.brand as any)?.name && <div>{(q.brand as any).name}</div>}
                      {!(q.service as any)?.title && !(q.brand as any)?.name && "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {(hasPermission("quotes.update") || hasPermission("quotes.edit")) && <select value={q.status_id || ""} onClick={e => e.stopPropagation()} onChange={e => updateStatus(q.id, e.target.value)}
                        className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1 font-bold bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0057e7]/30">
                        {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(q.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setDetail(q)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:underline ml-auto">Ver detalhes</button>
                        {hasPermission("quotes.delete") && (
                          <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteId(q.id); }} title="Excluir orçamento" aria-label="Excluir orçamento" className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      {/* Quote Detail Page */}
      {detail && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb={`Orçamentos > ${detail.protocol || detail.id.slice(0, 8)}`} title={detail.protocol || `Orçamento #${detail.id.slice(0, 8)}`} subtitle="Detalhes da solicitação de orçamento">
            <div className="space-y-4">
              <Section title="Dados pessoais / empresariais">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Tipo" value={(detail.customer as any)?.customer_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} />
                  {(detail.customer as any)?.customer_type === "PJ" ? <>
                    <InfoRow label="Nome fantasia" value={(detail.customer as any)?.trade_name || (detail.customer as any)?.full_name} />
                    <InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} />
                    <InfoRow label="CNPJ" value={(detail.customer as any)?.cnpj ? formatCnpj((detail.customer as any).cnpj) : null} />
                    <InfoRow label="Inscrição estadual" value={(detail.customer as any)?.state_registration} />
                    <InfoRow label="Data de fundação" value={(detail.customer as any)?.foundation_date ? new Date((detail.customer as any).foundation_date).toLocaleDateString("pt-BR") : null} />
                  </> : <InfoRow label="Nome completo" value={(detail.customer as any)?.full_name} />}
                  {(detail.customer as any)?.customer_type !== "PJ" && <InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} />}
                  <InfoRow label="E-mail" value={(detail.customer as any)?.email} />
                  <InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)} />
                  <InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)} />
                </div>
              </Section>
              <Section title="Endereço">
                <div className="grid sm:grid-cols-2 gap-3">
                  {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state", "reference"] as const).map(key => {
                    const address = ((detail.customer as any)?.addresses || []).find((item: Address) => item.is_default) || (detail.customer as any)?.addresses?.[0];
                    const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado", reference: "Referência" };
                    return address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null;
                  })}
                </div>
              </Section>
              <Section title="Dados do orçamento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Protocolo" value={detail.protocol || detail.id} />
                  <InfoRow label="Serviço" value={(detail.service as any)?.title} />
                  <InfoRow label="Marca" value={(detail.brand as any)?.name} />
                  <InfoRow label="Produto" value={(detail.product as any)?.name} />
                  <InfoRow label="Data de criação" value={fmtDate(detail.created_at)} />
                  <InfoRow label="Atualizado em" value={fmtDate(detail.updated_at)} />
                  <InfoRow label="Valor estimado" value={detail.estimated_price == null ? null : `R$ ${Number(detail.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                  <InfoRow label="Valor final" value={detail.final_price == null ? null : `R$ ${Number(detail.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                </div>
                {detail.customer_message && <div className="mt-4"><InfoRow label="Mensagem do cliente" value={detail.customer_message} /></div>}
              </Section>
            </div>
            <div className="sticky bottom-0 -mx-5 mt-5 border-t border-[#0d1b2e]/8 bg-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(hasPermission("quotes.update") || hasPermission("quotes.edit")) && <select value={detail.status_id || ""} onChange={e => updateStatus(detail.id, e.target.value)} className={cn(INPUT, "py-2 text-sm w-auto min-w-36")}>
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>}
                {hasPermission("quotes.delete") && <button type="button" onClick={() => setDeleteId(detail.id)} className="flex items-center gap-2 whitespace-nowrap bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"><Trash2 size={13} /> Excluir</button>}
                {hasPermission("quotes.convert") && <button onClick={async () => {
                if (!detail) return;
                if (!hasPermission("quotes.convert")) { setToast({ msg: "Você não possui permissão para converter orçamentos.", type: "error" }); return; }
                const { data: existing } = await supabase.from("service_orders").select("id, os_number").eq("quote_request_id", detail.id).maybeSingle();
                if (existing) { setToast({ msg: `OS ${existing.os_number || existing.id.slice(0,8)} já existe para este orçamento.`, type: "error" }); return; }
                const { data: availableStatuses, error: statusError } = await supabase.from("order_statuses").select("id,name,sort_order").order("sort_order");
                const status = initialOrderStatus(availableStatuses || []);
                if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status inicial válido para a OS.", type: "error" }); return; }
                const { error } = await supabase.from("service_orders").insert({
                  service_id: detail.service_id, quote_request_id: detail.id,
                  customer_id: detail.customer_id, status_id: status.id,
                  customer_notes: detail.customer_message || null,
                });
                if (error) { setToast({ msg: `Erro ao criar OS: ${error.message}`, type: "error" }); return; }
                setDetail(null);
                setToast({ msg: "OS criada com sucesso e vinculada ao orçamento.", type: "success" });
                if (onNavigate) setTimeout(() => onNavigate("orders"), 1200);
                }} className="flex items-center gap-2 whitespace-nowrap bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors">
                  <ClipboardList size={13} /> Converter em OS
                </button>}
              </div>
              <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
            </div>
        </AdminPage>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: ORDERS ─────────────────────────── */

function ServiceTypesAdminPanel({ onBack }: { onBack: () => void }) {
  return <AdminBackContext.Provider value={onBack}><ServiceTypesAdminPanelContent /></AdminBackContext.Provider>;
}

function ServiceTypesAdminPanelContent() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_types")
      .select("id,title,description,forecast_days,is_active,sort_order,created_at,updated_at")
      .order("sort_order")
      .order("title");
    if (error) setToast({ msg: `Erro ao carregar tipos: ${error.message}`, type: "error" });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ title: "", description: "", forecast_days: "", is_active: true });
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      title: item.title || "",
      description: item.description || "",
      forecast_days: item.forecast_days == null ? "" : String(item.forecast_days),
      is_active: item.is_active !== false,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!(editItem ? hasPermission("service_types.edit") : hasPermission("service_types.create"))) return;
    if (!form.title.trim()) {
      setToast({ msg: "Informe o título do tipo de atendimento.", type: "error" });
      return;
    }

    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      forecast_days: form.forecast_days ? Number(form.forecast_days) : null,
      is_active: form.is_active,
    };
    const result = editItem
      ? await supabase.from("service_types").update(payload).eq("id", editItem.id)
      : await supabase.from("service_types").insert({ ...payload, sort_order: items.length });
    setSaving(false);

    if (result.error) {
      setToast({ msg: `Erro ao salvar tipo: ${result.error.message}`, type: "error" });
      return;
    }

    setFormOpen(false);
    setToast({ msg: editItem ? "Tipo atualizado." : "Tipo criado.", type: "success" });
    load();
  };

  const toggle = async (item: any) => {
    if (!hasPermission("service_types.edit")) return;
    const { error } = await supabase.from("service_types").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) setToast({ msg: `Erro ao atualizar tipo: ${error.message}`, type: "error" });
    else load();
  };

  const remove = async (id: string) => {
    if (!hasPermission("service_types.delete")) return;
    const { error } = await supabase.from("service_types").delete().eq("id", id);
    if (error) setToast({ msg: `Não foi possível excluir: ${error.message}`, type: "error" });
    else load();
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && (
        <ConfirmDialog
          message="Excluir este tipo de atendimento? OS relacionadas ficarão sem tipo."
          onConfirm={() => {
            setDelId(null);
            void remove(delId);
          }}
          onCancel={() => setDelId(null)}
        />
      )}

      <PageHeader
        title="Tipos de Atendimento"
        subtitle="Configuração dos tipos utilizados nas ordens de serviço"
        actions={hasPermission("service_types.create") ? <BtnPrimary onClick={openNew}><Plus size={15} /> Novo tipo</BtnPrimary> : null}
      />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={List}
            title="Nenhum tipo cadastrado"
            message="Crie tipos para disponibilizá-los na Nova OS."
            onAdd={hasPermission("service_types.create") ? openNew : undefined}
            addLabel="Novo tipo"
          />
        ) : (
          <div className="divide-y divide-[#0d1b2e]/5">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-[#0d1b2e]">{item.title}</p>
                  <p className="text-xs text-[#5a6a82] truncate">
                    {item.description || "Sem descrição"}
                    {item.forecast_days != null && ` · ${item.forecast_days} dia(s)`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <StatusBadge status={item.is_active ? "Ativo" : "Inativo"} />
                  {hasPermission("service_types.edit") && (
                    <>
                      <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={14} /></button>
                      <button type="button" onClick={() => toggle(item)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={item.is_active ? "Desativar" : "Ativar"}>{item.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</button>
                    </>
                  )}
                  {hasPermission("service_types.delete") && (
                    <button type="button" onClick={() => setDelId(item.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 rounded-lg" title="Excluir"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminPage
        open={formOpen}
        onClose={() => setFormOpen(false)}
        breadcrumb="Operação > Tipos de Atendimento"
        title={editItem ? "Editar tipo de atendimento" : "Novo tipo de atendimento"}
        subtitle="Preencha os dados do tipo"
        maxW="max-w-xl"
      >
        <div className="p-5 space-y-4">
          <FInput label="Título" required value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} />
          <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} />
          <FInput label="Previsão em dias" type="number" min="0" value={form.forecast_days} onChange={(e: any) => setForm({ ...form, forecast_days: e.target.value })} />
          <FToggle label="Tipo ativo" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("service_types.edit") : hasPermission("service_types.create")) && (
            <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>
          )}
        </div>
      </AdminPage>
    </div>
  );
}

function OrderStatusesAdminPanel({ onBack }: { onBack: () => void }) {
  return <AdminBackContext.Provider value={onBack}><OrderStatusesAdminPanelContent /></AdminBackContext.Provider>;
}

function OrderStatusesAdminPanelContent() {
  const { hasPermission } = useAuth();
  if (!hasPermission("orders.view")) return null;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", color: "#0057e7", sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("order_statuses").select("id,name,color,sort_order").order("sort_order");
    if (error) setToast({ msg: `Erro ao carregar status: ${error.message}`, type: "error" });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ name: "", color: "#0057e7", sort_order: items.length });
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name || "", color: item.color || "#0057e7", sort_order: item.sort_order || 0 });
    setFormOpen(true);
  };

  const save = async () => {
    if (!(editItem ? hasPermission("orders.update") : hasPermission("orders.update"))) return;
    if (!form.name.trim()) {
      setToast({ msg: "Informe o nome do status.", type: "error" });
      return;
    }
    if (!isHexColor(form.color)) {
      setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" });
      return;
    }

    setSaving(true);
    const payload = { name: form.name.trim(), color: form.color.trim().toUpperCase(), sort_order: Number(form.sort_order) };
    const result = editItem
      ? await supabase.from("order_statuses").update(payload).eq("id", editItem.id)
      : await supabase.from("order_statuses").insert(payload);
    setSaving(false);

    if (result.error) {
      setToast({ msg: `Erro ao salvar status: ${result.error.message}`, type: "error" });
      return;
    }

    setFormOpen(false);
    setToast({ msg: editItem ? "Status atualizado." : "Status criado.", type: "success" });
    load();
  };

  const remove = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    const { error } = await supabase.from("order_statuses").delete().eq("id", id);
    if (error) setToast({ msg: `Não foi possível excluir: ${error.message}`, type: "error" });
    else load();
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && (
        <ConfirmDialog
          message="Excluir este status? O histórico relacionado pode impedir a exclusão."
          onConfirm={() => {
            setDelId(null);
            void remove(delId);
          }}
          onCancel={() => setDelId(null)}
        />
      )}

      <PageHeader
        title="Status da OS"
        subtitle="Status principais utilizados pelas ordens de serviço"
        actions={hasPermission("orders.update") ? <BtnPrimary onClick={openNew}><Plus size={15} /> Novo status</BtnPrimary> : null}
      />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="Nenhum status cadastrado"
            message="Cadastre o primeiro status da OS."
            onAdd={hasPermission("orders.update") ? openNew : undefined}
            addLabel="Novo status"
          />
        ) : (
          <div className="divide-y divide-[#0d1b2e]/5">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} />
                  <div>
                    <p className="font-bold text-[#0d1b2e]">{item.name}</p>
                    <p className="text-xs text-[#5a6a82]">Ordem {item.sort_order}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {hasPermission("orders.update") && <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={14} /></button>}
                  {hasPermission("orders.delete") && <button type="button" onClick={() => setDelId(item.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 rounded-lg" title="Excluir"><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Operação > Status da OS" title={editItem ? "Editar status" : "Novo status"} subtitle="Configure o status da OS">
        <div className="p-5 space-y-4">
          <FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
          <FInput label="Cor" type="color" value={form.color} onChange={(e: any) => setForm({ ...form, color: e.target.value })} />
          <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
          {hasPermission("orders.update") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}/* OSSituationsView moved to admin/TabOrders. */
/*
  const { user, hasPermission } = useAuth();
  if (!hasPermission("orders.view")) return null;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", color: "", hours: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("os_situations").select("id,name,slug,color,hours,sort_order,is_active,created_at,updated_at").order("sort_order");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditItem(null); setForm({ name: "", slug: "", color: "", hours: "", is_active: true, sort_order: items.length }); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditItem(s); setForm({ name: s.name || "", slug: s.slug || "", color: s.color || "", hours: s.hours == null ? "" : String(s.hours), is_active: s.is_active, sort_order: s.sort_order }); setDrawerOpen(true); };

  const save = async () => {
    if (!hasPermission("orders.update")) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome da situação.", type: "error" }); return; }
    if (form.color && !isHexColor(form.color)) { setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" }); return; }
    if (form.hours !== "" && (!Number.isFinite(Number(form.hours)) || Number(form.hours) < 0)) { setToast({ msg: "Informe uma quantidade de horas válida.", type: "error" }); return; }
    setSaving(true);
    const slug = form.slug.trim() || editItem?.slug?.trim() || slugify(form.name);
    if (!slug) {
      setSaving(false);
      setToast({ msg: "Informe um nome ou slug válido para a situação.", type: "error" });
      return;
    }
    const payload = { name: form.name.trim(), slug, color: form.color.trim().toUpperCase() || null, hours: form.hours === "" ? null : Number(form.hours), is_active: form.is_active, sort_order: Number(form.sort_order) };
    const { error } = editItem
      ? await supabase.from("os_situations").update(payload).eq("id", editItem.id)
      : await supabase.from("os_situations").insert(payload);
    setSaving(false);
    if (error) { setToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    setToast({ msg: "Situação salva!", type: "success" });
    setDrawerOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    await supabase.from("os_situations").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Remover esta situação?" onConfirm={() => { setDelId(null); void del(delId); }} onCancel={() => setDelId(null)} />}
      <PageHeader title="Situações da OS" subtitle="Etapas de progresso das ordens de serviço" actions={
        <div className="flex items-center gap-2">
          <InternalBackButton onBack={onBack} />
          {hasPermission("orders.update") && <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0] transition-colors"><Plus size={13} /> Nova Situação</button>}
        </div>
      } />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={List} title="Nenhuma situação" message="Crie situações para acompanhar as etapas das OS." /> : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
              <tr><th className="px-4 py-3 text-left">Ordem</th><th className="px-4 py-3 text-left">Nome</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-[#0d1b2e]/5">
              {items.map(s => (
                <tr key={s.id} className="hover:bg-[#f8fafc]/80">
                  <td className="px-4 py-3 text-[#5a6a82] text-xs font-mono">{s.sort_order}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#0057e7" }} /><div><p className="font-semibold text-[#0d1b2e]">{s.name}</p><p className="text-xs text-[#5a6a82]">{s.hours == null ? "Horas não informadas" : `${s.hours} hora(s)`}{s.slug ? ` · ${s.slug}` : ""}</p></div></div></td>
                  <td className="px-4 py-3"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", s.is_active ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{s.is_active ? "Ativa" : "Inativa"}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {hasPermission("orders.update") && <button onClick={() => openEdit(s)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#e8eef8] rounded-lg"><Edit2 size={14} /></button>}
                      {hasPermission("orders.delete") && <button onClick={() => setDelId(s.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {drawerOpen && (
        <AdminPage open={true} onClose={() => setDrawerOpen(false)} breadcrumb="Situações da OS" title={editItem ? "Editar situação" : "Nova situação"} maxW="max-w-md">
          <div className="p-5 space-y-4">
            <FInput label="Nome" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Em análise" />
            <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="ex: em-analise" />
            <FInput label="Cor" type="color" value={form.color || "#0057e7"} onChange={(e: any) => setForm({ ...form, color: e.target.value })} />
            <FInput label="Horas" type="number" min="0" step="0.01" value={form.hours} onChange={(e: any) => setForm({ ...form, hours: e.target.value })} placeholder="Ex: 2,5" />
            <FInput label="Ordem de exibição" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            <FToggle label="Situação ativa" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
            {hasPermission("orders.update") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}
          </div>
        </AdminPage>
      )}
    </div>
  );
}

*/
type AppointmentWithRelations = Appointment & {
  customer?: any;
  service_order?: any;
  situation?: AppointmentSituation | null;
  appointment_technicians?: { employee_id: string; employee?: { id: string; full_name: string } | null }[];
  created_by_profile?: { id: string; full_name: string } | null;
};

type CalendarEvent =
  | { kind: "service_order"; id: string; date: string; order: any }
  | { kind: "appointment"; id: string; date: string; appointment: AppointmentWithRelations };

function TabAgenda({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { user, hasPermission } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [generalServices, setGeneralServices] = useState<any[]>([]);
  const [situations, setSituations] = useState<any[]>([]);
  const [appointmentSituations, setAppointmentSituations] = useState<AppointmentSituation[]>([]);
  const [view, setView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [situationFilter, setSituationFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentSubmodal, setAppointmentSubmodal] = useState<"address" | "technicians" | null>(null);
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentCustomerSearch, setAppointmentCustomerSearch] = useState("");
  const [appointmentCustomers, setAppointmentCustomers] = useState<any[]>([]);
  const [appointmentCustomer, setAppointmentCustomer] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [changingAppointmentCustomer, setChangingAppointmentCustomer] = useState(false);
  const [appointmentCustomerSearchLoading, setAppointmentCustomerSearchLoading] = useState(false);
  const [appointmentOrders, setAppointmentOrders] = useState<any[]>([]);
  const [appointmentForm, setAppointmentForm] = useState({ customer_id: "", service_order_id: "", appointment_date: "", period: "no_time" as AppointmentPeriod, start_time: "", end_time: "", sector_location: "", situation_id: "", description: "", is_return: false, address_source: null as "customer" | "custom" | null, customer_address_id: "", zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
  const [appointmentTechnicians, setAppointmentTechnicians] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedAppointmentTechnicians, setSelectedAppointmentTechnicians] = useState<string[]>([]);
  const [appointmentTechnicianSearch, setAppointmentTechnicianSearch] = useState("");
  const [appointmentSituationsLoading, setAppointmentSituationsLoading] = useState(true);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const canViewAgenda = hasPermission("agenda.view") || hasPermission("orders.view");
  const canViewOtherAgendas = hasPermission("agenda.view_others") || hasPermission("agenda.view-other-users") || hasPermission("employees.view");

  const load = async () => {
    setLoading(true);
    setAppointmentSituationsLoading(true);

    let myEmployee: { id: string } | null = null;
    if (user?.id) {
      const { data: employeeData } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();
      myEmployee = employeeData ?? null;
      setMyEmployeeId(employeeData?.id ?? null);
    }

    let agendaQuery = supabase
      .from("service_orders")
      .select("id,os_number,scheduled_at,customer:customers(full_name),service:services(id,title),general_service:general_services(id,name),technician:employees!technician_id(id,full_name),technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)),order_status:order_statuses(id,name,color),situation:os_situations(id,name,color,hours)")
      .not("scheduled_at", "is", null)
      .order("scheduled_at");

    if (!canViewOtherAgendas) {
      const emptyUuid = "00000000-0000-0000-0000-000000000000";
      if (myEmployee?.id) {
        agendaQuery = agendaQuery.or(`technician_id.eq.${myEmployee.id},assigned_to.eq.${user?.id ?? emptyUuid}`);
      } else {
        agendaQuery = agendaQuery.eq("technician_id", emptyUuid);
      }
    }

    const [ordersResult, appointmentsResult, employeesResult, servicesResult, generalServicesResult, situationsResult, appointmentSituationsResult] = await Promise.all([
      agendaQuery,
      supabase.from("appointments").select("*, created_by_profile:profiles!created_by(id,full_name), customer:customers(id,full_name,document,cnpj,phone,whatsapp,addresses:customer_addresses(*)), service_order:service_orders(id,os_number,model,serial_number,service:services(title),general_service:general_services(name)), situation:appointment_situations(id,name,color,is_active,sort_order,created_at,updated_at), appointment_technicians(employee_id,employee:employees(id,full_name))").order("appointment_date"),
      supabase.from("employees").select("id,full_name,is_active").eq("is_active", true).order("full_name"),
      supabase.from("services").select("id,title").eq("is_active", true).order("title"),
      supabase.from("general_services").select("id,name").eq("is_active", true).order("name"),
      supabase.from("os_situations").select("id,name,hours").eq("is_active", true).order("sort_order"),
      supabase.from("appointment_situations").select("id,name,color,is_active,sort_order,created_at,updated_at").eq("is_active", true).order("sort_order").order("name"),
    ]);
    if (ordersResult.error) setToast({ msg: `Erro ao carregar agenda: ${ordersResult.error.message}`, type: "error" });
    if (appointmentsResult.error) setToast({ msg: `Erro ao carregar agendamentos: ${appointmentsResult.error.message}`, type: "error" });
    setOrders(ordersResult.data || []);
    setAppointments((appointmentsResult.data || []) as AppointmentWithRelations[]);
    setEmployees(employeesResult.data || []);
    setServices(servicesResult.data || []);
    setGeneralServices(generalServicesResult.data || []);
    setSituations(situationsResult.data || []);
    setAppointmentSituations((appointmentSituationsResult.data || []) as AppointmentSituation[]);
    setAppointmentTechnicians(employeesResult.data || []);
    setAppointmentSituationsLoading(false);
    setLoading(false);
  };

  useEffect(() => { if (!canViewAgenda) return; void load(); }, [canViewAgenda, user?.id]);
  useEffect(() => {
    if (!canViewOtherAgendas && myEmployeeId) {
      setTechnicianFilter(myEmployeeId);
    }
  }, [canViewOtherAgendas, myEmployeeId]);
  useEffect(() => {
    const closeFilters = (event: MouseEvent) => {
      if (!filterPanelRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", closeFilters);
    return () => document.removeEventListener("mousedown", closeFilters);
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (appointmentSubmodal) setAppointmentSubmodal(null); else if (appointmentModalOpen) setAppointmentModalOpen(false); else if (selectedAppointment) setSelectedAppointment(null); else setFiltersOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [appointmentSubmodal, appointmentModalOpen, selectedAppointment]);
  useEffect(() => {
    if (!appointmentModalOpen || appointmentForm.situation_id || appointmentSituations.length === 0) return;
    const defaultSituation = appointmentSituations.find(item => String(item.name).trim().toLowerCase() === "agendado") ?? appointmentSituations[0];
    setAppointmentForm(current => ({ ...current, situation_id: defaultSituation?.id ?? "" }));
  }, [appointmentModalOpen, appointmentSituations, appointmentForm.situation_id]);

  const dayKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const parseDay = (key: string) => new Date(`${key}T00:00:00`);
  const eventDay = (order: any) => dayKey(new Date(order.scheduled_at));
  const eventLabel = (order: any) => (order.general_service as any)?.name || (order.service as any)?.title || "Serviço";
  const effectiveTechnicianFilter = !canViewOtherAgendas ? myEmployeeId || "" : technicianFilter;
  const filteredOrders = orders.filter(order => {
    const serviceId = (order.service as any)?.id || (order.general_service as any)?.id || "";
    const searchText = `${(order.customer as any)?.full_name || ""} ${order.os_number || ""}`.toLowerCase();
    const technicianIds = [(order.technician as any)?.id, ...((order.technician_links || []).map((link: any) => link.employee_id))].filter(Boolean);
    return (!search || searchText.includes(search.toLowerCase())) && (!effectiveTechnicianFilter || technicianIds.includes(effectiveTechnicianFilter)) && (!statusFilter || (order.order_status as any)?.id === statusFilter) && (!situationFilter || (order.situation as any)?.id === situationFilter) && (!serviceFilter || serviceId === serviceFilter);
  });
  const referencedOrderIds = new Set(appointments.map(appointment => appointment.service_order_id).filter((id): id is string => Boolean(id)));
  const serviceOrderEvents = filteredOrders.filter(order => !referencedOrderIds.has(order.id)).map(order => ({ kind: "service_order" as const, id: order.id, date: eventDay(order), order }));
  const calendarEvents: CalendarEvent[] = [
    ...serviceOrderEvents,
    ...appointments.filter(appointment => {
      const technicianIds = (appointment.appointment_technicians || []).map(item => item.employee_id);
      const searchText = [appointment.customer?.full_name, appointment.description, appointment.sector_location, appointment.service_order?.os_number, ...((appointment.appointment_technicians || []).map(item => item.employee?.full_name || ""))].filter(Boolean).join(" ").toLowerCase();
      const appointmentServiceId = appointment.service_order?.service?.id || appointment.service_order?.general_service?.id;
      return (!search || searchText.includes(search.toLowerCase())) && (!effectiveTechnicianFilter || technicianIds.includes(effectiveTechnicianFilter)) && (!situationFilter || appointment.situation_id === situationFilter) && !statusFilter && (!serviceFilter || appointmentServiceId === serviceFilter);
    }).map(appointment => ({ kind: "appointment" as const, id: appointment.id, date: appointment.appointment_date, appointment })),
  ];
  const activeFilterCount = [technicianFilter, statusFilter, situationFilter, serviceFilter].filter(Boolean).length;
  const statuses = Array.from(
    new Map(
      orders.flatMap(order => {
        const statusId = (order.order_status as any)?.id;
        return statusId ? [[statusId, order.order_status] as const] : [];
      })
    ).values()
  );
  const moveCursor = (amount: number) => {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else if (view === "week") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
  };
  const today = () => setCursor(new Date());
  const rangeStart = () => {
    if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    if (view === "week") { const start = new Date(cursor); start.setDate(start.getDate() - start.getDay()); return start; }
    return new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  };
  const days = (count: number) => Array.from({ length: count }, (_, index) => { const date = rangeStart(); date.setDate(date.getDate() + index); return date; });
  const eventsFor = (date: Date) => calendarEvents.filter(event => event.date === dayKey(date));
  const updateEventDate = async (event: CalendarEvent | any, targetDay: string) => {
    if (!event.kind) {
      const legacyEvent: CalendarEvent = { kind: "service_order", id: event.id, date: eventDay(event), order: event };
      return updateEventDate(legacyEvent, targetDay);
    }
    if (event.kind === "appointment") {
      const { error } = await supabase.from("appointments").update({ appointment_date: targetDay }).eq("id", event.id);
      if (error) setToast({ msg: `Não foi possível mover o agendamento: ${error.message}`, type: "error" });
      else { setAppointments(current => current.map(item => item.id === event.id ? { ...item, appointment_date: targetDay } : item)); setToast({ msg: "Agendamento atualizado.", type: "success" }); }
      return;
    }
    const order = event.order;
    const oldDate = new Date(order.scheduled_at);
    const next = parseDay(targetDay);
    next.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    const { error } = await supabase.from("service_orders").update({ scheduled_at: next.toISOString() }).eq("id", order.id);
    if (error) setToast({ msg: `Não foi possível mover a OS: ${error.message}`, type: "error" });
    else { setOrders(current => current.map(item => item.id === order.id ? { ...item, scheduled_at: next.toISOString() } : item)); setToast({ msg: "Agendamento atualizado.", type: "success" }); }
  };
  const dropCalendarEvent = (dataTransfer: DataTransfer, targetDay: string) => {
    const raw = dataTransfer.getData("text/calendar-event");
    if (!raw) return;
    try {
      const dropped = JSON.parse(raw) as { kind: CalendarEvent["kind"]; id: string };
      const event = calendarEvents.find(item => item.kind === dropped.kind && item.id === dropped.id);
      if (event) void updateEventDate(event, targetDay);
    } catch { setToast({ msg: "Não foi possível identificar o evento arrastado.", type: "error" }); }
  };
  const Event = ({ event, order }: { event?: CalendarEvent; order?: any }) => { const calendarEvent = event || { kind: "service_order" as const, id: order.id, date: eventDay(order), order }; const startDrag = (dragEvent: React.DragEvent) => { setDraggedEventId(calendarEvent.id); dragEvent.dataTransfer.setData("text/calendar-event", JSON.stringify({ kind: calendarEvent.kind, id: calendarEvent.id })); }; const stopDragClick = () => { if (draggedEventId === calendarEvent.id) { setDraggedEventId(null); return; } if (calendarEvent.kind === "service_order") onOpenOrder(calendarEvent.order.id); else setSelectedAppointment(calendarEvent.appointment); }; return calendarEvent.kind === "service_order" ? <button type="button" draggable onDragStart={startDrag} onClick={stopDragClick} className="mb-1 w-full rounded-md border-l-4 bg-white px-2 py-1.5 text-left shadow-sm hover:shadow-md" style={{ borderLeftColor: calendarEvent.order.order_status?.color || "#0057e7" }} title={`${calendarEvent.order.os_number || "OS"} - ${calendarEvent.order.customer?.full_name || "Cliente"}`}><p className="truncate font-mono text-[10px] font-black text-[#0057e7]">{calendarEvent.order.os_number || `OS #${calendarEvent.order.id.slice(0, 8)}`}</p><p className="truncate text-[11px] font-semibold text-[#0d1b2e]">{calendarEvent.order.customer?.full_name || "Cliente"}</p><p className="truncate text-[10px] text-[#5a6a82]">{eventLabel(calendarEvent.order)} · {new Date(calendarEvent.order.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></button> : <button type="button" draggable onDragStart={startDrag} onClick={stopDragClick} className="mb-1 w-full rounded-md border-l-4 bg-[#f8fbff] px-2 py-1.5 text-left shadow-sm hover:shadow-md" style={{ borderLeftColor: calendarEvent.appointment.situation?.color || "#00b4ff" }} title={calendarEvent.appointment.description || "Agendamento"}><p className="flex items-center gap-1 truncate text-[10px] font-black text-[#0057e7]"><CalendarPlus size={11} /> Agendamento</p><p className="truncate text-[11px] font-semibold text-[#0d1b2e]">{calendarEvent.appointment.customer?.full_name || "Cliente"}</p>{calendarEvent.appointment.description && <p className="line-clamp-2 text-[10px] text-[#5a6a82]">{calendarEvent.appointment.description}</p>}<p className="truncate text-[10px] text-[#5a6a82]">{calendarEvent.appointment.period === "custom" ? `${calendarEvent.appointment.start_time || ""} - ${calendarEvent.appointment.end_time || ""}` : calendarEvent.appointment.period}{calendarEvent.appointment.is_return ? " · Retorno" : ""}</p>{calendarEvent.appointment.service_order?.os_number && <p className="truncate text-[10px] font-semibold text-[#0057e7]">OS referenciada: {calendarEvent.appointment.service_order.os_number}</p>}</button>; };

  const title = view === "month" ? cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : view === "day" ? cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : view === "week" ? `Semana de ${rangeStart().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "Todos os agendamentos";
  const isToday = (date: Date) => dayKey(date) === dayKey(new Date());
  const openAppointmentModal = () => {
    const defaultSituation = appointmentSituations.find(item => String(item.name).trim().toLowerCase() === "agendado") ?? appointmentSituations[0];
    setAppointmentForm({ customer_id: "", service_order_id: "", appointment_date: dayKey(cursor), period: "no_time", start_time: "", end_time: "", sector_location: "", situation_id: defaultSituation?.id ?? "", description: "", is_return: false, address_source: null, customer_address_id: "", zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
    setAppointmentCustomer(null); setAppointmentOrders([]); setSelectedAppointmentTechnicians([]); setAppointmentCustomers([]); setAppointmentCustomerSearch(""); setChangingAppointmentCustomer(false); setAppointmentModalOpen(true);
  };
  const searchAppointmentCustomers = async (value: string) => {
    setAppointmentCustomerSearch(value);
    if (value.trim().length < 2) { setAppointmentCustomers([]); return; }
    const term = value.trim();
    setAppointmentCustomerSearchLoading(true);
    try {
      const { data, error } = await supabase.from("customers").select("id,customer_type,full_name,trade_name,document,cnpj,phone,whatsapp,addresses:customer_addresses(*)").or(`full_name.ilike.%${term}%,trade_name.ilike.%${term}%,document.ilike.%${term}%,cnpj.ilike.%${term}%,phone.ilike.%${term}%,whatsapp.ilike.%${term}%`).limit(8);
      if (error) throw error;
      setAppointmentCustomers(data || []);
    } catch (error) {
      console.error("[ADMIN] appointment customer search error:", error);
      setAppointmentCustomers([]);
      setToast({ msg: `Erro ao buscar clientes: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally { setAppointmentCustomerSearchLoading(false); }
  };
  const selectAppointmentCustomer = async (customer: any) => {
    const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
    setAppointmentCustomer(customer); setChangingAppointmentCustomer(false); setAppointmentCustomers([]); setAppointmentCustomerSearch("");
    const { data } = await supabase.from("service_orders").select("id,os_number,model,serial_number,service:services(title),general_service:general_services(name)").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setAppointmentOrders(data || []);
    setAppointmentForm(current => ({ ...current, customer_id: customer.id, service_order_id: "", address_source: address ? "customer" : "custom", customer_address_id: address?.id || "", zip_code: address?.zip_code || "", street: address?.street || "", number: address?.number || "", complement: address?.complement || "", neighborhood: address?.neighborhood || "", city: address?.city || "", state: address?.state || "" }));
  };
  const saveAppointment = async () => {
    if (!appointmentForm.customer_id || !appointmentCustomer) { setToast({ msg: "Selecione um cliente para o agendamento.", type: "error" }); return; }
    if (!appointmentForm.appointment_date) { setToast({ msg: "Informe a data do agendamento.", type: "error" }); return; }
    if (appointmentForm.period === "custom" && (!appointmentForm.start_time || !appointmentForm.end_time || appointmentForm.end_time <= appointmentForm.start_time)) { setToast({ msg: "Informe um horário personalizado válido.", type: "error" }); return; }
    const selectedSituation = appointmentSituations.find(item => item.id === appointmentForm.situation_id);
    if (!selectedSituation) { setToast({ msg: "Selecione uma situação válida para o agendamento.", type: "error" }); return; }
    setAppointmentSaving(true);
    try {
      const payload = { customer_id: appointmentForm.customer_id, service_order_id: appointmentForm.service_order_id || null, appointment_date: appointmentForm.appointment_date, period: appointmentForm.period, start_time: appointmentForm.period === "custom" ? appointmentForm.start_time : null, end_time: appointmentForm.period === "custom" ? appointmentForm.end_time : null, sector_location: appointmentForm.sector_location.trim() || null, situation_id: selectedSituation.id, description: appointmentForm.description.trim() || null, is_return: appointmentForm.is_return, address_source: appointmentForm.address_source, customer_address_id: appointmentForm.address_source === "customer" ? appointmentForm.customer_address_id || null : null, zip_code: appointmentForm.zip_code || null, street: appointmentForm.street || null, number: appointmentForm.number || null, complement: appointmentForm.complement || null, neighborhood: appointmentForm.neighborhood || null, city: appointmentForm.city || null, state: appointmentForm.state || null, created_by: user?.id || null };
      const { data, error } = await supabase.from("appointments").insert(payload).select("*, created_by_profile:profiles!created_by(id,full_name), customer:customers(id,full_name,document,cnpj,phone,whatsapp), service_order:service_orders(id,os_number,model,serial_number,service:services(title),general_service:general_services(name)), situation:appointment_situations(id,name,color,is_active,sort_order,created_at,updated_at)").single();
      if (error || !data) throw error || new Error("Agendamento não criado.");
      if (selectedAppointmentTechnicians.length > 0) {
        const { error: techniciansError } = await supabase.from("appointment_technicians").insert(selectedAppointmentTechnicians.map(employee_id => ({ appointment_id: data.id, employee_id })));
        if (techniciansError) { await supabase.from("appointments").delete().eq("id", data.id); throw techniciansError; }
      }
      setAppointments(current => [...current, { ...data, appointment_technicians: selectedAppointmentTechnicians.map(employee_id => ({ employee_id, employee: appointmentTechnicians.find(item => item.id === employee_id) || null })) } as AppointmentWithRelations]);
      setAppointmentModalOpen(false); setToast({ msg: "Agendamento criado.", type: "success" });
    } catch (error) {
      console.error("[ADMIN] appointment save error:", error);
      setToast({ msg: `Erro ao criar agendamento: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally { setAppointmentSaving(false); }
  };
  const lookupAppointmentZip = async () => {
    const zipCode = formatZipCode(appointmentForm.zip_code);
    if (zipCode.replace(/\D/g, "").length !== 8) return;
    const address = await fetchAddressByZipCode(zipCode);
    if (!address) return;
    setAppointmentForm(current => ({ ...current, zip_code: zipCode, street: address.street || current.street, neighborhood: address.neighborhood || current.neighborhood, city: address.city || current.city, state: address.state || current.state }));
  };
  const agendaToolbar = <div className="relative flex w-full flex-wrap items-center gap-2">
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => moveCursor(-1)} aria-label="Período anterior" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] hover:bg-[#eef5ff] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><ChevronLeft size={16} /></button>
      <button type="button" onClick={() => moveCursor(1)} aria-label="Próximo período" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] hover:bg-[#eef5ff] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><ChevronRight size={16} /></button>
      <button type="button" onClick={today} className="h-9 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-xs font-bold text-[#0d1b2e] hover:bg-[#eef5ff] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40">Hoje</button>
    </div>
    <span className="whitespace-nowrap text-sm font-bold capitalize text-[#0d1b2e]">{title}</span>
    <div className="relative min-w-[190px] flex-1 sm:max-w-[260px]"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente, nº OS" className={cn(INPUT, "h-9 bg-white pl-9 py-2 text-xs")} /></div>
    <div ref={filterPanelRef} className="relative"><button type="button" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="agenda-filters" className="flex h-9 items-center gap-1.5 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-xs font-bold text-[#0d1b2e] hover:bg-[#eef5ff] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><ListFilter size={15} /> Filtrar{activeFilterCount > 0 && <span className="rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}</button>{filtersOpen && <div id="agenda-filters" className="absolute right-0 top-11 z-30 w-[min(18rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-[#0d1b2e]/10 bg-white p-4 shadow-xl"><FSelect label="Técnico" value={technicianFilter} onChange={event => setTechnicianFilter(event.target.value)} options={[{ value: "", label: "Todos os técnicos" }, ...employees.map(employee => ({ value: employee.id, label: employee.full_name }))]} /><FSelect label="Status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} options={[{ value: "", label: "Todos os status" }, ...statuses.map((status: any) => ({ value: status.id, label: status.name }))]} /><FSelect label="Situação" value={situationFilter} onChange={event => setSituationFilter(event.target.value)} options={[{ value: "", label: "Todas as situações" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} /><FSelect label="Serviço" value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} options={[{ value: "", label: "Todos os serviços" }, ...services.map(service => ({ value: service.id, label: service.title })), ...generalServices.map(service => ({ value: service.id, label: service.name }))]} /><button type="button" onClick={() => { setTechnicianFilter(""); setStatusFilter(""); setSituationFilter(""); setServiceFilter(""); setFiltersOpen(false); }} className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><Eraser size={13} /> Limpar filtros</button></div>}</div>
    <div className="ml-auto flex flex-wrap items-center gap-1">
      {hasPermission("agenda.view") && <button type="button" onClick={openAppointmentModal} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#0057e7] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#0046c0] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><Plus size={15} /> Novo</button>}
      {[{ value: "day" as const, label: "Dia" }, { value: "week" as const, label: "Semana" }, { value: "month" as const, label: "Mês" }, { value: "agenda" as const, label: "Lista" }].map(mode => <button key={mode.value} type="button" aria-pressed={view === mode.value} onClick={() => setView(mode.value)} className={cn("h-9 rounded-lg px-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40", view === mode.value ? "bg-[#0057e7] text-white" : "bg-white text-[#0d1b2e] hover:bg-[#eef5ff]")}>{mode.label}</button>)}
    </div>
    {appointmentModalOpen && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/55 p-4" onClick={() => { if (!appointmentSubmodal) setAppointmentModalOpen(false); }}>
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><h2 className="font-black text-[#0d1b2e]">Novo agendamento</h2><button type="button" aria-label="Fechar" onClick={() => setAppointmentModalOpen(false)} className="rounded-full p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {appointmentCustomer && !changingAppointmentCustomer ? <div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#0d1b2e]">{appointmentCustomer.customer_type === "PJ" ? (appointmentCustomer.trade_name || appointmentCustomer.legal_name || appointmentCustomer.full_name) : appointmentCustomer.full_name}</p><p className="text-xs font-semibold text-[#5a6a82]">{appointmentCustomer.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</p><p className="mt-1 text-xs text-[#5a6a82]">{appointmentCustomer.customer_type === "PJ" ? `CNPJ: ${formatCnpj(appointmentCustomer.cnpj || "")}` : `CPF: ${formatCpf(appointmentCustomer.document || "")}`}</p>{(appointmentCustomer.whatsapp || appointmentCustomer.phone) && <p className="text-xs text-[#5a6a82]">{appointmentCustomer.whatsapp ? `WhatsApp: ${formatPhone(appointmentCustomer.whatsapp)}` : `Telefone: ${formatPhone(appointmentCustomer.phone)}`}</p>}{appointmentCustomer.email && <p className="text-xs text-[#5a6a82]">E-mail: {appointmentCustomer.email}</p>}</div><div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => { setChangingAppointmentCustomer(true); setAppointmentCustomerSearch(""); setAppointmentCustomers([]); }} className="text-xs font-bold text-[#0057e7] hover:underline">Trocar cliente</button><button type="button" onClick={() => { setAppointmentCustomer(null); setAppointmentOrders([]); setAppointmentCustomers([]); setAppointmentCustomerSearch(""); setAppointmentForm(current => ({ ...current, customer_id: "", service_order_id: "", address_source: null, customer_address_id: "", zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })); setChangingAppointmentCustomer(false); }} className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><X size={13} /> Remover</button></div></div></div> : <div className="relative"><FInput label="Cliente" required value={appointmentCustomerSearch} placeholder="Buscar por nome, CPF, CNPJ ou telefone" onChange={event => void searchAppointmentCustomers(event.target.value)} />{appointmentCustomer && <button type="button" onClick={() => { setChangingAppointmentCustomer(false); setAppointmentCustomerSearch(""); setAppointmentCustomers([]); }} className="mt-1 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7]">Cancelar troca</button>}{appointmentCustomerSearchLoading && <p className="mt-1 text-xs text-[#5a6a82]">Buscando clientes...</p>}{!appointmentCustomerSearchLoading && appointmentCustomerSearch.trim().length >= 2 && appointmentCustomers.length === 0 && <p className="mt-1 text-xs text-[#5a6a82]">Nenhum cliente encontrado.</p>}{appointmentCustomers.length > 0 && <div className="absolute left-0 right-0 top-[4.5rem] z-10 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-white shadow-lg">{appointmentCustomers.map(customer => <button type="button" key={customer.id} onClick={() => void selectAppointmentCustomer(customer)} className="block w-full border-b border-[#0d1b2e]/5 px-3 py-2 text-left hover:bg-[#eef5ff]"><p className="text-sm font-bold text-[#0d1b2e]">{customer.full_name || customer.trade_name}</p><p className="text-xs text-[#5a6a82]">{customer.customer_type === "PJ" ? formatCnpj(customer.cnpj || "") : formatCpf(customer.document || "")} · {formatPhone(customer.phone || customer.whatsapp)}</p></button>)}</div>}</div>}
          <FSelect label="OS relacionada (opcional)" disabled={!appointmentCustomer} value={appointmentForm.service_order_id} onChange={event => setAppointmentForm(current => ({ ...current, service_order_id: event.target.value }))} options={[{ value: "", label: appointmentCustomer ? "Nenhuma OS relacionada" : "Selecione um cliente primeiro" }, ...appointmentOrders.map(order => ({ value: order.id, label: `OS ${order.os_number || order.id.slice(0, 8)} — ${(order.service as any)?.title || (order.general_service as any)?.name || order.model || "Atendimento"}` }))]} />
          <div className="grid gap-3 sm:grid-cols-2"><FInput label="Data" required type="date" value={appointmentForm.appointment_date} onChange={event => setAppointmentForm(current => ({ ...current, appointment_date: event.target.value }))} /><FSelect label="Horário/Período" value={appointmentForm.period} onChange={event => setAppointmentForm(current => ({ ...current, period: event.target.value as AppointmentPeriod }))} options={[{ value: "no_time", label: "Sem horário" }, { value: "morning", label: "Manhã" }, { value: "afternoon", label: "Tarde" }, { value: "evening", label: "Noite" }, { value: "custom", label: "Horário personalizado" }]} />{appointmentForm.period === "custom" && <><FInput label="Hora inicial" required type="time" value={appointmentForm.start_time} onChange={event => setAppointmentForm(current => ({ ...current, start_time: event.target.value }))} /><FInput label="Hora final" required type="time" value={appointmentForm.end_time} onChange={event => setAppointmentForm(current => ({ ...current, end_time: event.target.value }))} /></>}</div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!appointmentCustomer} onClick={() => setAppointmentSubmodal("address")} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7] disabled:opacity-50">{appointmentForm.address_source ? "Editar endereço" : "Adicionar endereço"}</button>{appointmentForm.address_source && <span className="text-xs text-[#5a6a82]">{[appointmentForm.street, appointmentForm.number, appointmentForm.city, appointmentForm.state].filter(Boolean).join(", ")}</span>}</div>
          <div><div className="flex flex-wrap items-center gap-2">{selectedAppointmentTechnicians.map(id => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{appointmentTechnicians.find(item => item.id === id)?.full_name}<button type="button" onClick={() => setSelectedAppointmentTechnicians(current => current.filter(item => item !== id))} aria-label="Remover técnico"><X size={12} /></button></span>)}<button type="button" onClick={() => setAppointmentSubmodal("technicians")} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]"><UserPlus size={13} className="mr-1 inline" />Selecionar técnicos</button></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><FInput label="Setor/Local" placeholder="Ex.: Sala 5" value={appointmentForm.sector_location} onChange={event => setAppointmentForm(current => ({ ...current, sector_location: event.target.value }))} /><FSelect label="Situação" required disabled={appointmentSituationsLoading} value={appointmentForm.situation_id} onChange={event => setAppointmentForm(current => ({ ...current, situation_id: event.target.value }))} options={appointmentSituations.map(situation => ({ value: situation.id, label: situation.name }))} /></div>
          <FTextarea label="Descrição" placeholder="O que será feito neste atendimento..." value={appointmentForm.description} onChange={event => setAppointmentForm(current => ({ ...current, description: event.target.value }))} rows={4} /><label className="flex items-center gap-2 text-sm font-semibold text-[#0d1b2e]"><input type="checkbox" checked={appointmentForm.is_return} onChange={event => setAppointmentForm(current => ({ ...current, is_return: event.target.checked }))} /> É retorno</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-5 py-4"><BtnSecondary onClick={() => setAppointmentModalOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void saveAppointment()} disabled={appointmentSaving || appointmentSituationsLoading}>{appointmentSaving ? "Agendando..." : <><Check size={15} /> Agendar</>}</BtnPrimary></div>
        {appointmentSubmodal === "address" && <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1b2e]/45 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h3 className="font-black text-[#0d1b2e]">Endereço do atendimento</h3><button type="button" aria-label="Fechar endereço" onClick={() => setAppointmentSubmodal(null)} className="rounded-full p-2 hover:bg-[#f5f7fa]"><X size={17} /></button></div><label className="mb-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={appointmentForm.address_source === "customer"} onChange={event => { if (event.target.checked && appointmentCustomer) { const address = (appointmentCustomer.addresses || []).find((item: Address) => item.is_default) || appointmentCustomer.addresses?.[0]; setAppointmentForm(current => ({ ...current, address_source: "customer", customer_address_id: address?.id || "", zip_code: address?.zip_code || "", street: address?.street || "", number: address?.number || "", complement: address?.complement || "", neighborhood: address?.neighborhood || "", city: address?.city || "", state: address?.state || "" })); } else setAppointmentForm(current => ({ ...current, address_source: "custom", customer_address_id: "" })); }} /> Usar endereço cadastrado do cliente</label><div className="grid gap-3 sm:grid-cols-2"><FInput label="CEP" value={appointmentForm.zip_code} onChange={event => setAppointmentForm(current => ({ ...current, zip_code: event.target.value }))} /><FInput label="Rua" value={appointmentForm.street} onChange={event => setAppointmentForm(current => ({ ...current, street: event.target.value }))} /><FInput label="Número" value={appointmentForm.number} onChange={event => setAppointmentForm(current => ({ ...current, number: event.target.value }))} /><FInput label="Complemento" value={appointmentForm.complement} onChange={event => setAppointmentForm(current => ({ ...current, complement: event.target.value }))} /><FInput label="Bairro" value={appointmentForm.neighborhood} onChange={event => setAppointmentForm(current => ({ ...current, neighborhood: event.target.value }))} /><FInput label="Cidade" value={appointmentForm.city} onChange={event => setAppointmentForm(current => ({ ...current, city: event.target.value }))} /><FInput label="Estado" value={appointmentForm.state} onChange={event => setAppointmentForm(current => ({ ...current, state: event.target.value }))} /></div><div className="mt-4 flex justify-end gap-2"><BtnSecondary onClick={() => setAppointmentSubmodal(null)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => setAppointmentSubmodal(null)}>Confirmar</BtnPrimary></div></div></div>}
        {appointmentSubmodal === "technicians" && <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1b2e]/45 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h3 className="font-black text-[#0d1b2e]">Selecionar Técnicos</h3><button type="button" aria-label="Fechar técnicos" onClick={() => setAppointmentSubmodal(null)} className="rounded-full p-2 hover:bg-[#f5f7fa]"><X size={17} /></button></div><FInput label="Buscar" value={appointmentTechnicianSearch} onChange={event => setAppointmentTechnicianSearch(event.target.value)} placeholder="Nome do técnico" /><div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{appointmentTechnicians.filter(employee => employee.full_name.toLowerCase().includes(appointmentTechnicianSearch.toLowerCase())).map(employee => <label key={employee.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-[#f8fafc]"><input type="checkbox" checked={selectedAppointmentTechnicians.includes(employee.id)} onChange={() => setSelectedAppointmentTechnicians(current => current.includes(employee.id) ? current.filter(id => id !== employee.id) : [...current, employee.id])} />{employee.full_name}</label>)}</div><div className="mt-4 flex justify-end"><BtnPrimary onClick={() => setAppointmentSubmodal(null)}>Confirmar</BtnPrimary></div></div></div>}
      </div>
    </div>}
  </div>;
  const agendaEvent = (event: CalendarEvent) => <Event key={`${event.kind}-${event.id}`} event={event} />;
  const renderDayCell = (date: Date, adjacent = false) => <div key={dayKey(date)} className={cn("flex h-[150px] min-h-0 flex-col border-r border-b border-[#0d1b2e]/8 p-1", adjacent && "bg-[#f8fafc]", dayKey(date) === dayKey(cursor) && "bg-[#eef5ff] ring-1 ring-inset ring-[#0057e7]")} onDragOver={event => event.preventDefault()} onDrop={event => { if (!adjacent) dropCalendarEvent(event.dataTransfer, dayKey(date)); }}><div className="shrink-0"><p className={cn("mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold", isToday(date) ? "bg-[#0057e7] text-white" : adjacent ? "text-[#94a3b8]" : "text-[#5a6a82]")}>{date.getDate()}</p></div><div className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">{adjacent ? null : eventsFor(date).map(agendaEvent)}</div></div>;
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const monthGrid = Array.from({ length: 42 }, (_, index) => { const date = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstDay + index); return date; });
  const formatAppointmentDate = (value: string) => { const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; };
  const appointmentPeriodLabel = (appointment: AppointmentWithRelations) => appointment.period === "no_time" ? "Sem horário" : appointment.period === "morning" ? "Manhã" : appointment.period === "afternoon" ? "Tarde" : appointment.period === "evening" ? "Noite" : `${appointment.start_time || ""} às ${appointment.end_time || ""}`;
  const newAgendaView = <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Agenda" actions={agendaToolbar} />
    {loading ? <LoadingState /> : view === "agenda" ? <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8 bg-white shadow-sm">{calendarEvents.length === 0 ? <EmptyState icon={CalendarDays} title="Nenhum agendamento" message="As OS e agendamentos aparecerão aqui." /> : calendarEvents.map(event => <div key={`${event.kind}-${event.id}`} className="border-b border-[#0d1b2e]/5 p-3"><Event event={event} /></div>)}</div> : view === "day" ? <div className="min-h-[420px] rounded-xl border border-[#0d1b2e]/8 bg-white p-4" onDragOver={event => event.preventDefault()} onDrop={event => dropCalendarEvent(event.dataTransfer, dayKey(cursor))}>{eventsFor(cursor).map(agendaEvent)}</div> : view === "week" ? <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white"><div className="grid min-w-[720px] grid-cols-7">{days(7).map(date => <div key={dayKey(date)} className="min-h-[420px] border-r border-[#0d1b2e]/8 last:border-r-0" onDragOver={event => event.preventDefault()} onDrop={event => dropCalendarEvent(event.dataTransfer, dayKey(date))}><div className={cn("border-b border-[#0d1b2e]/8 p-2 text-center", isToday(date) && "bg-[#eef5ff]")}><p className="text-[10px] font-bold uppercase text-[#5a6a82]">{date.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-black", isToday(date) && "bg-[#0057e7] text-white")}>{date.getDate()}</p></div><div className="p-1">{eventsFor(date).map(agendaEvent)}</div></div>)}</div></div> : <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white"><div className="grid min-w-[720px] grid-cols-7 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <div key={day} className="py-2 text-center text-[10px] font-bold uppercase text-[#5a6a82]">{day}</div>)}</div><div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-b-xl">{monthGrid.map(date => renderDayCell(date, date.getMonth() !== cursor.getMonth()))}</div></div>}
  </div>;
  return <>{newAgendaView}{selectedAppointment && <div className="fixed inset-0 z-[190] flex items-center justify-center bg-[#0d1b2e]/55 p-4" onClick={() => setSelectedAppointment(null)}><div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#0d1b2e]/10 bg-white shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h2 className="font-black text-[#0d1b2e]">Detalhes do agendamento</h2><span className="mt-1 inline-block rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: selectedAppointment.situation?.color || "#0057e7" }}>{selectedAppointment.situation?.name || "Agendamento"}</span></div><button type="button" aria-label="Fechar detalhes" onClick={() => setSelectedAppointment(null)} className="rounded-full p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div><div className="space-y-4 p-5"><Section title="Cliente"><p className="font-bold text-[#0d1b2e]">{selectedAppointment.customer?.customer_type === "PJ" ? (selectedAppointment.customer.trade_name || selectedAppointment.customer.legal_name || selectedAppointment.customer.full_name) : selectedAppointment.customer?.full_name || "Cliente"}</p><p className="text-sm text-[#5a6a82]">{selectedAppointment.customer?.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</p><p className="text-sm text-[#5a6a82]">{selectedAppointment.customer?.customer_type === "PJ" ? `CNPJ: ${formatCnpj(selectedAppointment.customer?.cnpj || "")}` : `CPF: ${formatCpf(selectedAppointment.customer?.document || "")}`}</p>{(selectedAppointment.customer?.whatsapp || selectedAppointment.customer?.phone) && <p className="text-sm text-[#5a6a82]">{selectedAppointment.customer.whatsapp ? `WhatsApp: ${formatPhone(selectedAppointment.customer.whatsapp)}` : `Telefone: ${formatPhone(selectedAppointment.customer.phone)}`}</p>}{selectedAppointment.customer?.email && <p className="text-sm text-[#5a6a82]">E-mail: {selectedAppointment.customer.email}</p>}</Section><Section title="Agendamento"><p className="text-sm text-[#0d1b2e]">Data: {formatAppointmentDate(selectedAppointment.appointment_date)}</p><p className="text-sm text-[#0d1b2e]">Horário/Período: {appointmentPeriodLabel(selectedAppointment)}</p>{selectedAppointment.sector_location && <p className="text-sm text-[#0d1b2e]">Setor/Local: {selectedAppointment.sector_location}</p>}{selectedAppointment.description && <p className="whitespace-pre-wrap text-sm text-[#0d1b2e]">{selectedAppointment.description}</p>}<p className="text-sm text-[#0d1b2e]">É retorno: {selectedAppointment.is_return ? "Sim" : "Não"}</p></Section><Section title="Técnicos">{selectedAppointment.appointment_technicians?.length ? <div className="flex flex-wrap gap-2">{selectedAppointment.appointment_technicians.map(technician => <span key={technician.employee_id} className="rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{technician.employee?.full_name || "Técnico"}</span>)}</div> : <p className="text-sm text-[#5a6a82]">Nenhum técnico selecionado</p>}</Section><Section title="Endereço">{selectedAppointment.street || selectedAppointment.city || selectedAppointment.zip_code ? <p className="whitespace-pre-wrap text-sm text-[#0d1b2e]">{[selectedAppointment.zip_code, [selectedAppointment.street, selectedAppointment.number].filter(Boolean).join(", "), selectedAppointment.complement, selectedAppointment.neighborhood, [selectedAppointment.city, selectedAppointment.state].filter(Boolean).join(" - ")].filter(Boolean).join("\n")}</p> : <p className="text-sm text-[#5a6a82]">Endereço não informado</p>}</Section>{selectedAppointment.service_order_id && <Section title="OS relacionada"><p className="text-sm font-bold text-[#0057e7]">{selectedAppointment.service_order?.os_number ? `OS ${selectedAppointment.service_order.os_number}` : "OS relacionada"}</p><button type="button" onClick={() => { setSelectedAppointment(null); onOpenOrder(selectedAppointment.service_order_id as string); }} className="mt-2 rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]">Abrir OS</button></Section>}</div><div className="flex justify-end border-t border-[#0d1b2e]/10 px-5 py-4"><BtnSecondary onClick={() => setSelectedAppointment(null)}>Fechar</BtnSecondary></div></div></div>}</>;
  if (view === "month") {
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
    const monthDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Agenda" actions={<div className="w-full flex flex-wrap items-center gap-2"><button type="button" onClick={() => moveCursor(-1)} aria-label="Período anterior" className="p-2 text-[#5a6a82] border border-[#0d1b2e]/15 rounded-lg"><ChevronLeft size={15} /></button><button type="button" onClick={() => moveCursor(1)} aria-label="Próximo período" className="p-2 text-[#5a6a82] border border-[#0d1b2e]/15 rounded-lg"><ChevronRight size={15} /></button><button type="button" onClick={today} className="text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-3 py-2 rounded-lg">Hoje</button><span className="text-sm font-black text-[#0d1b2e] min-w-[150px]">{title}</span><select value={technicianFilter} onChange={event => setTechnicianFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[130px] py-2 text-xs")}><option value="">Todos os técnicos</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[120px] py-2 text-xs")}><option value="">Todos os status</option>{statuses.map((status: any) => <option key={status.id} value={status.id}>{status.name}</option>)}</select><select value={situationFilter} onChange={event => setSituationFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[130px] py-2 text-xs")}><option value="">Todas as situações</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select><select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[130px] py-2 text-xs")}><option value="">Todos os serviços</option>{services.map(service => <option key={service.id} value={service.id}>{service.title}</option>)}{generalServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select><select value={view} onChange={event => setView(event.target.value as typeof view)} className={cn(INPUT, "w-auto py-2 text-xs")}><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option><option value="agenda">Lista</option></select></div>} />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden"><div className="grid grid-cols-7 min-w-[720px]">{Array.from({ length: firstDay }, (_, index) => <div key={`blank-${index}`} className="min-h-[120px] border-r border-b border-[#0d1b2e]/8 bg-[#f8fafc]" />)}{Array.from({ length: monthDays }, (_, index) => { const date = new Date(cursor.getFullYear(), cursor.getMonth(), index + 1); return <div key={dayKey(date)} className={cn("min-h-[120px] border-r border-b border-[#0d1b2e]/8 p-1", isToday(date) && "border-2 border-[#0057e7] bg-[#eef5ff]")} onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData("text/order-id"); const order = orders.find(item => item.id === id); if (order) void updateEventDate(order, dayKey(date)); }}><p className={cn("text-xs font-bold px-1 py-1", isToday(date) ? "text-[#0057e7]" : "text-[#5a6a82]")}>{date.getDate()}</p>{eventsFor(date).map(order => <Event key={order.id} order={order} />)}</div>; })}</div></div>
    </div>;
  }
  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Agenda" actions={<div className="w-full flex flex-wrap items-center gap-2"><button type="button" onClick={() => moveCursor(-1)} aria-label="Período anterior" className="p-2 text-[#5a6a82] border border-[#0d1b2e]/15 rounded-lg"><ChevronLeft size={15} /></button><button type="button" onClick={() => moveCursor(1)} aria-label="Próximo período" className="p-2 text-[#5a6a82] border border-[#0d1b2e]/15 rounded-lg"><ChevronRight size={15} /></button><button type="button" onClick={today} className="text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-3 py-2 rounded-lg">Hoje</button><span className="text-sm font-black text-[#0d1b2e] min-w-[150px]">{title}</span><select value={technicianFilter} onChange={event => setTechnicianFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[130px] py-2 text-xs")}><option value="">Todos os técnicos</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[120px] py-2 text-xs")}><option value="">Todos os status</option>{statuses.map((status: any) => <option key={status.id} value={status.id}>{status.name}</option>)}</select><select value={situationFilter} onChange={event => setSituationFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[130px] py-2 text-xs")}><option value="">Todas as situações</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select><select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className={cn(INPUT, "w-auto min-w-[130px] py-2 text-xs")}><option value="">Todos os serviços</option>{services.map(service => <option key={service.id} value={service.id}>{service.title}</option>)}{generalServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select><select value={view} onChange={event => setView(event.target.value as typeof view)} className={cn(INPUT, "w-auto py-2 text-xs")}><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option><option value="agenda">Lista</option></select></div>} />
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">{loading ? <LoadingState /> : view === "agenda" ? <div className="divide-y divide-[#0d1b2e]/5">{filteredOrders.length === 0 ? <EmptyState icon={CalendarDays} title="Nenhum agendamento" message="As OS com data agendada aparecerão aqui." /> : filteredOrders.map(order => <div key={order.id} className="p-3 sm:p-4"><Event order={order} /></div>)}</div> : view === "day" ? <div className="p-4 min-h-[420px]" onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData("text/order-id"); const order = orders.find(item => item.id === id); if (order) void updateEventDate(order, dayKey(cursor)); }}><h3 className="font-bold text-[#0d1b2e] mb-3">{title}</h3>{eventsFor(cursor).map(order => <Event key={order.id} order={order} />)}</div> : view === "week" ? <div className="grid grid-cols-7 min-w-[720px]">{days(7).map(date => <div key={dayKey(date)} className="min-h-[420px] border-r border-[#0d1b2e]/8 last:border-r-0" onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData("text/order-id"); const order = orders.find(item => item.id === id); if (order) void updateEventDate(order, dayKey(date)); }}><div className="p-2 border-b border-[#0d1b2e]/8 text-center"><p className="text-[10px] uppercase font-bold text-[#5a6a82]">{date.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className="text-sm font-black text-[#0d1b2e]">{date.getDate()}</p></div><div className="p-1">{eventsFor(date).map(order => <Event key={order.id} order={order} />)}</div></div>)}</div> : <div className="grid grid-cols-7 min-w-[720px]">{Array.from({ length: (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7 }, (_, index) => <div key={`blank-${index}`} className="min-h-[120px] border-r border-b border-[#0d1b2e]/8 bg-[#f8fafc]" />)}{Array.from({ length: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate() }, (_, index) => { const date = new Date(cursor.getFullYear(), cursor.getMonth(), index + 1); return <div key={dayKey(date)} className="min-h-[120px] border-r border-b border-[#0d1b2e]/8 p-1" onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData("text/order-id"); const order = orders.find(item => item.id === id); if (order) void updateEventDate(order, dayKey(date)); }}><p className="text-xs font-bold text-[#5a6a82] px-1 py-1">{date.getDate()}</p>{eventsFor(date).map(order => <Event key={order.id} order={order} />)}</div>; })}</div>}</div>
  </div>;
}

function TabInventory({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const canViewInventory = hasPermission("inventory.view");
  const canCreateInventory = hasPermission("inventory.create");
  const canEditInventory = hasPermission("inventory.update");
  const canDeleteInventory = hasPermission("inventory.delete");
  const canManageInventory = canViewInventory || canCreateInventory || canEditInventory || canDeleteInventory;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", sku: "", description: "", unit: "un", quantity: "0", min_quantity: "0", purchase_price: "", sale_price: "", is_active: true });
  const [history, setHistory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [movementForm, setMovementForm] = useState({ type: "in", quantity: "", reason: "", service_order_id: "" });

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory_items").select("*").order("name");
    if (error) {
      setToast({ msg: `Erro ao carregar estoque: ${error.message}`, type: "error" });
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { void loadItems(); }, []);

  const openNew = () => {
    setSelectedItem(null);
    setForm({ id: "", name: "", sku: "", description: "", unit: "un", quantity: "0", min_quantity: "0", purchase_price: "", sale_price: "", is_active: true });
    setRecordOpen(true);
  };

  const openEdit = (item: any) => {
    setSelectedItem(item);
    setForm({
      id: item.id,
      name: item.name || "",
      sku: item.sku || "",
      description: item.description || "",
      unit: item.unit || "un",
      quantity: String(Number(item.quantity ?? 0)),
      min_quantity: String(Number(item.min_quantity ?? 0)),
      purchase_price: item.purchase_price == null ? "" : String(item.purchase_price),
      sale_price: item.sale_price == null ? "" : String(item.sale_price),
      is_active: item.is_active !== false,
    });
    setRecordOpen(true);
  };

  const saveItem = async () => {
    const canSaveItem = selectedItem ? canEditInventory : canCreateInventory;
    if (!canSaveItem) {
      setToast({ msg: "Você não possui permissão para gerenciar o estoque.", type: "error" });
      return;
    }
    if (!form.name.trim()) {
      setToast({ msg: "Informe o nome do item do estoque.", type: "error" });
      return;
    }
    const purchasePrice = form.purchase_price.trim() === "" ? null : Number(form.purchase_price);
    const salePrice = form.sale_price.trim() === "" ? null : Number(form.sale_price);
    if ((purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0))) {
      setToast({ msg: "Informe valores de compra e venda válidos e não negativos.", type: "error" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      unit: form.unit.trim() || "un",
      quantity: Number(form.quantity || 0),
      min_quantity: Number(form.min_quantity || 0),
      purchase_price: purchasePrice,
      sale_price: salePrice,
      is_active: form.is_active,
    };

    try {
      const { error } = selectedItem
        ? await supabase.from("inventory_items").update(payload).eq("id", selectedItem.id)
        : await supabase.from("inventory_items").insert(payload);
      if (error) throw error;
      setToast({ msg: selectedItem ? "Item atualizado." : "Item cadastrado.", type: "success" });
      setRecordOpen(false);
      await loadItems();
    } catch (error) {
      setToast({ msg: `Erro ao salvar item: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    }
  };

  const formatCurrency = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const toggleActive = async (item: any) => {
    if (!canEditInventory) {
      setToast({ msg: "Você não possui permissão para alterar o status do item.", type: "error" });
      return;
    }
    const next = !item.is_active;
    const { error } = await supabase.from("inventory_items").update({ is_active: next }).eq("id", item.id);
    if (error) {
      setToast({ msg: `Erro ao alterar status: ${error.message}`, type: "error" });
      return;
    }
    setToast({ msg: next ? "Item ativado." : "Item desativado.", type: "success" });
    await loadItems();
  };

  const deleteItem = async (item: any) => {
    if (!canDeleteInventory) {
      setToast({ msg: "Você não possui permissão para excluir itens do estoque.", type: "error" });
      return;
    }
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) {
      setToast({ msg: `Erro ao excluir item: ${error.message}`, type: "error" });
      return;
    }
    setToast({ msg: "Item excluído do estoque.", type: "success" });
    await loadItems();
  };

  const openHistory = async (item: any) => {
    setSelectedItem(item);
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("*, created_by_profile:profiles(full_name), service_order:service_orders(os_number)")
      .eq("inventory_item_id", item.id)
      .order("created_at", { ascending: false });
    if (error) {
      setToast({ msg: `Erro ao carregar histórico: ${error.message}`, type: "error" });
      setHistory([]);
      return;
    }
    setHistory(data || []);
    setHistoryOpen(true);
  };

  const saveMovement = async () => {
    if (!selectedItem) return;
    if (!canEditInventory) {
      setToast({ msg: "Você não possui permissão para movimentar o estoque.", type: "error" });
      return;
    }
    const quantity = Number(movementForm.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setToast({ msg: "Informe uma quantidade válida para a movimentação.", type: "error" });
      return;
    }
    const { data: currentItem, error: currentItemError } = await supabase.from("inventory_items").select("id,name,quantity,is_active").eq("id", selectedItem.id).maybeSingle();
    if (currentItemError) {
      setToast({ msg: `Não foi possível validar o item: ${supabaseErrorMessage(currentItemError)}`, type: "error" });
      return;
    }
    if (!currentItem) {
      setToast({ msg: "O item do estoque não foi encontrado.", type: "error" });
      return;
    }
    if (currentItem.is_active === false) {
      setToast({ msg: "O item está inativo e não pode receber movimentações.", type: "error" });
      return;
    }
    const current = Number(currentItem.quantity ?? 0);
    const movementType = movementForm.type === "in" ? "IN" : movementForm.type === "out" ? "OUT" : movementForm.type === "adjust" ? "ADJUST" : null;
    if (!movementType) {
      setToast({ msg: "Tipo de movimentação inválido.", type: "error" });
      return;
    }
    let nextQuantity = current;
    if (movementType === "IN") nextQuantity = current + quantity;
    if (movementType === "OUT") {
      if (current < quantity) {
        setToast({ msg: `Estoque insuficiente para saída: há ${current} unidade(s) disponíveis.`, type: "error" });
        return;
      }
      nextQuantity = current - quantity;
    }
    if (movementType === "ADJUST") {
      nextQuantity = quantity;
    }

    const insertPayload = {
      inventory_item_id: selectedItem.id,
      movement_type: movementType,
      quantity,
      reason: movementForm.reason.trim() || "Movimentação manual",
      created_by: user?.id || null,
      service_order_id: movementForm.service_order_id || null,
    };

    try {
      const { error } = await supabase.from("inventory_movements").insert(insertPayload);
      if (error) throw error;
      const { error: updateError } = await supabase.from("inventory_items").update({ quantity: nextQuantity }).eq("id", selectedItem.id);
      if (updateError) throw updateError;
      setToast({ msg: "Movimentação registrada com sucesso.", type: "success" });
      setHistoryOpen(false);
      setSelectedItem(null);
      setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" });
      await loadItems();
    } catch (error) {
      setToast({ msg: `Erro na movimentação: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Estoque" subtitle="Controle de itens, quantidade mínima e movimentações do almoxarifado" actions={
        <div className="flex items-center gap-2">
          <InternalBackButton onBack={onBack} />
          {canCreateInventory && <BtnPrimary onClick={openNew}><Plus size={14} /> Novo item</BtnPrimary>}
        </div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : items.length === 0 ? (
          <EmptyState icon={Package} title="Nenhum item em estoque" message="Cadastre um item para começar a controlar o inventário." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Unidade</th>
                  <th className="px-4 py-3 text-left">Quantidade</th>
                  <th className="px-4 py-3 text-left">Mínimo</th>
                  <th className="px-4 py-3 text-left">Compra</th>
                  <th className="px-4 py-3 text-left">Venda</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {items.map((item: any) => {
                  const quantity = Number(item.quantity ?? 0);
                  const minQuantity = Number(item.min_quantity ?? 0);
                  const lowStock = quantity <= minQuantity;
                  const isEmpty = quantity === 0;
                  return (
                    <tr key={item.id} className="hover:bg-[#f8fafc]/80">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-[#0d1b2e]">{item.name}</div>
                        {item.description && <div className="text-[11px] text-[#5a6a82]">{item.description}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]">{item.sku || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{item.unit || "un"}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn("font-bold text-sm", isEmpty ? "text-red-700" : lowStock ? "text-amber-700" : "text-[#0d1b2e]")}>{quantity}</span>
                        {isEmpty && <span className="ml-2 text-[10px] uppercase font-bold text-red-700">Sem estoque</span>}
                        {!isEmpty && lowStock && <span className="ml-2 text-[10px] uppercase font-bold text-amber-700">Baixo</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{minQuantity}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatCurrency(item.purchase_price)}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatCurrency(item.sale_price)}</td>
                      <td className="px-4 py-3.5"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-2">
                          {canEditInventory && <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={14} /></button>}
                          {canEditInventory && <button type="button" onClick={() => toggleActive(item)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={item.is_active !== false ? "Desativar" : "Ativar"}>{item.is_active !== false ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</button>}
                          {canDeleteInventory && <button type="button" onClick={() => void deleteItem(item)} className="p-1.5 text-[#5a6a82] hover:text-red-600 rounded-lg" title="Excluir"><Trash2 size={14} /></button>}
                          <button type="button" onClick={() => openHistory(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Movimentações"><List size={14} /></button>
                          {canEditInventory && <button type="button" onClick={() => { setSelectedItem(item); setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" }); setHistoryOpen(false); setRecordOpen(false); }} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Movimentar item">+</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recordOpen && (
        <AdminPage open={true} onClose={() => setRecordOpen(false)} breadcrumb="Operação > Estoque" title={selectedItem ? "Editar item" : "Novo item"} subtitle="Cadastro do item em estoque" maxW="max-w-xl">
          <div className="p-5 space-y-4">
            <FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
            <FInput label="SKU" value={form.sku} onChange={(e: any) => setForm({ ...form, sku: e.target.value })} />
            <FInput label="Unidade" value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })} />
            <FInput label="Quantidade" type="number" min="0" value={form.quantity} onChange={(e: any) => setForm({ ...form, quantity: e.target.value })} />
            <FInput label="Quantidade mínima" type="number" min="0" value={form.min_quantity} onChange={(e: any) => setForm({ ...form, min_quantity: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FInput label="Valor de compra" type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e: any) => setForm({ ...form, purchase_price: e.target.value })} />
              <FInput label="Valor de venda" type="number" min="0" step="0.01" value={form.sale_price} onChange={(e: any) => setForm({ ...form, sale_price: e.target.value })} />
            </div>
            <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} />
            <FToggle label="Item ativo" checked={form.is_active} onChange={(value) => setForm({ ...form, is_active: value })} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setRecordOpen(false)}>Cancelar</BtnSecondary>
            {(selectedItem ? canEditInventory : canCreateInventory) && <BtnPrimary onClick={saveItem}>{selectedItem ? "Salvar" : "Cadastrar"}</BtnPrimary>}
          </div>
        </AdminPage>
      )}

      {selectedItem && !recordOpen && (
        <AdminPage open={true} onClose={() => setSelectedItem(null)} breadcrumb="Operação > Estoque" title={`Movimentação — ${selectedItem.name}`} subtitle="Entrada, saída e ajuste de quantidade" maxW="max-w-xl">
          <div className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                <p className="text-[10px] uppercase text-[#5a6a82] font-bold">Quantidade atual</p>
                <p className="mt-1 text-lg font-black text-[#0d1b2e]">{Number(selectedItem.quantity ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                <p className="text-[10px] uppercase text-[#5a6a82] font-bold">Mínimo</p>
                <p className="mt-1 text-lg font-black text-[#0d1b2e]">{Number(selectedItem.min_quantity ?? 0)}</p>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Tipo</label>
              <select value={movementForm.type} onChange={(e: any) => setMovementForm({ ...movementForm, type: e.target.value })} className={cn(INPUT, "text-xs")}>
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
                <option value="adjust">Ajuste</option>
              </select>
            </div>
            <FInput label="Quantidade" type="number" min="1" value={movementForm.quantity} onChange={(e: any) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
            <FInput label="Motivo" value={movementForm.reason} onChange={(e: any) => setMovementForm({ ...movementForm, reason: e.target.value })} />
            <FInput label="OS relacionada (opcional)" value={movementForm.service_order_id} onChange={(e: any) => setMovementForm({ ...movementForm, service_order_id: e.target.value })} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setSelectedItem(null)}>Cancelar</BtnSecondary>
            {canEditInventory && <BtnPrimary onClick={saveMovement}>Registrar</BtnPrimary>}
          </div>
        </AdminPage>
      )}

      {historyOpen && selectedItem && (
        <AdminPage open={true} onClose={() => { setHistoryOpen(false); setSelectedItem(null); }} breadcrumb="Operação > Estoque" title={`Histórico — ${selectedItem.name}`} subtitle="Movimentações do item" maxW="max-w-2xl">
          <div className="p-5">
            {history.length === 0 ? (
              <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada para este item.</p>
            ) : (
              <div className="space-y-3">
                {history.map((entry: any) => (
                  <div key={entry.id} className="rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase text-[#5a6a82]">{entry.movement_type}</span>
                      <span className={cn("text-xs font-bold", entry.movement_type === "out" ? "text-red-600" : entry.movement_type === "in" ? "text-green-600" : "text-amber-600")}>{entry.movement_type === "out" ? "-" : entry.movement_type === "in" ? "+" : "~"}{Number(entry.quantity || 0)}</span>
                    </div>
                    <div className="mt-2 text-sm text-[#0d1b2e]">{entry.reason || "Movimentação manual"}</div>
                    <div className="mt-2 grid sm:grid-cols-2 gap-2 text-[11px] text-[#5a6a82]">
                      <div><span className="font-bold">Data:</span> {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "—"}</div>
                      <div><span className="font-bold">Usuário:</span> {entry.created_by_profile?.full_name || "—"}</div>
                      <div><span className="font-bold">OS:</span> {entry.service_order?.os_number || "—"}</div>
                      <div><span className="font-bold">Quantidade:</span> {Number(entry.quantity || 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminPage>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: CUSTOMERS ─────────────────────────── */

function TabCustomers({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [detailQuotes, setDetailQuotes] = useState<any[]>([]);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingCustomerData, setEditingCustomerData] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingCustomerAddress, setEditingCustomerAddress] = useState(false);
  const [editForm, setEditForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [editAddress, setEditAddress] = useState<Address>({ ...emptyAddress });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [createAddress, setCreateAddress] = useState<Address>({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [cpfError, setCpfError] = useState("");
  const cpfInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*, addresses:customer_addresses(*)").order("created_at", { ascending: false });
    if (error) setToast({ msg: `Erro ao carregar clientes: ${error.message}`, type: "error" });
    else setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (c: any) => {
    setDetail(c);
    setEditForm(customerFormFromCustomer(c));
    setEditAddress({ ...emptyAddress, ...((c.addresses || []).find((address: Address) => address.is_default) || c.addresses?.[0] || {}) });
    setEditingCustomerData(false);
    setEditingCustomerAddress(false);
    setDetailLoading(true);
    const [quotesRes, ordersRes] = await Promise.all([
      supabase.from("quote_requests").select("id, protocol, created_at, status_id, estimated_price, final_price, customer_message, request_status:request_statuses(name), service:services(title), brand:brands(name)").eq("customer_id", c.id).order("created_at", { ascending: false }),
      supabase.from("service_orders").select("id, os_number, service:services(title), created_at, scheduled_at, completed_at, internal_notes, customer_notes, status_id, order_status:order_statuses(name,color)").eq("customer_id", c.id).order("created_at", { ascending: false }),
    ]);
    setDetailQuotes(quotesRes.data || []);
    setDetailOrders(ordersRes.data || []);
    setDetailLoading(false);
  };

  const handleSaveCustomerData = async () => {
    if (!hasPermission("customers.edit")) { setToast({ msg: "Você não possui permissão para editar clientes.", type: "error" }); return; }
    const validationError = validateCustomerForm(editForm);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSavingCustomer(true);
    try {
      const { error } = await supabase.from("customers").update(customerUpdatePayload(editForm)).eq("id", detail.id);
      if (error) { setToast({ msg: `Erro ao salvar: ${error.message}`, type: "error" }); return; }
      setToast({ msg: "Dados do cliente atualizados.", type: "success" });
      setEditingCustomerData(false);
      await load();
      await openDetail({ ...detail, ...customerUpdatePayload(editForm) });
    } catch (error) {
      setToast({ msg: `Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSaveCustomerAddress = async () => {
    if (!hasPermission("customers.edit")) { setToast({ msg: "Você não possui permissão para editar clientes.", type: "error" }); return; }
    setSavingAddress(true);
    try {
      const addressPayload = { customer_id: detail.id, zip_code: editAddress.zip_code || null, street: editAddress.street || null, number: editAddress.number || null, complement: editAddress.complement || null, neighborhood: editAddress.neighborhood || null, city: editAddress.city || null, state: editAddress.state || null, is_default: true };
      const addressExists = (detail.addresses || []).find((address: Address) => address.is_default) || detail.addresses?.[0];
      const addressResult = addressExists
        ? await supabase.from("customer_addresses").update(addressPayload).eq("id", addressExists.id).select().single()
        : await supabase.from("customer_addresses").insert(addressPayload).select().single();
      if (addressResult.error) { setToast({ msg: `Erro ao salvar endereço: ${addressResult.error.message}`, type: "error" }); return; }
      setDetail({ ...detail, addresses: [addressResult.data || editAddress] });
      setToast({ msg: "Endereço atualizado.", type: "success" });
      setEditingCustomerAddress(false);
      await load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar endereço: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleCreate = async () => {
    if (!hasPermission("customers.create")) { setToast({ msg: "Você não possui permissão para cadastrar clientes.", type: "error" }); return; }
    if (createForm.customerType === "PF" && !isValidCpf(createForm.document)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      cpfInputRef.current?.focus();
      return;
    }
    const validationError = validateCustomerForm(createForm);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSaving(true);
    const { data: customer, error } = await supabase.from("customers").insert(customerPayload(createForm)).select().single();
    if (error || !customer) { setToast({ msg: `Erro ao cadastrar: ${error?.message || "Cliente não criado."}`, type: "error" }); setSaving(false); return; }
    const hasAddress = Object.values(createAddress).some(Boolean);
    if (hasAddress) {
      const addressResult = await supabase.from("customer_addresses").insert({ customer_id: customer.id, zip_code: createAddress.zip_code || null, street: createAddress.street || null, number: createAddress.number || null, complement: createAddress.complement || null, neighborhood: createAddress.neighborhood || null, city: createAddress.city || null, state: createAddress.state || null, is_default: true });
      if (addressResult.error) { setToast({ msg: `Cliente criado, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); setSaving(false); await load(); return; }
    }
    setToast({ msg: "Cliente cadastrado com sucesso!", type: "success" });
    setCreateOpen(false);
    setCreateForm({ ...emptyCustomerForm });
    setCreateAddress({ ...emptyAddress });
    setCpfError("");
    setSaving(false);
    await load();
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!hasPermission("customers.delete")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      setToast({ msg: `Não foi possível excluir o cliente: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "Cliente excluído.", type: "success" });
    setDeleteId(null);
    setDetail(null);
    await load();
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  const normalizeDoc = (doc: string) => doc.replace(/\D/g, "");

  const lookupCreateCnpj = async (value: string, baseForm = createForm) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || createForm.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, createAddress, data);
      setCreateForm(result.form); setCreateAddress(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
  };

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.full_name || "").toLowerCase().includes(s) || (c.trade_name || "").toLowerCase().includes(s) || (c.legal_name || "").toLowerCase().includes(s) || (c.whatsapp || "").includes(search) || (c.email || "").toLowerCase().includes(s) || normalizeDoc(c.document || "").includes(normalizeDoc(search)) || normalizeDoc(c.cnpj || "").includes(normalizeDoc(search));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este cliente? Esta ação remove o registro principal e pode falhar se houver dependências existentes no schema." onConfirm={() => { void handleDeleteCustomer(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <PageHeader title="Clientes" subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`} actions={
        <div className="flex gap-2">
          {hasPermission("customers.create") && <button onClick={() => { setCpfError(""); setCreateOpen(true); }} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0] transition-colors"><Plus size={13} /> Cadastrar Cliente</button>}
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      } />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome, documento, WhatsApp ou e-mail..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente cadastrado" message="Os clientes aparecem aqui ao enviar um orçamento." onAdd={hasPermission("customers.create") ? () => { setCpfError(""); setCreateOpen(true); } : undefined} addLabel="Cadastrar Cliente" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Tipo / documento</th>
                  <th className="px-4 py-3 text-left">WhatsApp</th>
                  <th className="px-4 py-3 text-left">E-mail</th>
                  <th className="px-4 py-3 text-left">Cadastrado em</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedCustomers.map(c => (
                  <tr key={c.id} onClick={() => openDetail(c)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{c.full_name}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{c.customer_type === "PJ" ? "PJ" : "PF"}</span> · {c.customer_type === "PJ" ? (c.cnpj ? formatCnpj(c.cnpj) : "—") : (c.document ? formatCpf(c.document) : "—")}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatPhone(c.whatsapp) || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82] truncate max-w-[160px]">{c.email || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(c.created_at)}</td>
                    <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openDetail(c)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:underline ml-auto">Ver detalhes</button>
                        {hasPermission("customers.delete") && (
                          <button type="button" onClick={() => setDeleteId(c.id)} title="Excluir cliente" aria-label="Excluir cliente" className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      {/* Customer Detail Drawer */}
      {detail && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb="Clientes" title={detail.full_name} subtitle={detail.customer_type === "PJ" ? (detail.cnpj ? formatCnpj(detail.cnpj) : "Pessoa Jurídica") : (detail.document ? formatCpf(detail.document) : "Pessoa Física")} maxW="max-w-2xl">
          <div className="p-5 space-y-5">
            {/* Customer info */}
            <Section title="Informações do cliente">
              {editingCustomerData ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <CustomerTypeToggle value={editForm.customerType} disabled onChange={customerType => setEditForm({ ...editForm, customerType })} />
                    {editForm.customerType === "PF" ? <>
                    <FInput label="Nome completo" value={editForm.full_name} required onChange={(e: any) => setEditForm({ ...editForm, full_name: e.target.value })} />
                    <FInput label="CPF" value={editForm.document} disabled />
                    <div><FInput label="Data de nascimento" type="date" required value={editForm.birth_date} max={todayDateOnly()} onChange={(e: any) => setEditForm({ ...editForm, birth_date: e.target.value })} />{!editForm.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}{editForm.birth_date > todayDateOnly() && <p className="mt-1 text-xs text-red-600">A data não pode ser futura.</p>}</div>
                    </> : <>
                    <FInput label="Nome fantasia" value={editForm.trade_name} required onChange={(e: any) => setEditForm({ ...editForm, trade_name: e.target.value })} />
                    <FInput label="CNPJ" value={editForm.cnpj} required disabled placeholder="00.000.000/0000-00" />
                    <FInput label="Razão social" value={editForm.legal_name} onChange={(e: any) => setEditForm({ ...editForm, legal_name: e.target.value })} />
                    <FInput label="Inscrição estadual" value={editForm.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setEditForm({ ...editForm, state_registration: e.target.value })} />
                    <FInput label="Fundação" value={editForm.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setEditForm({ ...editForm, foundation_date: formatFoundationDate(e.target.value) })} />
                    </>}
                    <FInput label="WhatsApp" value={editForm.whatsapp} onChange={(e: any) => setEditForm({ ...editForm, whatsapp: formatPhone(e.target.value) })} />
                    <FInput label="Telefone" value={editForm.phone} onChange={(e: any) => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })} />
                    <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={editForm.email} onChange={(e: any) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {hasPermission("customers.edit") && <BtnPrimary onClick={() => void handleSaveCustomerData()} disabled={savingCustomer}>{savingCustomer ? "Salvando..." : "Salvar alterações"}</BtnPrimary>}
                    <BtnSecondary onClick={() => { setEditForm(customerFormFromCustomer(detail)); setEditingCustomerData(false); }}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome</p><p className="font-bold text-[#0d1b2e]">{detail.full_name}</p></div>
                    {detail.customer_type === "PJ" ? <>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Tipo</p><p className="font-medium text-[#0d1b2e]">Pessoa Jurídica</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CNPJ</p><p className="font-medium text-[#0d1b2e]">{detail.cnpj ? formatCnpj(detail.cnpj) : "—"}</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome fantasia</p><p className="font-medium text-[#0d1b2e]">{detail.trade_name || detail.full_name || "—"}</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Razão social</p><p className="font-medium text-[#0d1b2e]">{detail.legal_name || "—"}</p></div>
                    </> : <>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CPF</p><p className="font-medium text-[#0d1b2e]">{detail.document ? formatCpf(detail.document) : "—"}</p></div>
                      {detail.birth_date && <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Data de nascimento</p><p className="font-medium text-[#0d1b2e]">{formatDateOnly(detail.birth_date)}</p></div>}
                    </>}
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">WhatsApp</p><p className="font-medium text-[#0d1b2e]">{formatPhone(detail.whatsapp) || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Telefone</p><p className="font-medium text-[#0d1b2e]">{formatPhone(detail.phone) || "—"}</p></div>
                    <div className="sm:col-span-2"><p className="text-[10px] text-[#5a6a82] font-bold uppercase">E-mail</p><p className="font-medium text-[#0d1b2e]">{detail.email || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Cadastrado em</p><p className="font-medium text-[#0d1b2e]">{fmtDate(detail.created_at)}</p></div>
                  </div>
                  {hasPermission("customers.edit") && <button onClick={() => setEditingCustomerData(true)} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-1.5 rounded-lg border border-[#0057e7]/30 transition-colors">
                    <Edit2 size={12} /> Editar dados
                  </button>}
                </div>
              )}
            </Section>

            <Section title="Endereço">
              {editingCustomerAddress ? (
                <div className="space-y-3">
                  <AddressFields value={editAddress} onChange={setEditAddress} inputClassName={INPUT} />
                  <div className="flex gap-2 pt-1">
                    {hasPermission("customers.edit") && <BtnPrimary onClick={() => void handleSaveCustomerAddress()} disabled={savingAddress}>{savingAddress ? "Salvando..." : "Salvar endereço"}</BtnPrimary>}
                    <BtnSecondary onClick={() => { setEditingCustomerAddress(false); setEditAddress({ ...emptyAddress, ...((detail.addresses || []).find((address: Address) => address.is_default) || detail.addresses?.[0] || {}) }); }}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <>
                  {((detail.addresses || []).length > 0) ? (
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                        const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                        const address = (detail.addresses || []).find((item: Address) => item.is_default) || detail.addresses?.[0];
                        return address?.[key] ? <div key={key}><p className="text-[10px] text-[#5a6a82] font-bold uppercase">{labels[key]}</p><p className="font-medium text-[#0d1b2e]">{address[key]}</p></div> : null;
                      })}
                    </div>
                  ) : <p className="text-sm text-[#5a6a82]">Nenhum endereço cadastrado.</p>}
                  {hasPermission("customers.edit") && <button onClick={() => setEditingCustomerAddress(true)} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-1.5 rounded-lg border border-[#0057e7]/30 transition-colors">
                    <Edit2 size={12} /> Editar endereço
                  </button>}
                </>
              )}
            </Section>

            {detailLoading ? <LoadingState text="Carregando histórico..." /> : (
              <>
                {/* Quotes */}
                <Section title={`Orçamentos (${detailQuotes.length})`}>
                  {detailQuotes.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhum orçamento para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailQuotes.map(q => (
                        <div key={q.id} className="bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span>
                            <StatusBadge status={(q.request_status as any)?.name || "—"} />
                          </div>
                          <p className="text-xs text-[#5a6a82]">{(q.service as any)?.title || "Serviço não informado"}{(q.brand as any)?.name ? ` — ${(q.brand as any).name}` : ""}</p>
                          {q.customer_message && <p className="text-xs text-[#0d1b2e] mt-1 italic">&quot;{q.customer_message}&quot;</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>{fmtDate(q.created_at)}</span>
                            {q.estimated_price && <span>Est: R$ {Number(q.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                            {q.final_price && <span>Final: R$ {Number(q.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Orders */}
                <Section title={`Ordens de Serviço (${detailOrders.length})`}>
                  {detailOrders.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhuma OS para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailOrders.map(o => (
                        <button key={o.id} type="button" onClick={() => onOpenOrder?.(o.id)} className="w-full text-left bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3 hover:bg-[#eef5ff] transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-xs text-[#0057e7]">#{o.os_number || o.id.slice(0, 8)}</span>
                            <StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />
                          </div>
                          <p className="text-xs font-semibold text-[#0d1b2e]">{(o.service as any)?.title || "Ordem de Serviço"}</p>
                          {o.customer_notes && <p className="text-xs text-[#5a6a82] mt-0.5">{o.customer_notes}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>Criada: {fmtDate(o.created_at)}</span>
                            {o.scheduled_at && <span>Agendado: {fmtDate(o.scheduled_at)}</span>}
                            {o.completed_at && <span>Concluído: {fmtDate(o.completed_at)}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 text-right">
            <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
          </div>
        </AdminPage>
      )}

      {createOpen && (
        <AdminPage open={true} onClose={() => { setCpfError(""); setCreateOpen(false); }} breadcrumb="Clientes" title="Novo cliente" subtitle="Preencha os dados do cliente" maxW="max-w-2xl">
          <div className="p-5 space-y-5">
            <Section title="Dados do cliente">
              <div className="grid sm:grid-cols-2 gap-4">
                <CustomerTypeToggle value={createForm.customerType} onChange={customerType => { setCpfError(""); setCreateForm({ ...createForm, customerType }); }} />
                {createForm.customerType === "PF" ? <>
                  <FInput label="Nome completo" required value={createForm.full_name} onChange={(e: any) => setCreateForm({ ...createForm, full_name: e.target.value })} />
                  <div>
                    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">CPF<span className="text-red-400">*</span></label>
                    <input ref={cpfInputRef} aria-invalid={Boolean(cpfError)} aria-describedby={cpfError ? "create-cpf-error" : undefined} required value={formatCpf(createForm.document)} placeholder="000.000.000-00" onBlur={() => { if (createForm.document.trim() && !isValidCpf(createForm.document)) setCpfError("CPF inválido. Verifique os números informados."); }} onChange={e => { const nextValue = formatCpf(e.target.value); setCreateForm({ ...createForm, document: nextValue }); if (!nextValue || isValidCpf(nextValue)) setCpfError(""); }} className={cn(INPUT, cpfError && "border-red-500 focus:border-red-500 focus:ring-red-500/50")} />
                    {cpfError && <p id="create-cpf-error" className="mt-1 text-xs text-red-600">{cpfError}</p>}
                  </div>
                  <div><FInput label="Data de nascimento" type="date" required value={createForm.birth_date} max={todayDateOnly()} onChange={(e: any) => setCreateForm({ ...createForm, birth_date: e.target.value })} />{!createForm.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}{createForm.birth_date > todayDateOnly() && <p className="mt-1 text-xs text-red-600">A data não pode ser futura.</p>}</div>
                </> : <>
                  <FInput label="Nome fantasia" required value={createForm.trade_name} onChange={(e: any) => setCreateForm({ ...createForm, trade_name: e.target.value })} />
                    <FInput label="CNPJ" required value={createForm.cnpj} placeholder="00.000.000/0000-00" onBlur={(e: any) => lookupCreateCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = formatCnpj(e.target.value); setCnpjMessage(""); setCreateForm({ ...createForm, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCreateCnpj(nextCnpj, { ...createForm, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : cnpjMessage || undefined} />
                  <FInput label="Razão social" value={createForm.legal_name} onChange={(e: any) => setCreateForm({ ...createForm, legal_name: e.target.value })} />
                  <FInput label="Inscrição estadual" value={createForm.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setCreateForm({ ...createForm, state_registration: e.target.value })} />
                  <FInput label="Fundação" value={createForm.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setCreateForm({ ...createForm, foundation_date: formatFoundationDate(e.target.value) })} />
                </>}
                <FInput label="Email" type="email" value={createForm.email} onChange={(e: any) => setCreateForm({ ...createForm, email: e.target.value })} />
                <FInput label="Telefone" required value={createForm.phone} onChange={(e: any) => setCreateForm({ ...createForm, phone: formatPhone(e.target.value) })} />
                <FInput label="WhatsApp" value={createForm.whatsapp} onChange={(e: any) => setCreateForm({ ...createForm, whatsapp: formatPhone(e.target.value) })} />
              </div>
            </Section>
            <Section title="Dados de endereço">
              <AddressFields value={createAddress} onChange={setCreateAddress} inputClassName={INPUT} />
            </Section>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => { setCpfError(""); setCreateOpen(false); }}>Cancelar</BtnSecondary>
            {hasPermission("customers.create") && <BtnPrimary onClick={handleCreate} disabled={saving}>{saving ? "Salvando..." : "Cadastrar Cliente"}</BtnPrimary>}
          </div>
        </AdminPage>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */

function RolePermissionsPanel({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_active: true, selected: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    const [{ data: roleData, error: roleError }, { data: permissionData, error: permissionError }, { data: employees }] = await Promise.all([
      supabase.from("roles").select("id,name,description,is_system,is_active,sort_order").order("sort_order").order("name"),
      supabase.from("permissions").select("id,key,label,description,module_name,sort_order").order("sort_order").order("label"),
      supabase.from("employees").select("role_id"),
    ]);
    if (roleError || permissionError) { setToast({ msg: `Erro ao carregar permissões: ${(roleError || permissionError)?.message}`, type: "error" }); return; }
    const counts: Record<string, number> = {};
    (employees || []).forEach((employee: any) => { if (employee.role_id) counts[employee.role_id] = (counts[employee.role_id] || 0) + 1; });
    setRoles(roleData || []); setPermissions(permissionData || []); setRoleCounts(counts);
  };
  useEffect(() => { load(); }, []);

  const grouped = permissions.reduce<Record<string, any[]>>((groups, permission) => {
    const moduleName = permission.key?.startsWith("orders.") ? "Ordens de Serviço" : permission.key?.startsWith("inventory.") ? "Estoque" : permission.module_name || "Outros";
    (groups[moduleName] ||= []).push(permission);
    return groups;
  }, {});
  const openNew = () => { setEditing(null); setForm({ name: "", description: "", is_active: true, selected: [] }); setFormOpen(true); };
  const reloadRolePermissions = async (roleId: string) => {
    const { data, error } = await supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);
    if (error) return error;
    setForm(current => ({ ...current, selected: (data || []).map((item: any) => item.permission_id) }));
    return null;
  };
  const openEdit = async (role: any) => {
    setEditing(role); setForm({ name: role.name || "", description: role.description || "", is_active: role.is_active !== false, selected: [] });
    const error = await reloadRolePermissions(role.id);
    if (error) { setToast({ msg: `Erro ao carregar permissões da função: ${supabaseErrorMessage(error)}`, type: "error" }); return; }
    setFormOpen(true);
  };
  const save = async () => {
    if (!hasPermission(editing ? "roles.edit" : "roles.create")) { setToast({ msg: "Você não possui permissão para salvar funções.", type: "error" }); return; }
    if (!form.name.trim()) { setToast({ msg: "Informe o nome da função.", type: "error" }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, is_active: form.is_active };
    const roleId = editing?.id || crypto.randomUUID();
    const result = editing
      ? await supabase.from("roles").update(payload).eq("id", roleId)
      : await supabase.from("roles").insert({ ...payload, id: roleId, is_system: false, sort_order: roles.length });
    if (result.error) {
      console.error("Role save error:", { operation: editing ? "update" : "insert", table: "roles", code: result.error.code, message: result.error.message, details: result.error.details, hint: result.error.hint });
      setSaving(false);
      setToast({ msg: `Erro ao ${editing ? "atualizar" : "criar"} função: ${supabaseErrorMessage(result.error)}`, type: "error" });
      return;
    }

    const previousPermissionIds = new Set<string>();
    if (editing) {
      const { data: currentPermissions, error: currentPermissionsError } = await supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);
      if (currentPermissionsError) {
        setSaving(false);
        setToast({ msg: `A função foi salva, mas não foi possível ler suas permissões: ${supabaseErrorMessage(currentPermissionsError)}`, type: "error" });
        await load();
        return;
      }
      (currentPermissions || []).forEach((item: any) => previousPermissionIds.add(item.permission_id));
    }

    const selectedPermissionIds = new Set(form.selected);
    const permissionIdsToRemove = [...previousPermissionIds].filter(permissionId => !selectedPermissionIds.has(permissionId));
    const permissionIdsToAdd = [...selectedPermissionIds].filter(permissionId => !previousPermissionIds.has(permissionId));
    try {
      for (const permissionId of permissionIdsToAdd) {
        const { error } = await supabase.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
        if (error) throw error;
      }
      for (const permissionId of permissionIdsToRemove) {
        const { error } = await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
        if (error) throw error;
      }
    } catch (error) {
      console.error("Role permissions save error:", { operation: "delta-sync", table: "role_permissions", error });
      setSaving(false);
      setToast({ msg: `A função foi salva, mas não foi possível sincronizar as permissões: ${supabaseErrorMessage(error)}`, type: "error" });
      if (editing) {
        const reloadError = await reloadRolePermissions(roleId);
        if (reloadError) console.error("Role permissions reload error:", reloadError);
      }
      await load();
      return;
    }

    setSaving(false); setFormOpen(false); setToast({ msg: editing ? "Função atualizada." : "Função criada.", type: "success" }); await load();
  };
  const togglePermission = (permissionId: string) => setForm(current => ({ ...current, selected: current.selected.includes(permissionId) ? current.selected.filter(id => id !== permissionId) : [...current.selected, permissionId] }));
  const toggleGroup = (items: any[]) => { const ids = items.map(item => item.id); const allSelected = ids.every(id => form.selected.includes(id)); setForm(current => ({ ...current, selected: allSelected ? current.selected.filter(id => !ids.includes(id)) : Array.from(new Set([...current.selected, ...ids])) })); };
  const allSelected = permissions.length > 0 && permissions.every(permission => form.selected.includes(permission.id));

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Funções e Permissões" subtitle="Defina os acessos disponíveis para cada perfil" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("roles.create") && <BtnPrimary onClick={openNew}><Plus size={15} /> Nova função</BtnPrimary>}</div>} />
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold"><tr><th className="px-4 py-3 text-left">Função</th><th className="px-4 py-3 text-left">Descrição</th><th className="px-4 py-3 text-left">Permissões</th><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-left">Usuários</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-[#0d1b2e]/5">{roles.map(role => <RoleRow key={role.id} role={role} permissionCount={role.permission_count} userCount={roleCounts[role.id] || 0} onEdit={() => openEdit(role)} />)}</tbody></table></div></div>
    {formOpen && <AdminPage open={true} onClose={() => setFormOpen(false)} breadcrumb="Equipes" title={editing ? "Editar função" : "Nova função"} subtitle="Configure os acessos do perfil" maxW="max-w-3xl"><div className="p-5 space-y-5"><Section title="Dados da função"><div className="grid sm:grid-cols-2 gap-4"><FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /><div className="sm:col-span-2"><FToggle label="Função ativa" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} /></div></div></Section><Section title="Permissões"><div className="flex items-center justify-between mb-4"><label className="flex items-center gap-2 text-sm font-bold text-[#0d1b2e]"><input type="checkbox" checked={allSelected} onChange={() => toggleGroup(permissions)} /> Selecionar todas as permissões</label><span className="text-xs font-bold text-[#5a6a82]">{form.selected.length}/{permissions.length}</span></div><div className="space-y-3">{Object.entries(grouped).map(([moduleName, items]) => { const moduleItems = items as any[]; const selectedCount = moduleItems.filter(item => form.selected.includes(item.id)).length; return <div key={moduleName} className="border border-[#0d1b2e]/10 rounded-lg p-4"><div className="flex items-center justify-between mb-3"><label className="flex items-center gap-2 text-sm font-black text-[#0d1b2e]"><input type="checkbox" checked={selectedCount === moduleItems.length} onChange={() => toggleGroup(moduleItems)} /> {moduleName}</label><span className="text-[11px] text-[#5a6a82]">{selectedCount}/{moduleItems.length}</span></div><div className="grid sm:grid-cols-2 gap-2">{moduleItems.map(permission => <label key={permission.id} className="flex items-start gap-2 text-xs text-[#5a6a82]"><input type="checkbox" checked={form.selected.includes(permission.id)} onChange={() => togglePermission(permission.id)} /><span>{permission.label || permission.description || permission.key}</span></label>)}</div></div>; })}</div></Section></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{hasPermission(editing ? "roles.edit" : "roles.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar Permissões"}</BtnPrimary>}</div></AdminPage>}
  </div>;
}

function RoleRow({ role, permissionCount, userCount, onEdit }: { role: any; permissionCount?: number; userCount: number; onEdit: () => void }) {
  const [count, setCount] = useState(permissionCount);
  const { hasPermission } = useAuth();
  useEffect(() => { if (count != null) return; supabase.from("role_permissions").select("permission_id", { count: "exact", head: true }).eq("role_id", role.id).then(result => setCount(result.count || 0)); }, [role.id, count]);
  return <tr className="hover:bg-[#f8fafc]/80"><td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{role.name}</td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{role.description || "—"}</td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{count ?? "—"}</td><td className="px-4 py-3.5"><StatusBadge status={role.is_system ? "Padrão" : "Personalizado"} /></td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{userCount}</td><td className="px-4 py-3.5 text-right">{hasPermission("roles.edit") && <button type="button" onClick={onEdit} className="text-xs font-bold text-[#0057e7] hover:underline">Editar</button>}</td></tr>;
}

function TabEmployees({ onBack }: { onBack: () => void }) {
  const [activeArea, setActiveArea] = useState<"users" | "roles">("users");
  const { user, hasPermission } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", cpf: "", phone: "", email: "", password: "", function_name: "Funcionário", role_id: "", is_active: true });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const getEmployeeErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    return "Não foi possível atualizar o funcionário.";
  };

  const load = async () => {
    setLoading(true);
    const [{ data, error }, rolesResult] = await Promise.all([getEmployees(), supabase.from("roles").select("id,name,is_active").eq("is_active", true).order("sort_order").order("name")]);
    if (error) { console.error("[ADMIN] employees load error:", error); setToast({ msg: `Erro ao carregar equipes: ${error.message}`, type: "error" }); }
    else setEmployees(data || []);
    if (rolesResult.error) setToast({ msg: `Erro ao carregar funções: ${rolesResult.error.message}`, type: "error" });
    setRoles(rolesResult.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditItem(null); setForm({ full_name: "", cpf: "", phone: "", email: "", password: "", function_name: "Funcionário", role_id: roles[0]?.id || "", is_active: true }); setFormOpen(true); };
  const openEdit = (employee: any) => {
    setEditItem(employee);
    setForm({ full_name: employee.full_name || "", cpf: employee.cpf || "", phone: formatPhone(employee.phone), email: "", password: "", function_name: employee.function_name || "Funcionário", role_id: employee.role_id || "", is_active: employee.is_active !== false });
    setFormOpen(true);
  };
  const normalizeCpf = (value: string) => value.replace(/\D/g, "");
  const save = async () => {
    if (!hasPermission(editItem ? "employees.edit" : "employees.create")) { setToast({ msg: "Você não possui permissão para salvar usuários.", type: "error" }); return; }
    const cpf = normalizeCpf(form.cpf);
    if (!form.full_name.trim() || cpf.length !== 11) { setToast({ msg: "Informe nome completo e um CPF válido.", type: "error" }); return; }
    const normalizedEmail = String(form.email || "").trim().replace(/\s+/g, "").toLowerCase();
    if (!editItem && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setToast({ msg: "Informe um e-mail válido.", type: "error" }); return; }
    if (form.password && form.password.length < 8) { setToast({ msg: "A senha deve ter pelo menos 8 caracteres.", type: "error" }); return; }
    if (!form.role_id) { setToast({ msg: "Selecione uma função para o funcionário.", type: "error" }); return; }
    const duplicate = employees.some((e: any) => normalizeCpf(e.cpf) === cpf && e.id !== editItem?.id);
    if (duplicate) { setToast({ msg: "Este CPF já está cadastrado na equipe.", type: "error" }); return; }
    setSaving(true);
    try {
      if (editItem) {
        const updatePayload: Record<string, unknown> = {
          action: "update_employee_user",
          employee_id: editItem.id,
          full_name: form.full_name.trim(),
          cpf,
          phone: form.phone.replace(/\D/g, "") || null,
          function_name: form.function_name.trim() || null,
          role_id: form.role_id,
          is_active: form.is_active,
          password: form.password || undefined,
        };
        if (normalizedEmail) updatePayload.email = normalizedEmail;
        const { data, error: invokeError } = await supabase.functions.invoke("server", { body: updatePayload });
        if (invokeError) {
          const context = (invokeError as { context?: unknown }).context;
          if (context instanceof Response) {
            try {
              const responseBody = await context.clone().json() as { error?: unknown };
              if (responseBody.error) throw new Error(typeof responseBody.error === "string" ? responseBody.error : getEmployeeErrorMessage(responseBody.error));
            } catch (error) {
              if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
            }
          }
          throw invokeError;
        }
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : getEmployeeErrorMessage(data.error));
        if (data?.success !== true) throw new Error("Não foi possível atualizar o funcionário.");
      } else {
        const { data, error: invokeError } = await supabase.functions.invoke("server", {
          body: {
            action: "create_employee_user",
            email: normalizedEmail,
            password: form.password,
            full_name: form.full_name.trim(),
            cpf,
            phone: form.phone ? form.phone.replace(/\D/g, "") : null,
            function_name: form.function_name.trim() || "Funcionário",
            role_id: form.role_id,
          },
        });
        if (invokeError) {
          let responseMessage = "";
          const context = (invokeError as { context?: unknown }).context;
          if (context instanceof Response) {
            try {
              const responseBody = await context.clone().json() as { error?: unknown };
              responseMessage = typeof responseBody.error === "string" ? responseBody.error : "";
            } catch {
              responseMessage = "";
            }
          }
          throw new Error(responseMessage || invokeError.message || "Não foi possível cadastrar o funcionário.");
        }
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível cadastrar o funcionário.");
        if (data?.success !== true) throw new Error("Não foi possível cadastrar o funcionário.");
      }
      setFormOpen(false); setToast({ msg: editItem ? "Funcionário atualizado." : "Funcionário cadastrado.", type: "success" }); load();
    } catch (e: unknown) {
      console.error("[ADMIN] employee save error:", e);
      setToast({ msg: getEmployeeErrorMessage(e), type: "error" });
    } finally {
      setSaving(false);
    }
  };
  const toggleActive = async (emp: any) => {
    if (!hasPermission("employees.edit")) return;
    const currentlyActive = emp.is_active !== false;
    const { error } = await setEmployeeActive(emp.id, !currentlyActive);
    if (error) { console.error("[ADMIN] employee toggle error:", error); setToast({ msg: `Erro ao atualizar funcionário: ${error.message}`, type: "error" }); return; }
    setToast({ msg: `Funcionário ${currentlyActive ? "desativado" : "ativado"}.`, type: "success" });
    load();
  };

  const deleteEmployee = async (employeeId: string) => {
    if (!hasPermission("employees.delete")) return;
    const { error } = await supabase.from("employees").delete().eq("id", employeeId);
    if (error) {
      setToast({ msg: `Não foi possível excluir o funcionário: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "Funcionário excluído.", type: "success" });
    setDeleteId(null);
    await load();
  };

  if (activeArea === "roles" && hasPermission("roles.view")) return <RolePermissionsPanel onBack={() => setActiveArea("users")} />;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este funcionário? Isso remove o registro do funcionário, sem afetar o fluxo de ativação/desativação do status." onConfirm={() => { void deleteEmployee(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <PageHeader title="Equipes" subtitle="Cadastro e gestão dos funcionários da empresa" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("employees.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Novo funcionário</BtnPrimary>}</div>} />
      <div className="flex gap-1 border-b border-[#0d1b2e]/10"><button type="button" onClick={() => setActiveArea("users")} className={cn("px-4 py-2.5 text-xs font-bold border-b-2", activeArea === "users" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]")}>Usuários</button>{hasPermission("roles.view") && <button type="button" onClick={() => setActiveArea("roles")} className="px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-[#5a6a82]">Funções e Permissões</button>}</div>

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : employees.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum funcionário cadastrado" message="Cadastre o primeiro funcionário da equipe." onAdd={openNew} addLabel="Novo funcionário" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">CPF</th>
                  <th className="px-4 py-3 text-left">Telefone</th>
                  <th className="px-4 py-3 text-left">Função</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {employees.map(emp => {
                  const active = emp.is_active !== false;
                  const role = Array.isArray(emp.role) ? emp.role[0] : emp.role;
                  return (
                    <tr key={emp.id} onClick={() => openEdit(emp)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                      <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{emp.full_name}</td>
                      <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]">{formatCpf(emp.cpf)}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatPhone(emp.phone) || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{role?.name?.trim() || "Função não informada"}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={active ? "Ativo" : "Inativo"} /></td>
                      <td className="px-4 py-3.5"><div className="flex justify-end gap-1">{hasPermission("employees.edit") && <button onClick={(event) => { event.stopPropagation(); openEdit(emp); }} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={15} /></button>}{hasPermission("employees.edit") && <button onClick={(event) => { event.stopPropagation(); toggleActive(emp); }} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={active ? "Desativar" : "Ativar"}>{active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</button>}{hasPermission("employees.delete") && <button onClick={(event) => { event.stopPropagation(); setDeleteId(emp.id); }} className="p-1.5 text-[#5a6a82] hover:text-red-600 rounded-lg" title="Excluir funcionário"><Trash2 size={15} /></button>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Equipes" title={editItem ? editItem.full_name : "Novo funcionário"} subtitle={editItem ? "Atualize os dados do funcionário" : "Cadastre um funcionário da empresa"}>
        <div className="p-5 space-y-5"><Section title="Dados do funcionário"><div className="grid sm:grid-cols-2 gap-4"><FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} /><FInput label="CPF" required value={formatCpf(form.cpf)} onChange={(e: any) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /><FInput label="Número / telefone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />{editItem ? <FInput label="Gmail" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} placeholder="usuario@gmail.com" /> : <FInput label="E-mail" type="email" required value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />} {editItem && <PasswordField key={`edit-${editItem.id}-${formOpen}`} label="Nova senha" value={form.password} onChange={value => setForm({ ...form, password: value })} placeholder="Deixe em branco para manter" resetKey={String(formOpen)} />}{!editItem && <PasswordField key={`create-${formOpen}`} label="Senha" required value={form.password} onChange={value => setForm({ ...form, password: value })} resetKey={String(formOpen)} />}<FSelect label="Função" required value={form.role_id} onChange={(e: any) => setForm({ ...form, role_id: e.target.value })} options={[{ value: "", label: "Selecionar função..." }, ...roles.map(role => ({ value: role.id, label: role.name }))]} /><div className="sm:col-span-2"><FToggle label="Funcionário ativo" checked={form.is_active} onChange={value => setForm({ ...form, is_active: value })} /></div></div></Section></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{(editItem ? hasPermission("employees.edit") : hasPermission("employees.create")) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : editItem ? "Salvar alterações" : "Salvar funcionário"}</BtnPrimary>}</div>
      </AdminPage>
    </div>
  );
}

/* ─────────────────────────── TAB: SETTINGS ─────────────────────────── */

function TabSettings() {
  const { user, hasPermission } = useAuth();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("site_settings").select("setting_key, setting_value");
    const map: Record<string, any> = {};
    if (error) setToast({ msg: `Erro ao carregar configurações: ${error.message}`, type: "error" });
    (data || []).forEach((row: any) => { map[row.setting_key] = row.setting_value; });
    setSettings(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateSetting = (key: string, value: any) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase.from("site_settings").upsert({ setting_key: key, setting_value: value, updated_by: user?.id || null }, { onConflict: "setting_key" });
        if (error) throw error;
      }
      setToast({ msg: "Configurações salvas com sucesso!", type: "success" });
    } catch (error) {
      console.error("[ADMIN] site_settings save error:", error);
      setToast({ msg: `Erro ao salvar configurações: ${error instanceof Error ? error.message : "erro desconhecido"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const groups = [
    {
      title: "Identidade Visual", keys: [
        { key: "primary_color", label: "Cor primária", type: "text", placeholder: "#0057e7" },
        { key: "secondary_color", label: "Cor secundária", type: "text", placeholder: "#0d1b2e" },
        { key: "logo_url", label: "URL do logo", type: "text", placeholder: "https://..." },
      ]
    },
    {
      title: "Home — Textos", keys: [
        { key: "hero_title", label: "Título do Hero", type: "text", placeholder: "Tecnologia, produtos e serviços em um só lugar." },
        { key: "hero_subtitle", label: "Subtítulo do Hero", type: "text", placeholder: "Descrição curta da empresa." },
        { key: "hero_image_url", label: "Imagem do Hero (URL)", type: "text", placeholder: "https://..." },
      ]
    },
    {
      title: "Site — Informações Gerais", keys: [
        { key: "site_name", label: "Nome do site", type: "text", placeholder: "Eletrônica Artvideo" },
        { key: "site_description", label: "Descrição do site", type: "text", placeholder: "Meta description..." },
        { key: "whatsapp_number", label: "Número WhatsApp (com DDI)", type: "text", placeholder: "5579999999999" },
      ]
    },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Configurações do Site" subtitle="Controle as configurações globais do site" actions={
        hasPermission("settings.update") && (
        <BtnPrimary onClick={handleSave} disabled={saving}>
          {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
          {saving ? "Salvando..." : "Salvar tudo"}
        </BtnPrimary>
        )
      } />

      {loading ? <LoadingState /> : (
        <div className="space-y-4 max-w-2xl">
          {groups.map(group => (
            <Section key={group.title} title={group.title}>
              <div className="space-y-4">
                {group.keys.map(field => (
                  <FInput key={field.key} label={field.label} type={field.type} value={settings[field.key] || ""} onChange={(e: any) => updateSetting(field.key, e.target.value)} placeholder={field.placeholder} />
                ))}
              </div>
            </Section>
          ))}

          {Object.keys(settings).length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-bold mb-1">Tabela site_settings vazia ou sem dados.</p>
              <p>As configurações serão criadas ao salvar pela primeira vez.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: CONTACT ─────────────────────────── */

function TabContact() {
  const { user, hasPermission } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("site_settings").select("setting_key, setting_value");
    if (error) setToast({ msg: `Erro ao carregar contato: ${error.message}`, type: "error" });
    else setSettings(Object.fromEntries((data || []).map((setting: any) => [setting.setting_key, setting.setting_value || ""])));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      for (const [setting_key, setting_value] of Object.entries(settings)) {
        const { data, error } = await supabase.from("site_settings").upsert({ setting_key, setting_value, updated_by: user?.id || null }, { onConflict: "setting_key" }).select().single();
        if (error) {
          console.error("[ADMIN] Contact save error:", error);
          throw error;
        }
      }
      setToast({ msg: "Informações de contato salvas!", type: "success" });
    } catch (error) {
      console.error("[ADMIN] site settings contact save error:", error);
      const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
      setToast({ msg: `Erro ao salvar: ${message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const groups = [
    { title: "Contato", fields: [["phone", "Telefone", "(79) 0000-0000"], ["whatsapp", "WhatsApp", "(79) 99999-9999"], ["email", "E-mail", "contato@empresa.com"]] },
    { title: "Redes sociais", fields: [["instagram", "Instagram", "@empresa"]] },
    { title: "Endereço", fields: [["zip_code", "CEP", "00000-000"], ["street", "Rua", "Rua da empresa"], ["number", "Número", "123"], ["complement", "Complemento", "Sala, bloco..."], ["neighborhood", "Bairro", "Bairro"], ["city", "Cidade", "Cidade"], ["state", "Estado", "SE"]] },
    { title: "Horário", fields: [["business_hours", "Horário de funcionamento", "Seg a Sex: 8h às 18h"]] },
    { title: "Identidade", fields: [["company_name", "Nome da empresa", "Eletrônica Artvideo"]] },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Informações de Contato" subtitle="Dados exibidos no site e usados nos botões de ação" />

      {loading ? <LoadingState /> : (
        <form onSubmit={handleSave} className="max-w-xl space-y-5">
          {groups.map((group) => <Section key={group.title} title={group.title}><div className="space-y-4">{group.fields.map(([key, label, placeholder]) => <FInput key={key} label={label} value={settings[key] || ""} onChange={(event: any) => updateSetting(key, event.target.value)} placeholder={placeholder} />)}</div></Section>)}

          <div className="flex items-center gap-3">
            {hasPermission("contact.update") && <BtnPrimary type="submit" disabled={saving}>
              {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              {saving ? "Salvando..." : "Salvar contato"}
            </BtnPrimary>}
            <p className="text-xs text-[#5a6a82]">Essas informações alimentam o site público.</p>
          </div>
        </form>
      )}
    </div>
  );
}