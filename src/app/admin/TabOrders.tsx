import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  QuickEquipmentModal,
  ServiceTypeModal,
} from "@/features/orders/presentation/OrderQuickCreateModals";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { OrdersTable } from "@/features/orders/presentation/OrdersTable";
import { OrdersKanban } from "@/features/orders/presentation/OrdersKanban";
import { OrdersHeader } from "@/features/orders/presentation/OrdersHeader";
import { OrdersFilters } from "@/features/orders/presentation/OrdersFilters";
import { OrderSolutionSummary } from "@/features/orders/presentation/OrderSolutionSummary";
import { OrderPartRequestsSection } from "@/features/orders/presentation/OrderPartRequestsSection";
import { InfoRow, OrderDetailsContent } from "@/features/orders/presentation/OrderDetailsContent";
import { OrderDetailsActions } from "@/features/orders/presentation/OrderDetailsActions";
import { OrderCustomerSection } from "@/features/orders/presentation/OrderCustomerSection";
import { OrderEquipmentSection } from "@/features/orders/presentation/OrderEquipmentSection";
import { OrderInformationSection } from "@/features/orders/presentation/OrderInformationSection";
import { OrderServiceLocationSection } from "@/features/orders/presentation/OrderServiceLocationSection";
import { OrderFormActions } from "@/features/orders/presentation/OrderFormActions";
import { OrderResolutionPage } from "@/features/orders/presentation/OrderResolutionPage";
import {
  EmployeeMultiSelect,
  getPriorityLabel,
  getResponsibleName,
  OrderAddressSelect,
  OrderFilterMultiSelect,
  PriorityBadge,
  type MultiSelectOption,
  type ServiceOrderWithRelations,
} from "@/features/orders/presentation/OrderFormControls";
import {
  saveOrderCustomerAddress,
  updateOrderCustomer,
} from "@/features/orders/infrastructure/orders-customer.repository";
import {
  PartRequestModal,
  ReviewPartRequestModal,
  TestDeliveryModal,
  TestResultModal,
} from "@/features/orders/presentation/PartRequestModals";
import type { PartRequestForReview } from "@/features/orders/domain/part-request.types";
import { validateOrderResolution } from "@/features/orders/application/order-resolution";
import {
  fmtReviewDate,
  purposeLabel,
} from "@/features/orders/application/part-request.formatters";
import {
  clearServiceOrderSellers,
  clearServiceOrderTechnicians,
  createServiceOrder,
  deleteServiceOrder,
  deleteServiceOrderMediaLink,
  getFullServiceOrder,
  getServiceOrderDetail,
  getServiceOrderResolutionState,
  insertServiceOrderMedia,
  insertServiceOrderSellers,
  insertServiceOrderTechnicians,
  listApprovedResolutionPartRequests,
  listOrderStatusOptions,
  listServiceOrderMedia,
  listServiceOrderMediaLinks,
  markServiceOrderSolvable,
  markServiceOrderUnsolvable,
  resolveServiceOrder,
  updateServiceOrder,
  updateServiceOrderMediaSortOrder,
  listServiceOrderStatusHistory,
  listServiceOrderUsedItems,
} from "@/features/orders/infrastructure/orders.repository";
import { listActivePartInventory } from "@/features/orders/infrastructure/orders-part-requests.repository";
import {
  OrderImageLightbox,
  OrderImagesField,
  uploadOrderImage,
} from "@/features/orders/presentation/OrderImages";
import { useOrderImages } from "@/features/orders/presentation/useOrderImages";
import { useOrderPartRequests } from "@/features/orders/presentation/useOrderPartRequests";
import { useOrdersWorkspace } from "@/features/orders/presentation/useOrdersWorkspace";
import { useOrderFilters } from "@/features/orders/presentation/useOrderFilters";
import { useOrderListMutations } from "@/features/orders/presentation/useOrderListMutations";
import { useOrderCustomerSelection } from "@/features/orders/presentation/useOrderCustomerSelection";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import {
  LayoutDashboard, ClipboardList, Edit2, Trash2, RefreshCw, Search, MessageCircle,
  Users, List, X, Plus, Clock, CheckCircle, Upload, AlertTriangle, ArrowLeft,
  ChevronLeft, ChevronRight, Phone, Star, DollarSign, HelpCircle, ChevronDown,
  AlertCircle, FileText, Camera, Eraser, ArrowUpDown, ArrowUpNarrowWide, ArrowDownWideNarrow, Check, PackagePlus,
} from "lucide-react";
import {
  cn, slugify, initialOrderStatus, getWhatsAppUrl, formatPhone,
  CustomerType, customerPayload, customerUpdatePayload,
  validateCustomerForm, formatCpf, formatCnpj,
  formatFoundationDate, foundationDateToIso, foundationDateFromCustomer, todayDateOnly,
  INPUT, FInput, FTextarea, FSelect, FToggle, CustomerTypeToggle,
  StatusBadge, LoadingState, EmptyState, BtnPrimary, BtnSecondary, Toast, ConfirmDialog,
  PageHeader, Section, AdminPage, PaginationBar, ImageUpload, ProductAdminThumb,
  AdminBackContext, InternalBackButton, supabaseErrorMessage, createMediaRecord, isHexColor,
  type AdminTab,
} from "./shared";
import { getGeneralServices } from "@/lib/queries";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/app/components/ui/dropdown-menu";

type OrderType = "internal" | "external";
type ServiceAddressSource = "customer" | "custom";
type IbgeState = { sigla: string; nome: string };
type IbgeCity = { nome: string };
const normalizeSearchDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeSearchIdentifier = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeAddressLookup = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const FALLBACK_STATES: IbgeState[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" }, { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" }, { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" }, { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" }, { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" }, { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" }, { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" }, { sigla: "TO", nome: "Tocantins" },
];

