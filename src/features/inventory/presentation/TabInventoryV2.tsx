import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeftRight, Check, CheckCircle, ChevronDown, Edit2, Eraser, List, MapPin, Package, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteInventoryItem, getInventoryItem, listInventoryItems, listInventoryMovements, recordInventoryMovement, saveInventoryItem, setInventoryItemActive } from "../infrastructure/inventory.repository";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { cn } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FInput, FTextarea, FToggle, FCurrencyInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";

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
  purchase_price: string;
  sale_price: string;
  storage_shelf: string;
  storage_level: string;
  storage_compartment: string;
  is_active: boolean;
};

type MobileFilter = "name" | "sku" | "address";

const emptyInventoryForm = (): InventoryForm => ({
  id: "", name: "", sku: "", description: "", unit: "un", conversion_factor: "1", quantity: "0", min_quantity: "0",
  purchase_price: "", sale_price: "", storage_shelf: "", storage_level: "", storage_compartment: "", is_active: true,
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

function movementPresentation(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type === "in") return { label: "Entrada", sign: "+", badge: "bg-green-100 text-green-700", text: "text-green-600" };
  if (type === "out") return { label: "Saída", sign: "-", badge: "bg-red-100 text-red-700", text: "text-red-600" };
  if (type === "use") return { label: "Uso", sign: "×", badge: "bg-blue-100 text-blue-700", text: "text-blue-600" };
  if (type === "adjust") return { label: "Ajuste", sign: "~", badge: "bg-amber-100 text-amber-700", text: "text-amber-600" };
  return { label: type || "Movimentação", sign: "", badge: "bg-[#f5f7fa] text-[#5a6a82]", text: "text-[#5a6a82]" };
}

export function TabInventory({ routeResourceId, routeSubpage, onRouteChange }: TabInventoryProps) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("inventory.view");
  const canViewTable = hasPermission("inventory.table.view");
  const canViewDetails = hasPermission("inventory.details.view");
  const canCreate = hasPermission("inventory.create");
  const canEdit = hasPermission("inventory.update");
  const canDelete = hasPermission("inventory.delete");
  const canToggleActive = hasPermission("inventory.toggle_active");
  const canViewMovements = hasPermission("inventory.movements.view");
  const canCreateMovements = hasPermission("inventory.movements.create");
  const showName = hasPermission("inventory.table.name");
  const showSku = hasPermission("inventory.table.sku");
  const showUnit = hasPermission("inventory.table.unit");
  const showQuantity = hasPermission("inventory.table.quantity");
  const showMinQuantity = hasPermission("inventory.table.min_quantity");
  const showPurchasePrice = hasPermission("inventory.table.purchase_price");
  const showSalePrice = hasPermission("inventory.table.sale_price");
  const showStatus = hasPermission("inventory.table.status");
  const showActions = hasPermission("inventory.table.actions");
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: queryKeys.inventory.lists(), queryFn: listInventoryItems, enabled: canView && (canViewTable || canViewDetails || canCreate || canEdit || canViewMovements || canCreateMovements) });
  const items = itemsQuery.data ?? [];

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState<InventoryForm>(emptyInventoryForm);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [movementForm, setMovementForm] = useState({ type: "in", quantity: "", reason: "", service_order_id: "" });
  const [nameSearch, setNameSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => { if (itemsQuery.error) setToast({ msg: `Erro ao carregar estoque: ${itemsQuery.error instanceof Error ? itemsQuery.error.message : String(itemsQuery.error)}`, type: "error" }); }, [itemsQuery.error]);

  const filteredItems = useMemo(() => items.filter((item: any) => {
    const matchName = !nameSearch || normalize(item.name).includes(normalize(nameSearch));
    const matchSku = !skuSearch || normalize(item.sku).includes(normalize(skuSearch));
    const address = normalize(`${item.storage_shelf || ""} ${item.storage_level || ""} ${item.storage_compartment || ""} ${storageAddress(item)}`);
    const matchAddress = !addressSearch || address.includes(normalize(addressSearch));
    return matchName && matchSku && matchAddress;
  }), [items, nameSearch, skuSearch, addressSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(nameSearch || skuSearch || addressSearch);
  useEffect(() => { setPage(1); }, [nameSearch, skuSearch, addressSearch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refreshInventory = () => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });

  const clearFilters = () => { setNameSearch(""); setSkuSearch(""); setAddressSearch(""); setPage(1); };
  const openNew = () => { if (!canCreate) return; setSelectedItem(null); setForm(emptyInventoryForm()); setHistoryOpen(false); setRecordOpen(true); };
  const openEdit = (item: any) => {
    if (!(canViewDetails && canEdit)) return;
    setSelectedItem(item);
    setForm({
      id: item.id, name: item.name || "", sku: item.sku || "", description: item.description || "",
      unit: item.unit === "cx" ? "cx" : "un", conversion_factor: String(item.unit === "cx" ? conversionFactor(item) : 1),
      quantity: String(Number(item.quantity ?? 0)), min_quantity: String(Number(item.min_quantity ?? 0)),
      purchase_price: item.purchase_price == null ? "" : String(item.purchase_price), sale_price: item.sale_price == null ? "" : String(item.sale_price),
      storage_shelf: item.storage_shelf || "", storage_level: item.storage_level || "", storage_compartment: item.storage_compartment || "",
      is_active: item.is_active !== false,
    });
    setHistoryOpen(false); setRecordOpen(true);
  };
  const closePage = () => { setRecordOpen(false); setHistoryOpen(false); setSelectedItem(null); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));
  const openHistory = async (item: any) => { if (!canViewMovements) return; setSelectedItem(item); setRecordOpen(false); try { setHistory(await listInventoryMovements(item.id)); setHistoryOpen(true); } catch (error) { setToast({ msg: `Erro ao carregar histórico: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); setHistory([]); } };
  const openHistoryPage = (item: any) => canViewMovements && (onRouteChange ? onRouteChange(item.id, "history") : void openHistory(item));
  const openMovement = (item: any) => { if (!canCreateMovements) return; setSelectedItem(item); setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" }); setHistoryOpen(false); setRecordOpen(false); };
  const openMovementPage = (item: any) => canCreateMovements && (onRouteChange ? onRouteChange(item.id, "move") : openMovement(item));

  useEffect(() => {
    if (!routeResourceId) { if (recordOpen || historyOpen || selectedItem) { setRecordOpen(false); setHistoryOpen(false); setSelectedItem(null); } return; }
    if (routeResourceId === "new") { if (canCreate && !recordOpen) openNew(); return; }
    const item = items.find((entry: any) => entry.id === routeResourceId);
    if (!item) return;
    if (routeSubpage === "edit") { if (canViewDetails && canEdit && (!recordOpen || selectedItem?.id !== item.id)) openEdit(item); return; }
    if (routeSubpage === "history") { if (canViewMovements && (!historyOpen || selectedItem?.id !== item.id)) void openHistory(item); return; }
    if (routeSubpage === "move") { if (canCreateMovements && (recordOpen || historyOpen || selectedItem?.id !== item.id)) openMovement(item); }
  }, [routeResourceId, routeSubpage, items, recordOpen, historyOpen, selectedItem?.id, canCreate, canViewDetails, canEdit, canViewMovements, canCreateMovements]);

  const saveItem = async () => {
    const canSave = selectedItem ? canEdit : canCreate;
    if (!canSave) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome do item do estoque.", type: "error" }); return; }
    const factor = form.unit === "cx" ? Number(form.conversion_factor) : 1;
    if (!selectedItem && (!Number.isInteger(factor) || factor < 1)) { setToast({ msg: "Informe quantas unidades existem em cada caixa.", type: "error" }); return; }
    const purchasePrice = form.purchase_price.trim() === "" ? null : Number(form.purchase_price);
    const salePrice = form.sale_price.trim() === "" ? null : Number(form.sale_price);
    if ((purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0))) { setToast({ msg: "Informe valores de compra e venda válidos e não negativos.", type: "error" }); return; }
    const commonPayload = {
      name: form.name.trim(), sku: form.sku.trim() || null, description: form.description.trim() || null,
      purchase_price: purchasePrice, sale_price: salePrice, is_active: form.is_active,
      storage_shelf: form.storage_shelf.trim() || null, storage_level: form.storage_level.trim() || null, storage_compartment: form.storage_compartment.trim() || null,
    };
    const payload = selectedItem ? {
      ...commonPayload,
      // Unidade e fator seguem no payload apenas para preservar corretamente a conversão de preços; não são editáveis nesta tela.
      unit: form.unit, conversion_factor: factor,
    } : {
      ...commonPayload, unit: form.unit, conversion_factor: factor,
      quantity: Number(form.quantity || 0), min_quantity: Number(form.min_quantity || 0),
    };
    try {
      await saveInventoryItem(payload, selectedItem?.id);
      setToast({ msg: selectedItem ? "Item atualizado." : "Item cadastrado.", type: "success" });
      closePage(); await refreshInventory();
    } catch (error) { setToast({ msg: `Erro ao salvar item: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
  };

  const formatCurrency = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const toggleActive = async (item: any) => { if (!canToggleActive) return; const next = !item.is_active; try { await setInventoryItemActive(item.id, next); setToast({ msg: next ? "Item ativado." : "Item desativado.", type: "success" }); await refreshInventory(); } catch (error) { setToast({ msg: `Erro ao alterar status: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const deleteItem = async (item: any) => { if (!canDelete) return; try { await deleteInventoryItem(item.id); setToast({ msg: "Item excluído do estoque.", type: "success" }); await refreshInventory(); } catch (error) { setToast({ msg: `Erro ao excluir item: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const saveMovement = async () => {
    if (!selectedItem || !canCreateMovements) return;
    const quantity = Number(movementForm.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) { setToast({ msg: "Informe uma quantidade válida para a movimentação.", type: "error" }); return; }
    let currentItem;
    try { currentItem = await getInventoryItem(selectedItem.id); } catch (error) { setToast({ msg: `Não foi possível validar o item: ${supabaseErrorMessage(error)}`, type: "error" }); return; }
    if (!currentItem) { setToast({ msg: "O item do estoque não foi encontrado.", type: "error" }); return; }
    if (currentItem.is_active === false) { setToast({ msg: "O item está inativo e não pode receber movimentações.", type: "error" }); return; }
    const current = Number(currentItem.quantity ?? 0);
    const movementType = movementForm.type === "in" ? "IN" : movementForm.type === "out" ? "OUT" : movementForm.type === "adjust" ? "ADJUST" : null;
    if (!movementType) { setToast({ msg: "Tipo de movimentação inválido.", type: "error" }); return; }
    let nextQuantity = current;
    if (movementType === "IN") nextQuantity = current + quantity;
    if (movementType === "OUT") { if (current < quantity) { setToast({ msg: `Estoque insuficiente para saída: há ${current} ${unitLabel(currentItem.unit)} disponível(is).`, type: "error" }); return; } nextQuantity = current - quantity; }
    if (movementType === "ADJUST") nextQuantity = quantity;
    try {
      await recordInventoryMovement({ inventory_item_id: selectedItem.id, movement_type: movementType, quantity, reason: movementForm.reason.trim() || "Movimentação manual", created_by: user?.id || null, service_order_id: movementForm.service_order_id || null }, selectedItem.id, nextQuantity);
      setToast({ msg: "Movimentação registrada com sucesso.", type: "success" }); setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" }); closePage(); await refreshInventory();
    } catch (error) { setToast({ msg: `Erro na movimentação: ${supabaseErrorMessage(error)}`, type: "error" }); }
  };

  if (!canView) return null;
  const routePageReady = recordOpen || historyOpen || (selectedItem && routeSubpage === "move");
  const movementQuantity = Number(movementForm.quantity || 0);
  const mobileFilterLabel = mobileFilter === "name" ? "Nome" : mobileFilter === "sku" ? "SKU" : "Endereço";
  const mobileValue = mobileFilter === "name" ? nameSearch : mobileFilter === "sku" ? skuSearch : addressSearch;
  const setMobileValue = (value: string) => mobileFilter === "name" ? setNameSearch(value) : mobileFilter === "sku" ? setSkuSearch(value) : setAddressSearch(value);

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!routeResourceId && <>
      <PageHeader title="Estoque" subtitle="Controle de itens, localização física e movimentações do almoxarifado" actions={canCreate ? <AdminButton onClick={openNewPage} className="text-xs"><Plus size={14} /> Novo item</AdminButton> : null} />

      {canViewTable && <AdminSearchPanel title="Buscar estoque">
        <div className="space-y-3 md:hidden">
          <div className="flex items-center gap-2">
            <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm"><span className="truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-[220px]">{([['name','Nome'],['sku','SKU'],['address','Endereço']] as const).map(([value,label]) => <DropdownMenuItem key={value} onSelect={() => setMobileFilter(value)} className={cn("cursor-pointer", mobileFilter === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Search size={14} /><span>{label}</span>{mobileFilter === value && <Check size={14} className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
            {hasFilters && <button type="button" onClick={clearFilters} aria-label="Limpar filtros" className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600"><Eraser size={15} /></button>}
          </div>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={mobileValue} onChange={e => setMobileValue(e.target.value)} placeholder={mobileFilter === "name" ? "Digite o nome da peça" : mobileFilter === "sku" ? "Digite o SKU" : "Estante, prateleira ou compartimento"} className={cn(INPUT, "h-[42px] w-full pl-9 text-sm")} /></div>
        </div>
        <div className="hidden grid-cols-1 gap-3 md:grid md:grid-cols-3">
          <SearchField label="Nome" value={nameSearch} onChange={setNameSearch} placeholder="Digite o nome da peça" />
          <SearchField label="SKU" value={skuSearch} onChange={setSkuSearch} placeholder="Digite o SKU" />
          <SearchField label="Endereço" value={addressSearch} onChange={setAddressSearch} placeholder="Estante, prateleira ou compartimento" />
          {hasFilters && <div className="md:col-span-3 flex justify-end"><AdminButton variant="danger" size="sm" onClick={clearFilters} className="bg-white text-red-600 hover:bg-red-50"><Eraser size={14} /> Limpar filtros</AdminButton></div>}
        </div>
      </AdminSearchPanel>}

      {canViewTable && <AdminCard>{itemsQuery.isPending ? <LoadingState /> : filteredItems.length === 0 ? <EmptyState icon={Package} title={items.length === 0 ? "Nenhum item em estoque" : "Nenhum item encontrado"} message={items.length === 0 ? "Cadastre um item para começar a controlar o inventário." : "Ajuste os filtros de busca para encontrar a peça."} /> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{pagedItems.map((item: any) => { const quantity = Number(item.quantity ?? 0); const minQuantity = Number(item.min_quantity ?? 0); const lowStock = quantity <= minQuantity; const isEmpty = quantity === 0; const factor = conversionFactor(item); return <article key={item.id} className="min-w-0 space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-black text-[#0d1b2e]">{item.name}</p><p className="mt-1 font-mono text-[10px] font-semibold text-[#5a6a82]">SKU {item.sku || "—"}</p></div>{showStatus && <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span>}</div>
          {storageAddress(item) && <div className="flex items-start gap-2 rounded-lg bg-[#f5f7fa] px-3 py-2 text-xs font-semibold text-[#34445b]"><MapPin size={14} className="mt-0.5 shrink-0 text-[#0057e7]" /><span>{storageAddress(item)}</span></div>}
          {showQuantity && <div className={cn("rounded-xl border px-3 py-2.5", isEmpty ? "border-red-200 bg-red-50" : lowStock ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50")}><p className="text-[9px] font-bold uppercase text-[#5a6a82]">Quantidade atual</p><p className={cn("text-xl font-black", isEmpty ? "text-red-700" : lowStock ? "text-amber-700" : "text-emerald-700")}>{quantity} <span className="text-[11px]">{showUnit ? unitLabel(item.unit) : ""}</span></p>{item.unit === "cx" && <p className="text-[10px] font-semibold text-[#5a6a82]">{equivalentUnits(quantity, item)} un no total</p>}</div>}
          <div className="grid grid-cols-2 gap-3 text-xs">{showMinQuantity && <Info label="Mínimo" value={`${minQuantity}${showUnit ? ` ${unitLabel(item.unit)}` : ""}`} />}{showUnit && <Info label="Unidade" value={`${unitLabel(item.unit)}${item.unit === "cx" ? ` · ${factor} un/cx` : ""}`} />}{showPurchasePrice && <Info label="Compra" value={formatCurrency(item.purchase_price)} />}{showSalePrice && <Info label="Venda" value={formatCurrency(item.sale_price)} />}</div>
          {showActions && <div className="border-t border-[#0d1b2e]/8 pt-3"><div className="grid grid-cols-2 gap-2">{canViewDetails && canEdit && <AdminButton variant="secondary" size="sm" onClick={() => openEditPage(item)} className="h-10"><Edit2 size={15} /> Editar</AdminButton>}{canCreateMovements && <AdminButton size="sm" onClick={() => openMovementPage(item)} className="h-10"><ArrowLeftRight size={15} /> Movimentar</AdminButton>}</div><div className="mt-2 flex justify-end gap-1.5">{canViewMovements && <AdminIconButton ariaLabel="Histórico" onClick={() => openHistoryPage(item)} className="h-10 w-10"><List size={16} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active !== false ? "Desativar" : "Ativar"} onClick={() => toggleActive(item)} className="h-10 w-10">{item.is_active !== false ? <CheckCircle size={16} /> : <AlertCircle size={16} />}</AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir" variant="danger" onClick={() => void deleteItem(item)} className="h-10 w-10"><Trash2 size={16} /></AdminIconButton>}</div></div>}
        </article>; })}</div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[1080px]"><thead><tr>{showName && <th className="text-left">Nome</th>}{showSku && <th className="text-left">SKU</th>}<th className="text-left">Endereço</th>{showUnit && <th className="text-left">Unidade</th>}{showQuantity && <th className="text-left">Quantidade</th>}{showMinQuantity && <th className="text-left">Mínimo</th>}{showPurchasePrice && <th className="text-left">Compra</th>}{showSalePrice && <th className="text-left">Venda</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map((item: any) => { const quantity = Number(item.quantity ?? 0); const minQuantity = Number(item.min_quantity ?? 0); const lowStock = quantity <= minQuantity; const factor = conversionFactor(item); return <tr key={item.id}>{showName && <td><div className="font-semibold text-[#0d1b2e]">{item.name}</div>{item.description && <div className="max-w-sm text-[11px] text-[#5a6a82]">{item.description}</div>}</td>}{showSku && <td className="font-mono text-xs text-[#5a6a82]">{item.sku || "—"}</td>}<td className="max-w-[220px] text-xs text-[#5a6a82]">{storageAddress(item) || "—"}</td>{showUnit && <td className="text-xs text-[#5a6a82]">{unitLabel(item.unit)}{item.unit === "cx" && <div className="text-[10px]">{factor} un/cx</div>}</td>}{showQuantity && <td className={cn("font-bold", quantity === 0 ? "text-red-700" : lowStock ? "text-amber-700" : "text-[#0d1b2e]")}>{quantity}{item.unit === "cx" && <div className="text-[10px] font-normal text-[#5a6a82]">{equivalentUnits(quantity, item)} un</div>}</td>}{showMinQuantity && <td className="text-xs text-[#5a6a82]">{minQuantity}</td>}{showPurchasePrice && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.purchase_price)}</td>}{showSalePrice && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.sale_price)}</td>}{showStatus && <td><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar" onClick={() => openEditPage(item)}><Edit2 size={14} /></AdminIconButton>}{canViewMovements && <AdminIconButton ariaLabel="Histórico" onClick={() => openHistoryPage(item)}><List size={14} /></AdminIconButton>}{canCreateMovements && <AdminIconButton ariaLabel="Movimentar" onClick={() => openMovementPage(item)}><ArrowLeftRight size={14} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active !== false ? "Desativar" : "Ativar"} onClick={() => toggleActive(item)}>{item.is_active !== false ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir" variant="danger" onClick={() => void deleteItem(item)}><Trash2 size={14} /></AdminIconButton>}</div></td>}</tr>; })}</tbody></table></div>
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={filteredItems.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </>}</AdminCard>}
    </>}

    {routeResourceId && !routePageReady && <AdminCard className="p-8"><LoadingState /></AdminCard>}

    {recordOpen && <AdminPage open onClose={closePage} breadcrumb="Estoque" title={selectedItem ? "Editar item" : "Novo item"} subtitle={selectedItem ? "Atualize os dados cadastrais e o endereço físico da peça." : "Cadastre a peça, unidade, saldo inicial e endereço físico."} maxW="max-w-3xl"><div className="space-y-5 p-4 sm:p-5">
      <Section title="Dados da peça"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="SKU" value={form.sku} onChange={(e: any) => setForm({ ...form, sku: e.target.value })} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} /></div><FCurrencyInput label="Valor de compra" value={form.purchase_price} onChange={(e: any) => setForm({ ...form, purchase_price: e.target.value })} /><FCurrencyInput label="Valor de venda" value={form.sale_price} onChange={(e: any) => setForm({ ...form, sale_price: e.target.value })} /><div className="sm:col-span-2"><FToggle label="Item ativo" checked={form.is_active} onChange={value => setForm({ ...form, is_active: value })} /></div></div></Section>
      {!selectedItem && <Section title="Controle de estoque"><div className="space-y-4"><div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Unidade</label><AdminSelect value={form.unit} onValueChange={unit => setForm(current => ({ ...current, unit: unit === "cx" ? "cx" : "un", conversion_factor: unit === "cx" ? (current.conversion_factor === "1" ? "" : current.conversion_factor) : "1" }))} options={[{ value: "un", label: "Unidade (un)" }, { value: "cx", label: "Caixa (cx)" }]} ariaLabel="Unidade do item" /></div>{form.unit === "cx" && <FInput label="Unidades por caixa" required type="number" min="1" step="1" value={form.conversion_factor} onChange={(e: any) => setForm({ ...form, conversion_factor: e.target.value })} />}<div className="grid gap-4 sm:grid-cols-2"><FInput label={`Quantidade inicial (${form.unit})`} type="number" min="0" value={form.quantity} onChange={(e: any) => setForm({ ...form, quantity: e.target.value })} /><FInput label={`Quantidade mínima (${form.unit})`} type="number" min="0" value={form.min_quantity} onChange={(e: any) => setForm({ ...form, min_quantity: e.target.value })} /></div>{form.unit === "cx" && Number(form.conversion_factor) > 0 && <AdminCard className="bg-[#f8fafc] p-3 shadow-none"><p className="text-xs font-semibold text-[#5a6a82]">{Number(form.quantity || 0)} cx = {Number(form.quantity || 0) * Number(form.conversion_factor || 0)} un</p></AdminCard>}</div></Section>}
      {selectedItem && <AdminCard className="border-blue-100 bg-blue-50 p-4 shadow-none"><p className="text-xs font-black uppercase tracking-wide text-blue-700">Saldo e unidade protegidos</p><p className="mt-1 text-sm text-blue-800">Unidade, fator de conversão, quantidade e estoque mínimo não são alterados na edição. Use <strong>Movimentar</strong> para qualquer ajuste de saldo.</p></AdminCard>}
      <Section title="Endereço da peça"><div className="grid gap-4 sm:grid-cols-3"><FInput label="Estante" value={form.storage_shelf} onChange={(e: any) => setForm({ ...form, storage_shelf: e.target.value })} placeholder="Ex.: A, 1, A1" /><FInput label="Prateleira" value={form.storage_level} onChange={(e: any) => setForm({ ...form, storage_level: e.target.value })} placeholder="Ex.: 1, B, 2B" /><FInput label="Compartimento" value={form.storage_compartment} onChange={(e: any) => setForm({ ...form, storage_compartment: e.target.value })} placeholder="Ex.: A, 12, C3" /></div><p className="mt-3 text-xs text-[#718096]">Os três campos aceitam letras e números. Ex.: Estante A · Prateleira 1 · Compartimento A.</p></Section>
    </div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closePage}>Cancelar</BtnSecondary><BtnPrimary onClick={saveItem}>{selectedItem ? "Salvar" : "Cadastrar"}</BtnPrimary></div></AdminPage>}

    {selectedItem && !recordOpen && !historyOpen && canCreateMovements && routeSubpage === "move" && <AdminPage open onClose={closePage} breadcrumb="Estoque" title={`Movimentação — ${selectedItem.name}`} subtitle="Registre entrada, saída ou ajuste do saldo" maxW="max-w-xl"><div className="space-y-4 p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-2"><AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade atual</p><p className="mt-1 text-lg font-black">{Number(selectedItem.quantity ?? 0)} {unitLabel(selectedItem.unit)}</p></AdminCard><AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Endereço</p><p className="mt-1 text-sm font-bold">{storageAddress(selectedItem) || "Não informado"}</p></AdminCard></div><div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de movimentação</label><AdminSelect value={movementForm.type} onValueChange={type => setMovementForm({ ...movementForm, type })} options={[{ value: "in", label: "Entrada" }, { value: "out", label: "Saída" }, { value: "adjust", label: "Ajuste" }]} ariaLabel="Tipo de movimentação" /></div><FInput label={`Quantidade (${unitLabel(selectedItem.unit)})`} type="number" min="1" value={movementForm.quantity} onChange={(e: any) => setMovementForm({ ...movementForm, quantity: e.target.value })} />{selectedItem.unit === "cx" && movementQuantity > 0 && <AdminCard className="border-blue-100 bg-blue-50 p-3 shadow-none"><p className="text-sm font-black text-blue-800">{movementQuantity} cx × {conversionFactor(selectedItem)} = {equivalentUnits(movementQuantity, selectedItem)} un</p></AdminCard>}<FInput label="Motivo" value={movementForm.reason} onChange={(e: any) => setMovementForm({ ...movementForm, reason: e.target.value })} /><FInput label="OS relacionada (opcional)" value={movementForm.service_order_id} onChange={(e: any) => setMovementForm({ ...movementForm, service_order_id: e.target.value })} /></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closePage}>Cancelar</BtnSecondary><BtnPrimary onClick={saveMovement}>Registrar</BtnPrimary></div></AdminPage>}

    {historyOpen && selectedItem && canViewMovements && <AdminPage open onClose={closePage} breadcrumb="Estoque" title={`Histórico — ${selectedItem.name}`} subtitle="Movimentações do item" maxW="max-w-2xl"><div className="p-4 sm:p-5">{history.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada.</p> : <div className="space-y-3">{history.map((entry: any) => { const presentation = movementPresentation(entry.movement_type); const qty = Number(entry.quantity || 0); const displayUnit = entry.display_unit || unitLabel(selectedItem.unit); return <AdminCard key={entry.id} className="bg-[#f8fafc] p-4 shadow-none"><div className="flex items-center justify-between gap-3"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase", presentation.badge)}>{presentation.label}</span><span className={cn("text-sm font-black", presentation.text)}>{presentation.sign}{qty} {displayUnit}</span></div>{entry.base_quantity != null && displayUnit === "cx" && <div className="mt-2 text-[11px] font-semibold text-[#5a6a82]">Equivalente: {Number(entry.base_quantity)} un</div>}<div className="mt-2 text-sm text-[#0d1b2e]">{entry.reason || "Movimentação manual"}</div><div className="mt-2 grid gap-2 text-[11px] text-[#5a6a82] sm:grid-cols-2"><div><strong>Data:</strong> {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "—"}</div><div><strong>Usuário:</strong> {entry.created_by_profile?.full_name || "—"}</div><div><strong>OS:</strong> {entry.service_order?.os_number || "—"}</div><div><strong>Endereço:</strong> {storageAddress(selectedItem) || "—"}</div></div></AdminCard>; })}</div>}</div></AdminPage>}
  </div>;
}

function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="min-w-0"><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[9px] font-bold uppercase text-[#8a96a8]">{label}</p><p className="truncate font-semibold text-[#34445b]">{value}</p></div>; }

function supabaseErrorMessage(error: unknown) { if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "Erro desconhecido"); return error instanceof Error ? error.message : String(error || "Erro desconhecido"); }
