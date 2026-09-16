import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeftRight, Check, CheckCircle, ChevronDown, Edit2, Eraser, List, MapPin, Package, Plus, Search, Truck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  getInventoryItem,
  listInventoryItemSuppliers,
  listInventoryItems,
  listInventoryMovements,
  recordInventoryMovement,
  saveInventoryItem,
  setInventoryItemActive,
  syncInventoryItemSuppliers,
  type InventorySupplier,
} from "../infrastructure/inventory.repository";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FInput, FTextarea, FToggle, FCurrencyInput, FIntegerInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { InventorySuppliersEditor } from "./InventorySuppliersEditor";

type TabInventoryProps = {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

type InventoryForm = {
  id: string;
  name: string;
  sku: string;
  description: string;
  unit: "un" | "cx";
  conversion_factor: string;
  quantity: string;
  min_quantity: string;
  initial_unit_cost: string;
  initial_supplier_entity_id: string;
  initial_reference: string;
  sale_price: string;
  storage_shelf: string;
  storage_level: string;
  storage_compartment: string;
  is_active: boolean;
};

type MovementForm = {
  type: "in" | "out" | "adjust";
  quantity: string;
  supplier_entity_id: string;
  input_unit_cost: string;
  purchase_reference: string;
  reason: string;
  notes: string;
  service_order_id: string;
};

type MobileFilter = "name" | "sku" | "address";

const emptyInventoryForm = (): InventoryForm => ({
  id: "",
  name: "",
  sku: "",
  description: "",
  unit: "un",
  conversion_factor: "1",
  quantity: "0",
  min_quantity: "0",
  initial_unit_cost: "",
  initial_supplier_entity_id: "",
  initial_reference: "",
  sale_price: "",
  storage_shelf: "",
  storage_level: "",
  storage_compartment: "",
  is_active: true,
});

const emptyMovementForm = (): MovementForm => ({
  type: "in",
  quantity: "",
  supplier_entity_id: "",
  input_unit_cost: "",
  purchase_reference: "",
  reason: "",
  notes: "",
  service_order_id: "",
});

const unitLabel = (unit?: string | null) => unit === "cx" ? "cx" : "un";
const conversionFactor = (item: any) => Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
const equivalentUnits = (quantity: number, item: any) => quantity * conversionFactor(item);
const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
const storageAddress = (item: any) => [
  item?.storage_shelf ? `Estante ${item.storage_shelf}` : "",
  item?.storage_level ? `Prateleira ${item.storage_level}` : "",
  item?.storage_compartment ? `Compartimento ${item.storage_compartment}` : "",
].filter(Boolean).join(" · ");

function relatedRecord(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function lastSupplierName(item: any) {
  const supplier = relatedRecord(item?.last_supplier);
  return supplier?.name || supplier?.trade_name || supplier?.legal_name || "—";
}

function movementSupplierName(entry: any) {
  const supplier = relatedRecord(entry?.supplier);
  return supplier?.name || supplier?.trade_name || supplier?.legal_name || "—";
}

function displayBaseQuantity(value: unknown, item: any) {
  const quantity = Number(value ?? 0);
  return item?.unit === "cx" ? quantity / conversionFactor(item) : quantity;
}

function displayAverageCost(value: unknown, item: any) {
  if (value == null) return null;
  const cost = Number(value);
  return item?.unit === "cx" ? cost * conversionFactor(item) : cost;
}

function movementPresentation(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type === "in") return { label: "Entrada", sign: "+", badge: "bg-green-100 text-green-700", text: "text-green-600" };
  if (type === "out") return { label: "Saída", sign: "-", badge: "bg-red-100 text-red-700", text: "text-red-600" };
  if (type === "use") return { label: "Uso", sign: "×", badge: "bg-blue-100 text-blue-700", text: "text-blue-600" };
  if (type === "adjust") return { label: "Ajuste", sign: "~", badge: "bg-amber-100 text-amber-700", text: "text-amber-600" };
  return { label: type || "Movimentação", sign: "", badge: "bg-[#f5f7fa] text-[#5a6a82]", text: "text-[#5a6a82]" };
}

function movementOrigin(value: unknown) {
  const origin = String(value || "legacy");
  if (origin === "purchase") return "Compra";
  if (origin === "initial_balance") return "Saldo inicial";
  if (origin === "service_order") return "Ordem de serviço";
  if (origin === "return") return "Devolução";
  if (origin === "manual") return "Manual";
  return "Legado";
}

export function TabInventory({ routeResourceId, routeSubpage, onRouteChange }: TabInventoryProps) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("inventory.view");
  const canViewTable = hasPermission("inventory.table.view");
  const canViewDetails = hasPermission("inventory.details.view");
  const canCreate = hasPermission("inventory.create");
  const canEdit = hasPermission("inventory.update");
  const canToggleActive = hasPermission("inventory.toggle_active");
  const canViewMovements = hasPermission("inventory.movements.view");
  const canCreateMovements = hasPermission("inventory.movements.create");
  const canViewSuppliers = hasPermission("inventory.suppliers.view") || hasPermission("inventory.suppliers.manage");
  const canManageSuppliers = hasPermission("inventory.suppliers.manage");
  const canViewCosts = hasPermission("inventory.costs.view");
  const showName = hasPermission("inventory.table.name");
  const showSku = hasPermission("inventory.table.sku");
  const showUnit = hasPermission("inventory.table.unit");
  const showQuantity = hasPermission("inventory.table.quantity");
  const showMinQuantity = hasPermission("inventory.table.min_quantity");
  const showPurchasePrice = canViewCosts && hasPermission("inventory.table.purchase_price");
  const showSalePrice = hasPermission("inventory.table.sale_price");
  const showStatus = hasPermission("inventory.table.status");
  const showActions = hasPermission("inventory.table.actions");
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: [...queryKeys.inventory.lists(), activeOrganizationId, canViewCosts ? "costs" : "safe"],
    queryFn: () => listInventoryItems(activeOrganizationId, canViewCosts),
    enabled: Boolean(activeOrganizationId && canView && (canViewTable || canViewDetails || canCreate || canEdit || canViewMovements || canCreateMovements)),
  });
  const items = itemsQuery.data ?? [];

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState<InventoryForm>(emptyInventoryForm);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [linkedSuppliers, setLinkedSuppliers] = useState<InventorySupplier[]>([]);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [nameSearch, setNameSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    if (itemsQuery.error) setToast({ msg: `Erro ao carregar estoque: ${itemsQuery.error instanceof Error ? itemsQuery.error.message : String(itemsQuery.error)}`, type: "error" });
  }, [itemsQuery.error]);

  const filteredItems = useMemo(() => items.filter((item: any) => {
    const matchName = !nameSearch || normalize(item.name).includes(normalize(nameSearch));
    const matchSku = !skuSearch || normalize(item.sku).includes(normalize(skuSearch));
    const address = normalize(`${item.storage_shelf || ""} ${item.storage_level || ""} ${item.storage_compartment || ""} ${storageAddress(item)}`);
    return matchName && matchSku && (!addressSearch || address.includes(normalize(addressSearch)));
  }), [items, nameSearch, skuSearch, addressSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(nameSearch || skuSearch || addressSearch);
  useEffect(() => { setPage(1); }, [nameSearch, skuSearch, addressSearch, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const refreshInventory = () => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  const clearFilters = () => { setNameSearch(""); setSkuSearch(""); setAddressSearch(""); setPage(1); };

  const loadSuppliers = async (itemId: string) => {
    if (!canViewSuppliers) {
      setLinkedSuppliers([]);
      return [];
    }
    try {
      const suppliers = await listInventoryItemSuppliers(itemId, activeOrganizationId);
      setLinkedSuppliers(suppliers);
      return suppliers;
    } catch (error) {
      setLinkedSuppliers([]);
      setToast({ msg: `Erro ao carregar fornecedores do item: ${supabaseErrorMessage(error)}`, type: "error" });
      return [];
    }
  };

  const openNew = () => {
    if (!canCreate) return;
    setSelectedItem(null);
    setForm(emptyInventoryForm());
    setLinkedSuppliers([]);
    setHistoryOpen(false);
    setRecordOpen(true);
  };

  const openEdit = async (item: any) => {
    if (!(canViewDetails && canEdit)) return;
    setSelectedItem(item);
    setForm({
      id: item.id,
      name: item.name || "",
      sku: item.sku || "",
      description: item.description || "",
      unit: item.unit === "cx" ? "cx" : "un",
      conversion_factor: String(item.unit === "cx" ? conversionFactor(item) : 1),
      quantity: String(Number(item.quantity ?? 0)),
      min_quantity: String(Number(item.min_quantity ?? 0)),
      initial_unit_cost: "",
      initial_supplier_entity_id: "",
      initial_reference: "",
      sale_price: item.sale_price == null ? "" : String(item.sale_price),
      storage_shelf: item.storage_shelf || "",
      storage_level: item.storage_level || "",
      storage_compartment: item.storage_compartment || "",
      is_active: item.is_active !== false,
    });
    setHistoryOpen(false);
    setRecordOpen(true);
    await loadSuppliers(item.id);
  };

  const openHistory = async (item: any) => {
    if (!canViewMovements) return;
    setSelectedItem(item);
    setRecordOpen(false);
    try {
      setHistory(await listInventoryMovements(item.id, activeOrganizationId, canViewCosts));
      setHistoryOpen(true);
    } catch (error) {
      setToast({ msg: `Erro ao carregar histórico: ${supabaseErrorMessage(error)}`, type: "error" });
      setHistory([]);
    }
  };

  const openMovement = async (item: any) => {
    if (!canCreateMovements) return;
    setSelectedItem(item);
    setMovementForm(emptyMovementForm());
    setHistoryOpen(false);
    setRecordOpen(false);
    await loadSuppliers(item.id);
  };

  const closePage = () => {
    setRecordOpen(false);
    setHistoryOpen(false);
    setSelectedItem(null);
    setLinkedSuppliers([]);
    onRouteChange?.(null, null);
  };

  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : void openEdit(item));
  const openHistoryPage = (item: any) => canViewMovements && (onRouteChange ? onRouteChange(item.id, "history") : void openHistory(item));
  const openMovementPage = (item: any) => canCreateMovements && (onRouteChange ? onRouteChange(item.id, "move") : void openMovement(item));

  useEffect(() => {
    if (!routeResourceId) {
      if (recordOpen || historyOpen || selectedItem) {
        setRecordOpen(false);
        setHistoryOpen(false);
        setSelectedItem(null);
        setLinkedSuppliers([]);
      }
      return;
    }
    if (routeResourceId === "new") {
      if (canCreate && !recordOpen) openNew();
      return;
    }
    const item = items.find((entry: any) => entry.id === routeResourceId);
    if (!item) return;
    if (routeSubpage === "edit" && canViewDetails && canEdit && (!recordOpen || selectedItem?.id !== item.id)) void openEdit(item);
    if (routeSubpage === "history" && canViewMovements && (!historyOpen || selectedItem?.id !== item.id)) void openHistory(item);
    if (routeSubpage === "move" && canCreateMovements && (recordOpen || historyOpen || selectedItem?.id !== item.id)) void openMovement(item);
  }, [routeResourceId, routeSubpage, items, recordOpen, historyOpen, selectedItem?.id, canCreate, canViewDetails, canEdit, canViewMovements, canCreateMovements]);

  const saveItem = async () => {
    const canSave = selectedItem ? canEdit : canCreate;
    if (!canSave) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome do item do estoque.", type: "error" }); return; }
    const factor = form.unit === "cx" ? Number(form.conversion_factor) : 1;
    if (!Number.isInteger(factor) || factor < 1) { setToast({ msg: "Informe quantas unidades inteiras existem em cada caixa.", type: "error" }); return; }
    const initialQuantity = Number(form.quantity || 0);
    if (!selectedItem && (!Number.isInteger(initialQuantity) || initialQuantity < 0)) { setToast({ msg: "Informe um saldo inicial inteiro e não negativo.", type: "error" }); return; }
    const minQuantity = Number(form.min_quantity || 0);
    if (!Number.isInteger(minQuantity) || minQuantity < 0) { setToast({ msg: "Informe uma quantidade mínima inteira e não negativa.", type: "error" }); return; }
    const salePrice = form.sale_price.trim() === "" ? null : Number(form.sale_price);
    if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) { setToast({ msg: "Informe um valor de venda válido e não negativo.", type: "error" }); return; }
    const initialUnitCost = form.initial_unit_cost.trim() === "" ? null : Number(form.initial_unit_cost);
    if (!selectedItem && initialUnitCost !== null && (!Number.isFinite(initialUnitCost) || initialUnitCost < 0)) { setToast({ msg: "Informe um custo inicial válido e não negativo.", type: "error" }); return; }
    if (!selectedItem && form.initial_supplier_entity_id && !linkedSuppliers.some(supplier => supplier.id === form.initial_supplier_entity_id)) {
      setToast({ msg: "O fornecedor do saldo inicial precisa estar vinculado ao item.", type: "error" });
      return;
    }

    const commonPayload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      sale_price: salePrice,
      is_active: form.is_active,
      min_quantity: minQuantity,
      storage_shelf: form.storage_shelf.trim() || null,
      storage_level: form.storage_level.trim() || null,
      storage_compartment: form.storage_compartment.trim() || null,
      unit: form.unit,
      conversion_factor: factor,
    };

    try {
      if (selectedItem) {
        await saveInventoryItem(commonPayload, selectedItem.id, activeOrganizationId);
        if (canManageSuppliers) await syncInventoryItemSuppliers(selectedItem.id, linkedSuppliers.map(supplier => supplier.id), activeOrganizationId);
      } else {
        await saveInventoryItem({
          ...commonPayload,
          supplier_entity_ids: canManageSuppliers ? linkedSuppliers.filter(supplier => supplier.is_active !== false).map(supplier => supplier.id) : [],
          initial_quantity: initialQuantity,
          initial_supplier_entity_id: form.initial_supplier_entity_id || null,
          initial_unit_cost: initialUnitCost,
          initial_reference: form.initial_reference.trim() || null,
        }, undefined, activeOrganizationId);
      }
      setToast({ msg: selectedItem ? "Item atualizado." : "Item cadastrado com histórico de saldo inicial.", type: "success" });
      closePage();
      await refreshInventory();
    } catch (error) {
      setToast({ msg: `Erro ao salvar item: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  const toggleActive = async (item: any) => {
    if (!canToggleActive) return;
    const next = item.is_active === false;
    try {
      await setInventoryItemActive(item.id, next, activeOrganizationId);
      setToast({ msg: next ? "Item ativado." : "Item inativado.", type: "success" });
      await refreshInventory();
    } catch (error) {
      setToast({ msg: `Erro ao alterar status: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  const saveMovement = async () => {
    if (!selectedItem || !canCreateMovements) return;
    const quantity = Number(movementForm.quantity || 0);
    const movementType = movementForm.type === "in" ? "IN" : movementForm.type === "out" ? "OUT" : "ADJUST";
    if (!Number.isInteger(quantity) || quantity < 0 || (movementType !== "ADJUST" && quantity <= 0)) {
      setToast({ msg: movementType === "ADJUST" ? "Informe o novo saldo inteiro e não negativo." : "Informe uma quantidade inteira maior que zero.", type: "error" });
      return;
    }
    if (movementType === "IN") {
      const cost = movementForm.input_unit_cost.trim() === "" ? NaN : Number(movementForm.input_unit_cost);
      if (!movementForm.supplier_entity_id) { setToast({ msg: "Selecione o fornecedor desta entrada.", type: "error" }); return; }
      if (!Number.isFinite(cost) || cost < 0) { setToast({ msg: "Informe o valor pago por unidade/caixa nesta entrada.", type: "error" }); return; }
    }
    if (movementType === "ADJUST" && !movementForm.reason.trim()) {
      setToast({ msg: "Informe a justificativa do ajuste de estoque.", type: "error" });
      return;
    }

    try {
      const currentItem = await getInventoryItem(selectedItem.id, activeOrganizationId, canViewCosts);
      if (!currentItem) throw new Error("O item do estoque não foi encontrado.");
      if (currentItem.is_active === false) throw new Error("O item está inativo e não pode receber movimentações.");
      await recordInventoryMovement({
        inventory_item_id: selectedItem.id,
        movement_type: movementType,
        input_quantity: quantity,
        supplier_entity_id: movementType === "IN" ? movementForm.supplier_entity_id : null,
        input_unit_cost: movementType === "IN" ? Number(movementForm.input_unit_cost) : null,
        purchase_reference: movementType === "IN" ? movementForm.purchase_reference : null,
        reason: movementForm.reason.trim() || (movementType === "IN" ? "Entrada de compra" : movementType === "OUT" ? "Saída manual" : null),
        service_order_id: movementForm.service_order_id.trim() || null,
        movement_origin: movementType === "IN" ? "purchase" : "manual",
        notes: movementForm.notes.trim() || null,
      }, activeOrganizationId);
      setToast({ msg: "Movimentação registrada com sucesso.", type: "success" });
      setMovementForm(emptyMovementForm());
      closePage();
      await refreshInventory();
    } catch (error) {
      setToast({ msg: `Erro na movimentação: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  if (!canView) return null;

  const routePageReady = recordOpen || historyOpen || (selectedItem && routeSubpage === "move");
  const movementQuantity = Number(movementForm.quantity || 0);
  const mobileFilterLabel = mobileFilter === "name" ? "Nome" : mobileFilter === "sku" ? "SKU" : "Endereço";
  const mobileValue = mobileFilter === "name" ? nameSearch : mobileFilter === "sku" ? skuSearch : addressSearch;
  const setMobileValue = (value: string) => mobileFilter === "name" ? setNameSearch(value) : mobileFilter === "sku" ? setSkuSearch(value) : setAddressSearch(value);
  const activeLinkedSuppliers = linkedSuppliers.filter(supplier => supplier.is_active !== false);

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    {!routeResourceId && <>
      <PageHeader title="Estoque" subtitle="Controle de itens, fornecedores, custos e movimentações do almoxarifado" actions={canCreate ? <AdminButton onClick={openNewPage} className="text-xs"><Plus size={14} /> Novo item</AdminButton> : null} />

      {canViewTable && <AdminSearchPanel title="Buscar estoque">
        <div className="space-y-3 md:hidden">
          <div className="flex items-center gap-2">
            <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm"><span className="truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-[220px]">{([['name','Nome'],['sku','SKU'],['address','Endereço']] as const).map(([value,label]) => <DropdownMenuItem key={value} onSelect={() => setMobileFilter(value)} className={cn("cursor-pointer", mobileFilter === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Search size={14} /><span>{label}</span>{mobileFilter === value && <Check size={14} className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
            {hasFilters && <button type="button" onClick={clearFilters} aria-label="Limpar filtros" className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600"><Eraser size={15} /></button>}
          </div>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={mobileValue} onChange={event => setMobileValue(event.target.value)} placeholder={mobileFilter === "name" ? "Digite o nome da peça" : mobileFilter === "sku" ? "Digite o SKU" : "Estante, prateleira ou compartimento"} className={cn(INPUT, "h-[42px] w-full pl-9 text-sm")} /></div>
        </div>
        <div className="hidden grid-cols-1 gap-3 md:grid md:grid-cols-3">
          <SearchField label="Nome" value={nameSearch} onChange={setNameSearch} placeholder="Digite o nome da peça" />
          <SearchField label="SKU" value={skuSearch} onChange={setSkuSearch} placeholder="Digite o SKU" />
          <SearchField label="Endereço" value={addressSearch} onChange={setAddressSearch} placeholder="Estante, prateleira ou compartimento" />
          {hasFilters && <div className="flex justify-end md:col-span-3"><AdminButton variant="danger" size="sm" onClick={clearFilters} className="bg-white text-red-600 hover:bg-red-50"><Eraser size={14} /> Limpar filtros</AdminButton></div>}
        </div>
      </AdminSearchPanel>}

      {canViewTable && <AdminCard>{itemsQuery.isPending ? <LoadingState /> : filteredItems.length === 0 ? <EmptyState icon={Package} title={items.length === 0 ? "Nenhum item em estoque" : "Nenhum item encontrado"} message={items.length === 0 ? "Cadastre um item para começar a controlar o inventário." : "Ajuste os filtros para encontrar a peça."} /> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{pagedItems.map((item: any) => {
          const quantity = Number(item.quantity ?? 0);
          const minQuantity = Number(item.min_quantity ?? 0);
          const lowStock = quantity <= minQuantity;
          return <article key={item.id} className="min-w-0 space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-black text-[#0d1b2e]">{item.name}</p><p className="mt-1 font-mono text-[10px] font-semibold text-[#5a6a82]">SKU {item.sku || "—"}</p></div>{showStatus && <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span>}</div>
            {storageAddress(item) && <div className="flex items-start gap-2 rounded-lg bg-[#f5f7fa] px-3 py-2 text-xs font-semibold text-[#34445b]"><MapPin size={14} className="mt-0.5 shrink-0 text-[#0057e7]" /><span>{storageAddress(item)}</span></div>}
            {showQuantity && <div className={cn("rounded-xl border px-3 py-2.5", quantity === 0 ? "border-red-200 bg-red-50" : lowStock ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50")}><p className="text-[9px] font-bold uppercase text-[#5a6a82]">Quantidade atual</p><p className={cn("text-xl font-black", quantity === 0 ? "text-red-700" : lowStock ? "text-amber-700" : "text-emerald-700")}>{formatNumber(quantity)} <span className="text-[11px]">{showUnit ? unitLabel(item.unit) : ""}</span></p>{item.unit === "cx" && <p className="text-[10px] font-semibold text-[#5a6a82]">{formatNumber(equivalentUnits(quantity, item))} un no total</p>}</div>}
            <div className="grid grid-cols-2 gap-3 text-xs">{showMinQuantity && <Info label="Mínimo" value={`${formatNumber(minQuantity)}${showUnit ? ` ${unitLabel(item.unit)}` : ""}`} />}{showUnit && <Info label="Unidade" value={`${unitLabel(item.unit)}${item.unit === "cx" ? ` · ${formatNumber(conversionFactor(item))} un/cx` : ""}`} />}{showPurchasePrice && <Info label="Última compra" value={formatCurrency(item.purchase_price)} />}{canViewCosts && <Info label="Custo médio" value={formatCurrency(item.average_cost)} />}{canViewCosts && <Info label="Valor em estoque" value={formatCurrency(item.stock_value)} />}{showSalePrice && <Info label="Venda" value={formatCurrency(item.sale_price)} />}</div>
            {showActions && <div className="border-t border-[#0d1b2e]/8 pt-3"><div className="grid grid-cols-2 gap-2">{canViewDetails && canEdit && <AdminButton variant="secondary" size="sm" onClick={() => openEditPage(item)} className="h-10"><Edit2 size={15} /> Editar</AdminButton>}{canCreateMovements && <AdminButton size="sm" onClick={() => openMovementPage(item)} className="h-10"><ArrowLeftRight size={15} /> Movimentar</AdminButton>}</div><div className="mt-2 flex justify-end gap-1.5">{canViewMovements && <AdminIconButton ariaLabel="Histórico" onClick={() => openHistoryPage(item)} className="h-10 w-10"><List size={16} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active !== false ? "Inativar" : "Ativar"} onClick={() => void toggleActive(item)} className="h-10 w-10">{item.is_active !== false ? <AlertCircle size={16} /> : <CheckCircle size={16} />}</AdminIconButton>}</div></div>}
          </article>;
        })}</div>

        <div className="hidden overflow-x-auto md:block"><table className="min-w-[1120px]"><thead><tr>{showName && <th className="text-left">Nome</th>}{showSku && <th className="text-left">SKU</th>}<th className="text-left">Endereço</th>{showUnit && <th className="text-left">Unidade</th>}{showQuantity && <th className="text-left">Quantidade</th>}{showMinQuantity && <th className="text-left">Mínimo</th>}{showPurchasePrice && <th className="text-left">Última compra</th>}{canViewCosts && <th className="text-left">Custo médio</th>}{canViewCosts && <th className="text-left">Valor estoque</th>}{showSalePrice && <th className="text-left">Venda</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map((item: any) => {
          const quantity = Number(item.quantity ?? 0);
          const minQuantity = Number(item.min_quantity ?? 0);
          return <tr key={item.id}>{showName && <td><div className="font-semibold text-[#0d1b2e]">{item.name}</div>{item.description && <div className="max-w-sm text-[11px] text-[#5a6a82]">{item.description}</div>}</td>}{showSku && <td className="font-mono text-xs text-[#5a6a82]">{item.sku || "—"}</td>}<td className="max-w-[220px] text-xs text-[#5a6a82]">{storageAddress(item) || "—"}</td>{showUnit && <td className="text-xs text-[#5a6a82]">{unitLabel(item.unit)}{item.unit === "cx" && <div className="text-[10px]">{formatNumber(conversionFactor(item))} un/cx</div>}</td>}{showQuantity && <td className={cn("font-bold", quantity === 0 ? "text-red-700" : quantity <= minQuantity ? "text-amber-700" : "text-[#0d1b2e]")}>{formatNumber(quantity)}{item.unit === "cx" && <div className="text-[10px] font-normal text-[#5a6a82]">{formatNumber(equivalentUnits(quantity, item))} un</div>}</td>}{showMinQuantity && <td className="text-xs text-[#5a6a82]">{formatNumber(minQuantity)}</td>}{showPurchasePrice && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.purchase_price)}</td>}{canViewCosts && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.average_cost)}</td>}{canViewCosts && <td className="text-xs font-semibold text-[#0d1b2e]">{formatCurrency(item.stock_value)}</td>}{showSalePrice && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.sale_price)}</td>}{showStatus && <td><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar" onClick={() => openEditPage(item)}><Edit2 size={14} /></AdminIconButton>}{canViewMovements && <AdminIconButton ariaLabel="Histórico" onClick={() => openHistoryPage(item)}><List size={14} /></AdminIconButton>}{canCreateMovements && <AdminIconButton ariaLabel="Movimentar" onClick={() => openMovementPage(item)}><ArrowLeftRight size={14} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active !== false ? "Inativar" : "Ativar"} onClick={() => void toggleActive(item)}>{item.is_active !== false ? <AlertCircle size={14} /> : <CheckCircle size={14} />}</AdminIconButton>}</div></td>}</tr>;
        })}</tbody></table></div>
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={filteredItems.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </>}</AdminCard>}
    </>}

    {routeResourceId && !routePageReady && <AdminCard className="p-8"><LoadingState /></AdminCard>}

    {recordOpen && <AdminPage open onClose={closePage} breadcrumb="Estoque" title={selectedItem ? "Editar item" : "Novo item"} subtitle={selectedItem ? "Atualize o cadastro, fornecedores e localização da peça." : "Cadastre o item e registre o saldo inicial com rastreabilidade."} maxW="max-w-4xl">
      <div className="space-y-5 p-4 sm:p-5">
        {selectedItem && canViewCosts && <Section title="Custos e última compra"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Último preço" value={formatCurrency(selectedItem.purchase_price)} /><Metric label="Custo médio" value={formatCurrency(selectedItem.average_cost)} /><Metric label="Valor em estoque" value={formatCurrency(selectedItem.stock_value)} /><Metric label="Último fornecedor" value={lastSupplierName(selectedItem)} /></div>{selectedItem.last_purchase_at && <p className="mt-3 text-xs text-[#5a6a82]">Última compra registrada em {formatDateTime(selectedItem.last_purchase_at)}.</p>}</Section>}

        <Section title="Dados da peça"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required value={form.name} onChange={(event: any) => setForm({ ...form, name: event.target.value })} /><FInput label="SKU" value={form.sku} onChange={(event: any) => setForm({ ...form, sku: event.target.value })} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm({ ...form, description: event.target.value })} rows={3} /></div><FCurrencyInput label="Valor de venda" value={form.sale_price} onChange={(event: any) => setForm({ ...form, sale_price: event.target.value })} /><div className="flex items-end"><FToggle label="Item ativo" checked={form.is_active} onChange={value => setForm({ ...form, is_active: value })} /></div></div></Section>

        {!selectedItem && <Section title="Controle de estoque"><div className="space-y-4"><div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Unidade</label><AdminSelect value={form.unit} onValueChange={unit => setForm(current => ({ ...current, unit: unit === "cx" ? "cx" : "un", conversion_factor: unit === "cx" ? (current.conversion_factor === "1" ? "" : current.conversion_factor) : "1" }))} options={[{ value: "un", label: "Unidade (un)" }, { value: "cx", label: "Caixa (cx)" }]} ariaLabel="Unidade do item" /></div>{form.unit === "cx" && <FIntegerInput label="Unidades por caixa" required value={form.conversion_factor} onChange={(event: any) => setForm({ ...form, conversion_factor: event.target.value })} />}<div className="grid gap-4 sm:grid-cols-2"><FIntegerInput label={`Saldo inicial (${form.unit})`} value={form.quantity} onChange={(event: any) => setForm({ ...form, quantity: event.target.value })} /><FIntegerInput label={`Quantidade mínima (${form.unit})`} value={form.min_quantity} onChange={(event: any) => setForm({ ...form, min_quantity: event.target.value })} /></div>{form.unit === "cx" && Number(form.conversion_factor) > 0 && <AdminCard className="bg-[#f8fafc] p-3 shadow-none"><p className="text-xs font-semibold text-[#5a6a82]">{formatNumber(Number(form.quantity || 0))} cx = {formatNumber(Number(form.quantity || 0) * Number(form.conversion_factor || 0))} un</p></AdminCard>}
          {Number(form.quantity || 0) > 0 && <div className="grid gap-4 border-t border-[#0d1b2e]/8 pt-4 sm:grid-cols-2">{canViewCosts && <FCurrencyInput label={`Custo do saldo inicial (${form.unit})`} value={form.initial_unit_cost} onChange={(event: any) => setForm({ ...form, initial_unit_cost: event.target.value })} />}{canViewSuppliers && <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Fornecedor do saldo inicial</label><AdminSelect value={form.initial_supplier_entity_id} onValueChange={value => setForm({ ...form, initial_supplier_entity_id: value })} options={[{ value: "", label: "Sem fornecedor informado" }, ...linkedSuppliers.filter(supplier => supplier.is_active !== false).map(supplier => ({ value: supplier.id, label: supplier.name }))]} ariaLabel="Fornecedor do saldo inicial" /></div>}<div className="sm:col-span-2"><FInput label="Documento / referência do saldo inicial" value={form.initial_reference} onChange={(event: any) => setForm({ ...form, initial_reference: event.target.value })} placeholder="NF, pedido, inventário inicial..." /></div></div>}
        </div></Section>}

        {selectedItem && <Section title="Controle de estoque"><FIntegerInput label={`Quantidade mínima (${form.unit})`} value={form.min_quantity} onChange={(event: any) => setForm({ ...form, min_quantity: event.target.value })} /></Section>}

        {canViewSuppliers && <InventorySuppliersEditor organizationId={activeOrganizationId} value={linkedSuppliers} onChange={setLinkedSuppliers} disabled={!canManageSuppliers} />}

        <Section title="Endereço da peça"><div className="grid gap-4 sm:grid-cols-3"><FInput label="Estante" value={form.storage_shelf} onChange={(event: any) => setForm({ ...form, storage_shelf: event.target.value })} placeholder="Ex.: A, 1, A1" /><FInput label="Prateleira" value={form.storage_level} onChange={(event: any) => setForm({ ...form, storage_level: event.target.value })} placeholder="Ex.: 1, B, 2B" /><FInput label="Compartimento" value={form.storage_compartment} onChange={(event: any) => setForm({ ...form, storage_compartment: event.target.value })} placeholder="Ex.: A, 12, C3" /></div></Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closePage}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void saveItem()}>{selectedItem ? "Salvar" : "Cadastrar"}</BtnPrimary></div>
    </AdminPage>}

    {selectedItem && !recordOpen && !historyOpen && canCreateMovements && routeSubpage === "move" && <AdminPage open onClose={closePage} breadcrumb="Estoque" title={`Movimentação — ${selectedItem.name}`} subtitle="Registre compras, saídas e ajustes com histórico completo" maxW="max-w-2xl">
      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2"><AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade atual</p><p className="mt-1 text-lg font-black">{formatNumber(Number(selectedItem.quantity ?? 0))} {unitLabel(selectedItem.unit)}</p></AdminCard><AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Endereço</p><p className="mt-1 text-sm font-bold">{storageAddress(selectedItem) || "Não informado"}</p></AdminCard></div>
        <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de movimentação</label><AdminSelect value={movementForm.type} onValueChange={type => setMovementForm({ ...emptyMovementForm(), type: type === "out" ? "out" : type === "adjust" ? "adjust" : "in" })} options={[{ value: "in", label: "Entrada / Compra" }, { value: "out", label: "Saída" }, { value: "adjust", label: "Ajuste de saldo" }]} ariaLabel="Tipo de movimentação" /></div>
        <FIntegerInput label={movementForm.type === "adjust" ? `Novo saldo (${unitLabel(selectedItem.unit)})` : `Quantidade (${unitLabel(selectedItem.unit)})`} value={movementForm.quantity} onChange={(event: any) => setMovementForm({ ...movementForm, quantity: event.target.value })} />
        {selectedItem.unit === "cx" && movementQuantity >= 0 && movementForm.quantity !== "" && <AdminCard className="border-blue-100 bg-blue-50 p-3 shadow-none"><p className="text-sm font-black text-blue-800">{formatNumber(movementQuantity)} cx × {formatNumber(conversionFactor(selectedItem))} = {formatNumber(equivalentUnits(movementQuantity, selectedItem))} un</p></AdminCard>}

        {movementForm.type === "in" && <Section title="Compra"><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Fornecedor *</label><AdminSelect value={movementForm.supplier_entity_id} onValueChange={value => setMovementForm({ ...movementForm, supplier_entity_id: value })} options={[{ value: "", label: activeLinkedSuppliers.length ? "Selecione o fornecedor" : "Nenhum fornecedor ativo vinculado" }, ...activeLinkedSuppliers.map(supplier => ({ value: supplier.id, label: supplier.name }))]} ariaLabel="Fornecedor da entrada" disabled={!activeLinkedSuppliers.length} /></div><FCurrencyInput label={`Valor pago por ${unitLabel(selectedItem.unit)} *`} value={movementForm.input_unit_cost} onChange={(event: any) => setMovementForm({ ...movementForm, input_unit_cost: event.target.value })} /><div className="sm:col-span-2"><FInput label="Documento / referência" value={movementForm.purchase_reference} onChange={(event: any) => setMovementForm({ ...movementForm, purchase_reference: event.target.value })} placeholder="NF, pedido, cupom, referência..." /></div>{movementQuantity > 0 && movementForm.input_unit_cost !== "" && <AdminCard className="sm:col-span-2 bg-[#f8fafc] p-3 shadow-none"><p className="text-xs text-[#5a6a82]">Total desta entrada</p><p className="mt-1 text-base font-black text-[#0d1b2e]">{formatCurrency(movementQuantity * Number(movementForm.input_unit_cost || 0))}</p></AdminCard>}</div>{activeLinkedSuppliers.length === 0 && <p className="mt-3 text-xs font-semibold text-amber-700">Vincule ao menos um fornecedor ativo ao item antes de registrar uma compra.</p>}</Section>}

        <FInput label={movementForm.type === "adjust" ? "Justificativa *" : "Motivo"} value={movementForm.reason} onChange={(event: any) => setMovementForm({ ...movementForm, reason: event.target.value })} placeholder={movementForm.type === "adjust" ? "Explique por que o saldo foi ajustado" : "Opcional"} />
        <FTextarea label="Observações" value={movementForm.notes} onChange={(event: any) => setMovementForm({ ...movementForm, notes: event.target.value })} rows={3} />
        <FInput label="OS relacionada (opcional)" value={movementForm.service_order_id} onChange={(event: any) => setMovementForm({ ...movementForm, service_order_id: event.target.value })} />
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closePage}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void saveMovement()} disabled={movementForm.type === "in" && activeLinkedSuppliers.length === 0}>Registrar</BtnPrimary></div>
    </AdminPage>}

    {historyOpen && selectedItem && canViewMovements && <AdminPage open onClose={closePage} breadcrumb="Estoque" title={`Histórico — ${selectedItem.name}`} subtitle="Movimentações auditáveis do item" maxW="max-w-3xl"><div className="p-4 sm:p-5">{history.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada.</p> : <div className="space-y-3">{history.map((entry: any) => {
      const presentation = movementPresentation(entry.movement_type);
      const displayUnit = entry.display_unit || unitLabel(selectedItem.unit);
      const before = entry.previous_quantity == null ? null : displayBaseQuantity(entry.previous_quantity, selectedItem);
      const after = entry.resulting_quantity == null ? null : displayBaseQuantity(entry.resulting_quantity, selectedItem);
      const averageBefore = displayAverageCost(entry.average_cost_before, selectedItem);
      const averageAfter = displayAverageCost(entry.average_cost_after, selectedItem);
      return <AdminCard key={entry.id} className="bg-[#f8fafc] p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase", presentation.badge)}>{presentation.label}</span><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#5a6a82]">{movementOrigin(entry.movement_origin)}</span></div><span className={cn("text-sm font-black", presentation.text)}>{presentation.sign}{formatNumber(Number(entry.quantity || 0))} {displayUnit}</span></div>
        <div className="mt-3 grid gap-2 text-[11px] text-[#5a6a82] sm:grid-cols-2 lg:grid-cols-3"><HistoryValue label="Data" value={formatDateTime(entry.created_at)} /><HistoryValue label="Usuário" value={entry.created_by_profile?.full_name || "—"} /><HistoryValue label="OS" value={entry.service_order?.os_number || "—"} />{before !== null && <HistoryValue label="Saldo anterior" value={`${formatNumber(before)} ${unitLabel(selectedItem.unit)}`} />}{after !== null && <HistoryValue label="Saldo posterior" value={`${formatNumber(after)} ${unitLabel(selectedItem.unit)}`} />}{entry.supplier_entity_id && <HistoryValue label="Fornecedor" value={movementSupplierName(entry)} />}{entry.purchase_reference && <HistoryValue label="Referência" value={entry.purchase_reference} />}{canViewCosts && entry.input_unit_cost != null && <HistoryValue label={`Valor por ${displayUnit}`} value={formatCurrency(entry.input_unit_cost)} />}{canViewCosts && entry.total_cost != null && <HistoryValue label="Total da compra" value={formatCurrency(entry.total_cost)} />}{canViewCosts && averageBefore !== null && <HistoryValue label="Custo médio anterior" value={formatCurrency(averageBefore)} />}{canViewCosts && averageAfter !== null && <HistoryValue label="Custo médio posterior" value={formatCurrency(averageAfter)} />}</div>
        {(entry.reason || entry.notes) && <div className="mt-3 border-t border-[#0d1b2e]/8 pt-3 text-sm text-[#0d1b2e]">{entry.reason && <p><strong>Motivo:</strong> {entry.reason}</p>}{entry.notes && <p className="mt-1"><strong>Observações:</strong> {entry.notes}</p>}</div>}
      </AdminCard>;
    })}</div>}</div></AdminPage>}
  </div>;
}

function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="min-w-0"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[9px] font-bold uppercase text-[#8a96a8]">{label}</p><p className="truncate font-semibold text-[#34445b]">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p><p className="mt-1 break-words text-sm font-black text-[#0d1b2e]">{value}</p></div>;
}

function HistoryValue({ label, value }: { label: string; value: string }) {
  return <div><strong className="text-[#34445b]">{label}:</strong> {value}</div>;
}

function supabaseErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "Erro desconhecido");
  return error instanceof Error ? error.message : String(error || "Erro desconhecido");
}