export function TabOrders({ onNavigate, initialOrderId, onFocused }: { onNavigate?: (tab: AdminTab) => void; initialOrderId?: string | null; onFocused?: () => void }) {
  const { user, profile, hasPermission } = useAuth();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [displayMode, setDisplayMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("os_view_mode") === "kanban" ? "kanban" : "list";
  });
  const {
    orders,
    setOrders,
    statuses,
    situations,
    serviceTypeSituations,
    profiles,
    services,
    brands,
    products,
    equipmentTypes,
    setEquipmentTypes,
    equipmentBrands,
    setEquipmentBrands,
    equipmentModels,
    setEquipmentModels,
    employees,
    serviceTypes,
    generalServices,
    loading,
    reloadWorkspace,
  } = useOrdersWorkspace({ showToast: setToast });
  const [detail, setDetail] = useState<any>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailUsedItems, setDetailUsedItems] = useState<any[]>([]);
  const [detailSolutionImages, setDetailSolutionImages] = useState<OrderImage[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [solveOpen, setSolveOpen] = useState(false);
  const [solveDraft, setSolveDraft] = useState({ diagnosis: "", solution: "", usedItems: [], cannotSolve: false, cannotSolveReason: "" } as { diagnosis: string; solution: string; usedItems: any[]; cannotSolve: boolean; cannotSolveReason: string });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [serviceUseCustomerAddress, setServiceUseCustomerAddress] = useState(false);
  const [serviceCustomerAddressOverride, setServiceCustomerAddressOverride] = useState(false);
  const [serviceAddressMessage, setServiceAddressMessage] = useState("");
  const [ibgeStates, setIbgeStates] = useState<IbgeState[]>([]);
  const [ibgeStatesLoading, setIbgeStatesLoading] = useState(false);
  const [ibgeCities, setIbgeCities] = useState<IbgeCity[]>([]);
  const [ibgeCitiesLoading, setIbgeCitiesLoading] = useState(false);
  const citiesCacheRef = useRef<Record<string, IbgeCity[]>>({});
  const citiesRequestRef = useRef(0);
  const zipRequestRef = useRef(0);
  const [quickEquipment, setQuickEquipment] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(false);

  const emptyForm = { service_id: "", general_service_id: "", service_type_id: "", seller_id: "", estimated_price: "", status_id: "", situation_id: "", customer_id: "", technician_id: "", brand_id: "", product_id: "", model: "", equipment_type_id: "", equipment_brand_id: "", equipment_model_id: "", serial_number: "", accessories: "", equipment_condition: "", priority: "normal", scheduled_at: "", started_at: "", completed_at: "", internal_notes: "", customer_notes: "", order_type: "internal" as OrderType, service_state: "", service_city: "", service_street: "", service_zip_code: "", service_neighborhood: "", service_number: "", service_complement: "", service_customer_address_id: "", external_os_number: "" };
  const [form, setForm] = useState(emptyForm);
  const [needsScheduling, setNeedsScheduling] = useState(true);
  const {
    orderImages,
    solutionImages,
    viewImage,
    setViewImage,
    loadOrderImages,
    replaceOrderImages,
    clearOrderImages,
    addOrderImages,
    removeOrderImage,
    replaceSolutionImages,
    addSolutionImages,
    removeSolutionImage,
  } = useOrderImages();
  const upF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const {
    customerSearch,
    customerResults,
    selectedCustomer,
    setSelectedCustomer,
    editingCustomer,
    setEditingCustomer,
    customerDraft,
    setCustomerDraft,
    customerAddressDraft,
    setCustomerAddressDraft,
    addressExpanded,
    setAddressExpanded,
    searchCustomers,
    selectCustomer,
    hydrateCustomer,
    clearCustomer,
  } = useOrderCustomerSelection({
    onCustomerSelected: (customer, address) => {
      upF("customer_id", customer.id);
      if (form.order_type !== "external" || !serviceUseCustomerAddress) return;
      if (address) {
        setServiceAddressMessage("");
        setServiceCustomerAddressOverride(true);
        copyCustomerAddressToForm(address);
      } else {
        setServiceUseCustomerAddress(false);
        setServiceAddressMessage(
          "Este cliente não possui endereço cadastrado. Preencha o local do atendimento.",
        );
        clearServiceAddress();
      }
    },
  });

  const selectedServiceAddress = ((selectedCustomer?.addresses || []) as Address[]).find(address => address.is_default) || ((selectedCustomer?.addresses || []) as Address[])[0] || null;
  const serviceAddressPreview: Address | null = serviceUseCustomerAddress
    ? (serviceCustomerAddressOverride ? selectedServiceAddress : { id: form.service_customer_address_id || undefined, zip_code: form.service_zip_code, state: form.service_state, city: form.service_city, neighborhood: form.service_neighborhood, street: form.service_street, number: form.service_number, complement: form.service_complement })
    : null;
  const clearServiceAddress = () => {
    upF("service_zip_code", ""); upF("service_state", ""); upF("service_city", ""); upF("service_neighborhood", "");
    upF("service_street", ""); upF("service_number", ""); upF("service_complement", "");
  };
  const copyCustomerAddressToForm = (address: Address | null) => {
    upF("service_zip_code", address?.zip_code || ""); upF("service_state", address?.state || ""); upF("service_city", address?.city || "");
    upF("service_neighborhood", address?.neighborhood || ""); upF("service_street", address?.street || ""); upF("service_number", address?.number || ""); upF("service_complement", address?.complement || "");
    if (address?.state) void loadIbgeCities(address.state, address.city);
  };
  const loadIbgeCities = async (state: string, preferredCity?: string) => {
    const uf = state.trim().toUpperCase();
    if (!uf) { setIbgeCities([]); return []; }
    const requestId = ++citiesRequestRef.current;
    const cached = citiesCacheRef.current[uf];
    if (cached) {
      setIbgeCities(cached);
      if (preferredCity) {
        const officialCity = cached.find(city => normalizeAddressLookup(city.nome) === normalizeAddressLookup(preferredCity));
        if (officialCity) upF("service_city", officialCity.nome);
      }
      return cached;
    }
    setIbgeCitiesLoading(true);
    try {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
      if (!response.ok) throw new Error("Falha ao carregar cidades.");
      const cities = await response.json() as IbgeCity[];
      if (requestId !== citiesRequestRef.current) return [];
      citiesCacheRef.current[uf] = cities;
      setIbgeCities(cities);
      if (preferredCity) {
        const officialCity = cities.find(city => normalizeAddressLookup(city.nome) === normalizeAddressLookup(preferredCity));
        if (officialCity) upF("service_city", officialCity.nome);
      }
      return cities;
    } catch {
      if (requestId === citiesRequestRef.current) setIbgeCities([]);
      return [];
    } finally {
      if (requestId === citiesRequestRef.current) setIbgeCitiesLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setIbgeStatesLoading(true);
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome")
      .then(response => response.ok ? response.json() as Promise<IbgeState[]> : Promise.reject(new Error("Falha ao carregar estados.")))
      .then(states => { if (active) setIbgeStates(states); })
      .catch(() => { if (active) setIbgeStates(FALLBACK_STATES); })
      .finally(() => { if (active) setIbgeStatesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (form.order_type !== "external" || serviceUseCustomerAddress || normalizeSearchDigits(form.service_zip_code).length !== 8) return;
    const requestId = ++zipRequestRef.current;
    setServiceAddressMessage("");
    const zipCode = formatZipCode(form.service_zip_code);
    setIbgeCitiesLoading(true);
    fetchAddressByZipCode(zipCode)
      .then(async address => {
        if (requestId !== zipRequestRef.current) return;
        if (!address) { setServiceAddressMessage("CEP não encontrado. Verifique ou preencha o endereço manualmente."); return; }
        upF("service_state", address.state || "");
        upF("service_neighborhood", address.neighborhood || "");
        upF("service_street", address.street || "");
        const cities = await loadIbgeCities(address.state || "", address.city || "");
        if (requestId !== zipRequestRef.current) return;
        if (!cities.some(city => normalizeAddressLookup(city.nome) === normalizeAddressLookup(address.city))) upF("service_city", address.city || "");
        setServiceAddressMessage("");
      })
      .catch(() => { if (requestId === zipRequestRef.current) setServiceAddressMessage("Não foi possível consultar o CEP agora. Preencha o endereço manualmente."); })
      .finally(() => { if (requestId === zipRequestRef.current) setIbgeCitiesLoading(false); });
    return () => { zipRequestRef.current += 1; };
  }, [form.order_type, form.service_zip_code, serviceUseCustomerAddress]);

  const loadInventoryItems = async () => {
    const { data, error } = await listActivePartInventory();
    if (!error) setInventoryItems(data || []);
  };

  const {
    detailPartRequests,
    selectedPartRequest,
    partApprovalOpen,
    partRejectionOpen,
    approvalQuantities,
    partReviewNotes,
    setPartReviewNotes,
    partReviewSubmitting,
    partRequestOpen,
    partRequestInventory,
    partRequestInventoryLoading,
    partRequestSearch,
    setPartRequestSearch,
    selectedPartRequestItems,
    partRequestNotes,
    setPartRequestNotes,
    partRequestSubmitting,
    partRequestInventoryError,
    partRequestPurpose,
    setPartRequestPurpose,
    selectedDeliveryRequest,
    deliveryOpen,
    deliverySubmitting,
    selectedTestRequest,
    testResultOpen,
    testResultRows,
    setTestResultRows,
    testResultSubmitting,
    loadPartRequests,
    openPartRequestModal,
    closePartRequestModal,
    selectPartRequestItem,
    updatePartRequestQuantity,
    removePartRequestItem,
    openPartApproval,
    openPartRejection,
    closePartReview,
    updateApprovalQuantity,
    approvePartRequest,
    rejectPartRequest,
    openDeliveryRequest,
    closeDeliveryRequest,
    deliverTestRequest,
    openTestResult,
    closeTestResult,
    submitTestResults,
    getTestCommittedQuantity,
    getTestPendingQuantity,
  } = useOrderPartRequests({
    orderId: detail?.id,
    reloadOrders: reloadWorkspace,
    showToast: setToast,
    formatError: supabaseErrorMessage,
  });

  const {
    draggingId,
    dragOverStatusId,
    setDragOverStatusId,
    updateOrderStatus,
    updateOrderSituation,
    handleKanbanDrop,
    handleCardDragStart,
    handleCardDragEnd,
    shouldSuppressCardOpen,
    handleDragLeave,
  } = useOrderListMutations({
    orders,
    setOrders,
    statuses,
    situations,
    detail,
    setDetail,
    userId: user?.id,
    hasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
  });

  useEffect(() => {
    if (!initialOrderId || loading) return;
    const order = orders.find(item => item.id === initialOrderId);
    if (order) openDetail(order);
    onFocused?.();
  }, [initialOrderId, loading, orders]);


  const openDetail = async (o: any) => {
    const [{ data: currentOrder }, { data: hist }, { data: mediaLinks }, { data: usedItems }] = await Promise.all([
      getServiceOrderDetail(o.id),
      listServiceOrderStatusHistory(o.id),
      listServiceOrderMedia(o.id),
      listServiceOrderUsedItems(o.id),
    ]);
    const orderImagesList = (mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" }));
    const solutionImagesList = (mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" }));
    setDetailHistory(hist || []);
    setDetailUsedItems(usedItems || []);
    await loadPartRequests(o.id);
    setDetailSolutionImages(solutionImagesList);
    replaceOrderImages(orderImagesList);
    setDetail({ ...o, ...(currentOrder || {}) });
  };

  const openNew = () => {
    setSelectedTechnicianIds([]); setSelectedSellerIds([]); setEditingOS(null); setForm(emptyForm); setServiceUseCustomerAddress(false); setServiceCustomerAddressOverride(false); setServiceAddressMessage(""); setIbgeCities([]); setNeedsScheduling(true); clearOrderImages(); setViewImage(null); clearCustomer(); setFormOpen(true);
  };

  const openEdit = async (o: any) => {
    const { data: currentOrder, error: currentOrderError } = await getServiceOrderResolutionState(o.id);
    if (currentOrderError) {
      setToast({ msg: `Não foi possível verificar o estado da OS: ${supabaseErrorMessage(currentOrderError)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || o.is_solved) {
      setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" });
      return;
    }
    setEditingOS(o);
    setSelectedTechnicianIds(Array.from(new Set((o.technician_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(o.technician_id ? [o.technician_id] : []))));
    setSelectedSellerIds(Array.from(new Set((o.seller_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(o.seller_id ? [o.seller_id] : []))));
    setNeedsScheduling(true);
    await loadOrderImages(o.id);
    setForm({ ...emptyForm, service_id: o.service_id || "", general_service_id: o.general_service_id || "", service_type_id: o.service_type_id || "", seller_id: o.seller_id || "", estimated_price: o.estimated_price == null ? "" : String(o.estimated_price), status_id: o.status_id || "", situation_id: o.situation_id || "", customer_id: o.customer_id || "", technician_id: o.technician_id || "", brand_id: o.brand_id || "", product_id: o.product_id || "", model: o.model || "", equipment_type_id: o.equipment_type_id || "", equipment_brand_id: o.equipment_brand_id || "", equipment_model_id: o.equipment_model_id || "", serial_number: o.serial_number || "", accessories: o.accessories || "", equipment_condition: o.equipment_condition || "", priority: o.priority || "normal", scheduled_at: o.scheduled_at ? o.scheduled_at.slice(0, 16) : "", started_at: o.started_at ? o.started_at.slice(0, 16) : "", completed_at: o.completed_at ? o.completed_at.slice(0, 16) : "", internal_notes: o.internal_notes || "", customer_notes: o.customer_notes || "", order_type: o.order_type === "external" ? "external" : "internal", service_state: o.order_type === "external" ? o.service_state || "" : "", service_city: o.order_type === "external" ? o.service_city || "" : "", service_street: o.order_type === "external" ? o.service_street || "" : "", service_zip_code: o.order_type === "external" ? o.service_zip_code || "" : "", service_neighborhood: o.order_type === "external" ? o.service_neighborhood || "" : "", service_number: o.order_type === "external" ? o.service_number || "" : "", service_complement: o.order_type === "external" ? o.service_complement || "" : "", service_customer_address_id: o.order_type === "external" ? o.service_customer_address_id || "" : "", external_os_number: o.external_os_number || "" });
    setServiceUseCustomerAddress(o.order_type === "external" && o.service_address_source === "customer"); setServiceCustomerAddressOverride(false); setServiceAddressMessage(""); setIbgeCities([]);
    if (o.order_type === "external" && o.service_state) void loadIbgeCities(o.service_state, o.service_city);
    hydrateCustomer((o.customer as any) || null);
    setFormOpen(true);
  };

  const saveCustomer = async () => {
    if (!hasPermission("customers.edit")) return;
    if (!selectedCustomer?.id) return;
    const validationError = validateCustomerForm(customerDraft);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSaving(true);
    const { error: customerError } = await updateOrderCustomer(selectedCustomer.id, customerUpdatePayload(customerDraft));
    if (customerError) { console.error("[ADMIN] customer update error:", customerError); setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
    const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
    const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
    const addressResult = await saveOrderCustomerAddress(address?.id || null, addressPayload);
    setSaving(false);
    if (addressResult.error) { console.error("[ADMIN] customer address update error:", addressResult.error); setToast({ msg: `Cliente salvo, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); return; }
    setSelectedCustomer({ ...selectedCustomer, ...customerUpdatePayload(customerDraft), addresses: [customerAddressDraft] });
    setEditingCustomer(false);
    setAddressExpanded(true);
    setToast({ msg: "Dados do cliente atualizados.", type: "success" });
  };

  const saveOrderSolution = async (orderId: string) => {
    if (!hasPermission("orders.solve")) {
      setToast({ msg: "Você não possui permissão para resolver ordens de serviço.", type: "error" });
      return;
    }

    if (detail?.cannot_be_solved && !solveDraft.cannotSolve) {
      setSaving(true);
      try {
        const { error } = await markServiceOrderSolvable(orderId);
        if (error) throw error;
        setDetail({ ...detail, cannot_be_solved: false, cannot_be_solved_reason: null });
        setOrders(current => current.map(order => order.id === orderId ? { ...order, cannot_be_solved: false, cannot_be_solved_reason: null } : order));
        setSolveOpen(false);
        setToast({ msg: "Estado não solucionável removido. A OS continua pendente de resolução.", type: "success" });
      } catch (error) {
        setToast({ msg: `Não foi possível remover o estado não solucionável: ${supabaseErrorMessage(error)}`, type: "error" });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (solveDraft.cannotSolve) {
      const reason = solveDraft.cannotSolveReason.trim();
      if (!reason) {
        setToast({ msg: "Informe a justificativa para esta OS não solucionável.", type: "error" });
        return;
      }
      setSaving(true);
      try {
        const { error } = await markServiceOrderUnsolvable(orderId, reason);
        if (error) throw error;
        const nextDetail = { ...detail, cannot_be_solved: true, cannot_be_solved_reason: reason };
        setDetail(nextDetail);
        setOrders(current => current.map(order => order.id === orderId ? { ...order, cannot_be_solved: true, cannot_be_solved_reason: reason } : order));
        setSolveOpen(false);
        setToast({ msg: "OS marcada como não solucionável.", type: "success" });
      } catch (error) {
        setToast({ msg: `Não foi possível salvar a justificativa: ${supabaseErrorMessage(error)}`, type: "error" });
      } finally {
        setSaving(false);
      }
      return;
    }

    const diagnosis = solveDraft.diagnosis.trim();
    const solution = solveDraft.solution.trim();
    if (!diagnosis) {
      setToast({ msg: "Informe o diagnóstico antes de concluir a solução.", type: "error" });
      return;
    }
    if (!solution) {
      setToast({ msg: "Informe a solução antes de concluir a OS.", type: "error" });
      return;
    }

    const hasUndestinedTestParts = detailPartRequests.some((request: PartRequestForReview) => (request.purpose || "RESOLUTION") === "TEST" && request.items.some(item => {
      const delivered = Number(item.delivered_quantity ?? 0);
      const returned = Number(item.returned_quantity ?? 0);
      const damaged = Number(item.damaged_quantity ?? 0);
      return delivered - returned - damaged > 0 && getTestPendingQuantity(request, item) > 0;
    }));
    if (hasUndestinedTestParts) {
      setToast({ msg: "Existem peças de teste aguardando devolução, dano ou solicitação para resolução.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const { error: resolveError } = await resolveServiceOrder({
        serviceOrderId: orderId,
        diagnosis,
        solution,
        usedItems: solveDraft.usedItems.map(item => ({ inventory_item_id: item.inventory_item_id, quantity: Number(item.quantity) })),
      });
      if (resolveError) throw resolveError;

      let solutionImageError: unknown = null;
      try {
        for (const [sortOrder, image] of solutionImages.entries()) {
          if (image.file) {
            const mediaId = await uploadOrderImage(image.file);
            const { error: insertError } = await insertServiceOrderMedia(orderId, mediaId, sortOrder + 1000);
            if (insertError) throw insertError;
          }
        }
      } catch (error) {
        solutionImageError = error;
      }

      const freshDetail = await getFullServiceOrder(orderId);
      if (freshDetail.data) setDetail(freshDetail.data);
      const { data: usedData } = await listServiceOrderUsedItems(orderId);
      const { data: mediaLinks } = await listServiceOrderMedia(orderId);
      setDetailUsedItems(usedData || []);
      replaceOrderImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" })));
      setDetailSolutionImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" })));
      setSolveOpen(false);
      setToast({ msg: solutionImageError ? `OS resolvida, mas não foi possível salvar todas as imagens da solução: ${supabaseErrorMessage(solutionImageError)}` : "OS resolvida com sucesso.", type: solutionImageError ? "error" : "success" });
      await reloadWorkspace();
    } catch (error) {
      setToast({ msg: `Não foi possível concluir a solução da OS: ${supabaseErrorMessage(error)}. Nenhuma alteração de estoque foi aplicada.`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveOS = async () => {
    if (editingOS ? !hasPermission("orders.edit") : !hasPermission("orders.create")) { setToast({ msg: "Você não possui permissão para esta ação na OS.", type: "error" }); return; }
    if (!editingOS && !user?.id) { setToast({ msg: "Não foi possível identificar o responsável pela OS.", type: "error" }); return; }
    if (editingOS?.is_solved) { setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" }); return; }
    if (!form.general_service_id && !form.service_id) { setToast({ msg: "Selecione o serviço geral da OS.", type: "error" }); return; }
    if (!editingOS && !form.service_type_id) { setToast({ msg: "Selecione o tipo de atendimento da OS.", type: "error" }); return; }
    const cid = selectedCustomer?.id || form.customer_id;
    if (!cid) { setToast({ msg: "Selecione um cliente.", type: "error" }); return; }
    const historicalCustomerAddress: Address = { id: form.service_customer_address_id || undefined, zip_code: form.service_zip_code, state: form.service_state, city: form.service_city, neighborhood: form.service_neighborhood, street: form.service_street, number: form.service_number, complement: form.service_complement };
    const selectedAddress = serviceUseCustomerAddress ? (serviceCustomerAddressOverride ? selectedServiceAddress : historicalCustomerAddress) : null;
    const serviceAddress = selectedAddress || {
      id: undefined,
      zip_code: form.service_zip_code,
      state: form.service_state,
      city: form.service_city,
      neighborhood: form.service_neighborhood,
      street: form.service_street,
      number: form.service_number,
      complement: form.service_complement,
    };
    const serviceZipCode = String(serviceAddress.zip_code ?? "").trim();
    const serviceState = String(serviceAddress.state ?? "").trim();
    const serviceCity = String(serviceAddress.city ?? "").trim();
    const serviceNeighborhood = String(serviceAddress.neighborhood ?? "").trim();
    const serviceStreet = String(serviceAddress.street ?? "").trim();
    const serviceNumber = String(serviceAddress.number ?? "").trim();
    const serviceComplement = String(serviceAddress.complement ?? "").trim();
    if (form.order_type === "external" && serviceUseCustomerAddress && !selectedAddress) { setToast({ msg: "Selecione um endereço cadastrado ou informe um endereço personalizado.", type: "error" }); return; }
    if (form.order_type === "external" && (!serviceZipCode || !serviceState || !serviceCity || !serviceStreet || !serviceNumber)) { setToast({ msg: "Informe CEP, estado, cidade, rua e número para uma OS externa.", type: "error" }); return; }
    if (needsScheduling && !form.scheduled_at) { setToast({ msg: "Informe a data e hora agendadas ou selecione Não.", type: "error" }); return; }
    if (form.equipment_brand_id && !equipmentBrands.some(brand => brand.id === form.equipment_brand_id && brand.equipment_type_id === form.equipment_type_id)) { setToast({ msg: "A marca selecionada não pertence ao equipamento.", type: "error" }); return; }
    if (form.equipment_model_id && !equipmentModels.some(model => model.id === form.equipment_model_id && model.equipment_brand_id === form.equipment_brand_id)) { setToast({ msg: "O modelo selecionado não pertence à marca.", type: "error" }); return; }
    const { data: availableStatuses, error: statusError } = await listOrderStatusOptions();
    const status = editingOS ? (availableStatuses || []).find(item => item.id === form.status_id) : initialOrderStatus(availableStatuses || []);
    if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status válido para a OS.", type: "error" }); return; }
    setSaving(true);
    if (editingCustomer && selectedCustomer?.id) {
      const validationError = validateCustomerForm(customerDraft);
      if (validationError) { setToast({ msg: validationError, type: "error" }); setSaving(false); return; }
      const { error: customerError } = await updateOrderCustomer(selectedCustomer.id, customerUpdatePayload(customerDraft));
      if (customerError) { setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
      const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
      const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
      const addressResult = await saveOrderCustomerAddress(address?.id || null, addressPayload);
      if (addressResult.error) { setToast({ msg: `Cliente atualizado, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); setSaving(false); return; }
      setSelectedCustomer({ ...selectedCustomer, ...customerUpdatePayload(customerDraft), addresses: [customerAddressDraft] });
      setEditingCustomer(false);
    }
    const payload = { service_id: editingOS ? form.service_id || null : null, general_service_id: form.general_service_id || null, service_type_id: form.service_type_id || null, seller_id: selectedSellerIds[0] || null, estimated_price: form.estimated_price ? Number(form.estimated_price) : null, status_id: status.id, situation_id: form.situation_id || null, customer_id: cid, ...(editingOS ? {} : { assigned_to: user?.id }), technician_id: selectedTechnicianIds[0] || null, equipment_type_id: form.equipment_type_id || null, equipment_brand_id: form.equipment_brand_id || null, equipment_model_id: form.equipment_model_id || null, brand_id: form.brand_id || null, product_id: form.product_id || null, model: form.model || null, ...(editingOS ? {} : { serial_number: form.serial_number || null, external_os_number: form.external_os_number.trim() || null }), accessories: form.accessories || null, equipment_condition: form.equipment_condition || null, priority: form.priority || "normal", scheduled_at: needsScheduling ? form.scheduled_at || null : null, started_at: form.started_at || null, completed_at: form.completed_at || null, internal_notes: form.internal_notes || null, customer_notes: form.customer_notes || null, order_type: form.order_type, service_zip_code: form.order_type === "external" ? serviceZipCode : null, service_state: form.order_type === "external" ? serviceState : null, service_city: form.order_type === "external" ? serviceCity : null, service_neighborhood: form.order_type === "external" ? serviceNeighborhood : null, service_street: form.order_type === "external" ? serviceStreet : null, service_number: form.order_type === "external" ? serviceNumber : null, service_complement: form.order_type === "external" ? serviceComplement : null, service_address_source: form.order_type === "external" ? (serviceUseCustomerAddress ? "customer" : "custom") : null, service_customer_address_id: form.order_type === "external" && serviceUseCustomerAddress ? selectedAddress?.id || null : null };
    let error;
    let savedOrderId = editingOS?.id as string | undefined;
    if (editingOS) {
      const r = await updateServiceOrder(editingOS.id, payload);
      error = r.error;
    } else {
      const r = await createServiceOrder(payload);
      error = r.error;
      savedOrderId = r.data?.id;
    }
    if (error) { setSaving(false); setToast({ msg: `Erro ao salvar OS: ${error.message}`, type: "error" }); return; }
    const uniqueTechnicianIds = Array.from(new Set(selectedTechnicianIds));
    const uniqueSellerIds = Array.from(new Set(selectedSellerIds));
    const previousTechnicianIds = Array.from(new Set((editingOS?.technician_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOS?.technician_id ? [editingOS.technician_id] : [])));
    const previousSellerIds = Array.from(new Set((editingOS?.seller_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOS?.seller_id ? [editingOS.seller_id] : [])));
    try {
      if (editingOS) {
        const { error: deleteTechniciansError } = await clearServiceOrderTechnicians(savedOrderId);
        if (deleteTechniciansError) throw deleteTechniciansError;
        const { error: deleteSellersError } = await clearServiceOrderSellers(savedOrderId);
        if (deleteSellersError) throw deleteSellersError;
      }
      if (uniqueTechnicianIds.length) {
        const { error: technicianError } = await insertServiceOrderTechnicians(savedOrderId, uniqueTechnicianIds);
        if (technicianError) throw technicianError;
      }
      if (uniqueSellerIds.length) {
        const { error: sellerError } = await insertServiceOrderSellers(savedOrderId, uniqueSellerIds);
        if (sellerError) throw sellerError;
      }
    } catch (relationError) {
      if (editingOS) {
        await clearServiceOrderTechnicians(savedOrderId);
        await clearServiceOrderSellers(savedOrderId);
        if (previousTechnicianIds.length) await insertServiceOrderTechnicians(savedOrderId, previousTechnicianIds);
        if (previousSellerIds.length) await insertServiceOrderSellers(savedOrderId, previousSellerIds);
      }
      setSaving(false);
      setToast({ msg: `OS salva, mas não foi possível atualizar técnicos/vendedores: ${supabaseErrorMessage(relationError)}`, type: "error" });
      return;
    }
    try {
      if (!savedOrderId) throw new Error("A OS foi salva, mas não foi possível obter seu ID.");
      const { data: existingLinks, error: linksError } = await listServiceOrderMediaLinks(savedOrderId);
      if (linksError) throw linksError;
      const retainedMediaIds = new Set(orderImages.filter(image => image.mediaId).map(image => image.mediaId));
      for (const link of existingLinks || []) {
        if (!retainedMediaIds.has(link.media_id)) {
          const { error: removeError } = await deleteServiceOrderMediaLink(link.id);
          if (removeError) throw removeError;
        }
      }
      for (const [sortOrder, image] of orderImages.entries()) {
        if (image.mediaId) {
          const link = (existingLinks || []).find((item: any) => item.media_id === image.mediaId);
          if (link) {
            const { error: updateError } = await updateServiceOrderMediaSortOrder(link.id, sortOrder);
            if (updateError) throw updateError;
          }
        } else if (image.file) {
          const mediaId = await uploadOrderImage(image.file);
          const { error: insertError } = await insertServiceOrderMedia(savedOrderId, mediaId, sortOrder);
          if (insertError) throw insertError;
        }
      }
    } catch (imageError) {
      setSaving(false);
      setToast({ msg: `OS salva, mas houve erro nas imagens: ${supabaseErrorMessage(imageError)}`, type: "error" });
      return;
    }
    setSaving(false);
    setToast({ msg: `OS ${editingOS ? "atualizada" : "criada"} com sucesso!`, type: "success" });
    setFormOpen(false); setDetail(null); upF("external_os_number", ""); reloadWorkspace();
  };

  const closeOrderForm = () => { setFormOpen(false); upF("external_os_number", ""); };

  const openSolveOrder = async (order: any) => {
    if (!hasPermission("orders.solve")) {
      setToast({ msg: "Você não possui permissão para resolver a OS.", type: "error" });
      return;
    }
    const { data: currentOrder, error: currentOrderError } = await getServiceOrderResolutionState(order.id);
    if (currentOrderError) {
      setToast({ msg: `Não foi possível verificar o estado da OS: ${supabaseErrorMessage(currentOrderError)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || order.is_solved) {
      setToast({ msg: "Esta OS já foi solucionada e não pode ser solucionada novamente.", type: "error" });
      return;
    }
    if (currentOrder?.cannot_be_solved || order.cannot_be_solved) {
      setToast({ msg: "Esta OS está marcada como não solucionável e não pode ser resolvida novamente.", type: "error" });
      return;
    }
    const hasUndestinedTestParts = detailPartRequests.some((request: PartRequestForReview) =>
      (request.purpose || "RESOLUTION") === "TEST" &&
      request.items.some(item => getTestPendingQuantity(request, item) > 0)
    );
    if (hasUndestinedTestParts) {
      setToast({ msg: "Existem peças de teste aguardando devolução, dano ou solicitação para resolução.", type: "error" });
      return;
    }
    const [{ data: approvedRequests, error: approvedRequestsError }, { data: mediaLinks }] = await Promise.all([
      listApprovedResolutionPartRequests(order.id),
      listServiceOrderMedia(order.id),
    ]);
    if (approvedRequestsError) { setToast({ msg: `Não foi possível carregar as peças aprovadas: ${supabaseErrorMessage(approvedRequestsError)}`, type: "error" }); return; }
    const approvedByInventory = new Map<string, any>();
    (approvedRequests || []).flatMap((request: any) => request.items || []).forEach((item: any) => {
      const quantity = Number(item.approved_quantity);
      if (!item.inventory_item_id || !Number.isFinite(quantity) || quantity <= 0) return;
      const current = approvedByInventory.get(item.inventory_item_id);
      approvedByInventory.set(item.inventory_item_id, {
        ...item,
        approved_quantity: Number(current?.approved_quantity || 0) + quantity,
        prewithdrawn_quantity: Number(current?.prewithdrawn_quantity || 0) + (item.source_test_item_id ? quantity : 0),
      });
    });
    const approvedItems = Array.from(approvedByInventory.values());
    setInventoryItems(approvedItems.map((item: any) => item.inventory_item).filter(Boolean));
    replaceOrderImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" })));
    replaceSolutionImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" })));
    setSolveDraft({
      diagnosis: currentOrder?.diagnosis || order.diagnosis || "",
      solution: currentOrder?.solution || order.solution || "",
      usedItems: approvedItems.map((item: any) => ({ id: item.id, inventory_item_id: item.inventory_item_id, name: item.inventory_item?.name || "", unit: item.inventory_item?.unit || "un", quantity: Number(item.approved_quantity), approved_quantity: Number(item.approved_quantity), prewithdrawn_quantity: Number(item.prewithdrawn_quantity || 0) })),
      cannotSolve: currentOrder?.cannot_be_solved ?? order.cannot_be_solved ?? false,
      cannotSolveReason: currentOrder?.cannot_be_solved_reason || order.cannot_be_solved_reason || "",
    });
    setSolveOpen(true);
  };

  const handleDeleteOrder = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    const { error } = await deleteServiceOrder(id);
    if (error) {
      setToast({ msg: `Não foi possível excluir a OS: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "OS excluída.", type: "success" });
    setDeleteId(null);
    setDetail(null);
    await reloadWorkspace();
  };

  const setViewMode = (mode: "list" | "kanban") => {
    setDisplayMode(mode);
    window.localStorage.setItem("os_view_mode", mode);
  };

  const fmtDate = (d?: string | null, time = false) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
  };

  const equipmentSummary = (o: any) => {
    const type = (o.equipment_type as any)?.name;
    const brand = (o.equipment_brand as any)?.name;
    const model = (o.equipment_model as any)?.name || o.model;
    const pieces = [type, [brand, model].filter(Boolean).join(" ")].filter(Boolean);
    return pieces.join(" • ") || "—";
  };

  const stateLabel = (state: unknown) => {
    const sigla = String(state ?? "").trim().toUpperCase();
    if (!sigla) return "";
    const ibgeState = ibgeStates.find(item => item.sigla.trim().toUpperCase() === sigla);
    return ibgeState ? `${sigla} — ${ibgeState.nome}` : sigla;
  };

  const {
    search,
    setSearch,
    filterStatus,
    setFilterStatus,
    filterSituation,
    setFilterSituation,
    filterOrderType,
    setFilterOrderType,
    selectedServiceTypeId,
    setSelectedServiceTypeId,
    orderSort,
    setOrderSort,
    selectedStates,
    setSelectedStates,
    selectedCities,
    setSelectedCities,
    cityFilterOptions,
    cityFiltersLoading,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    setPage,
    pageSize,
    setPageSize,
    invalidPeriod,
    filteredOrders: filtered,
    pagedOrders,
    totalPages,
    safePage,
    orderLabel,
    clearFilters,
  } = useOrderFilters({
    orders,
    stateOptions: ibgeStates,
    getStateLabel: stateLabel,
    getEquipmentSummary: equipmentSummary,
  });
  const OrderSortIcon = orderSort === "asc"
    ? ArrowUpNarrowWide
    : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  const getSituationsForType = (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) => {
    const links = serviceTypeSituations.filter(link => link.service_type_id === serviceTypeId).sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
    if (links.length === 0) return situations;
    const linkedSituationIds = new Set(links.map(link => link.situation_id));
    const allowed = links.map(link => situations.find(situation => situation.id === link.situation_id)).filter(Boolean);
    const historical = currentSituationId && !linkedSituationIds.has(currentSituationId) ? [currentSituation || situations.find(situation => situation.id === currentSituationId)].filter(Boolean) : [];
    return [...historical, ...allowed];
  };

  const getSlaForOrder = (serviceTypeId?: string, situationId?: string, relatedSituation?: any) => {
    const link = serviceTypeSituations.find(item => item.service_type_id === serviceTypeId && item.situation_id === situationId);
    const situation = situations.find(item => item.id === situationId) || relatedSituation;
    if (!link || !situation) return null;
    const hours = Number(link.use_default_hours ? situation.hours : link.sla_hours);
    return Number.isFinite(hours) && hours > 0 ? { hours, isDefault: link.use_default_hours !== false } : null;
  };

  if (subView === "situations") return <OSSituationsView onBack={() => setSubView("list")} />;

  const formatSolvedAt = (value: string) => Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)).replace(", ", " às ");
  const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const detailUsedItemsTotal = detailUsedItems.reduce((total, item) => {
    if (item.total_sale_price == null) return total;
    const itemTotal = Number(item.total_sale_price);
    return Number.isFinite(itemTotal) ? total + itemTotal : total;
  }, 0);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir esta OS? Esta ação remove o registro principal da tabela de ordens de serviço." onConfirm={() => { void handleDeleteOrder(deleteId); }} onCancel={() => setDeleteId(null)} />}

      {!detail && !formOpen && !solveOpen && <>
      <OrdersHeader
        total={filtered.length}
        displayMode={displayMode}
        canCreate={hasPermission("orders.create")}
        onDisplayModeChange={setViewMode}
        onCreate={openNew}
        onRefresh={() => { void reloadWorkspace(); }}
      />

      <OrdersFilters
        search={search}
        statusId={filterStatus}
        situationId={filterSituation}
        orderType={filterOrderType}
        serviceTypeId={selectedServiceTypeId}
        selectedStates={selectedStates}
        selectedCities={selectedCities}
        dateFrom={dateFrom}
        dateTo={dateTo}
        orderSort={orderSort}
        statuses={statuses}
        situations={situations}
        serviceTypes={serviceTypes}
        stateOptions={ibgeStates}
        cityOptions={cityFilterOptions}
        statesLoading={ibgeStatesLoading}
        citiesLoading={cityFiltersLoading}
        invalidPeriod={invalidPeriod}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        onStatusChange={(value) => { setFilterStatus(value); setPage(1); }}
        onSituationChange={(value) => { setFilterSituation(value); setPage(1); }}
        onOrderTypeChange={(value) => { setFilterOrderType(value as OrderType | ""); setPage(1); }}
        onServiceTypeChange={(value) => { setSelectedServiceTypeId(value); setPage(1); }}
        onStateSelect={(value) => setSelectedStates(current => current.includes(value) ? current : [...current, value])}
        onStateRemove={(value) => setSelectedStates(current => current.filter(state => state !== value))}
        onStatesClear={() => setSelectedStates([])}
        onCitySelect={(value) => {
          const option = cityFilterOptions.find(city => `${city.state}:${city.name}` === value);
          if (option && !selectedCities.some(city => city.name === option.name && city.state === option.state)) {
            setSelectedCities(current => [...current, option]);
          }
        }}
        onCityRemove={(value) => setSelectedCities(current => current.filter(city => `${city.state}:${city.name}` !== value))}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onOrderSortChange={(value) => { setOrderSort(value); setPage(1); }}
        onClear={clearFilters}
      />

      {displayMode === "list" ? <OrdersTable
        loading={loading}
        filteredOrders={filtered}
        pagedOrders={pagedOrders}
        statuses={statuses}
        hasActiveFilters={Boolean(search || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || orderSort || selectedStates.length || selectedCities.length || dateFrom || dateTo)}
        hasPermission={hasPermission}
        onOpen={openDetail}
        onStatusChange={updateOrderStatus}
        onSituationChange={updateOrderSituation}
        getSituations={getSituationsForType}
        onEdit={(order) => { void openEdit(order); }}
        onDelete={setDeleteId}
        formatDate={fmtDate}
        equipmentSummary={equipmentSummary}
        page={safePage}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
        onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
      /> : <OrdersKanban
        statuses={statuses}
        filteredOrders={filtered}
        situations={situations}
        draggingId={draggingId}
        dragOverStatusId={dragOverStatusId}
        hasPermission={hasPermission}
        onDragOver={setDragOverStatusId}
        onDragLeave={handleDragLeave}
        onDrop={(statusId) => { void handleKanbanDrop(statusId); }}
        onCardDragStart={handleCardDragStart}
        onCardDragEnd={handleCardDragEnd}
        onOpen={(order) => {
          if (!shouldSuppressCardOpen()) openDetail(order);
        }}
        onSituationChange={(order, situationId) => { void updateOrderSituation(order, situationId); }}
        onEdit={(order) => { void openEdit(order); }}
        formatDate={fmtDate}
      />}
      </>}

      {/* OS Detail Drawer */}
      {detail && !solveOpen && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <OrderDetailsContent
                detail={detail}
                images={orderImages}
                history={detailHistory}
                formatDate={fmtDate}
                formatState={stateLabel}
                getSla={getSlaForOrder}
                onViewImage={setViewImage}
              />
              <OrderPartRequestsSection
                requests={detailPartRequests}
                assignedTo={detail.assigned_to}
                currentUserId={user?.id}
                hasPermission={hasPermission}
                formatDate={fmtDate}
                getCommittedQuantity={getTestCommittedQuantity}
                getPendingQuantity={getTestPendingQuantity}
                onApprove={openPartApproval}
                onReject={openPartRejection}
                onDelivery={openDeliveryRequest}
                onTestResult={openTestResult}
              />
              <OrderSolutionSummary
                detail={detail}
                profileName={profile?.full_name}
                usedItems={detailUsedItems}
                solutionImages={detailSolutionImages}
                usedItemsTotal={detailUsedItemsTotal}
                formatSolvedAt={formatSolvedAt}
                formatCurrency={formatCurrency}
                onViewImage={setViewImage}
              />
            </div>
            <OrderDetailsActions
              detail={detail}
              statuses={statuses}
              situations={getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation)}
              hasPermission={hasPermission}
              onClose={() => setDetail(null)}
              onStatusChange={(statusId) => updateOrderStatus(detail, statusId)}
              onSituationChange={(situationId) => { void updateOrderSituation(detail, situationId); }}
              onRequestParts={openPartRequestModal}
              onResolve={() => openSolveOrder(detail)}
              onEdit={() => { setDetail(null); void openEdit(detail); }}
              onDelete={() => setDeleteId(detail.id)}
            />
        </AdminPage>
      )}

      {/* OS Create/Edit Page */}
      {formOpen && (
        <AdminPage open={true} onClose={closeOrderForm} breadcrumb={editingOS ? `Ordens de Serviço > OS #${editingOS.os_number || editingOS.id.slice(0,8)}` : "Ordens de Serviço"} title={editingOS ? "Editar OS" : "Nova OS"} subtitle={editingOS ? "Atualize os dados do atendimento" : "Cadastre os dados do atendimento"} maxW="max-w-2xl" fullPage={Boolean(editingOS)}>
          <div className="p-5 space-y-5">
            {/* Cliente */}
            <OrderCustomerSection
              selectedCustomer={selectedCustomer}
              editingCustomer={editingCustomer}
              customerDraft={customerDraft}
              customerAddressDraft={customerAddressDraft}
              saving={saving}
              editingOrder={Boolean(editingOS)}
              addressExpanded={addressExpanded}
              customerSearch={customerSearch}
              customerResults={customerResults}
              hasPermission={hasPermission}
              setCustomerDraft={setCustomerDraft}
              setCustomerAddressDraft={setCustomerAddressDraft}
              setEditingCustomer={setEditingCustomer}
              setAddressExpanded={setAddressExpanded}
              saveCustomer={() => { void saveCustomer(); }}
              searchCustomers={(query) => { void searchCustomers(query); }}
              selectCustomer={selectCustomer}
              onClearCustomer={() => { clearCustomer(); upF("customer_id", ""); }}
              onCreateCustomer={() => setQuickCustomer(true)}
            />

            <OrderEquipmentSection
              form={form}
              equipmentTypes={equipmentTypes}
              equipmentBrands={equipmentBrands}
              equipmentModels={equipmentModels}
              editing={Boolean(editingOS)}
              canCreate={hasPermission("equipment.create")}
              onFieldChange={upF}
              onCreateEquipment={() => setQuickEquipment(true)}
            />

            <OrderServiceLocationSection
              form={form}
              setForm={setForm}
              serviceUseCustomerAddress={serviceUseCustomerAddress}
              setServiceUseCustomerAddress={setServiceUseCustomerAddress}
              setServiceCustomerAddressOverride={setServiceCustomerAddressOverride}
              selectedServiceAddress={selectedServiceAddress}
              serviceAddressPreview={serviceAddressPreview}
              serviceAddressMessage={serviceAddressMessage}
              setServiceAddressMessage={setServiceAddressMessage}
              ibgeStates={ibgeStates}
              ibgeCities={ibgeCities}
              ibgeStatesLoading={ibgeStatesLoading}
              ibgeCitiesLoading={ibgeCitiesLoading}
              onFieldChange={upF}
              clearServiceAddress={clearServiceAddress}
              copyCustomerAddressToForm={copyCustomerAddressToForm}
              loadIbgeCities={loadIbgeCities}
            />

            <OrderImagesField images={orderImages} onAdd={addOrderImages} onRemove={removeOrderImage} onView={setViewImage} canEdit={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")} />

            <OrderInformationSection
              form={form}
              editingOrder={editingOS}
              serviceTypes={serviceTypes}
              serviceTypeSituations={serviceTypeSituations}
              generalServices={generalServices}
              employees={employees}
              selectedTechnicianIds={selectedTechnicianIds}
              selectedSellerIds={selectedSellerIds}
              canAssign={hasPermission("orders.assign")}
              situations={situations}
              onFieldChange={upF}
              onTechniciansChange={setSelectedTechnicianIds}
              onSellersChange={setSelectedSellerIds}
              getSituations={getSituationsForType}
              getSla={getSlaForOrder}
            />
          </div>
          <OrderFormActions
            saving={saving}
            canSave={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")}
            onCancel={closeOrderForm}
            onSave={() => { void saveOS(); }}
          />
        </AdminPage>
      )}
      {quickEquipment && <QuickEquipmentModal
        onClose={() => setQuickEquipment(false)}
        onSaved={({ type, brand, model }) => {
          setEquipmentTypes(current => [...current, type]);
          setEquipmentBrands(current => [...current, brand]);
          setEquipmentModels(current => [...current, model]);
          setForm(current => ({ ...current, equipment_type_id: type.id, equipment_brand_id: brand.id, equipment_model_id: model.id }));
        }}
      />}
      {quickCustomer && <QuickCustomerModal
        onClose={() => setQuickCustomer(false)}
        onSaved={selectCustomer}
      />}
      <OrderResolutionPage
        open={solveOpen}
        detail={detail}
        solveDraft={solveDraft}
        setSolveDraft={setSolveDraft}
        inventoryItems={inventoryItems}
        orderImages={orderImages}
        solutionImages={solutionImages}
        onAddSolutionImages={addSolutionImages}
        onRemoveSolutionImage={removeSolutionImage}
        saving={saving}
        onClose={() => setSolveOpen(false)}
        onViewImage={setViewImage}
        onSubmit={() => {
          const validationError = validateOrderResolution(solveDraft, inventoryItems);
          if (validationError) {
            setToast({ msg: validationError, type: "error" });
            return;
          }
          void saveOrderSolution(detail.id);
        }}
      />
      {viewImage && <OrderImageLightbox image={viewImage} onClose={() => setViewImage(null)} />}
      {partRequestOpen && detail && (
        <PartRequestModal orderNumber={detail.os_number} inventoryItems={partRequestInventory} inventoryLoading={partRequestInventoryLoading} inventoryError={partRequestInventoryError} selectedItems={selectedPartRequestItems} search={partRequestSearch} notes={partRequestNotes} purpose={partRequestPurpose} submitting={partRequestSubmitting} onPurposeChange={setPartRequestPurpose} onSearchChange={setPartRequestSearch} onNotesChange={setPartRequestNotes} onSelect={selectPartRequestItem} onQuantityChange={updatePartRequestQuantity} onRemove={removePartRequestItem} onClose={closePartRequestModal} onSubmit={() => void submitPartRequest()} />
      )}
      {partApprovalOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={false} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={approvePartRequest} />}
      {partRejectionOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={true} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={rejectPartRequest} />}
      {deliveryOpen && selectedDeliveryRequest && <TestDeliveryModal request={selectedDeliveryRequest} orderNumber={detail?.os_number} submitting={deliverySubmitting} onClose={closeDeliveryRequest} onSubmit={() => void deliverTestRequest()} />}
      {testResultOpen && selectedTestRequest && <TestResultModal request={selectedTestRequest} rows={testResultRows} submitting={testResultSubmitting} getPendingQuantity={getTestPendingQuantity} onRowsChange={setTestResultRows} onClose={closeTestResult} onSubmit={() => void submitTestResults()} />}
    </div>
  );
}

