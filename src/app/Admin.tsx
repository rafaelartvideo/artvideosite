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
