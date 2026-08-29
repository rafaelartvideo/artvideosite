import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import {
  LayoutDashboard, Wrench, FolderTree, Package, Tag, FileText, ClipboardList,
  Users, Settings, Phone, LogOut, Search, Plus, Edit2, Trash2, CheckCircle,
  AlertCircle, Clock, RefreshCw, X, ArrowLeft, Menu, Upload, AlertTriangle,
  Star, Filter, DollarSign, List, HelpCircle, ChevronDown, MessageCircle,
  Mail, MapPin, Instagram, Globe, Hash, Activity, Shield, CalendarDays,
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

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { TabDashboard } from "@/features/dashboard/presentation/TabDashboard";
import { TabQuotes } from "@/features/quotes/presentation/TabQuotes";
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
import { TabAgenda } from "@/features/appointments/presentation/TabAgenda";
import { TabInventory } from "@/features/inventory/presentation/TabInventory";
import { TabCustomers } from "@/features/customers/presentation/TabCustomers";
import { TabEmployees } from "@/features/employees/presentation/TabEmployees";
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

/* ─────────────────────────── TAB: QUOTES ─────────────────────────── */

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
