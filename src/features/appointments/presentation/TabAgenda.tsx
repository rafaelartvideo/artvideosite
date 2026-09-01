import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  ListFilter,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  createAppointment,
  listCustomerServiceOrders,
  loadAgendaData,
  searchAppointmentCustomers as searchCustomers,
  updateAppointmentDate,
  updateServiceOrderSchedule,
} from "../infrastructure/appointments.repository";
import { fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import type {
  AppointmentPeriod,
  AppointmentSituation,
} from "@/lib/database.types";
import {
  buildAgendaDays,
  dayKey,
  eventDay,
  filterAgendaData,
  parseDay,
  type AppointmentWithRelations,
  type CalendarEvent,
} from "@/features/appointments/application/agenda-calendar";
import {
  BtnPrimary,
  BtnSecondary,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import {
  cn,
  formatCnpj,
  formatCpf,
  formatPhone,
} from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  AdminSelect,
  FInput,
  FSelect,
  FTextarea,
  INPUT,
} from "@/shared/ui/admin/AdminFormControls";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { AgendaEventCard } from "./AgendaEventCard";
import { AppointmentDetailsDialog } from "./AppointmentDetailsDialog";

export function TabAgenda({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { user, hasPermission } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
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
  const [selectedAppointmentTechnicians, setSelectedAppointmentTechnicians] = useState<string[]>([]);
  const [appointmentTechnicianSearch, setAppointmentTechnicianSearch] = useState("");
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const canViewAgenda = hasPermission("agenda.view") || hasPermission("orders.view");
  const canViewOtherAgendas = hasPermission("agenda.view_others") || hasPermission("agenda.view-other-users") || hasPermission("employees.view");
  const queryClient = useQueryClient();
  const agendaQuery = useQuery({
    queryKey: queryKeys.appointments.list({
      userId: user?.id ?? null,
      canViewOtherAgendas,
    }),
    queryFn: () => loadAgendaData({
      userId: user?.id ?? null,
      canViewOtherAgendas,
    }),
    enabled: canViewAgenda,
  });
  const loading = canViewAgenda && agendaQuery.isPending;
  const appointmentSituationsLoading = loading;
  const employees = agendaQuery.data?.employees ?? [];
  const services = agendaQuery.data?.services ?? [];
  const generalServices = agendaQuery.data?.generalServices ?? [];
  const situations = agendaQuery.data?.situations ?? [];
  const appointmentSituations = (agendaQuery.data?.appointmentSituations ?? []) as AppointmentSituation[];
  const appointmentTechnicians = employees as { id: string; full_name: string }[];
  const myEmployeeId = agendaQuery.data?.myEmployeeId ?? null;

  useEffect(() => {
    const data = agendaQuery.data;
    if (data) {
      setOrders(data.orders);
      setAppointments(data.appointments as AppointmentWithRelations[]);
    }
  }, [agendaQuery.data]);

  useEffect(() => {
    if (!agendaQuery.error) return;
    const message = agendaQuery.error instanceof Error ? agendaQuery.error.message : String(agendaQuery.error);
    setToast({ msg: `Erro ao carregar agenda: ${message}`, type: "error" });
  }, [agendaQuery.error]);
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

  const effectiveTechnicianFilter = !canViewOtherAgendas ? myEmployeeId || "" : technicianFilter;
  const { filteredOrders, calendarEvents } = filterAgendaData({
    orders,
    appointments,
    search,
    technicianFilter: effectiveTechnicianFilter,
    statusFilter,
    situationFilter,
    serviceFilter,
  });
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
  const days = (count: number) => buildAgendaDays(view, cursor, count);
  const eventsFor = (date: Date) => calendarEvents.filter(event => event.date === dayKey(date));
  const updateEventDate = async (event: CalendarEvent | any, targetDay: string) => {
    if (!event.kind) {
      const legacyEvent: CalendarEvent = { kind: "service_order", id: event.id, date: eventDay(event), order: event };
      return updateEventDate(legacyEvent, targetDay);
    }
    if (event.kind === "appointment") {
      try {
        await updateAppointmentDate(event.id, targetDay);
        setAppointments(current => current.map(item => item.id === event.id ? { ...item, appointment_date: targetDay } : item));
        setToast({ msg: "Agendamento atualizado.", type: "success" });
        await queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setToast({ msg: `Não foi possível mover o agendamento: ${message}`, type: "error" });
      }
      return;
    }
    const order = event.order;
    const oldDate = new Date(order.scheduled_at);
    const next = parseDay(targetDay);
    next.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    try {
      await updateServiceOrderSchedule(order.id, next.toISOString());
      setOrders(current => current.map(item => item.id === order.id ? { ...item, scheduled_at: next.toISOString() } : item));
      setToast({ msg: "Agendamento atualizado.", type: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Não foi possível mover a OS: ${message}`, type: "error" });
    }
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
      setAppointmentCustomers(await searchCustomers(term));
    } catch (error) {
      console.error("[ADMIN] appointment customer search error:", error);
      setAppointmentCustomers([]);
      setToast({ msg: `Erro ao buscar clientes: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally { setAppointmentCustomerSearchLoading(false); }
  };
  const selectAppointmentCustomer = async (customer: any) => {
    const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
    setAppointmentCustomer(customer); setChangingAppointmentCustomer(false); setAppointmentCustomers([]); setAppointmentCustomerSearch("");
    try {
      setAppointmentOrders(await listCustomerServiceOrders(customer.id));
    } catch (error) {
      setAppointmentOrders([]);
      setToast({ msg: `Erro ao carregar OS do cliente: ${supabaseErrorMessage(error)}`, type: "error" });
    }
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
      const data = await createAppointment(payload, selectedAppointmentTechnicians);
      setAppointments(current => [...current, { ...data, appointment_technicians: selectedAppointmentTechnicians.map(employee_id => ({ employee_id, employee: appointmentTechnicians.find(item => item.id === employee_id) || null })) } as AppointmentWithRelations]);
      setAppointmentModalOpen(false); setToast({ msg: "Agendamento criado.", type: "success" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
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
    <Dialog open={appointmentModalOpen} onOpenChange={(open) => { if (!open && !appointmentSubmodal) setAppointmentModalOpen(false); }}>
      <DialogContent showClose={false} className="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-[#0d1b2e]/10 bg-white p-0 shadow-2xl">
        <DialogTitle className="sr-only">Novo agendamento</DialogTitle>
        <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><h2 className="font-black text-[#0d1b2e]">Novo agendamento</h2><button type="button" aria-label="Fechar" onClick={() => setAppointmentModalOpen(false)} className="rounded-full p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {appointmentCustomer && !changingAppointmentCustomer ? <div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#0d1b2e]">{appointmentCustomer.customer_type === "PJ" ? (appointmentCustomer.trade_name || appointmentCustomer.legal_name || appointmentCustomer.full_name) : appointmentCustomer.full_name}</p><p className="text-xs font-semibold text-[#5a6a82]">{appointmentCustomer.customer_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</p><p className="mt-1 text-xs text-[#5a6a82]">{appointmentCustomer.customer_type === "PJ" ? `CNPJ: ${formatCnpj(appointmentCustomer.cnpj || "")}` : `CPF: ${formatCpf(appointmentCustomer.document || "")}`}</p>{(appointmentCustomer.whatsapp || appointmentCustomer.phone) && <p className="text-xs text-[#5a6a82]">{appointmentCustomer.whatsapp ? `WhatsApp: ${formatPhone(appointmentCustomer.whatsapp)}` : `Telefone: ${formatPhone(appointmentCustomer.phone)}`}</p>}{appointmentCustomer.email && <p className="text-xs text-[#5a6a82]">E-mail: {appointmentCustomer.email}</p>}</div><div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => { setChangingAppointmentCustomer(true); setAppointmentCustomerSearch(""); setAppointmentCustomers([]); }} className="text-xs font-bold text-[#0057e7] hover:underline">Trocar cliente</button><button type="button" onClick={() => { setAppointmentCustomer(null); setAppointmentOrders([]); setAppointmentCustomers([]); setAppointmentCustomerSearch(""); setAppointmentForm(current => ({ ...current, customer_id: "", service_order_id: "", address_source: null, customer_address_id: "", zip_code: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })); setChangingAppointmentCustomer(false); }} className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><X size={13} /> Remover</button></div></div></div> : <div className="relative"><FInput label="Cliente" required value={appointmentCustomerSearch} placeholder="Buscar por nome, CPF, CNPJ ou telefone" onChange={event => void searchAppointmentCustomers(event.target.value)} />{appointmentCustomer && <button type="button" onClick={() => { setChangingAppointmentCustomer(false); setAppointmentCustomerSearch(""); setAppointmentCustomers([]); }} className="mt-1 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7]">Cancelar troca</button>}{appointmentCustomerSearchLoading && <p className="mt-1 text-xs text-[#5a6a82]">Buscando clientes...</p>}{!appointmentCustomerSearchLoading && appointmentCustomerSearch.trim().length >= 2 && appointmentCustomers.length === 0 && <p className="mt-1 text-xs text-[#5a6a82]">Nenhum cliente encontrado.</p>}{appointmentCustomers.length > 0 && <div className="absolute left-0 right-0 top-[4.5rem] z-10 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-white shadow-lg">{appointmentCustomers.map(customer => <button type="button" key={customer.id} onClick={() => void selectAppointmentCustomer(customer)} className="block w-full border-b border-[#0d1b2e]/5 px-3 py-2 text-left hover:bg-[#eef5ff]"><p className="text-sm font-bold text-[#0d1b2e]">{customer.full_name || customer.trade_name}</p><p className="text-xs text-[#5a6a82]">{customer.customer_type === "PJ" ? formatCnpj(customer.cnpj || "") : formatCpf(customer.document || "")} · {formatPhone(customer.phone || customer.whatsapp)}</p></button>)}</div>}</div>}
          <FSelect label="OS relacionada (opcional)" disabled={!appointmentCustomer} value={appointmentForm.service_order_id} onChange={event => setAppointmentForm(current => ({ ...current, service_order_id: event.target.value }))} options={[{ value: "", label: appointmentCustomer ? "Nenhuma OS relacionada" : "Selecione um cliente primeiro" }, ...appointmentOrders.map(order => ({ value: order.id, label: `OS ${order.os_number || order.id.slice(0, 8)} — ${(order.service as any)?.title || (order.general_service as any)?.name || order.model || "Atendimento"}` }))]} />
          <div className="grid gap-3 sm:grid-cols-2"><FInput label="Data" required type="date" value={appointmentForm.appointment_date} onChange={event => setAppointmentForm(current => ({ ...current, appointment_date: event.target.value }))} /><FSelect label="Horário/Período" value={appointmentForm.period} onChange={event => setAppointmentForm(current => ({ ...current, period: event.target.value as AppointmentPeriod }))} options={[{ value: "no_time", label: "Sem horário" }, { value: "morning", label: "Manhã" }, { value: "afternoon", label: "Tarde" }, { value: "evening", label: "Noite" }, { value: "custom", label: "Horário personalizado" }]} />{appointmentForm.period === "custom" && <><FInput label="Hora inicial" required type="time" value={appointmentForm.start_time} onChange={event => setAppointmentForm(current => ({ ...current, start_time: event.target.value }))} /><FInput label="Hora final" required type="time" value={appointmentForm.end_time} onChange={event => setAppointmentForm(current => ({ ...current, end_time: event.target.value }))} /></>}</div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!appointmentCustomer} onClick={() => setAppointmentSubmodal("address")} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7] disabled:opacity-50">{appointmentForm.address_source ? "Editar endereço" : "Adicionar endereço"}</button>{appointmentForm.address_source && <span className="text-xs text-[#5a6a82]">{[appointmentForm.street, appointmentForm.number, appointmentForm.city, appointmentForm.state].filter(Boolean).join(", ")}</span>}</div>
          <div><div className="flex flex-wrap items-center gap-2">{selectedAppointmentTechnicians.map(id => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0057e7]">{appointmentTechnicians.find(item => item.id === id)?.full_name}<button type="button" onClick={() => setSelectedAppointmentTechnicians(current => current.filter(item => item !== id))} aria-label="Remover técnico"><X size={12} /></button></span>)}<button type="button" onClick={() => setAppointmentSubmodal("technicians")} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]"><UserPlus size={13} className="mr-1 inline" />Selecionar técnicos</button></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><FInput label="Setor/Local" placeholder="Ex.: Sala 5" value={appointmentForm.sector_location} onChange={event => setAppointmentForm(current => ({ ...current, sector_location: event.target.value }))} /><FSelect label="Situação" required disabled={appointmentSituationsLoading} value={appointmentForm.situation_id} onChange={event => setAppointmentForm(current => ({ ...current, situation_id: event.target.value }))} options={appointmentSituations.map(situation => ({ value: situation.id, label: situation.name }))} /></div>
          <FTextarea label="Descrição" placeholder="O que será feito neste atendimento..." value={appointmentForm.description} onChange={event => setAppointmentForm(current => ({ ...current, description: event.target.value }))} rows={4} /><label className="flex items-center gap-2 text-sm font-semibold text-[#0d1b2e]"><Checkbox checked={appointmentForm.is_return} onCheckedChange={checked => setAppointmentForm(current => ({ ...current, is_return: checked === true }))} /> É retorno</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-5 py-4"><BtnSecondary onClick={() => setAppointmentModalOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void saveAppointment()} disabled={appointmentSaving || appointmentSituationsLoading}>{appointmentSaving ? "Agendando..." : <><Check size={15} /> Agendar</>}</BtnPrimary></div>
        {appointmentSubmodal === "address" && <Dialog open onOpenChange={(open) => { if (!open) setAppointmentSubmodal(null); }}><DialogContent showClose={false} className="max-w-lg gap-0 rounded-xl bg-white p-5 shadow-2xl"><DialogTitle className="sr-only">Endereço do atendimento</DialogTitle><div className="mb-4 flex items-center justify-between"><h3 className="font-black text-[#0d1b2e]">Endereço do atendimento</h3><button type="button" aria-label="Fechar endereço" onClick={() => setAppointmentSubmodal(null)} className="rounded-full p-2 hover:bg-[#f5f7fa]"><X size={17} /></button></div><label className="mb-4 flex items-center gap-2 text-sm font-semibold"><Checkbox checked={appointmentForm.address_source === "customer"} onCheckedChange={checked => { if (checked === true && appointmentCustomer) { const address = (appointmentCustomer.addresses || []).find((item: Address) => item.is_default) || appointmentCustomer.addresses?.[0]; setAppointmentForm(current => ({ ...current, address_source: "customer", customer_address_id: address?.id || "", zip_code: address?.zip_code || "", street: address?.street || "", number: address?.number || "", complement: address?.complement || "", neighborhood: address?.neighborhood || "", city: address?.city || "", state: address?.state || "" })); } else setAppointmentForm(current => ({ ...current, address_source: "custom", customer_address_id: "" })); }} /> Usar endereço cadastrado do cliente</label><div className="grid gap-3 sm:grid-cols-2"><FInput label="CEP" value={appointmentForm.zip_code} onChange={event => setAppointmentForm(current => ({ ...current, zip_code: event.target.value }))} /><FInput label="Rua" value={appointmentForm.street} onChange={event => setAppointmentForm(current => ({ ...current, street: event.target.value }))} /><FInput label="Número" value={appointmentForm.number} onChange={event => setAppointmentForm(current => ({ ...current, number: event.target.value }))} /><FInput label="Complemento" value={appointmentForm.complement} onChange={event => setAppointmentForm(current => ({ ...current, complement: event.target.value }))} /><FInput label="Bairro" value={appointmentForm.neighborhood} onChange={event => setAppointmentForm(current => ({ ...current, neighborhood: event.target.value }))} /><FInput label="Cidade" value={appointmentForm.city} onChange={event => setAppointmentForm(current => ({ ...current, city: event.target.value }))} /><FInput label="Estado" value={appointmentForm.state} onChange={event => setAppointmentForm(current => ({ ...current, state: event.target.value }))} /></div><div className="mt-4 flex justify-end gap-2"><BtnSecondary onClick={() => setAppointmentSubmodal(null)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => setAppointmentSubmodal(null)}>Confirmar</BtnPrimary></div></DialogContent></Dialog>}
        {appointmentSubmodal === "technicians" && <Dialog open onOpenChange={(open) => { if (!open) setAppointmentSubmodal(null); }}><DialogContent showClose={false} className="max-w-lg gap-0 rounded-xl bg-white p-5 shadow-2xl"><DialogTitle className="sr-only">Selecionar técnicos</DialogTitle><div className="mb-4 flex items-center justify-between"><h3 className="font-black text-[#0d1b2e]">Selecionar Técnicos</h3><button type="button" aria-label="Fechar técnicos" onClick={() => setAppointmentSubmodal(null)} className="rounded-full p-2 hover:bg-[#f5f7fa]"><X size={17} /></button></div><FInput label="Buscar" value={appointmentTechnicianSearch} onChange={event => setAppointmentTechnicianSearch(event.target.value)} placeholder="Nome do técnico" /><div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{appointmentTechnicians.filter(employee => employee.full_name.toLowerCase().includes(appointmentTechnicianSearch.toLowerCase())).map(employee => <label key={employee.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-[#f8fafc]"><Checkbox checked={selectedAppointmentTechnicians.includes(employee.id)} onCheckedChange={() => setSelectedAppointmentTechnicians(current => current.includes(employee.id) ? current.filter(id => id !== employee.id) : [...current, employee.id])} />{employee.full_name}</label>)}</div><div className="mt-4 flex justify-end"><BtnPrimary onClick={() => setAppointmentSubmodal(null)}>Confirmar</BtnPrimary></div></DialogContent></Dialog>}
      </DialogContent>
    </Dialog>
  </div>;
  const agendaEvent = (event: CalendarEvent) => <AgendaEventCard key={`${event.kind}-${event.id}`} event={event} draggedEventId={draggedEventId} onDraggedEventChange={setDraggedEventId} onOpenOrder={onOpenOrder} onOpenAppointment={setSelectedAppointment} />;
  const renderDayCell = (date: Date, adjacent = false) => <div key={dayKey(date)} className={cn("flex h-[150px] min-h-0 flex-col border-r border-b border-[#0d1b2e]/8 p-1", adjacent && "bg-[#f8fafc]", dayKey(date) === dayKey(cursor) && "bg-[#eef5ff] ring-1 ring-inset ring-[#0057e7]")} onDragOver={event => event.preventDefault()} onDrop={event => { if (!adjacent) dropCalendarEvent(event.dataTransfer, dayKey(date)); }}><div className="shrink-0"><p className={cn("mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold", isToday(date) ? "bg-[#0057e7] text-white" : adjacent ? "text-[#94a3b8]" : "text-[#5a6a82]")}>{date.getDate()}</p></div><div className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">{adjacent ? null : eventsFor(date).map(agendaEvent)}</div></div>;
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const monthGrid = Array.from({ length: 42 }, (_, index) => { const date = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstDay + index); return date; });
  const newAgendaView = <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Agenda" actions={agendaToolbar} />
    {loading ? <LoadingState /> : view === "agenda" ? <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/8 bg-white shadow-sm">{calendarEvents.length === 0 ? <EmptyState icon={CalendarDays} title="Nenhum agendamento" message="As OS e agendamentos aparecerão aqui." /> : calendarEvents.map(event => <div key={`${event.kind}-${event.id}`} className="border-b border-[#0d1b2e]/5 p-3"><AgendaEventCard event={event} draggedEventId={draggedEventId} onDraggedEventChange={setDraggedEventId} onOpenOrder={onOpenOrder} onOpenAppointment={setSelectedAppointment} /></div>)}</div> : view === "day" ? <div className="min-h-[420px] rounded-xl border border-[#0d1b2e]/8 bg-white p-4" onDragOver={event => event.preventDefault()} onDrop={event => dropCalendarEvent(event.dataTransfer, dayKey(cursor))}>{eventsFor(cursor).map(agendaEvent)}</div> : view === "week" ? <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white"><div className="grid min-w-[720px] grid-cols-7">{days(7).map(date => <div key={dayKey(date)} className="min-h-[420px] border-r border-[#0d1b2e]/8 last:border-r-0" onDragOver={event => event.preventDefault()} onDrop={event => dropCalendarEvent(event.dataTransfer, dayKey(date))}><div className={cn("border-b border-[#0d1b2e]/8 p-2 text-center", isToday(date) && "bg-[#eef5ff]")}><p className="text-[10px] font-bold uppercase text-[#5a6a82]">{date.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-black", isToday(date) && "bg-[#0057e7] text-white")}>{date.getDate()}</p></div><div className="p-1">{eventsFor(date).map(agendaEvent)}</div></div>)}</div></div> : <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white"><div className="grid min-w-[720px] grid-cols-7 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <div key={day} className="py-2 text-center text-[10px] font-bold uppercase text-[#5a6a82]">{day}</div>)}</div><div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-b-xl">{monthGrid.map(date => renderDayCell(date, date.getMonth() !== cursor.getMonth()))}</div></div>}
  </div>;
  return <>
    {newAgendaView}
    <AppointmentDetailsDialog appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} onOpenOrder={onOpenOrder} />
  </>;
}

