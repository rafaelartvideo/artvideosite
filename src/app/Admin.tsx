import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import { createEmployee, getEmployees, setEmployeeActive, updateEmployee } from "@/lib/queries";
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

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminSidebar } from "@/features/admin-shell/presentation/AdminSidebar";
import { AdminHeader } from "@/features/admin-shell/presentation/AdminHeader";
import { AdminLayout } from "@/features/admin-shell/presentation/AdminLayout";
import { AdminContentRouter, type AdminRouteMap } from "@/features/admin-shell/presentation/AdminContentRouter";
import { TabSettings } from "@/features/settings/presentation/TabSettings";
import { TabContact } from "@/features/contact/presentation/TabContact";
import { TabCategories } from "@/features/categories/presentation/TabCategories";
import { TabBrands } from "@/features/brands/presentation/TabBrands";
import { TabProducts } from "@/features/products/presentation/TabProducts";
import { TabServices } from "@/features/services/presentation/TabServices";
import { GeneralServicesPanel } from "@/features/general-services/presentation/GeneralServicesPanel";
import { EquipmentAdminPanel } from "@/features/equipment/presentation/EquipmentAdminPanel";
import { ServiceTypesAdminPanel } from "@/features/service-types/presentation/ServiceTypesAdminPanel";
import { OrderStatusesAdminPanel } from "@/features/order-statuses/presentation/OrderStatusesAdminPanel";
import { operationItems, permissionForTab, siteItems } from "@/features/admin-shell/navigation-config";

/* ─────────────────────────── ADMIN DASHBOARD WRAPPER ─────────────────────────── */

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");

  const canAccessTab = (tab: AdminTab) => hasPermission(permissionForTab[tab]);



  const routes: AdminRouteMap = {
    dashboard: { element: <TabDashboard /> },
    services: { element: <TabServices onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    categories: { element: <TabCategories onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    products: { element: <TabProducts onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    brands: { element: <TabBrands onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    site: {
      requiresPermission: false,
      element: (
        <AdminHubPage
          title="Site"
          description="Conteúdo e cadastros exibidos no site público."
          items={siteItems.filter((item) => hasPermission(item.permissionKey))}
          onSelect={(id, label) => {
            setPage({ breadcrumb: "Site", title: label, onBack: () => { setActiveTab("site"); setPage(null); } });
            setActiveTab(id as AdminTab);
          }}
        />
      ),
    },
    operation: {
      requiresPermission: false,
      element: (
        <AdminHubPage
          title="Operação"
          description="Cadastros e configurações internas da assistência técnica."
          items={operationItems.filter((item) => hasPermission(item.permissionKey))}
          onSelect={(id, label) => {
            setPage({ breadcrumb: "Operação", title: label, onBack: () => { setActiveTab("operation"); setPage(null); } });
            setActiveTab(id as AdminTab);
          }}
        />
      ),
    },
    equipment: { element: <EquipmentAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    generalServices: { element: <GeneralServicesPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    serviceTypes: { element: <ServiceTypesAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    inventory: { element: <TabInventory onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    situations: { element: <OSSituationsView onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    orderStatuses: { element: <OrderStatusesAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    quotes: { element: <TabQuotes onNavigate={setActiveTab} /> },
    orders: {
      element: (
        <TabOrders
          onNavigate={setActiveTab}
          initialOrderId={focusedOrderId}
          onFocused={() => setFocusedOrderId(null)}
        />
      ),
    },
    agenda: {
      element: <TabAgenda onOpenOrder={(id) => { setFocusedOrderId(id); setActiveTab("orders"); }} />,
    },
    customers: {
      element: <TabCustomers onOpenOrder={(id) => { setFocusedOrderId(id); setActiveTab("orders"); }} />,
    },
    employees: { element: <TabEmployees onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    settings: { element: <TabSettings /> },
    contact: { element: <TabContact /> },
  };

  const sidebar = (
    <AdminSidebar
      activeTab={activeTab}
      userName={profile?.full_name || user?.email?.split("@")[0] || "Admin"}
      roleName={roleName}
      hasPermission={hasPermission}
      onNavigate={(tab) => {
        setActiveTab(tab);
        setPage(null);
        setSidebarOpen(false);
      }}
      onSignOut={() => signOut()}
      onBackToSite={onBackToSite}
    />
  );

  return (
    <AdminPageContext.Provider value={{ page, setPage }}>
      <AdminLayout
        sidebar={sidebar}
        mobileSidebarOpen={sidebarOpen}
        onCloseMobileSidebar={() => setSidebarOpen(false)}
        header={
          <AdminHeader
            activeTab={activeTab}
            page={page}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
          />
        }
      >
        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <AdminContentRouter activeTab={activeTab} routes={routes} canAccessTab={canAccessTab} />
        </div>
      </AdminLayout>
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
    const permissionByKey = new Map(permissions.map(permission => [permission.key, permission.id]));
    const viewPermissionId = permissionByKey.get("orders.view");
    const viewAllPermissionId = permissionByKey.get("orders.view_all");
    const requestPartsPermissionId = permissionByKey.get("orders.request_parts");
    const managePartRequestsPermissionId = permissionByKey.get("orders.manage_part_requests");
    if (viewPermissionId && (selectedPermissionIds.has(viewAllPermissionId) || selectedPermissionIds.has(requestPartsPermissionId) || selectedPermissionIds.has(managePartRequestsPermissionId))) selectedPermissionIds.add(viewPermissionId);
    if (viewAllPermissionId && selectedPermissionIds.has(managePartRequestsPermissionId)) selectedPermissionIds.add(viewAllPermissionId);
    if (viewPermissionId && !selectedPermissionIds.has(viewPermissionId)) {
      if (viewAllPermissionId) selectedPermissionIds.delete(viewAllPermissionId);
      if (requestPartsPermissionId) selectedPermissionIds.delete(requestPartsPermissionId);
      if (managePartRequestsPermissionId) selectedPermissionIds.delete(managePartRequestsPermissionId);
    }
    if (viewAllPermissionId && !selectedPermissionIds.has(viewAllPermissionId) && managePartRequestsPermissionId) selectedPermissionIds.delete(managePartRequestsPermissionId);
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
  const togglePermission = (permissionId: string) => setForm(current => {
    const permission = permissions.find(item => item.id === permissionId);
    const nextSelected = new Set(current.selected);
    const wasSelected = nextSelected.has(permissionId);
    if (wasSelected) nextSelected.delete(permissionId);
    else nextSelected.add(permissionId);
    if (permission?.key === "orders.view") {
      if (!nextSelected.has(permissionId)) {
        permissions.filter(item => item.key === "orders.view_all" || item.key === "orders.request_parts" || item.key === "orders.manage_part_requests").forEach(item => nextSelected.delete(item.id));
      }
    } else if (permission?.key === "orders.view_all" || permission?.key === "orders.request_parts") {
      const viewPermission = permissions.find(item => item.key === "orders.view");
      if (viewPermission) nextSelected.add(viewPermission.id);
      if (permission?.key === "orders.view_all" && wasSelected) {
        const managePermission = permissions.find(item => item.key === "orders.manage_part_requests");
        if (managePermission) nextSelected.delete(managePermission.id);
      }
    } else if (permission?.key === "orders.manage_part_requests") {
      const viewPermission = permissions.find(item => item.key === "orders.view");
      const viewAllPermission = permissions.find(item => item.key === "orders.view_all");
      if (viewPermission) nextSelected.add(viewPermission.id);
      if (viewAllPermission) nextSelected.add(viewAllPermission.id);
    }
    return { ...current, selected: Array.from(nextSelected) };
  });
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
