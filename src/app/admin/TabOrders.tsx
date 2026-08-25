import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, type Address } from "@/lib/address";
import {
  LayoutDashboard, ClipboardList, Edit2, Trash2, RefreshCw, Search, MessageCircle,
  Users, List, X, Plus, Clock, CheckCircle, Upload, AlertTriangle, ArrowLeft,
  ChevronLeft, ChevronRight, Phone, Star, DollarSign, HelpCircle, ChevronDown,
  AlertCircle, FileText,
} from "lucide-react";
import {
  cn, slugify, generateOsProtocol, initialOrderStatus, getWhatsAppUrl,
  CustomerType, CustomerForm, emptyCustomerForm, customerFormFromCustomer, customerPayload,
  validateCustomerForm, fetchCnpjData, applyCnpjData, formatCpf, formatCnpj,
  formatFoundationDate, foundationDateToIso, foundationDateFromCustomer,
  INPUT, FInput, FTextarea, FSelect, FToggle, CustomerTypeToggle,
  StatusBadge, LoadingState, EmptyState, BtnPrimary, BtnSecondary, Toast, ConfirmDialog,
  PageHeader, Section, AdminPage, PaginationBar, ImageUpload, ProductAdminThumb,
  AdminBackContext, InternalBackButton, supabaseErrorMessage, createMediaRecord,
  type AdminTab,
} from "./shared";
import { getGeneralServices } from "@/lib/queries";

function QuickEquipmentModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (items: { type: any; brand: any; model: any }) => void;
}) {
  const { hasPermission } = useAuth();
  const [typeName, setTypeName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelName, setModelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    if (!typeName.trim() || !brandName.trim() || !modelName.trim()) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: existingType, error: typeLookupError } = await supabase.from("equipment_types").select("*").ilike("name", typeName.trim()).maybeSingle();
      if (typeLookupError) throw typeLookupError;
      const typeResult = existingType ? { data: existingType, error: null } : await supabase.from("equipment_types").insert({ name: typeName.trim(), slug: slugify(typeName), is_active: true, sort_order: 0 }).select("*").single();
      const { data: type, error: typeError } = typeResult;
      if (typeError || !type) throw typeError || new Error("Equipamento não foi cadastrado.");
      const { data: existingBrand, error: brandLookupError } = await supabase.from("equipment_brands").select("*").eq("equipment_type_id", type.id).ilike("name", brandName.trim()).maybeSingle();
      if (brandLookupError) throw brandLookupError;
      const brandResult = existingBrand ? { data: existingBrand, error: null } : await supabase.from("equipment_brands").insert({ name: brandName.trim(), slug: slugify(brandName), equipment_type_id: type.id, is_active: true, sort_order: 0 }).select("*").single();
      const { data: brand, error: brandError } = brandResult;
      if (brandError || !brand) throw brandError || new Error("Marca não foi cadastrada.");
      const { data: existingModel, error: modelLookupError } = await supabase.from("equipment_models").select("*").eq("equipment_brand_id", brand.id).ilike("name", modelName.trim()).maybeSingle();
      if (modelLookupError) throw modelLookupError;
      const modelResult = existingModel ? { data: existingModel, error: null } : await supabase.from("equipment_models").insert({ name: modelName.trim(), slug: slugify(modelName), equipment_brand_id: brand.id, is_active: true, sort_order: 0 }).select("*").single();
      const { data: model, error: modelError } = modelResult;
      if (modelError || !model) throw modelError || new Error("Modelo não foi cadastrado.");
      onSaved({ type, brand, model });
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick equipment save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/35 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Adicionar novo equipamento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre a hierarquia completa</p></div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3"><FInput label="Tipo de equipamento" required autoFocus value={typeName} onChange={(event: any) => setTypeName(event.target.value)} placeholder="Ex: Televisão" /><FInput label="Marca" required value={brandName} onChange={(event: any) => setBrandName(event.target.value)} placeholder="Ex: Samsung" /><FInput label="Modelo" required value={modelName} onChange={(event: any) => setModelName(event.target.value)} placeholder="Ex: UN55CU7700" />{errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}</div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("equipment.create") && <BtnPrimary onClick={save} disabled={saving || !typeName.trim() || !brandName.trim() || !modelName.trim()}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
      </div>
    </div>
  );
}

function ServiceTypeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (serviceType: any) => void }) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const save = async () => {
    if (!form.title.trim()) { setErrorMessage("Informe o título do tipo de atendimento."); return; }
    setSaving(true);
    setErrorMessage("");
    const { data, error } = await supabase.from("service_types").insert({ title: form.title.trim(), description: form.description.trim() || null, forecast_days: form.forecast_days ? Number(form.forecast_days) : null, is_active: form.is_active, sort_order: 0 }).select("id,title,description,forecast_days,is_active,sort_order").single();
    if (error || !data) setErrorMessage(error?.message || "Tipo de atendimento não foi cadastrado.");
    else { onSaved(data); onClose(); }
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/35 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Novo tipo de atendimento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre sem sair da OS</p></div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <FInput label="Título" required autoFocus value={form.title} onChange={(event: any) => setForm({ ...form, title: event.target.value })} />
          <FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm({ ...form, description: event.target.value })} rows={3} />
          <FInput label="Previsão em dias" type="number" min="0" value={form.forecast_days} onChange={(event: any) => setForm({ ...form, forecast_days: event.target.value })} />
          <FToggle label="Tipo ativo" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("service_types.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
      </div>
    </div>
  );
}
export function TabOrders({ onNavigate, initialOrderId, onFocused }: { onNavigate?: (tab: AdminTab) => void; initialOrderId?: string | null; onFocused?: () => void }) {
  const { user, profile, hasPermission } = useAuth();
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [displayMode, setDisplayMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("os_view_mode") === "kanban" ? "kanban" : "list";
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [situations, setSituations] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [equipmentBrands, setEquipmentBrands] = useState<any[]>([]);
  const [equipmentModels, setEquipmentModels] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [generalServices, setGeneralServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState<any>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailUsedItems, setDetailUsedItems] = useState<any[]>([]);
  const [detailSolutionImages, setDetailSolutionImages] = useState<OrderImage[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [solveOpen, setSolveOpen] = useState(false);
  const [solveDraft, setSolveDraft] = useState({ diagnosis: "", solution: "", usedItems: [], cannotSolve: false, cannotSolveReason: "" } as { diagnosis: string; solution: string; usedItems: any[]; cannotSolve: boolean; cannotSolveReason: string });
  const [solutionImages, setSolutionImages] = useState<OrderImage[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [customerAddressDraft, setCustomerAddressDraft] = useState<Address>({ ...emptyAddress });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [quickEquipment, setQuickEquipment] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const dragOriginRef = useRef<any[] | null>(null);
  const suppressCardClickRef = useRef(false);

  const emptyForm = { service_id: "", general_service_id: "", service_type_id: "", seller_id: "", estimated_price: "", status_id: "", situation_id: "", customer_id: "", assigned_to: user?.id || "", technician_id: "", brand_id: "", product_id: "", model: "", equipment_type_id: "", equipment_brand_id: "", equipment_model_id: "", serial_number: "", accessories: "", equipment_condition: "", priority: "normal", scheduled_at: "", started_at: "", completed_at: "", internal_notes: "", customer_notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [needsScheduling, setNeedsScheduling] = useState(true);
  const [orderImages, setOrderImages] = useState<OrderImage[]>([]);
  const [initialOrderImageIds, setInitialOrderImageIds] = useState<string[]>([]);
  const [viewImage, setViewImage] = useState<OrderImage | null>(null);
  const upF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const loadOrderImages = async (orderId: string) => {
    const { data, error } = await supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", orderId).order("sort_order");
    if (error) { console.error("[ADMIN] service order media load error:", error); setOrderImages([]); setInitialOrderImageIds([]); return; }
    const images = (data || []).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" }));
    setOrderImages(images); setInitialOrderImageIds(images.map(image => image.mediaId).filter(Boolean));
  };

  const addOrderImages = (files: FileList | null) => {
    const available = Math.max(0, 5 - orderImages.length);
    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, available);
    setOrderImages(current => [...current, ...selected.map(file => ({ key: `new-${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), name: file.name }))]);
  };

  const removeOrderImage = (key: string) => setOrderImages(current => {
    const removed = current.find(image => image.key === key);
    if (removed?.url) URL.revokeObjectURL(removed.url);
    return current.filter(image => image.key !== key);
  });

  const loadInventoryItems = async () => {
    const { data, error } = await supabase.from("inventory_items").select("*").eq("is_active", true).order("name");
    if (error) {
      console.error("[ADMIN] inventory load error:", error);
      setInventoryItems([]);
      return;
    }
    setInventoryItems(data || []);
  };

  const load = async () => {
    setLoading(true);
    const [ordRes, statRes, sitRes, profRes, serviceRes, brandRes, productRes, equipmentTypeRes, equipmentBrandRes, equipmentModelRes, employeeRes, generalServiceRes, serviceTypeRes] = await Promise.all([
      supabase.from("service_orders").select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), service_type:service_types(id,title), general_service:general_services(id,name), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)").order("created_at", { ascending: false }),
      supabase.from("order_statuses").select("id,name,color,sort_order").order("sort_order"),
      supabase.from("os_situations").select("id,name,color,sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("profiles").select("id,full_name").order("full_name"),
      supabase.from("services").select("id,title").eq("is_active", true).order("title"),
      supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
      supabase.from("products").select("id,name").eq("is_active", true).order("name"),
      supabase.from("equipment_types").select("id,name").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("equipment_brands").select("id,name,equipment_type_id").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("equipment_models").select("id,name,equipment_brand_id").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("employees").select("id,full_name,is_active").eq("is_active", true).order("full_name"),
      supabase.from("general_services").select("id,name,is_active,sort_order").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("service_types").select("id,title,description,forecast_days,is_active,sort_order").eq("is_active", true).order("sort_order").order("title"),
    ]);
    if (ordRes.error) {
      console.error("[ADMIN] service_orders load error:", { code: ordRes.error.code, message: ordRes.error.message, details: ordRes.error.details, hint: ordRes.error.hint });
      setToast({ msg: `Erro ao carregar OS: ${ordRes.error.message}`, type: "error" });
    } else setOrders(ordRes.data || []);
    [statRes, sitRes, profRes, serviceRes, brandRes, productRes, equipmentTypeRes, equipmentBrandRes, equipmentModelRes, employeeRes, generalServiceRes, serviceTypeRes].forEach((result, index) => {
      if (result.error) console.error("[ADMIN] OS related query error:", index, result.error);
    });
    setStatuses(statRes.data || []);
    setSituations(sitRes.data || []);
    setProfiles(profRes.data || []);
    setServices(serviceRes.data || []);
    setBrands(brandRes.data || []);
    setProducts(productRes.data || []);
    setEquipmentTypes(equipmentTypeRes.data || []);
    setEquipmentBrands(equipmentBrandRes.data || []);
    setEquipmentModels(equipmentModelRes.data || []);
    setEmployees(employeeRes.data || []);
    setGeneralServices(generalServiceRes.data || []);
    setServiceTypes(serviceTypeRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!initialOrderId || loading) return;
    const order = orders.find(item => item.id === initialOrderId);
    if (order) openDetail(order);
    onFocused?.();
  }, [initialOrderId, loading, orders]);

  const openDetail = async (o: any) => {
    const [{ data: currentOrder }, { data: hist }, { data: mediaLinks }, { data: usedItems }] = await Promise.all([
      supabase.from("service_orders").select("is_solved,cannot_be_solved,cannot_be_solved_reason").eq("id", o.id).maybeSingle(),
      supabase.from("service_order_status_history").select("*, order_status:order_statuses(name)").eq("service_order_id", o.id).order("created_at", { ascending: false }),
      supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", o.id).order("sort_order"),
      supabase.from("service_order_used_items").select("*, inventory_item:inventory_items(id,name,sku,unit)").eq("service_order_id", o.id).order("created_at", { ascending: false }),
    ]);
    const orderImagesList = (mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" }));
    const solutionImagesList = (mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" }));
    setDetailHistory(hist || []);
    setDetailUsedItems(usedItems || []);
    setDetailSolutionImages(solutionImagesList);
    setOrderImages(orderImagesList);
    setDetail({ ...o, ...(currentOrder || {}) });
  };

  const openNew = () => {
    setEditingOS(null); setForm(emptyForm); setNeedsScheduling(true); setOrderImages([]); setInitialOrderImageIds([]); setViewImage(null); setSelectedCustomer(null); setEditingCustomer(false); setAddressExpanded(false); setCustomerDraft({ ...emptyCustomerForm }); setCustomerAddressDraft({ ...emptyAddress }); setCustomerSearch(""); setCustomerResults([]); setFormOpen(true);
  };

  const openEdit = async (o: any) => {
    const { data: currentOrder, error: currentOrderError } = await supabase.from("service_orders").select("is_solved,cannot_be_solved,cannot_be_solved_reason").eq("id", o.id).maybeSingle();
    if (currentOrderError) {
      setToast({ msg: `Não foi possível verificar o estado da OS: ${supabaseErrorMessage(currentOrderError)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || o.is_solved) {
      setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" });
      return;
    }
    setEditingOS(o);
    setNeedsScheduling(true);
    await loadOrderImages(o.id);
    setForm({ service_id: o.service_id || "", general_service_id: o.general_service_id || "", service_type_id: o.service_type_id || "", seller_id: o.seller_id || "", estimated_price: o.estimated_price == null ? "" : String(o.estimated_price), status_id: o.status_id || "", situation_id: o.situation_id || "", customer_id: o.customer_id || "", assigned_to: o.assigned_to || "", technician_id: o.technician_id || "", brand_id: o.brand_id || "", product_id: o.product_id || "", model: o.model || "", equipment_type_id: o.equipment_type_id || "", equipment_brand_id: o.equipment_brand_id || "", equipment_model_id: o.equipment_model_id || "", serial_number: o.serial_number || "", accessories: o.accessories || "", equipment_condition: o.equipment_condition || "", priority: o.priority || "normal", scheduled_at: o.scheduled_at ? o.scheduled_at.slice(0, 16) : "", started_at: o.started_at ? o.started_at.slice(0, 16) : "", completed_at: o.completed_at ? o.completed_at.slice(0, 16) : "", internal_notes: o.internal_notes || "", customer_notes: o.customer_notes || "" });
    setSelectedCustomer((o.customer as any) || null);
    const customer = (o.customer as any) || {};
    setCustomerDraft(customerFormFromCustomer(customer));
    const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
    setCustomerAddressDraft({ ...emptyAddress, ...(address || {}) });
    setEditingCustomer(false); setAddressExpanded(false);
    setCustomerSearch(""); setCustomerResults([]);
    setFormOpen(true);
  };

  const saveCustomer = async () => {
    if (!hasPermission("customers.edit")) return;
    if (!selectedCustomer?.id) return;
    const validationError = validateCustomerForm(customerDraft);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSaving(true);
    const { error: customerError } = await supabase.from("customers").update(customerPayload(customerDraft)).eq("id", selectedCustomer.id);
    if (customerError) { console.error("[ADMIN] customer update error:", customerError); setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
    const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
    const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
    const addressResult = address ? await supabase.from("customer_addresses").update(addressPayload).eq("id", address.id) : await supabase.from("customer_addresses").insert(addressPayload);
    setSaving(false);
    if (addressResult.error) { console.error("[ADMIN] customer address update error:", addressResult.error); setToast({ msg: `Cliente salvo, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); return; }
    setSelectedCustomer({ ...selectedCustomer, ...customerPayload(customerDraft), addresses: [customerAddressDraft] });
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
        const { error } = await supabase.from("service_orders").update({ cannot_be_solved: false, cannot_be_solved_reason: null }).eq("id", orderId);
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
        const { error } = await supabase.from("service_orders").update({ cannot_be_solved: true, cannot_be_solved_reason: reason }).eq("id", orderId);
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

    setSaving(true);
    try {
      const { error: resolveError } = await supabase.rpc("resolve_service_order", {
        p_service_order_id: orderId,
        p_diagnosis: diagnosis,
        p_solution: solution,
        p_used_items: solveDraft.usedItems.map(item => ({ inventory_item_id: item.inventory_item_id, quantity: Number(item.quantity) })),
      });
      if (resolveError) throw resolveError;

      let solutionImageError: unknown = null;
      try {
        for (const [sortOrder, image] of solutionImages.entries()) {
          if (image.file) {
            const mediaId = await uploadOrderImage(image.file);
            const { error: insertError } = await supabase.from("service_order_media").insert({ service_order_id: orderId, media_id: mediaId, sort_order: sortOrder + 1000 });
            if (insertError) throw insertError;
          }
        }
      } catch (error) {
        solutionImageError = error;
      }

      const freshDetail = await supabase.from("service_orders").select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), service_type:service_types(id,title), general_service:general_services(id,name), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)").eq("id", orderId).maybeSingle();
      if (freshDetail.data) setDetail(freshDetail.data);
      const { data: usedData } = await supabase.from("service_order_used_items").select("*, inventory_item:inventory_items(id,name,sku,unit)").eq("service_order_id", orderId).order("created_at", { ascending: false });
      const { data: mediaLinks } = await supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", orderId).order("sort_order");
      setDetailUsedItems(usedData || []);
      setOrderImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" })));
      setDetailSolutionImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" })));
      setSolveOpen(false);
      setToast({ msg: solutionImageError ? `OS resolvida, mas não foi possível salvar todas as imagens da solução: ${supabaseErrorMessage(solutionImageError)}` : "OS resolvida com sucesso.", type: solutionImageError ? "error" : "success" });
      await loadInventoryItems();
      await load();
    } catch (error) {
      setToast({ msg: `Não foi possível concluir a solução da OS: ${supabaseErrorMessage(error)}. Nenhuma alteração de estoque foi aplicada.`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveOS = async () => {
    if (editingOS ? !hasPermission("orders.edit") : !hasPermission("orders.create")) { setToast({ msg: "Você não possui permissão para esta ação na OS.", type: "error" }); return; }
    if (editingOS?.is_solved) { setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" }); return; }
    if (!form.general_service_id && !form.service_id) { setToast({ msg: "Selecione o serviço geral da OS.", type: "error" }); return; }
    if (!editingOS && !form.service_type_id) { setToast({ msg: "Selecione o tipo de atendimento da OS.", type: "error" }); return; }
    const cid = selectedCustomer?.id || form.customer_id;
    if (!cid) { setToast({ msg: "Selecione um cliente.", type: "error" }); return; }
    if (needsScheduling && !form.scheduled_at) { setToast({ msg: "Informe a data e hora agendadas ou selecione Não.", type: "error" }); return; }
    if (form.equipment_brand_id && !equipmentBrands.some(brand => brand.id === form.equipment_brand_id && brand.equipment_type_id === form.equipment_type_id)) { setToast({ msg: "A marca selecionada não pertence ao equipamento.", type: "error" }); return; }
    if (form.equipment_model_id && !equipmentModels.some(model => model.id === form.equipment_model_id && model.equipment_brand_id === form.equipment_brand_id)) { setToast({ msg: "O modelo selecionado não pertence à marca.", type: "error" }); return; }
    const { data: availableStatuses, error: statusError } = await supabase.from("order_statuses").select("id,name,sort_order").order("sort_order");
    const status = editingOS ? (availableStatuses || []).find(item => item.id === form.status_id) : initialOrderStatus(availableStatuses || []);
    if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status válido para a OS.", type: "error" }); return; }
    setSaving(true);
    if (editingCustomer && selectedCustomer?.id) {
      const validationError = validateCustomerForm(customerDraft);
      if (validationError) { setToast({ msg: validationError, type: "error" }); setSaving(false); return; }
      const { error: customerError } = await supabase.from("customers").update(customerPayload(customerDraft)).eq("id", selectedCustomer.id);
      if (customerError) { setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
      const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
      const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
      const addressResult = address
        ? await supabase.from("customer_addresses").update(addressPayload).eq("id", address.id)
        : await supabase.from("customer_addresses").insert(addressPayload);
      if (addressResult.error) { setToast({ msg: `Cliente atualizado, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); setSaving(false); return; }
      setSelectedCustomer({ ...selectedCustomer, ...customerPayload(customerDraft), addresses: [customerAddressDraft] });
      setEditingCustomer(false);
    }
    const payload: any = { os_number: editingOS?.os_number || generateOsProtocol(), service_id: editingOS ? form.service_id || null : null, general_service_id: form.general_service_id || null, service_type_id: form.service_type_id || null, seller_id: form.seller_id || null, estimated_price: form.estimated_price ? Number(form.estimated_price) : null, status_id: status.id, situation_id: form.situation_id || null, customer_id: cid, assigned_to: editingOS ? form.assigned_to || null : user?.id || null, technician_id: form.technician_id || null, equipment_type_id: form.equipment_type_id || null, equipment_brand_id: form.equipment_brand_id || null, equipment_model_id: form.equipment_model_id || null, brand_id: form.brand_id || null, product_id: form.product_id || null, model: form.model || null, serial_number: form.serial_number || null, accessories: form.accessories || null, equipment_condition: form.equipment_condition || null, priority: form.priority || "normal", scheduled_at: needsScheduling ? form.scheduled_at || null : null, started_at: form.started_at || null, completed_at: form.completed_at || null, internal_notes: form.internal_notes || null, customer_notes: form.customer_notes || null };
    let error;
    let savedOrderId = editingOS?.id as string | undefined;
    if (editingOS) {
      const r = await supabase.from("service_orders").update(payload).eq("id", editingOS.id);
      error = r.error;
    } else {
      const r = await supabase.from("service_orders").insert(payload).select("id").single();
      error = r.error;
      savedOrderId = r.data?.id;
    }
    if (error) { setSaving(false); setToast({ msg: `Erro ao salvar OS: ${error.message}`, type: "error" }); return; }
    try {
      if (!savedOrderId) throw new Error("A OS foi salva, mas não foi possível obter seu ID.");
      const { data: existingLinks, error: linksError } = await supabase.from("service_order_media").select("id,media_id").eq("service_order_id", savedOrderId);
      if (linksError) throw linksError;
      const retainedMediaIds = new Set(orderImages.filter(image => image.mediaId).map(image => image.mediaId));
      for (const link of existingLinks || []) {
        if (!retainedMediaIds.has(link.media_id)) {
          const { error: removeError } = await supabase.from("service_order_media").delete().eq("id", link.id);
          if (removeError) throw removeError;
        }
      }
      for (const [sortOrder, image] of orderImages.entries()) {
        if (image.mediaId) {
          const link = (existingLinks || []).find((item: any) => item.media_id === image.mediaId);
          if (link) {
            const { error: updateError } = await supabase.from("service_order_media").update({ sort_order: sortOrder }).eq("id", link.id);
            if (updateError) throw updateError;
          }
        } else if (image.file) {
          const mediaId = await uploadOrderImage(image.file);
          const { error: insertError } = await supabase.from("service_order_media").insert({ service_order_id: savedOrderId, media_id: mediaId, sort_order: sortOrder });
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
    setFormOpen(false); setDetail(null); load();
  };

  const openSolveOrder = async (order: any) => {
    if (!hasPermission("orders.solve")) {
      setToast({ msg: "Você não possui permissão para resolver a OS.", type: "error" });
      return;
    }
    const { data: currentOrder, error: currentOrderError } = await supabase.from("service_orders").select("is_solved,diagnosis,solution,cannot_be_solved,cannot_be_solved_reason").eq("id", order.id).maybeSingle();
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
    await loadInventoryItems();
    const [{ data: usedItems }, { data: mediaLinks }] = await Promise.all([
      supabase.from("service_order_used_items").select("*, inventory_item:inventory_items(id,name,sku,unit)").eq("service_order_id", order.id).order("created_at", { ascending: false }),
      supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", order.id).order("sort_order"),
    ]);
    setOrderImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" })));
    setSolutionImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" })));
    setSolveDraft({
      diagnosis: currentOrder?.diagnosis || order.diagnosis || "",
      solution: currentOrder?.solution || order.solution || "",
      usedItems: (usedItems || []).map((item: any) => ({
        id: item.id,
        inventory_item_id: item.inventory_item_id,
        name: item.inventory_item?.name || "",
        quantity: Number(item.quantity || 0),
      })),
      cannotSolve: currentOrder?.cannot_be_solved ?? order.cannot_be_solved ?? false,
      cannotSolveReason: currentOrder?.cannot_be_solved_reason || order.cannot_be_solved_reason || "",
    });
    setSolveOpen(true);
  };

  const handleDeleteOrder = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    const { error } = await supabase.from("service_orders").delete().eq("id", id);
    if (error) {
      setToast({ msg: `Não foi possível excluir a OS: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "OS excluída.", type: "success" });
    setDeleteId(null);
    setDetail(null);
    await load();
  };

  const updateOrderStatus = async (order: any, statusId: string) => {
    if (!hasPermission("orders.status")) { setToast({ msg: "Você não possui permissão para alterar o status.", type: "error" }); return; }
    const { error } = await supabase.from("service_orders").update({ status_id: statusId }).eq("id", order.id);
    if (error) { setToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    await supabase.from("service_order_status_history").insert({ service_order_id: order.id, status_id: statusId, notes: null, is_visible_to_customer: false, created_by: user?.id || null });
    setToast({ msg: "Status atualizado!", type: "success" });
    const updated = orders.map(o => o.id === order.id ? { ...o, status_id: statusId, order_status: statuses.find(status => status.id === statusId) || o.order_status } : o);
    setOrders(updated);
    if (detail?.id === order.id) setDetail({ ...detail, status_id: statusId, order_status: statuses.find(status => status.id === statusId) || detail.order_status });
  };

  const updateOrderSituation = async (order: any, situationId: string) => {
    if (!hasPermission("orders.edit")) { setToast({ msg: "Você não possui permissão para alterar a situação.", type: "error" }); return; }
    const { data, error } = await supabase.from("service_orders").update({ situation_id: situationId || null }).eq("id", order.id).select("situation_id").maybeSingle();
    if (error) { setToast({ msg: `Erro ao alterar situação: ${supabaseErrorMessage(error)}`, type: "error" }); return; }
    const situation = situations.find(item => item.id === (data?.situation_id || situationId));
    setOrders(current => current.map(item => item.id === order.id ? { ...item, situation_id: data?.situation_id || situationId, situation: situation || null } : item));
    if (detail?.id === order.id) setDetail({ ...detail, situation_id: data?.situation_id || situationId, situation: situation || null });
  };

  const setViewMode = (mode: "list" | "kanban") => {
    setDisplayMode(mode);
    window.localStorage.setItem("os_view_mode", mode);
  };

  const handleKanbanDrop = async (statusId: string) => {
    if (!hasPermission("orders.status")) return;
    const order = orders.find(item => item.id === draggingId);
    const previousOrders = dragOriginRef.current;
    setDraggingId(null);
    setDragOverStatusId(null);
    if (!order || order.status_id === statusId || !previousOrders) return;

    const nextStatus = statuses.find(status => status.id === statusId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, status_id: statusId, order_status: nextStatus || item.order_status } : item));
    try {
      const { error } = await supabase.from("service_orders").update({ status_id: statusId }).eq("id", order.id);
      if (error) throw error;
      const { error: historyError } = await supabase.from("service_order_status_history").insert({ service_order_id: order.id, status_id: statusId, notes: null, is_visible_to_customer: false, created_by: user?.id || null });
      if (historyError) console.warn("[ADMIN] OS status history warning:", historyError.message);
      setToast({ msg: `OS ${order.os_number || order.id.slice(0, 8)} movida para ${nextStatus?.name || "o novo status"}.`, type: "success" });
    } catch (error) {
      setOrders(previousOrders);
      setToast({ msg: `Não foi possível alterar o status: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      dragOriginRef.current = null;
    }
  };

  const searchCustomers = async (q: string) => {
    setCustomerSearch(q);
    if (q.length < 2) { setCustomerResults([]); return; }
    const { data } = await supabase.from("customers").select("id,customer_type,full_name,document,email,whatsapp,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,addresses:customer_addresses(*)").or(`full_name.ilike.%${q}%,trade_name.ilike.%${q}%,document.ilike.%${q}%,cnpj.ilike.%${q}%,whatsapp.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setCustomerResults(data || []);
  };

  const selectCustomer = (customer: any) => {
    const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
    setSelectedCustomer(customer);
    setCustomerDraft(customerFormFromCustomer(customer));
    setCustomerAddressDraft({ ...emptyAddress, ...(address || {}) });
    setAddressExpanded(false);
    upF("customer_id", customer.id);
    setCustomerResults([]);
    setCustomerSearch("");
  };

  const lookupCustomerCnpj = async (value: string, baseForm = customerDraft) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || customerDraft.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, customerAddressDraft, data);
      setCustomerDraft(result.form); setCustomerAddressDraft(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
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

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !search || (o.os_number || "").toLowerCase().includes(q) || ((o.service as any)?.title || "").toLowerCase().includes(q) || ((o.customer as any)?.full_name || "").toLowerCase().includes(q) || ((o.service_type as any)?.title || "").toLowerCase().includes(q) || equipmentSummary(o).toLowerCase().includes(q);
    const matchStatus = !filterStatus || o.status_id === filterStatus;
    const matchSituation = !filterSituation || o.situation_id === filterSituation;
    return matchSearch && matchStatus && matchSituation;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, filterStatus, filterSituation]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (subView === "situations") return <OSSituationsView onBack={() => setSubView("list")} />;

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">{label}</p><p className="text-sm font-medium text-[#0d1b2e]">{value}</p></div> : null;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir esta OS? Esta ação remove o registro principal da tabela de ordens de serviço." onConfirm={() => { void handleDeleteOrder(deleteId); }} onCancel={() => setDeleteId(null)} />}

      {!detail && !formOpen && !solveOpen && <>
      <PageHeader title="Ordens de Serviço" subtitle={`${orders.length} OS cadastrada${orders.length !== 1 ? "s" : ""}`} actions={
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-lg border border-[#0d1b2e]/15 overflow-hidden">
            <button type="button" onClick={() => setViewMode("list")} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-bold", displayMode === "list" ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]")}><List size={13} /> Lista</button>
            <button type="button" onClick={() => setViewMode("kanban")} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-bold", displayMode === "kanban" ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]")}><LayoutDashboard size={13} /> Kanban</button>
          </div>
          {hasPermission("orders.create") && <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0]"><Plus size={13} /> Nova OS</button>}
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5"><RefreshCw size={13} /> Atualizar</button>
          
        </div>
      } />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar OS, cliente ou serviço..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className={cn(INPUT, "py-2 text-xs")}>
          <option value="">Todos os status</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterSituation} onChange={e => { setFilterSituation(e.target.value); setPage(1); }} className={cn(INPUT, "py-2 text-xs")}>
          <option value="">Todas as situações</option>{situations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {displayMode === "list" ? <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" message={search || filterStatus || filterSituation ? "Tente ajustar os filtros." : "Crie a primeira OS com o botão Nova OS."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left w-28">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left w-40">Tipo de atendimento</th>
                  <th className="px-4 py-3 text-left w-40">Equipamento</th>
                  <th className="px-4 py-3 text-left w-24">Prioridade</th>
                  <th className="px-4 py-3 text-left w-32">Data de agendamento</th>
                  <th className="px-4 py-3 text-left w-28">Status</th>
                  <th className="px-4 py-3 text-left w-36">Situação</th>
                  <th className="px-4 py-3 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedOrders.map(o => (
                  <tr key={o.id} onClick={() => openDetail(o)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2"><span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7]">{o.os_number || o.id.slice(0, 8)}</span></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#0d1b2e] text-sm">{(o.customer as any)?.full_name || "—"}</p>
                      <p className="text-[11px] text-[#5a6a82]">{(o.customer as any)?.whatsapp || (o.customer as any)?.phone || ""}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{equipmentSummary(o)}</td>
                    <td className="px-4 py-3.5"><PriorityBadge priority={o.priority || "normal"} /></td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</td>
                    <td className="px-4 py-3.5"><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />{o.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Solucionada</span>}{o.cannot_be_solved && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div></td>
                    <td className="px-4 py-3.5">{(o.situation as any)?.name ? <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} /> : <span className="text-xs text-[#5a6a82]">—</span>}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        {hasPermission("orders.status") && <select value={o.status_id || ""} onClick={event => event.stopPropagation()} onChange={event => updateOrderStatus(o, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0057e7]/30">
                          {statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}
                        </select>}
                        {hasPermission("orders.edit") && <select value={o.situation_id || ""} onClick={event => event.stopPropagation()} onChange={event => void updateOrderSituation(o, event.target.value)} className="max-w-[130px] text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Situação</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select>}
                        {hasPermission("orders.edit") && !o.is_solved && <button onClick={(event) => { event.stopPropagation(); void openEdit(o); }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors"><Edit2 size={14} /> Editar</button>}
                        {hasPermission("orders.delete") && !o.is_solved && <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteId(o.id); }} className="flex items-center gap-1.5 text-xs font-bold text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /> Excluir</button>}
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
      </div> : <div className="overflow-x-auto pb-3">
        <div className="flex items-start gap-4 min-w-max">
          {statuses.map(status => {
            const statusOrders = filtered.filter(order => order.status_id === status.id);
            return <div key={status.id} onDragOver={event => { event.preventDefault(); setDragOverStatusId(status.id); }} onDragLeave={() => setDragOverStatusId(current => current === status.id ? null : current)} onDrop={event => { event.preventDefault(); void handleKanbanDrop(status.id); }} className={cn("w-[300px] flex-shrink-0 bg-[#f8fafc] rounded-xl border overflow-hidden transition-colors", dragOverStatusId === status.id ? "border-[#0057e7] bg-[#e8eef8]" : "border-[#0d1b2e]/8")}>
              <div className="px-4 py-3 border-b border-[#0d1b2e]/8 bg-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || "transparent" }} /><span className="font-bold text-sm text-[#0d1b2e] truncate">{status.name}</span></div>
                <span className="text-xs font-bold text-[#5a6a82]">{statusOrders.length}</span>
              </div>
              <div className="p-3 space-y-3 min-h-[180px]">
                {statusOrders.length === 0 ? <p className="py-10 text-center text-xs text-[#5a6a82]">Solte uma OS aqui.</p> : statusOrders.map(order => <div key={order.id} draggable onDragStart={event => { dragOriginRef.current = orders; suppressCardClickRef.current = true; setDraggingId(order.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", order.id); }} onDragEnd={() => { setDraggingId(null); setDragOverStatusId(null); window.setTimeout(() => { suppressCardClickRef.current = false; }, 0); }} onClick={() => { if (suppressCardClickRef.current) { suppressCardClickRef.current = false; return; } openDetail(order); }} className={cn("bg-white rounded-lg border border-[#0d1b2e]/10 p-3 shadow-sm cursor-grab hover:border-[#0057e7]/30 transition-colors", draggingId === order.id && "opacity-50 cursor-grabbing")}>
                  <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7] truncate">{order.os_number || order.id.slice(0, 8)}</span></div>
                  <p className="mt-3 font-semibold text-sm text-[#0d1b2e] truncate">{(order.customer as any)?.full_name || "Cliente não informado"}</p>
                  <p className="text-xs text-[#5a6a82] truncate">{(order.general_service as any)?.name || (order.service as any)?.title || "Serviço não informado"}</p>
                  {order.estimated_price != null && <p className="mt-2 text-xs font-bold text-[#0d1b2e]">R$ {Number(order.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
                  {order.scheduled_at && <p className="mt-1 text-[11px] text-[#5a6a82]">Agendado: {fmtDate(order.scheduled_at)}</p>}
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5a6a82]" onClick={event => event.stopPropagation()}>
                    <span className="font-semibold">Situação:</span>
                    {hasPermission("orders.edit") ? <select value={order.situation_id || ""} onChange={event => void updateOrderSituation(order, event.target.value)} className="min-w-0 flex-1 rounded border border-[#0d1b2e]/15 bg-white px-1.5 py-1 text-[11px]"><option value="">Não definida</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select> : <span className="truncate">{(order.situation as any)?.name || "Não definida"}</span>}
                  </div>
                  {order.is_solved && <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}
                  {order.cannot_be_solved && <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span>}
                  {hasPermission("orders.edit") && !order.is_solved && <div className="mt-3 flex items-center justify-end" onClick={event => event.stopPropagation()}><button type="button" draggable={false} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }} onClick={() => void openEdit(order)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-2.5 py-1.5 rounded-lg"><Edit2 size={13} /> Editar</button></div>}
                </div>)}
              </div>
            </div>;
          })}
        </div>
      </div>}
      </>}

      {/* OS Detail Drawer */}
      {detail && !solveOpen && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb="Ordens de Serviço" title={detail.os_number || `OS #${detail.id.slice(0,8)}`} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={(detail.order_status as any)?.name || "—"} color={(detail.order_status as any)?.color} />
                {(detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}
              </div>
              <Section title="Cliente">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Nome" value={(detail.customer as any)?.full_name} />
                  {(detail.customer as any)?.customer_type === "PJ" ? <>
                    <InfoRow label="Tipo" value="Pessoa Jurídica" />
                    <InfoRow label="CNPJ" value={formatCnpj((detail.customer as any)?.cnpj || "")} />
                    <InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} />
                  </> : <InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} />}
                  <InfoRow label="WhatsApp" value={(detail.customer as any)?.whatsapp} />
                  <InfoRow label="Telefone" value={(detail.customer as any)?.phone} />
                  <InfoRow label="E-mail" value={(detail.customer as any)?.email} />
                </div>
              </Section>
              <Section title="Dados de endereço">
                <div className="grid sm:grid-cols-2 gap-3">
                  {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                    const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                    const address = ((detail.customer as any)?.addresses || []).find((item: Address) => item.is_default) || (detail.customer as any)?.addresses?.[0];
                    return address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null;
                  })}
                </div>
              </Section>
              <Section title="Equipamento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || undefined} />
                  <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || undefined} />
                  <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || undefined} />
                  <InfoRow label="Versão" value={detail.model || undefined} />
                  <InfoRow label="Número de série" value={detail.serial_number || undefined} />
                  <InfoRow label="Lacre" value={detail.accessories || undefined} />
                  <InfoRow label="Garantia" value={detail.equipment_condition || undefined} />
                </div>
              </Section>
              <Section title="Informações da OS">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Tipo de atendimento" value={(detail.service_type as any)?.title} />
                  <InfoRow label="Serviço" value={(detail.general_service as any)?.name || (detail.service as any)?.title} />
                  <InfoRow label="Responsável" value={(detail.assigned_profile as any)?.full_name} />
                  <InfoRow label="Vendedor" value={(detail.seller as any)?.full_name} />
                  <InfoRow label="Técnico" value={(detail.technician as any)?.full_name} />
                  <InfoRow label="Status" value={(detail.order_status as any)?.name} />
                  <InfoRow label="Situação" value={(detail.situation as any)?.name} />
                  <InfoRow label="Prioridade" value={detail.priority ? PRIORITY_LABELS[detail.priority] || detail.priority : undefined} />
                  <InfoRow label="Data agendada" value={fmtDate(detail.scheduled_at)} />
                  <InfoRow label="Data de início" value={fmtDate(detail.started_at)} />
                  <InfoRow label="Data de conclusão" value={fmtDate(detail.completed_at)} />
                  <InfoRow label="Valor" value={detail.estimated_price == null ? undefined : `R$ ${Number(detail.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                  <InfoRow label="Horas da situação" value={(detail.situation as any)?.hours == null ? null : `${(detail.situation as any).hours} hora(s)`} />
                </div>
              </Section>
              {orderImages.length > 0 && <Section title="Imagens da OS"><div className="flex flex-wrap gap-3">{orderImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div></Section>}
              <Section title="Histórico">
                {detailHistory.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum registro de alteração.</p> : (
                  <div className="space-y-2">
                    {detailHistory.map((h: any) => (
                      <div key={h.id} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0057e7] mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-[#0d1b2e]">{(h.order_status as any)?.name || "Status alterado"}</span>
                          {h.notes && <span className="text-[#5a6a82] ml-1">— {h.notes}</span>}
                          <p className="text-[#5a6a82] text-[10px]">{fmtDate(h.created_at, true)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
              {detail.internal_notes && <Section title="Observações internas"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.internal_notes}</p></Section>}
              {detail.customer_notes && <Section title="Descrição do problema"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></Section>}
              {(detail.is_solved || detail.cannot_be_solved || detail.diagnosis || detail.solution || detailUsedItems.length > 0 || detailSolutionImages.length > 0) && (
                <Section title="Solução da OS">
                  <div className="space-y-4">
                    {detail.is_solved && <div className="flex items-center gap-2"><span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-[10px] font-bold uppercase">✓ OS solucionada</span></div>}
                    {detail.cannot_be_solved && <div className="space-y-1"><span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span><p className="text-sm text-[#0d1b2e] whitespace-pre-line"><strong>Justificativa:</strong> {detail.cannot_be_solved_reason}</p></div>}
                    {detail.customer_notes && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Descrição do problema</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></div>}
                    {detail.diagnosis && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Diagnóstico</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.diagnosis}</p></div>}
                    {detail.solution && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Solução</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.solution}</p></div>}
                    {detailUsedItems.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Produtos utilizados</p><div className="space-y-2">{detailUsedItems.map((item: any) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2 text-sm"><span>{item.inventory_item?.name || "Produto"}</span><span className="font-bold text-[#0d1b2e]">{Number(item.quantity || 0)} {item.inventory_item?.unit || "un"}</span></div>)}</div></div>}
                    {detailSolutionImages.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Imagens da solução</p><div className="flex flex-wrap gap-3">{detailSolutionImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div></div>}
                  </div>
                </Section>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-between gap-3">
              <div className="flex gap-2 flex-wrap">
                <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
                {hasPermission("orders.status") && <select value={detail.status_id || ""} onChange={event => updateOrderStatus(detail, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Status</option>{statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}</select>}
                {hasPermission("orders.edit") && <select value={detail.situation_id || ""} onChange={event => void updateOrderSituation(detail, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Situação</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select>}
                {hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved && <BtnPrimary onClick={() => openSolveOrder(detail)}><CheckCircle size={14} /> Resolver OS</BtnPrimary>}
                {hasPermission("orders.edit") && !detail.is_solved && <BtnPrimary onClick={() => { setDetail(null); void openEdit(detail); }}><Edit2 size={14} /> Editar</BtnPrimary>}
                {hasPermission("orders.delete") && !detail.is_solved && <button type="button" onClick={() => setDeleteId(detail.id)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"><Trash2 size={14} /> Excluir</button>}
              </div>
            </div>
        </AdminPage>
      )}

      {/* OS Create/Edit Page */}
      {formOpen && (
        <AdminPage open={true} onClose={() => setFormOpen(false)} breadcrumb={editingOS ? `Ordens de Serviço > OS #${editingOS.os_number || editingOS.id.slice(0,8)}` : "Ordens de Serviço"} title={editingOS ? "Editar OS" : "Nova OS"} subtitle={editingOS ? "Atualize os dados do atendimento" : "Cadastre os dados do atendimento"} maxW="max-w-2xl" fullPage={Boolean(editingOS)}>
          <div className="p-5 space-y-5">
            {/* Cliente */}
            <Section title="Cliente">
              {selectedCustomer ? (
                <div className="space-y-4">
                  {editingCustomer ? (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <CustomerTypeToggle value={customerDraft.customerType} disabled onChange={customerType => setCustomerDraft({ ...customerDraft, customerType })} />
                        {customerDraft.customerType === "PF" ? <>
                          <FInput label="Nome completo" required value={customerDraft.full_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, full_name: e.target.value })} />
                          <FInput label="CPF" value={customerDraft.document} readOnly />
                        </> : <>
                          <FInput label="Nome fantasia" required value={customerDraft.trade_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, trade_name: e.target.value })} />
                          <FInput label="CNPJ" required value={customerDraft.cnpj} readOnly />
                          <FInput label="Razão social" value={customerDraft.legal_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, legal_name: e.target.value })} />
                          <FInput label="Inscrição estadual" value={customerDraft.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setCustomerDraft({ ...customerDraft, state_registration: e.target.value })} />
                          <FInput label="Fundação" value={customerDraft.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setCustomerDraft({ ...customerDraft, foundation_date: formatFoundationDate(e.target.value) })} />
                        </>}
                        <FInput label="WhatsApp" value={customerDraft.whatsapp} onChange={(e: any) => setCustomerDraft({ ...customerDraft, whatsapp: e.target.value })} />
                        <FInput label="Telefone" value={customerDraft.phone} onChange={(e: any) => setCustomerDraft({ ...customerDraft, phone: e.target.value })} />
                        <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={customerDraft.email} onChange={(e: any) => setCustomerDraft({ ...customerDraft, email: e.target.value })} /></div>
                      </div>
                      <Section title="Endereço do cliente">
                        <AddressFields value={customerAddressDraft} onChange={setCustomerAddressDraft} inputClassName={INPUT} />
                      </Section>
                      {hasPermission("customers.edit") && <BtnPrimary onClick={saveCustomer} disabled={saving}>{saving ? "Salvando..." : "Salvar dados"}</BtnPrimary>}
                    </div>
                  ) : (
                    <>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <InfoRow label="Nome" value={selectedCustomer.full_name} />
                        <InfoRow label="Telefone" value={selectedCustomer.phone} />
                        <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">WhatsApp</p><div className="flex items-center gap-2 text-sm font-medium text-[#0d1b2e]">{selectedCustomer.whatsapp || "—"}{getWhatsAppUrl(selectedCustomer.whatsapp) && <a href={getWhatsAppUrl(selectedCustomer.whatsapp) || "#"} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp do cliente" className="text-[#25d366] hover:text-[#1da851]"><MessageCircle size={16} /></a>}</div></div>
                        <InfoRow label="E-mail" value={selectedCustomer.email} />
                        <InfoRow label="Documento" value={selectedCustomer.document} />
                      </div>
                      <button type="button" onClick={() => setAddressExpanded(value => !value)} className="text-xs font-bold text-[#0057e7] hover:underline">{addressExpanded ? "Ocultar endereço ▲" : "Mostrar endereço ▼"}</button>
                      {addressExpanded && <div className="border-t border-[#0d1b2e]/8 pt-4"><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Endereço</p><div className="grid sm:grid-cols-3 gap-3">{(() => { const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0]; const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" }; return (["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map(key => address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null); })()}</div></div>}
                      <div className="flex flex-wrap gap-2">{!editingOS && <BtnSecondary onClick={() => { setSelectedCustomer(null); upF("customer_id", ""); }}><Users size={13} /> Trocar cliente</BtnSecondary>}{hasPermission("customers.edit") && <BtnSecondary onClick={() => setEditingCustomer(true)}><Edit2 size={13} /> Editar dados</BtnSecondary>}</div>
                    </>
                  )}
                  {editingCustomer && <button onClick={() => setEditingCustomer(false)} className="text-xs text-[#5a6a82] hover:underline">Cancelar edição</button>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                      <input value={customerSearch} onChange={e => searchCustomers(e.target.value)} placeholder="Buscar cliente por nome, CPF ou WhatsApp..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
                    </div>
                    {hasPermission("customers.create") && <BtnPrimary onClick={() => setQuickCustomer(true)}><Plus size={13} /> Criar cliente</BtnPrimary>}
                  </div>
                  {customerResults.length > 0 && (
                    <div className="border border-[#0d1b2e]/10 rounded-lg overflow-hidden">
                      {customerResults.map(c => (
                        <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-[#e8eef8] border-b last:border-b-0 border-[#0d1b2e]/5">
                          <p className="font-semibold text-sm text-[#0d1b2e]">{c.full_name}</p>
                          <p className="text-xs text-[#5a6a82]">{c.customer_type === "PJ" ? formatCnpj(c.cnpj || "") : formatCpf(c.document || "")} {c.whatsapp && `· ${c.whatsapp}`}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Equipamento">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 flex items-end gap-2"><div className="flex-1"><FSelect label="Tipo de equipamento" value={form.equipment_type_id} onChange={(e: any) => { upF("equipment_type_id", e.target.value); upF("equipment_brand_id", ""); upF("equipment_model_id", ""); }} options={[{ value: "", label: "Selecionar equipamento..." }, ...equipmentTypes.map(type => ({ value: type.id, label: type.name }))]} /></div>{!editingOS && hasPermission("equipment.create") && <BtnPrimary className="h-[42px]" onClick={() => setQuickEquipment(true)}><Plus size={15} /> Criar equipamento</BtnPrimary>}</div>
                <FSelect label="Marca técnica" value={form.equipment_brand_id} disabled={!form.equipment_type_id} onChange={(e: any) => { upF("equipment_brand_id", e.target.value); upF("equipment_model_id", ""); }} options={[{ value: "", label: form.equipment_type_id ? "Selecionar marca..." : "Selecione o tipo primeiro" }, ...equipmentBrands.filter(brand => brand.equipment_type_id === form.equipment_type_id).map(brand => ({ value: brand.id, label: brand.name }))]} />
                <FSelect label="Modelo" value={form.equipment_model_id} disabled={!form.equipment_brand_id} onChange={(e: any) => upF("equipment_model_id", e.target.value)} options={[{ value: "", label: form.equipment_brand_id ? "Selecionar modelo..." : "Selecione a marca primeiro" }, ...equipmentModels.filter(model => model.equipment_brand_id === form.equipment_brand_id).map(model => ({ value: model.id, label: model.name }))]} />
                <FInput label="Versão" value={form.model} onChange={(e: any) => upF("model", e.target.value)} />
                <FInput label="Nº de série" value={form.serial_number} onChange={(e: any) => upF("serial_number", e.target.value)} />
                <FInput label="Lacre / garantia" value={form.accessories} onChange={(e: any) => upF("accessories", e.target.value)} />
                <div className="sm:col-span-2"><FTextarea label="Observações do equipamento" value={form.equipment_condition} onChange={(e: any) => upF("equipment_condition", e.target.value)} rows={3} /></div>
              </div>
            </Section>

            <OrderImagesField images={orderImages} onAdd={addOrderImages} onRemove={removeOrderImage} onView={setViewImage} canEdit={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")} />

            <Section title="Informações da OS">
              <div className="grid sm:grid-cols-2 gap-4">
                <FSelect label="Tipo de atendimento" required={!editingOS} value={form.service_type_id} onChange={(e: any) => upF("service_type_id", e.target.value)} options={[{ value: "", label: "Selecionar tipo..." }, ...serviceTypes.map(type => ({ value: type.id, label: type.title }))]} />
                <FSelect label="Serviço" value={form.general_service_id} required onChange={(e: any) => upF("general_service_id", e.target.value)} options={[{ value: "", label: "Selecionar serviço..." }, ...generalServices.map(service => ({ value: service.id, label: service.name }))]} />
                <FSelect label="Situação" value={form.situation_id} onChange={(e: any) => upF("situation_id", e.target.value)} options={[{ value: "", label: "Selecionar situação..." }, ...situations.map(s => ({ value: s.id, label: s.name }))]} />
                {hasPermission("orders.assign") && <><FSelect label="Técnico" value={form.technician_id} onChange={(e: any) => upF("technician_id", e.target.value)} options={[{ value: "", label: "Nenhum técnico selecionado" }, ...employees.map(employee => ({ value: employee.id, label: employee.full_name }))]} /><FSelect label="Vendedor" value={form.seller_id} onChange={(e: any) => upF("seller_id", e.target.value)} options={[{ value: "", label: "Nenhum vendedor selecionado" }, ...employees.map(employee => ({ value: employee.id, label: employee.full_name }))]} /></>}
                <FSelect label="Prioridade" value={form.priority} onChange={(e: any) => upF("priority", e.target.value)} options={[{ value: "baixa", label: "Baixa" }, { value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} />
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Necessita agendamento</label>
                  <div className="flex gap-4 text-sm text-[#0d1b2e]">
                    <label className="flex items-center gap-2"><input type="radio" checked={needsScheduling} onChange={() => setNeedsScheduling(true)} /> Sim</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={!needsScheduling} onChange={() => { setNeedsScheduling(false); upF("scheduled_at", ""); }} /> Não</label>
                  </div>
                </div>
                {needsScheduling && <>
                  <FInput label="Data agendada" type="date" required value={form.scheduled_at.slice(0, 10)} onChange={(e: any) => upF("scheduled_at", `${e.target.value}${form.scheduled_at.slice(10) || "T"}`)} />
                  <FInput label="Hora agendada" type="time" required value={form.scheduled_at.slice(11, 16)} onChange={(e: any) => upF("scheduled_at", `${form.scheduled_at.slice(0, 10)}T${e.target.value}`)} />
                  <FInput label="Valor" type="number" min="0" step="0.01" value={form.estimated_price} onChange={(e: any) => upF("estimated_price", e.target.value)} placeholder="0,00" />
                </>}
              </div>
              <div className="space-y-4">
                <FTextarea label="Descrição do problema" value={form.customer_notes} onChange={(e: any) => upF("customer_notes", e.target.value)} rows={4} />
                <FTextarea label="Observações internas" value={form.internal_notes} onChange={(e: any) => upF("internal_notes", e.target.value)} rows={3} />
                {!needsScheduling && <FInput label="Valor" type="number" min="0" step="0.01" value={form.estimated_price} onChange={(e: any) => upF("estimated_price", e.target.value)} placeholder="0,00" />}
              </div>
            </Section>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
            {(editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")) && <BtnPrimary onClick={saveOS} disabled={saving}>{saving ? <Clock size={14} className="animate-spin" /> : <CheckCircle size={14} />}{saving ? "Salvando..." : "Salvar OS"}</BtnPrimary>}
          </div>
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
        onSaved={customer => {
          setSelectedCustomer(customer);
          setCustomerDraft(customerFormFromCustomer(customer));
          setCustomerAddressDraft({ ...emptyAddress, ...(customer.addresses?.[0] || {}) });
          setCustomerResults([]);
          setCustomerSearch("");
          upF("customer_id", customer.id);
        }}
      />}
      {solveOpen && detail && <AdminPage open={true} onClose={() => setSolveOpen(false)} breadcrumb="Ordens de Serviço" title="Resolver OS" subtitle="Diagnóstico, solução e produtos utilizados" maxW="max-w-2xl">
        <div className="p-5 space-y-5">
          <Section title="Informações da OS">
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow label="Nº da OS" value={detail.os_number || `OS #${detail.id.slice(0, 8)}`} />
              <InfoRow label="Serviço" value={(detail.service as any)?.title || (detail.general_service as any)?.name || "—"} />
              <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || "—"} />
              <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || (detail.brand as any)?.name || "—"} />
              <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || "—"} />
              <InfoRow label="Versão" value={detail.model || "—"} />
              <InfoRow label="Nº de série" value={detail.serial_number || "—"} />
              <InfoRow label="Lacre" value={detail.accessories || "—"} />
              <InfoRow label="Garantia" value={detail.equipment_condition || "—"} />
            </div>
          </Section>

          <Section title="Descrição do problema">
            <p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes || "Nenhuma descrição do problema registrada."}</p>
          </Section>

          <Section title="Diagnóstico">
            <FTextarea label="Diagnóstico" value={solveDraft.diagnosis} onChange={(e: any) => setSolveDraft(current => ({ ...current, diagnosis: e.target.value }))} rows={5} />
          </Section>

          <Section title="Solução">
            <FTextarea label="Solução" value={solveDraft.solution} onChange={(e: any) => setSolveDraft(current => ({ ...current, solution: e.target.value }))} rows={5} />
          </Section>

          <Section title="Resultado do atendimento">
            <label className="flex items-start gap-2 text-sm font-bold text-[#0d1b2e]">
              <input type="checkbox" checked={solveDraft.cannotSolve} onChange={event => setSolveDraft(current => ({ ...current, cannotSolve: event.target.checked }))} />
              OS não pode ser solucionada
            </label>
            {solveDraft.cannotSolve && <div className="mt-3"><FTextarea label="Justificativa" value={solveDraft.cannotSolveReason} onChange={(e: any) => setSolveDraft(current => ({ ...current, cannotSolveReason: e.target.value }))} rows={4} hint="Informe por que esta OS não pode ser solucionada." /></div>}
          </Section>

          <Section title="Produtos utilizados">
            <div className="space-y-3">
              {solveDraft.usedItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum produto adicionado.</p> : solveDraft.usedItems.map((item: any) => {
                const stockItem = inventoryItems.find(entry => entry.id === item.inventory_item_id);
                const available = Number(stockItem?.quantity ?? 0);
                const requested = Number(item.quantity || 0);
                const invalid = requested <= 0 || requested > available;
                return (
                  <div key={item.inventory_item_id} className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-[#0d1b2e]">{item.name}</p>
                        <p className="text-[11px] text-[#5a6a82]">Disponível: {available} {stockItem?.unit || "un"}</p>
                        {invalid && <p className="mt-1 text-[10px] font-bold text-red-600">Estoque insuficiente</p>}
                      </div>
                      <div className="w-24">
                        <input type="number" min="1" value={item.quantity} onChange={(e: any) => setSolveDraft(current => ({ ...current, usedItems: current.usedItems.map(existing => existing.inventory_item_id === item.inventory_item_id ? { ...existing, quantity: Math.max(1, Number(e.target.value || 1)) } : existing) }))} className={cn(INPUT, "w-full text-center text-sm")} />
                      </div>
                      <button type="button" onClick={() => setSolveDraft(current => ({ ...current, usedItems: current.usedItems.filter(existing => existing.inventory_item_id !== item.inventory_item_id) }))} className="p-2 rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2">
                <select value="" onChange={(e: any) => {
                  const selectedId = e.target.value;
                  if (!selectedId) return;
                  const item = inventoryItems.find(product => product.id === selectedId);
                  if (!item) return;
                  setSolveDraft(current => ({
                    ...current,
                    usedItems: current.usedItems.some(existing => existing.inventory_item_id === item.id)
                      ? current.usedItems.map(existing => existing.inventory_item_id === item.id ? { ...existing, quantity: Number(existing.quantity || 0) + 1 } : existing)
                      : [...current.usedItems, { inventory_item_id: item.id, name: item.name, quantity: 1 }],
                  }));
                  e.target.value = "";
                }} className={cn(INPUT, "text-xs")}>
                  <option value="">+ Adicionar produto</option>
                  {inventoryItems.filter(item => item.is_active !== false).map(item => <option key={item.id} value={item.id}>{item.name} · Disponível: {Number(item.quantity ?? 0)} {item.unit || "un"}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Imagens da OS">
            {orderImages.length > 0 ? <div className="flex flex-wrap gap-3">{orderImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div> : <p className="text-xs text-[#5a6a82]">Nenhuma imagem da OS cadastrada.</p>}
          </Section>

          <Section title="Imagens da solução">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs text-[#5a6a82]">{solutionImages.length}/5 imagens</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={solutionImages.length >= 5} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
                  input.multiple = true;
                  input.onchange = (event: any) => {
                    const files = event.target.files as FileList | null;
                    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 5 - solutionImages.length);
                    setSolutionImages(current => [...current, ...selected.map(file => ({ key: `solution-${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), name: file.name }))]);
                  };
                  input.click();
                }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Upload size={13} /> Adicionar imagens</button>
                <button type="button" disabled={solutionImages.length >= 5} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (event: any) => {
                    const files = event.target.files as FileList | null;
                    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 5 - solutionImages.length);
                    setSolutionImages(current => [...current, ...selected.map(file => ({ key: `solution-cam-${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), name: file.name }))]);
                  };
                  input.click();
                }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Camera size={13} /> Abrir câmera</button>
              </div>
            </div>
            {solutionImages.length > 0 ? <div className="flex flex-wrap gap-3">{solutionImages.map(image => <OrderImageThumb key={image.key} image={image} onRemove={() => setSolutionImages(current => current.filter(item => item.key !== image.key))} onView={() => setViewImage(image)} />)}</div> : <p className="text-xs text-[#5a6a82]">Nenhuma imagem adicionada para a solução.</p>}
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setSolveOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={() => {
            if (solveDraft.cannotSolve) {
              if (!solveDraft.cannotSolveReason.trim()) {
                setToast({ msg: "Informe a justificativa para esta OS não solucionável.", type: "error" });
                return;
              }
            }
            const hasInvalidProducts = solveDraft.usedItems.some(item => {
              const stockItem = inventoryItems.find(entry => entry.id === item.inventory_item_id);
              return Number(item.quantity || 0) <= 0 || Number(item.quantity || 0) > Number(stockItem?.quantity ?? 0);
            });
            if (hasInvalidProducts) {
              setToast({ msg: "Estoque insuficiente em pelo menos um produto. Ajuste a quantidade antes de concluir.", type: "error" });
              return;
            }
            void saveOrderSolution(detail.id);
          }} disabled={saving}><CheckCircle size={14} /> Concluir solução</BtnPrimary>
        </div>
      </AdminPage>}
      {viewImage && <OrderImageLightbox image={viewImage} onClose={() => setViewImage(null)} />}
    </div>
  );
}

function QuickCustomerModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (customer: any) => void;
}) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [address, setAddress] = useState<Address>({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    const validationError = validateCustomerForm(form);
    if (validationError) { setErrorMessage(validationError); return; }
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: customer, error } = await supabase.from("customers").insert(customerPayload(form)).select().single();
      if (error || !customer) throw error || new Error("Cliente não foi cadastrado.");
      if (Object.values(address).some(Boolean)) {
        const addressResult = await supabase.from("customer_addresses").insert({
          customer_id: customer.id,
          zip_code: address.zip_code || null,
          street: address.street || null,
          number: address.number || null,
          complement: address.complement || null,
          neighborhood: address.neighborhood || null,
          city: address.city || null,
          state: address.state || null,
          reference: address.reference || null,
          is_default: true,
        });
        if (addressResult.error) throw addressResult.error;
        customer.addresses = [address];
      }
      onSaved(customer);
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick customer save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };
  const lookupCnpj = async (value: string, baseForm = form) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || form.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, address, data);
      setForm(result.form); setAddress(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/35 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="sticky top-0 z-10 flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 bg-white px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Criar cliente</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre o cliente sem sair da Nova OS</p></div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <CustomerTypeToggle value={form.customerType} onChange={customerType => setForm({ ...form, customerType })} />
            {form.customerType === "PF" ? <>
              <FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} />
              <FInput label="CPF" value={form.document} placeholder="000.000.000-00" onChange={(e: any) => setForm({ ...form, document: formatCpf(e.target.value) })} />
            </> : <>
              <FInput label="Nome fantasia" required value={form.trade_name} onChange={(e: any) => setForm({ ...form, trade_name: e.target.value })} />
              <FInput label="CNPJ" required value={form.cnpj} placeholder="00.000.000/0000-00" onBlur={(e: any) => lookupCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = formatCnpj(e.target.value); setCnpjMessage(""); setForm({ ...form, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCnpj(nextCnpj, { ...form, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : cnpjMessage || undefined} />
              <FInput label="Razão social" value={form.legal_name} onChange={(e: any) => setForm({ ...form, legal_name: e.target.value })} />
              <FInput label="Inscrição estadual" value={form.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setForm({ ...form, state_registration: e.target.value })} />
              <FInput label="Fundação" value={form.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setForm({ ...form, foundation_date: formatFoundationDate(e.target.value) })} />
            </>}
            <FInput label="E-mail" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
            <FInput label="Telefone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />
            <FInput label="WhatsApp" required value={form.whatsapp} onChange={(e: any) => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          <Section title="Endereço do cliente"><AddressFields value={address} onChange={setAddress} inputClassName={INPUT} /></Section>
          {errorMessage && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMessage}</p>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/10 bg-white px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("customers.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Criar cliente"}</BtnPrimary>}</div>
      </div>
    </div>
  );
}

type OrderImage = { key: string; mediaId?: string; url?: string; file?: File; name: string };

async function uploadOrderImage(file: File) {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "jpg";

  const path =
    `orders/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${extension}`;

  /* =====================================================
     1. Upload físico para Storage
     ===================================================== */

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from("service-images")
      .upload(
        path,
        file,
        {
          upsert: true,
        }
      );

  if (uploadError) {
    console.error(
      "[MEDIA] Storage upload error:",
      uploadError
    );

    throw uploadError;
  }

  /* =====================================================
     2. Registrar mídia através da Edge Function
     ===================================================== */

  try {
    const mediaId =
      await createMediaRecord({
        bucket:
          "service-images",

        path,

        file,
      });

    return mediaId;
  } catch (error) {
    /*
     * O arquivo foi enviado para Storage, mas o registro
     * em public.media falhou.
     *
     * Tenta limpar o arquivo órfão para não deixar lixo
     * no bucket.
     */

    console.error(
      "[MEDIA] Media record error:",
      error
    );

    const {
      error: removeError,
    } =
      await supabase.storage
        .from("service-images")
        .remove([
          path,
        ]);

    if (removeError) {
      console.warn(
        "[MEDIA] Could not remove orphan storage file:",
        removeError
      );
    }

    throw error;
  }
}

function OrderImageThumb({ image, onRemove, onView }: { image: OrderImage; onRemove?: () => void; onView?: () => void }) {
  const { url: mediaUrl, loading, error } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;

  return (
    <div className="relative group w-24 h-20 rounded-lg overflow-hidden border border-[#0d1b2e]/12 bg-[#f5f7fa]">
      {loading ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82]">Carregando...</div>
      ) : url ? (
        <button type="button" className="w-full h-full" onClick={onView}><img src={url} alt={image.name} className="w-full h-full object-cover" /></button>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82] bg-[#f5f7fa]">{error ? "Imagem indisponível" : "Sem imagem"}</div>
      )}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remover ${image.name}`} className="absolute top-1 right-1 p-1 rounded-full bg-[#0d1b2e]/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>}
    </div>
  );
}

function OrderImagesField({ images, onAdd, onRemove, onView, canEdit = true }: { images: OrderImage[]; onAdd: (files: FileList | null) => void; onRemove: (key: string) => void; onView?: (image: OrderImage) => void; canEdit?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  return (
    <Section title="Imagens da OS">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-[#5a6a82]">{images.length}/5 imagens</p>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" disabled={images.length >= 5} onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Upload size={13} /> Adicionar imagens</button>
            <button type="button" disabled={images.length >= 5} onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Camera size={13} /> Abrir câmera</button>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      {images.length > 0 && <div className="flex flex-wrap gap-3">{images.map(image => <OrderImageThumb key={image.key} image={image} onRemove={canEdit ? () => onRemove(image.key) : undefined} onView={() => onView?.(image)} />)}</div>}
    </Section>
  );
}

function OrderImageLightbox({ image, onClose }: { image: OrderImage; onClose: () => void }) {
  const { url: mediaUrl } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;
  return url ? <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0d1b2e]/80 p-5" onClick={onClose}><button type="button" aria-label="Fechar imagem" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white"><X size={20} /></button><img src={url} alt={image.name} className="max-w-full max-h-full object-contain" onClick={event => event.stopPropagation()} /></div> : null;

}
